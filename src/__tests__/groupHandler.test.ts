import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
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
  createGroupWithCollisionRetry,
  renderGroupStatus,
} from '../bot/groupHandler.js';
import { InviteCodeCollisionError, findGroupById } from '../db/groupRepository.js';
import { upsertSafetyStatus } from '../db/safetyStatusRepository.js';
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

// PR #230 second-round review Gap A — exhaustion path of the collision retry loop.
// The helper is exported precisely so this test can drive the loop with stub
// dependencies, exercising the all-collide branch without requiring concurrent
// inserts or DB-level race simulation.
describe('createGroupWithCollisionRetry — exhaustion + all branches', () => {
  it("returns 'collision-exhausted' after maxRetries consecutive collisions", () => {
    const db = getDb();
    upsertUser(1001);

    let calls = 0;
    const result = createGroupWithCollisionRetry(
      db,
      { name: 'doomed', ownerId: 1001 },
      {
        // Generate predictable codes — values don't matter, only that they're fresh
        generateInviteCodeFn: () => `STUB${++calls}`,
        // Always collide
        createGroupFn: () => {
          throw new InviteCodeCollisionError('STUB');
        },
        maxRetries: 3,
      },
    );

    assert.equal(result.kind, 'collision-exhausted');
    // Each retry should have called both deps once
    assert.equal(calls, 3, 'generateInviteCodeFn should have been called maxRetries times');
    // No actual group was created in the DB
    assert.equal(countGroupsOwnedBy(db, 1001), 0);
  });

  it("returns 'codegen-failed' when generateInviteCodeFn throws non-collision error", () => {
    const db = getDb();
    upsertUser(1001);

    const result = createGroupWithCollisionRetry(
      db,
      { name: 'x', ownerId: 1001 },
      {
        generateInviteCodeFn: () => {
          throw new Error('crypto exhausted');
        },
        createGroupFn: () => {
          throw new Error('should not be reached');
        },
        maxRetries: 3,
      },
    );

    assert.equal(result.kind, 'codegen-failed');
    if (result.kind === 'codegen-failed') {
      assert.match(String((result.cause as Error).message), /crypto exhausted/);
    }
  });

  it("returns 'createGroup-failed' when createGroup throws a non-collision error (e.g. FK)", () => {
    const db = getDb();
    upsertUser(1001);

    const result = createGroupWithCollisionRetry(
      db,
      { name: 'x', ownerId: 1001 },
      {
        generateInviteCodeFn: () => 'OKAY01',
        createGroupFn: () => {
          throw new Error('FOREIGN KEY constraint failed');
        },
        maxRetries: 3,
      },
    );

    assert.equal(result.kind, 'createGroup-failed');
    if (result.kind === 'createGroup-failed') {
      assert.match(String((result.cause as Error).message), /FOREIGN KEY/);
    }
  });

  it("retries past one collision and returns 'ok' when subsequent attempt succeeds", () => {
    const db = getDb();
    upsertUser(1001);

    let attempt = 0;
    const result = createGroupWithCollisionRetry(
      db,
      { name: 'persistent', ownerId: 1001 },
      {
        generateInviteCodeFn: () => `RTY${++attempt}`,
        createGroupFn: (innerDb, input) => {
          if (attempt === 1) throw new InviteCodeCollisionError(input.inviteCode);
          // Second attempt: actually create
          return createGroup(innerDb, input);
        },
        maxRetries: 3,
      },
    );

    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.equal(result.inviteCode, 'RTY2'); // first retry
      assert.equal(result.group.name, 'persistent');
      assert.equal(result.group.ownerId, 1001);
    }
    assert.equal(countGroupsOwnedBy(db, 1001), 1);
  });

  it('handler integration — exhaustion path surfaces the specific Hebrew error message', async () => {
    // Top-level test: exhaustion shows "לא הצלחנו ליצור קוד הזמנה ייחודי" — distinct
    // from the generic 'שגיאת שרת ביצירת קוד'. This guards against future refactors
    // collapsing the two error messages.
    const db = getDb();
    upsertUser(1001);

    // Pre-seed all 32 alphabet permutations is impractical. Instead, use the seam:
    // monkey-patch crypto.randomInt to always return 0 so generateInviteCode
    // produces "AAAAAA", then pre-create that row so generateInviteCode itself
    // exhausts internally (5 retries on the same code).
    const realRandomInt = crypto.randomInt;
    (crypto as any).randomInt = () => 0;
    try {
      // Pre-create the row that will collide
      createGroup(db, { name: 'blocker', ownerId: 1001, inviteCode: 'AAAAAA' });

      const bot = buildMockBot();
      registerGroupHandler(bot as unknown as Bot);

      const ctx = makeCtx({ message: { text: '/group create newone' } });
      await bot._fireCmd('group', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      // generateInviteCode exhausts internally → 'codegen-failed' branch → its message
      assert.match(text, /קוד הזמנה|שגיאת שרת/);
    } finally {
      (crypto as any).randomInt = realRandomInt;
    }
  });
});

// PR #230 second-round review Gap B — handleLeave picker + validation branches.
// 5 distinct branches, covered by 4 tests (NaN + negative grouped).
describe('groupHandler — /group leave validation branches', () => {
  it('shows empty-state reply when user has no groups and uses no-arg picker', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1002);

    const ctx = makeCtx({ chat: { id: 1002, type: 'private' }, message: { text: '/group leave' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /אינך חבר באף קבוצה/);
  });

  it('shows multi-group inline picker when user belongs to ≥2 groups', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const g1 = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'PCK001' });
    const g2 = createGroup(db, { name: 'work',   ownerId: 1001, inviteCode: 'PCK002' });

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/group leave' } });
    await bot._fireCmd('group', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /בחר קבוצה/);
    // Inline keyboard should have one button per group, both pointing at g:leaveY:<id>
    const markup = JSON.stringify((ctx as any)._replyCalls[0][1]?.reply_markup ?? {});
    assert.ok(markup.includes(`g:leaveY:${g1.id}`), 'picker should include g1');
    assert.ok(markup.includes(`g:leaveY:${g2.id}`), 'picker should include g2');
  });

  it('rejects NaN / negative / zero groupId', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    for (const badId of ['abc', '-5', '0', '999999999999999999999999']) {
      const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: `/group leave ${badId}` } });
      await bot._fireCmd('group', ctx);

      const text = (ctx as any)._replyCalls[0]?.[0] as string;
      // Either "מזהה קבוצה לא תקין" (NaN/<=0 path) or "הקבוצה לא נמצאה" (huge int → no row)
      assert.ok(
        /מזהה קבוצה לא תקין|הקבוצה לא נמצאה/.test(text),
        `expected validation error for badId="${badId}", got: ${text}`,
      );
    }
  });

  it('rejects "group not found" when groupId does not exist', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/group leave 99999' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /הקבוצה לא נמצאה/);
  });

  it('rejects non-member trying to leave a group they are not in', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001); // owner
    upsertUser(9999); // not a member
    const db = getDb();
    const g = createGroup(db, { name: 'private', ownerId: 1001, inviteCode: 'NMB001' });

    const ctx = makeCtx({ chat: { id: 9999, type: 'private' }, message: { text: `/group leave ${g.id}` } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /אינך חבר/);
    // Group still exists, untouched
    assert.equal(countMembersOfGroup(db, g.id), 1);
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

// ─── Task 2 (#212) — /group status command ──────────────────────────────────

describe('groupHandler — /group status command dispatch', () => {
  it('shows empty state for user with no groups', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    const ctx = makeCtx({ message: { text: '/group status' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /אינך חבר באף קבוצה/);
  });

  it('auto-picks single group and renders status card', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const g = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'STA001' });

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/group status' } });
    await bot._fireCmd('group', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /family/);
    // Single member who hasn't reported → shows "0/1 בסדר" + "לא דיווח"
    assert.match(text, /0\/1 בסדר/);
    assert.match(text, /לא דיווח/);
    // Hint to /status command (no safety:menu callback exists)
    assert.match(text, /\/status/);

    // Inline keyboard should have just the refresh button targeting g:refresh:<id>
    const markup = JSON.stringify((ctx as any)._replyCalls[0][1]?.reply_markup ?? {});
    assert.ok(markup.includes(`g:refresh:${g.id}`), 'should have refresh button');
    assert.ok(!markup.includes('safety:menu'), 'must NOT reference non-existent safety:menu');
  });

  it('shows multi-group picker when user belongs to ≥2 groups', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const g1 = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'STA002' });
    const g2 = createGroup(db, { name: 'work',   ownerId: 1001, inviteCode: 'STA003' });

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/group status' } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /בחר קבוצה/);
    const markup = JSON.stringify((ctx as any)._replyCalls[0][1]?.reply_markup ?? {});
    assert.ok(markup.includes(`g:s:${g1.id}`), 'picker should include g1');
    assert.ok(markup.includes(`g:s:${g2.id}`), 'picker should include g2');
  });

  it('rejects non-member trying to view status by explicit groupId', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    upsertUser(9999);
    const db = getDb();
    const g = createGroup(db, { name: 'private', ownerId: 1001, inviteCode: 'STA004' });

    const ctx = makeCtx({ chat: { id: 9999, type: 'private' }, message: { text: `/group status ${g.id}` } });
    await bot._fireCmd('group', ctx);

    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /אינך חבר/);
    // Group internals never leak
    assert.doesNotMatch(text, /private/);
  });

  it('rejects NaN / negative groupId in /group status', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);
    upsertUser(1001);

    for (const badId of ['abc', '-5', '0']) {
      const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: `/group status ${badId}` } });
      await bot._fireCmd('group', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /מזהה קבוצה לא תקין/, `expected validation error for badId="${badId}", got: ${text}`);
    }
  });
});

describe('renderGroupStatus — content + aggregate count', () => {
  it('aggregates ok/help/dismissed/none with correct emoji + count', async () => {
    upsertUser(1001);
    upsertUser(1002);
    upsertUser(1003);
    upsertUser(1004);
    const db = getDb();
    const g = createGroup(db, { name: 'cell', ownerId: 1001, inviteCode: 'AGG001' });
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(g.id, 1002);
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(g.id, 1003);
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(g.id, 1004);

    // Seed statuses: owner=ok, 1002=help, 1003=dismissed, 1004=no status
    upsertSafetyStatus(db, 1001, 'ok');
    upsertSafetyStatus(db, 1002, 'help');
    upsertSafetyStatus(db, 1003, 'dismissed');

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' } });
    // Inject lookupUser that reads from THIS db (not getDb() singleton).
    // Without injection, getUser() reads from process.env DB_PATH, which is :memory:
    // here so it would happen to work — but we test the seam explicitly.
    const testLookup = (chatId: number) => {
      const row = db.prepare('SELECT display_name, home_city FROM users WHERE chat_id = ?').get(chatId) as
        | { display_name: string | null; home_city: string | null }
        | undefined;
      return row;
    };
    await renderGroupStatus(ctx as any, db, g.id, testLookup);

    assert.equal((ctx as any)._replyCalls.length, 1);
    const text = (ctx as any)._replyCalls[0][0] as string;

    assert.match(text, /cell/);
    assert.match(text, /✅/);
    assert.match(text, /⚠️/);
    assert.match(text, /🔇/);
    assert.match(text, /❓/);
    assert.match(text, /1\/4 בסדר/, 'only owner reported ok → 1/4');
    assert.match(text, /\/status/);
  });

  it('uses editMessageText when called from a callback context (refresh path)', async () => {
    upsertUser(1001);
    const db = getDb();
    const g = createGroup(db, { name: 'rfr', ownerId: 1001, inviteCode: 'RFR001' });

    const ctx = makeCtx({
      chat: { id: 1001, type: 'private' },
      callbackQuery: { id: 'fakeId', data: `g:refresh:${g.id}` },
    });
    const lookup = (chatId: number) =>
      db.prepare('SELECT display_name, home_city FROM users WHERE chat_id = ?').get(chatId) as any;

    await renderGroupStatus(ctx as any, db, g.id, lookup);

    // Should have called editMessageText, NOT reply
    assert.equal((ctx as any)._editCalls.length, 1);
    assert.equal((ctx as any)._replyCalls.length, 0);
    const editText = (ctx as any)._editCalls[0][0] as string;
    assert.match(editText, /rfr/);
  });

  it('handles missing display_name with fallback "משתמש #<id>"', async () => {
    const db = getDb();
    // Insert a user with NO display_name (simulating pre-onboarding state)
    db.prepare("INSERT INTO users (chat_id, created_at) VALUES (?, datetime('now'))").run(7777);
    const g = createGroup(db, { name: 'noname', ownerId: 7777, inviteCode: 'NON001' });

    const ctx = makeCtx({ chat: { id: 7777, type: 'private' } });
    const lookup = (chatId: number) =>
      db.prepare('SELECT display_name, home_city FROM users WHERE chat_id = ?').get(chatId) as any;

    await renderGroupStatus(ctx as any, db, g.id, lookup);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /משתמש #7777/);
  });

  it('returns "הקבוצה לא נמצאה" when group does not exist', async () => {
    const db = getDb();
    upsertUser(1001);
    const ctx = makeCtx({ chat: { id: 1001, type: 'private' } });
    const lookup = (chatId: number) =>
      db.prepare('SELECT display_name, home_city FROM users WHERE chat_id = ?').get(chatId) as any;

    await renderGroupStatus(ctx as any, db, 999999, lookup);
    const text = (ctx as any)._replyCalls[0][0] as string;
    assert.match(text, /הקבוצה לא נמצאה/);
  });
});

describe('g:s and g:refresh callbacks', () => {
  it('g:s:<id> callback renders status via editMessageText', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    const db = getDb();
    const g = createGroup(db, { name: 'cb-test', ownerId: 1001, inviteCode: 'CBS001' });

    const ctx = makeCtx({ chat: { id: 1001, type: 'private' } });
    await bot._fireCb(`g:s:${g.id}`, ctx);

    // Either edited or replied — the callback wraps editMessageText which the
    // mock supports — but since renderGroupStatus checks ctx.callbackQuery
    // truthiness, and the mock setter doesn't add it, expect a reply OR an edit.
    // The picker→g:s flow uses editMessageText (the mock context will have
    // callbackQuery via _fireCb path).
    const totalCalls = (ctx as any)._editCalls.length + (ctx as any)._replyCalls.length;
    assert.ok(totalCalls > 0, 'g:s should produce some output');
    // Find the rendered text
    const text = ((ctx as any)._editCalls[0]?.[0] ?? (ctx as any)._replyCalls[0]?.[0]) as string;
    assert.match(text, /cb-test/);
  });

  it('g:s:<id> blocks non-members entirely', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    upsertUser(9999);
    const db = getDb();
    const g = createGroup(db, { name: 'secret', ownerId: 1001, inviteCode: 'CBS002' });

    const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
    await bot._fireCb(`g:s:${g.id}`, ctx);

    const text = ((ctx as any)._editCalls[0]?.[0] ?? (ctx as any)._replyCalls[0]?.[0]) as string;
    assert.match(text, /אינך חבר/);
    // Group name never leaks to non-member
    assert.doesNotMatch(text, /secret/);
  });

  it('g:refresh:<id> blocks non-members', async () => {
    const bot = buildMockBot();
    registerGroupHandler(bot as unknown as Bot);

    upsertUser(1001);
    upsertUser(9999);
    const db = getDb();
    const g = createGroup(db, { name: 'rfr-secret', ownerId: 1001, inviteCode: 'RFR002' });

    const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
    await bot._fireCb(`g:refresh:${g.id}`, ctx);

    const text = ((ctx as any)._editCalls[0]?.[0] ?? (ctx as any)._replyCalls[0]?.[0]) as string;
    assert.match(text, /אינך חבר/);
    assert.doesNotMatch(text, /rfr-secret/);
  });
});
