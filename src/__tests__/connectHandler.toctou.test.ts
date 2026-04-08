// TOCTOU regression tests for the cx:confirm callback in connectHandler.
//
// Context: The /connect flow has two steps:
//   1. `/connect {code}` — validates the target exists, not a duplicate, etc,
//      then stores state in the in-memory `pendingPermissions` Map and shows
//      the permission toggle screen.
//   2. `cx:confirm` — callback that reads the pendingPermissions state and
//      creates the real `contacts` row via `createContactWithPermissions`.
//
// Between those two steps the DB state can change — e.g. user A accepts
// user B's incoming request from another device while still staring at the
// permission screen on the first device, or a second rapid-fire `cx:confirm`
// lands after the first one already created the contact row. The handler
// MUST re-run the duplicate-pair and pending-count checks at confirm time
// and reject gracefully, not crash or corrupt the contact_permissions table.
//
// The existing connectHandler.test.ts has 32 tests, none of which simulate
// state changes between pendingPermissions being populated and cx:confirm
// firing. These tests lock that guard down.
//
// Simulation strategy: we directly seed `pendingPermissions.set(...)` with a
// valid state, then synchronously mutate the DB to inject the race, then
// fire the `cx:confirm` callback. No concurrency primitives needed — the
// handler is fully synchronous once it starts.
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db/schema.js';
import { upsertUser } from '../db/userRepository.js';
import {
  createContact,
  createContactWithPermissions,
  getContactByPair,
  getPermissions,
} from '../db/contactRepository.js';
import {
  registerConnectHandler,
  pendingPermissions,
  failureCounts,
  lookupCooldownMap,
} from '../bot/connectHandler.js';
import type { Bot, Context } from 'grammy';

// Constants mirroring connectHandler internals. MAX_PENDING_REQUESTS is
// currently 10 — if this changes, fail loudly.
const MAX_PENDING_REQUESTS_ASSUMED = 10;

const REQUESTER = 5_001;
const TARGET = 5_002;

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

beforeEach(() => {
  // Clean DB + module state between tests. Same pattern as the primary
  // connectHandler.test.ts suite.
  const db = getDb();
  db.prepare('DELETE FROM contact_permissions').run();
  db.prepare('DELETE FROM contacts').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM settings').run();
  failureCounts.clear();
  lookupCooldownMap.clear();
  pendingPermissions.clear();
});

function buildMockBot() {
  const callbacks: Array<[string | RegExp, (ctx: Context) => Promise<void>]> = [];
  return {
    command: () => {},
    callbackQuery: (pat: string | RegExp, handler: (ctx: Context) => Promise<void>) => {
      callbacks.push([pat, handler]);
    },
    on: () => {},
    catch: () => {},
    _fireCb: async (data: string, ctx: Context) => {
      for (const [pat, handler] of callbacks) {
        if (typeof pat === 'string' && pat === data) { await handler(ctx); return; }
        if (pat instanceof RegExp && pat.test(data)) {
          (ctx as unknown as { match: RegExpMatchArray | null }).match = data.match(pat);
          await handler(ctx);
          return;
        }
      }
    },
  };
}

interface TestCtx extends Context {
  _editCalls: [string, unknown?][];
  _replyCalls: [string, unknown?][];
  _answerCalls: unknown[];
  _sendCalls: unknown[];
}

function makeCtx(chatId: number): TestCtx {
  const editCalls: [string, unknown?][] = [];
  const replyCalls: [string, unknown?][] = [];
  const answerCalls: unknown[] = [];
  const sendCalls: unknown[] = [];
  const ctx = {
    chat: { id: chatId, type: 'private' },
    message: { text: '' },
    match: null,
    reply: async (text: string, opts?: unknown) => { replyCalls.push([text, opts]); },
    editMessageText: async (text: string, opts?: unknown) => { editCalls.push([text, opts]); },
    answerCallbackQuery: async (...args: unknown[]) => { answerCalls.push(args); },
    api: {
      sendMessage: async (...args: unknown[]) => { sendCalls.push(args); },
    },
    _editCalls: editCalls,
    _replyCalls: replyCalls,
    _answerCalls: answerCalls,
    _sendCalls: sendCalls,
  };
  return ctx as unknown as TestCtx;
}

function primePendingState(chatId: number, targetId: number): void {
  pendingPermissions.set(chatId, {
    targetId,
    targetName: 'Test Target',
    safety_status: true,
    home_city: false,
    update_time: true,
    expiresAt: Date.now() + 10 * 60_000,
  });
}

describe('connectHandler — cx:confirm TOCTOU guards', () => {
  it('rejects when a forward contact was inserted between invite and confirm', async () => {
    upsertUser(REQUESTER);
    upsertUser(TARGET);

    const bot = buildMockBot();
    registerConnectHandler(bot as unknown as Bot);

    // Requester is mid-flow: /connect already ran and seeded pendingPermissions.
    primePendingState(REQUESTER, TARGET);

    // RACE: a forward contact appears before cx:confirm fires.
    // (In production this would be caused by a second device issuing /connect
    // + cx:confirm ahead of the first one, or an accepted reverse request.)
    createContact(REQUESTER, TARGET);

    const ctx = makeCtx(REQUESTER);
    await bot._fireCb('cx:confirm', ctx);

    // Verdict: editMessageText with the "already connected" copy, NO new
    // contact row, NO permissions row leaked.
    assert.equal(ctx._editCalls.length, 1, 'must edit the bot message once with rejection copy');
    assert.match(ctx._editCalls[0]![0], /כבר מחוברים/, 'copy must explain already-connected');
    assert.equal(
      pendingPermissions.get(REQUESTER),
      undefined,
      'pendingPermissions must be cleared on rejection'
    );

    // Only ONE contact row must exist (the one we injected) — the handler
    // must not insert a duplicate.
    const allRows = getDb().prepare('SELECT COUNT(*) as c FROM contacts').get() as { c: number };
    assert.equal(allRows.c, 1, 'handler must NOT insert a duplicate contact row');

    // The pre-existing contact was created via createContact() which does
    // NOT write a permissions row — so the permissions table must still be
    // empty. If the cx:confirm handler leaked a row, this would be 1.
    const perms = getDb().prepare('SELECT COUNT(*) as c FROM contact_permissions').get() as { c: number };
    assert.equal(perms.c, 0, 'no orphan permissions row leaked on rejected confirm');
  });

  it('rejects when a REVERSE contact was inserted between invite and confirm', async () => {
    upsertUser(REQUESTER);
    upsertUser(TARGET);

    const bot = buildMockBot();
    registerConnectHandler(bot as unknown as Bot);

    primePendingState(REQUESTER, TARGET);
    // RACE: reverse direction gets a row (target → requester). Either
    // direction counts as "already connected".
    createContact(TARGET, REQUESTER);

    const ctx = makeCtx(REQUESTER);
    await bot._fireCb('cx:confirm', ctx);

    assert.equal(ctx._editCalls.length, 1);
    assert.match(ctx._editCalls[0]![0], /כבר מחוברים/);
    assert.equal(pendingPermissions.get(REQUESTER), undefined);
    // One row (the reverse we inserted). Handler must not add a second.
    const allRows = getDb().prepare('SELECT COUNT(*) as c FROM contacts').get() as { c: number };
    assert.equal(allRows.c, 1);
  });

  it('rejects when target reached MAX_PENDING_REQUESTS between invite and confirm', async () => {
    upsertUser(REQUESTER);
    upsertUser(TARGET);
    const bot = buildMockBot();
    registerConnectHandler(bot as unknown as Bot);

    primePendingState(REQUESTER, TARGET);

    // RACE: fill the target's inbox with MAX_PENDING_REQUESTS pending invites
    // from other random requesters — now the target is over cap by the time
    // cx:confirm fires.
    for (let i = 0; i < MAX_PENDING_REQUESTS_ASSUMED; i++) {
      const otherRequester = 6_000 + i;
      upsertUser(otherRequester);
      createContact(otherRequester, TARGET);
    }

    const ctx = makeCtx(REQUESTER);
    await bot._fireCb('cx:confirm', ctx);

    assert.equal(ctx._editCalls.length, 1);
    assert.match(
      ctx._editCalls[0]![0],
      /יותר מדי בקשות ממתינות/,
      'copy must explain pending cap reached'
    );
    assert.equal(pendingPermissions.get(REQUESTER), undefined);

    // Requester must NOT have a contact row — the handler must not create one.
    assert.equal(getContactByPair(REQUESTER, TARGET), undefined);
  });

  it('leaves no orphan permission rows when cx:confirm rejects after a race', async () => {
    upsertUser(REQUESTER);
    upsertUser(TARGET);
    const bot = buildMockBot();
    registerConnectHandler(bot as unknown as Bot);

    // Seed a "prior success" state: a different contact exists with its own
    // permissions row, so we can assert that the rejected attempt doesn't
    // leak an orphan or corrupt the existing row. Both user rows must exist
    // first — contacts table has FK constraints on user_id + contact_id.
    upsertUser(9_999);
    upsertUser(9_998);
    const prior = createContactWithPermissions(9_999, 9_998, {
      safety_status: true, home_city: true, update_time: true,
    });
    assert.ok(prior.id);

    primePendingState(REQUESTER, TARGET);
    createContact(REQUESTER, TARGET); // race

    const ctx = makeCtx(REQUESTER);
    await bot._fireCb('cx:confirm', ctx);

    // Only the pre-existing permissions row should remain. If the handler
    // wrongly inserted another, perms.c would be 2.
    const perms = getDb().prepare('SELECT COUNT(*) as c FROM contact_permissions').get() as { c: number };
    assert.equal(perms.c, 1, 'only the pre-existing permissions row remains after rejected confirm');

    // And the pre-existing row's values are unchanged.
    const priorPerms = getPermissions(prior.id);
    assert.deepEqual(priorPerms, { safety_status: true, home_city: true, update_time: true });
  });

  it('normal happy path still works — no race, confirm creates contact + permissions', async () => {
    // Sanity check: the TOCTOU guard must not break the non-racing case.
    upsertUser(REQUESTER);
    upsertUser(TARGET);
    const bot = buildMockBot();
    registerConnectHandler(bot as unknown as Bot);

    primePendingState(REQUESTER, TARGET);

    const ctx = makeCtx(REQUESTER);
    await bot._fireCb('cx:confirm', ctx);

    const contact = getContactByPair(REQUESTER, TARGET);
    assert.ok(contact, 'contact must be created in the non-racing case');
    assert.equal(pendingPermissions.get(REQUESTER), undefined, 'state cleared on success too');

    const perms = getPermissions(contact!.id);
    assert.ok(perms, 'permissions row must be created on happy path');
    assert.equal(perms!.safety_status, true);
    assert.equal(perms!.home_city, false);
    assert.equal(perms!.update_time, true);
  });
});
