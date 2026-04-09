import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  createGroup,
  addMember,
} from '../db/groupRepository.js';
import { notifyGroupMembersOfStatusChange } from '../services/groupNotificationService.js';
import type { Bot } from 'grammy';

// Standalone DB pattern (telegramListenerRepository style) — each test owns
// the seeded users and groups. We use explicit `db` injection everywhere
// because the production `getUser()` reads from the getDb() singleton, which
// would silently miss this test's :memory: instance. Pattern documented in
// memory: pattern_getuser_singleton_vs_di.md.

let db: Database.Database;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
});

beforeEach(() => {
  // Cascade wipes group_members + safety_status automatically
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM users').run();
});

function seedUser(chatId: number, displayName: string): void {
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(chatId, displayName);
}

function makeTestLookup() {
  return (chatId: number) =>
    db.prepare('SELECT display_name FROM users WHERE chat_id = ?').get(chatId) as
      | { display_name: string | null }
      | undefined;
}

const fakeBot = {} as unknown as Bot; // _bot param is unused — only present for API symmetry with safetyNotificationService

describe('notifyGroupMembersOfStatusChange', () => {
  it("notifies all group members except the sender (status='ok')", async () => {
    seedUser(1001, 'אבא');
    seedUser(1002, 'אמא');
    seedUser(1003, 'ילד');
    const group = createGroup(db, { name: 'בית', ownerId: 1001, inviteCode: 'NTF001' });
    addMember(db, group.id, 1002);
    addMember(db, group.id, 1003);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    // Sender excluded, both other members notified
    assert.equal(enqueued.length, 2);
    const chatIds = enqueued.map((t) => t.chatId).sort();
    assert.deepEqual(chatIds, ['1002', '1003']);

    // Each task carries the sender's display name + group name
    for (const task of enqueued) {
      assert.match(task.text, /אבא/);
      assert.match(task.text, /בית/);
      assert.match(task.text, /בסדר/);
      assert.match(task.text, /✅/);
    }
  });

  it("formats 'help' status with warning emoji and call-to-action", async () => {
    seedUser(1001, 'דנה');
    seedUser(1002, 'אורי');
    const group = createGroup(db, { name: 'משפחה', ownerId: 1001, inviteCode: 'NTF002' });
    addMember(db, group.id, 1002);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'help', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    assert.equal(enqueued.length, 1);
    const text = enqueued[0]?.text ?? '';
    assert.match(text, /דנה/);
    assert.match(text, /משפחה/);
    assert.match(text, /⚠️/);
    assert.match(text, /זקוק/);
    // The "consider reaching out" call-to-action distinguishes 'help' from 'ok'
    assert.match(text, /צור|ליצור|קשר/);
  });

  it("skips notification entirely when status='dismissed'", async () => {
    seedUser(1001, 'a');
    seedUser(1002, 'b');
    const group = createGroup(db, { name: 'g', ownerId: 1001, inviteCode: 'NTF003' });
    addMember(db, group.id, 1002);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'dismissed', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    assert.equal(enqueued.length, 0, 'dismissed should not produce any tasks');
  });

  it('respects notify_group=0 opt-out per member', async () => {
    seedUser(1001, 'sender');
    seedUser(1002, 'optedIn');
    seedUser(1003, 'optedOut');
    const group = createGroup(db, { name: 'g', ownerId: 1001, inviteCode: 'NTF004' });
    addMember(db, group.id, 1002);
    addMember(db, group.id, 1003);

    // Flip notify_group to 0 for member 1003
    db.prepare('UPDATE group_members SET notify_group = 0 WHERE user_id = ?').run(1003);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    assert.equal(enqueued.length, 1);
    assert.equal(enqueued[0]?.chatId, '1002', 'opted-out member must not receive a task');
  });

  it("dedupes recipients across overlapping groups", async () => {
    seedUser(1001, 'sender');
    seedUser(1002, 'overlapMember');
    seedUser(1003, 'g1Only');
    seedUser(1004, 'g2Only');
    // Two groups, both owned by sender, both contain overlapMember
    const g1 = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'DUP001' });
    addMember(db, g1.id, 1002);
    addMember(db, g1.id, 1003);
    const g2 = createGroup(db, { name: 'work', ownerId: 1001, inviteCode: 'DUP002' });
    addMember(db, g2.id, 1002);
    addMember(db, g2.id, 1004);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    // 3 distinct recipients: 1002 (in both groups, deduped), 1003, 1004
    assert.equal(enqueued.length, 3, `expected 3 deduped recipients, got ${enqueued.length}`);
    const chatIds = enqueued.map((t) => t.chatId).sort();
    assert.deepEqual(chatIds, ['1002', '1003', '1004']);

    // The deduped recipient gets the notification labeled with ONE of the
    // groups (whichever was iterated first via getGroupsForUser ORDER BY
    // created_at DESC). Just verify it has SOME group name.
    const overlapTask = enqueued.find((t) => t.chatId === '1002');
    assert.ok(overlapTask);
    assert.ok(/family|work/.test(overlapTask.text), `overlap task text should mention a group: ${overlapTask.text}`);
  });

  it('returns silently when sender belongs to no groups', async () => {
    seedUser(9999, 'lonely');
    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 9999, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });
    assert.equal(enqueued.length, 0);
  });

  it('returns silently when group has only the sender (no recipients)', async () => {
    seedUser(1001, 'solo');
    createGroup(db, { name: 'just-me', ownerId: 1001, inviteCode: 'SOLO01' });

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });
    assert.equal(enqueued.length, 0);
  });

  it("uses fallback 'משתמש #<id>' when sender has no display_name", async () => {
    // No display_name (pre-onboarding state)
    db.prepare("INSERT INTO users (chat_id, created_at) VALUES (?, datetime('now'))").run(7777);
    seedUser(8888, 'recipient');
    const group = createGroup(db, { name: 'g', ownerId: 7777, inviteCode: 'NON001' });
    addMember(db, group.id, 8888);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 7777, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    assert.equal(enqueued.length, 1);
    assert.match(enqueued[0]?.text ?? '', /משתמש #7777/);
  });

  it('escapes HTML in display_name and group name to prevent injection', async () => {
    seedUser(1001, '<script>alert(1)</script>');
    seedUser(1002, 'recipient');
    const group = createGroup(db, { name: '<b>EvilGroup</b>', ownerId: 1001, inviteCode: 'XSS001' });
    addMember(db, group.id, 1002);

    const enqueued: Array<{ chatId: string; text: string }> = [];
    await notifyGroupMembersOfStatusChange(db, fakeBot, 1001, 'ok', {
      enqueueAll: (tasks) => enqueued.push(...tasks),
      getUser: makeTestLookup(),
    });

    assert.equal(enqueued.length, 1);
    const text = enqueued[0]?.text ?? '';
    // The literal raw HTML must NOT appear unescaped — must be entity-encoded
    assert.doesNotMatch(text, /<script>/);
    assert.doesNotMatch(text, /<b>EvilGroup<\/b>/);
    assert.match(text, /&lt;script&gt;/);
    assert.match(text, /&lt;b&gt;EvilGroup&lt;\/b&gt;/);
  });
});
