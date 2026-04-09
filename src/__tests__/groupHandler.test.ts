import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db/schema.js';
import { upsertUser } from '../db/userRepository.js';
import {
  createGroup,
  findGroupByInviteCode,
  getGroupsForUser,
  countGroupsOwnedBy,
  countMembersOfGroup,
} from '../db/groupRepository.js';
import {
  registerGroupHandler,
  cb,
  joinCooldownMap,
  joinFailures,
  MAX_GROUPS_PER_USER_FALLBACK,
  MAX_MEMBERS_PER_GROUP_FALLBACK,
} from '../bot/groupHandler.js';
import type { Bot, Context } from 'grammy';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

beforeEach(() => {
  const db = getDb();
  // Cascade deletes group_members + memberships
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM users').run();
  joinCooldownMap.clear();
  joinFailures.clear();
});

// Mock Grammy Bot — just records the registered command + callback handlers
function buildMockBot() {
  const commands: Record<string, (ctx: Context) => Promise<void>> = {};
  const callbacks: Array<[string | RegExp, (ctx: Context) => Promise<void>]> = [];

  return {
    command: (name: string, handler: (ctx: Context) => Promise<void>) => {
      commands[name] = handler;
    },
    callbackQuery: (pat: string | RegExp, handler: (ctx: Context) => Promise<void>) => {
      callbacks.push([pat, handler]);
    },
    on: () => {},
    catch: () => {},
    _fireCmd: async (name: string, ctx: Context) => commands[name]?.(ctx),
    _fireCb: async (data: string, ctx: Context) => {
      for (const [pat, handler] of callbacks) {
        if (typeof pat === 'string' && pat === data) {
          await handler(ctx);
          return;
        }
        if (pat instanceof RegExp && pat.test(data)) {
          (ctx as any).match = data.match(pat);
          await handler(ctx);
          return;
        }
      }
    },
  };
}

function makeCtx(overrides: Record<string, unknown> = {}): Context {
  const replyCalls: unknown[] = [];
  const editCalls: unknown[] = [];
  const sendCalls: unknown[] = [];
  const answerCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 1001, type: 'private' },
    message: { text: '/group' },
    match: null,
    reply: async (...args: unknown[]) => {
      replyCalls.push(args);
    },
    editMessageText: async (...args: unknown[]) => {
      editCalls.push(args);
    },
    answerCallbackQuery: async (...args: unknown[]) => {
      answerCalls.push(args);
    },
    api: {
      sendMessage: async (...args: unknown[]) => {
        sendCalls.push(args);
      },
    },
    _replyCalls: replyCalls,
    _editCalls: editCalls,
    _sendCalls: sendCalls,
    _answerCalls: answerCalls,
    ...overrides,
  };
  return ctx as Context;
}

describe('cb() — callback_data byte-length guard', () => {
  it('accepts realistic worst-case payloads', () => {
    // Worst case: g:leaveY:<10-digit ID> = 18 ASCII bytes
    assert.equal(cb('g:leaveY:2147483647'), 'g:leaveY:2147483647');
    assert.equal(cb('g:c:1'), 'g:c:1');
    assert.equal(cb('g:list'), 'g:list');
  });

  it('throws on > 64 bytes UTF-8', () => {
    const tooLong = 'g:leave:' + '1'.repeat(60);
    assert.equal(Buffer.byteLength(tooLong, 'utf8'), 68);
    assert.throws(() => cb(tooLong), /callback_data too long/);
  });

  it('throws on Hebrew payload that overflows due to multi-byte chars', () => {
    // Each Hebrew char is 2 bytes — 33 chars = 66 bytes
    const hebrewPayload = 'ק'.repeat(33);
    assert.throws(() => cb(hebrewPayload), /callback_data too long/);
  });

  it('accepts payload exactly at 64 bytes', () => {
    const exactly64 = 'a'.repeat(64);
    assert.equal(cb(exactly64), exactly64);
  });
});

describe('groupHandler — /group (no args) → list view', () => {
  it('shows empty state for user with no groups', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const ctx = makeCtx({ message: { text: '/group' } });
    await bot._fireCmd('group', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /אינך חבר באף קבוצה/);
  });

  it('lists groups user belongs to', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    createGroup(db, { name: 'משפחה', ownerId: 1001, inviteCode: 'FAM001' });

    const ctx = makeCtx({ message: { text: '/group' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /משפחה/);
  });
});

describe('groupHandler — /group create', () => {
  it('creates a group with valid name and shows invite code', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const ctx = makeCtx({ message: { text: '/group create משפחה' } });
    await bot._fireCmd('group', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /משפחה/);
    // Invite code should appear in the message (6 chars from CODE_ALPHABET)
    assert.match(text, /[A-Z2-9]{6}/);

    // DB side-effect: 1 group + 1 owner membership
    assert.equal(countGroupsOwnedBy(getDb(), 1001), 1);
  });

  it('rejects empty name', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    const ctx = makeCtx({ message: { text: '/group create   ' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /שם/);
    assert.equal(countGroupsOwnedBy(getDb(), 1001), 0);
  });

  it('enforces MAX_GROUPS_PER_USER_FALLBACK cap', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    // Pre-create exactly the cap directly via repo
    const db = getDb();
    for (let i = 0; i < MAX_GROUPS_PER_USER_FALLBACK; i++) {
      createGroup(db, { name: `g${i}`, ownerId: 1001, inviteCode: `CAP${i}AB` });
    }

    const ctx = makeCtx({ message: { text: '/group create extra' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /הגעת לגבול|מקסימום|מוגבל/);
    assert.equal(countGroupsOwnedBy(db, 1001), MAX_GROUPS_PER_USER_FALLBACK);
  });
});

describe('groupHandler — /group join', () => {
  it('joins via valid invite code', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001); // owner
    upsertUser(1002); // joiner
    const db = getDb();
    const group = createGroup(db, { name: 'משפחה', ownerId: 1001, inviteCode: 'JOIN01' });

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join JOIN01' } });
    await bot._fireCmd('group', ctx);

    assert.equal(countMembersOfGroup(db, group.id), 2);
    const groups = getGroupsForUser(db, 1002);
    assert.equal(groups.length, 1);
  });

  it('rejects invalid code and increments failure counter', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1002);

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join NOPE99' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /קוד.*תקין|לא נמצא/);
    assert.equal(joinFailures.get(1002)?.count, 1);
  });

  it('blocks user after 5 failed attempts', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1002);

    // Pre-set the failure count to the threshold
    joinFailures.set(1002, { count: 5, blockedUntil: Date.now() + 60_000 });

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join ANY999' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /יותר מדי|נחסם|נסה שוב בעוד/);
  });

  it('rejects join when group is at member cap', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const group = createGroup(db, { name: 'full', ownerId: 1001, inviteCode: 'FULL01' });

    // Fill the group to the cap (owner + N-1 others)
    for (let i = 2; i < 2 + MAX_MEMBERS_PER_GROUP_FALLBACK - 1; i++) {
      upsertUser(i);
      db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(group.id, i);
    }
    assert.equal(countMembersOfGroup(db, group.id), MAX_MEMBERS_PER_GROUP_FALLBACK);

    const lateJoinerId = 9999;
    upsertUser(lateJoinerId);
    const ctx = makeCtx({ chat: { id: lateJoinerId, type: 'private' }, message: { text: '/group join FULL01' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /מלאה|מקסימום|חברים/);
    // Joiner did NOT get added
    assert.equal(countMembersOfGroup(db, group.id), MAX_MEMBERS_PER_GROUP_FALLBACK);
  });

  it('respects 5s cooldown between attempts', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1002);

    // First attempt — sets cooldown (will fail with bad code, that's fine)
    let ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join NOPE01' } });
    await bot._fireCmd('group', ctx);

    // Second attempt immediately — should be cooldown-blocked
    ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join NOPE02' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /נסה שוב|המתן|שניות/);
  });
});

// PR #230 review item #7 — invite alphabet exclusion (no 0/O/I/1)
describe('invite code alphabet — generated codes never contain 0/O/I/1', () => {
  it('500 generated codes all match /^[A-HJ-NP-Z2-9]{6}$/', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const codes: string[] = [];
    for (let i = 0; i < 500; i++) {
      // Each /group create call mints a fresh code; capture it from reply text
      const ctx = makeCtx({ message: { text: `/group create test${i}` } });
      // Bypass the MAX_GROUPS_PER_USER cap by deleting prior groups before each call
      getDb().prepare('DELETE FROM groups').run();
      await bot._fireCmd('group', ctx);
      const reply = (ctx as any)._replyCalls[0]?.[0] as string;
      const m = reply.match(/<code>([A-Z2-9]{6})<\/code>/);
      assert.ok(m, `iteration ${i}: reply did not contain a code: ${reply.slice(0, 80)}`);
      codes.push(m[1]);
    }

    // 500 samples × 6 chars = 3000 characters scanned
    const banned = /[0OI1]/;
    for (const code of codes) {
      assert.ok(!banned.test(code), `code ${code} contains a banned char`);
      assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    }
  });
});

// PR #230 review item #10 — owner-only invite code disclosure (auth invariant)
describe('g:c callback — owner-only invite code disclosure', () => {
  it('shows invite code to the owner', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const group = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'OWN001' });

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' } });
    await bot._fireCb(`g:c:${group.id}`, ctx);

    // Latest editMessageText call is the rendered card
    const editArgs = (ctx as any)._editCalls[0];
    assert.ok(editArgs, 'expected an editMessageText call');
    const text = editArgs[0] as string;
    assert.match(text, /OWN001/, 'owner must see the invite code');
  });

  it('hides invite code from a non-owner member', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001); // owner
    upsertUser(1002); // non-owner member
    const db = getDb();
    const group = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'NOSEE1' });
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(group.id, 1002);

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' } });
    await bot._fireCb(`g:c:${group.id}`, ctx);

    const editArgs = (ctx as any)._editCalls[0];
    assert.ok(editArgs, 'expected an editMessageText call');
    const text = editArgs[0] as string;
    assert.doesNotMatch(text, /NOSEE1/, 'non-owner must NOT see the invite code');
    // But the group name should still appear (basic card view)
    assert.match(text, /family/);
  });

  it('blocks non-members from viewing the card entirely', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    upsertUser(9999); // not a member
    const db = getDb();
    const group = createGroup(db, { name: 'private', ownerId: 1001, inviteCode: 'BLK001' });

    const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
    await bot._fireCb(`g:c:${group.id}`, ctx);

    const editArgs = (ctx as any)._editCalls[0];
    assert.ok(editArgs);
    const text = editArgs[0] as string;
    assert.match(text, /אינך חבר/);
    // No invite code, no group internals leaked
    assert.doesNotMatch(text, /BLK001/);
    assert.doesNotMatch(text, /private/);
  });
});

// PR #230 review minor items — name length, non-private chat, cooldown ordering
describe('groupHandler — input validation', () => {
  it('rejects group name longer than 50 chars', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    const longName = 'א'.repeat(51);
    const ctx = makeCtx({ message: { text: `/group create ${longName}` } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /ארוך מדי|מקסימום/);
    assert.equal(countGroupsOwnedBy(getDb(), 1001), 0);
  });

  it('replies with explanation in non-private chat (not silent)', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    const ctx = makeCtx({ chat: { id: -1001, type: 'group' }, message: { text: '/group' } });
    await bot._fireCmd('group', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /שיחה פרטית/);
  });

  it('does not consume cooldown when /group join has no args', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1002);

    // Empty args — should NOT set cooldown
    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group join' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /חסר קוד|שימוש/);
    // Cooldown map should NOT have an entry for 1002
    assert.equal(joinCooldownMap.has(1002), false);
  });
});

describe('groupHandler — /group leave', () => {
  it('removes member from group', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001); // owner
    upsertUser(1002); // member
    const db = getDb();
    const group = createGroup(db, { name: 'x', ownerId: 1001, inviteCode: 'LV0001' });
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(group.id, 1002);
    assert.equal(countMembersOfGroup(db, group.id), 2);

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: `/group leave ${group.id}` } });
    await bot._fireCmd('group', ctx);

    assert.equal(countMembersOfGroup(db, group.id), 1);
  });

  it('blocks owner from leaving when other members exist', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    upsertUser(1002);
    const db = getDb();
    const group = createGroup(db, { name: 'x', ownerId: 1001, inviteCode: 'LV0002' });
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(group.id, 1002);

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: `/group leave ${group.id}` } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /בעלים|בעלות|מחק/);
    // Still in the group
    assert.equal(countMembersOfGroup(db, group.id), 2);
  });

  it('owner leaving last member deletes the group entirely', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const group = createGroup(db, { name: 'solo', ownerId: 1001, inviteCode: 'LV0003' });
    assert.equal(countMembersOfGroup(db, group.id), 1);

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: `/group leave ${group.id}` } });
    await bot._fireCmd('group', ctx);

    // Group is gone
    assert.equal(findGroupByInviteCode(db, 'LV0003'), undefined);
  });
});
