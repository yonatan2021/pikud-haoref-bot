import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Bot, Context } from 'grammy';

process.env['DB_PATH'] = ':memory:';

import { initDb, getDb } from '../db/schema.js';
import {
  registerShelterStoriesHandler,
  clearPendingShare,
  hasPendingShare,
} from '../bot/shelterStoriesHandler.js';

// ── Mock bot factory ──────────────────────────────────────────────────────────

function createMockBot() {
  const handlers = {
    command: new Map<string, Function>(),
    callbackQuery: new Map<string, Function | Function[]>(),
    on: new Map<string, Function>(),
  };
  const bot = {
    command: (name: string, fn: Function) => {
      handlers.command.set(name, fn);
    },
    callbackQuery: (pattern: string | RegExp, fn: Function) => {
      const key = String(pattern);
      handlers.callbackQuery.set(key, fn);
    },
    on: (event: string, fn: Function) => {
      handlers.on.set(event, fn);
    },
    api: {
      sendMessage: mock.fn(async () => ({ message_id: 1 })),
    },
  } as unknown as Bot;
  return { bot, handlers };
}

function createMockCtx(overrides: Record<string, unknown> = {}): Context {
  return {
    from: { id: 55001, first_name: 'Test' },
    chat: { id: 55001, type: 'private' },
    message: { text: '' },
    reply: mock.fn(async () => ({ message_id: 1 })),
    editMessageText: mock.fn(async () => ({ message_id: 1 })),
    answerCallbackQuery: mock.fn(async () => {}),
    callbackQuery: { data: '' },
    match: null,
    ...overrides,
  } as unknown as Context;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const TEST_CHAT_ID = 55001;

before(() => {
  initDb();
  getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(TEST_CHAT_ID);
});

beforeEach(() => {
  clearPendingShare(TEST_CHAT_ID);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('shelterStoriesHandler', () => {
  it('registers the /share command', () => {
    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);
    assert.ok(handlers.command.has('share'), '/share must be registered');
  });

  it('/share when stories_enabled=false replies with disabled message', async () => {
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('stories_enabled','false',0)").run();

    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    const ctx = createMockCtx();
    const fn = handlers.command.get('share')!;
    await fn(ctx);

    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 1);
    const replyText: string = replyCalls[0].arguments[0] as string;
    assert.ok(replyText.includes('כבוי'), `expected 'כבוי' in reply, got: ${replyText}`);
    assert.equal(hasPendingShare(TEST_CHAT_ID), false);

    // cleanup
    getDb().prepare("DELETE FROM settings WHERE key = 'stories_enabled'").run();
  });

  it('/share when rate limited replies with rate limit message', async () => {
    // Set rate limit to 1 minute and insert a recent story
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('stories_rate_limit_minutes','60',0)").run();
    // Insert a story within the last hour to trigger rate limit
    getDb().prepare("INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)").run(TEST_CHAT_ID, 'prior story');

    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    const ctx = createMockCtx();
    const fn = handlers.command.get('share')!;
    await fn(ctx);

    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 1);
    const replyText: string = replyCalls[0].arguments[0] as string;
    assert.ok(replyText.includes('יותר מדי'), `expected rate limit message, got: ${replyText}`);
    assert.equal(hasPendingShare(TEST_CHAT_ID), false);

    // cleanup
    getDb().prepare("DELETE FROM settings WHERE key = 'stories_rate_limit_minutes'").run();
    getDb().prepare("DELETE FROM shelter_stories WHERE chat_id = ? AND body = 'prior story'").run(TEST_CHAT_ID);
  });

  it('/share sets pendingShares entry when not rate limited', async () => {
    getDb().prepare("DELETE FROM shelter_stories WHERE chat_id = ?").run(TEST_CHAT_ID);

    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    const ctx = createMockCtx();
    const fn = handlers.command.get('share')!;
    await fn(ctx);

    assert.equal(hasPendingShare(TEST_CHAT_ID), true);

    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 1);
  });

  it('text message with chatId in pendingShares creates story', async () => {
    getDb().prepare("DELETE FROM shelter_stories WHERE chat_id = ?").run(TEST_CHAT_ID);

    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    // Manually set pending state
    clearPendingShare(TEST_CHAT_ID);
    // Trigger /share to set state
    const commandFn = handlers.command.get('share')!;
    await commandFn(createMockCtx());
    assert.equal(hasPendingShare(TEST_CHAT_ID), true);

    // Now send a text message
    const textFn = handlers.on.get('message:text')!;
    const nextFn = mock.fn(async () => {});
    const ctx = createMockCtx({ message: { text: 'הייתי במקלט וזה היה מפחיד' } });
    await textFn(ctx, nextFn);

    // Story should be created, pendingShare cleared
    assert.equal(hasPendingShare(TEST_CHAT_ID), false);
    const storyCount = (getDb().prepare("SELECT COUNT(*) as cnt FROM shelter_stories WHERE chat_id = ?").get(TEST_CHAT_ID) as { cnt: number }).cnt;
    assert.ok(storyCount >= 1);

    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 1);
    const replyText: string = replyCalls[0].arguments[0] as string;
    assert.ok(replyText.includes('תודה'), `expected confirmation message, got: ${replyText}`);
    assert.equal((nextFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 0);
  });

  it('text message with chatId NOT in pendingShares calls next()', async () => {
    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    assert.equal(hasPendingShare(TEST_CHAT_ID), false);

    const textFn = handlers.on.get('message:text')!;
    const nextFn = mock.fn(async () => {});
    const ctx = createMockCtx({ message: { text: 'שאילתה כלשהי' } });
    await textFn(ctx, nextFn);

    assert.equal((nextFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 0);
  });

  it('text over max length replies with error without creating story', async () => {
    getDb().prepare("DELETE FROM shelter_stories WHERE chat_id = ?").run(TEST_CHAT_ID);
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('stories_max_length','200',0)").run();

    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    const commandFn = handlers.command.get('share')!;
    await commandFn(createMockCtx());
    assert.equal(hasPendingShare(TEST_CHAT_ID), true);

    const longText = 'א'.repeat(201);
    const textFn = handlers.on.get('message:text')!;
    const nextFn = mock.fn(async () => {});
    const ctx = createMockCtx({ message: { text: longText } });
    await textFn(ctx, nextFn);

    // pendingShare should remain (user can retry with shorter text)
    assert.equal(hasPendingShare(TEST_CHAT_ID), true);

    const replyCalls = (ctx.reply as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(replyCalls.length, 1);
    const replyText: string = replyCalls[0].arguments[0] as string;
    assert.ok(replyText.includes('ארוכה'), `expected length error, got: ${replyText}`);

    const storyCount = (getDb().prepare("SELECT COUNT(*) as cnt FROM shelter_stories WHERE chat_id = ?").get(TEST_CHAT_ID) as { cnt: number }).cnt;
    assert.equal(storyCount, 0);

    getDb().prepare("DELETE FROM settings WHERE key = 'stories_max_length'").run();
  });

  it('story:cancel removes from pendingShares and answers callback', async () => {
    const { bot, handlers } = createMockBot();
    registerShelterStoriesHandler(bot);

    // Manually set pending state
    const commandFn = handlers.command.get('share')!;
    await commandFn(createMockCtx());
    assert.equal(hasPendingShare(TEST_CHAT_ID), true);

    const cancelFn = handlers.callbackQuery.get('story:cancel')!;
    const ctx = createMockCtx({
      callbackQuery: { data: 'story:cancel' },
    });
    await (cancelFn as Function)(ctx);

    assert.equal(hasPendingShare(TEST_CHAT_ID), false);
    const answerCalls = (ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(answerCalls.length, 1);
  });
});
