import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { registerSearchHandler } from '../bot/searchHandler.js';
import { isSubscribed } from '../db/subscriptionRepository.js';
import { initDb } from '../db/schema.js';
import type { Bot, Context } from 'grammy';

// DB_PATH=:memory: must be set before initDb() is called
before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

// Minimal mock that captures registered Grammy handlers
function buildMockBot() {
  const commands: Record<string, (ctx: Context) => Promise<void>> = {};
  const callbacks: Array<[string | RegExp, (ctx: Context) => Promise<void>]> = [];
  const messageHandlers: Array<(ctx: Context, next: () => Promise<void>) => Promise<void>> = [];
  return {
    command: (name: string, handler: (ctx: Context) => Promise<void>) => {
      commands[name] = handler;
    },
    callbackQuery: (pat: string | RegExp, handler: (ctx: Context) => Promise<void>) => {
      callbacks.push([pat, handler]);
    },
    on: (_ev: string, handler: (ctx: Context, next: () => Promise<void>) => Promise<void>) => {
      messageHandlers.push(handler);
    },
    catch: () => {},
    _fireCmd: async (name: string, ctx: Context) => commands[name]?.(ctx),
    _fireCb: async (data: string, ctx: Context) => {
      for (const [pat, handler] of callbacks) {
        if (typeof pat === 'string' && pat === data) { await handler(ctx); return; }
        if (pat instanceof RegExp && pat.test(data)) {
          (ctx as any).match = data.match(pat);
          await handler(ctx);
          return;
        }
      }
    },
    _fireMsg: async (ctx: Context) => {
      const noop = async () => {};
      for (const h of messageHandlers) { await h(ctx, noop); }
    },
  };
}

// Build a minimal Grammy context mock
function makeCtx(overrides: Record<string, unknown> = {}): Context {
  const replyCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 1000, type: 'private' },
    message: null,
    callbackQuery: null,
    match: null,
    reply: async (...args: unknown[]) => { replyCalls.push(args); },
    editMessageText: async () => {},
    answerCallbackQuery: async () => {},
    _replyCalls: replyCalls,
    ...overrides,
  };
  return ctx as unknown as Context;
}

describe('registerSearchHandler', () => {
  describe('/add command', () => {
    it('does nothing in a group chat', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      const ctx = makeCtx({ chat: { id: 9001, type: 'supergroup' } });
      await bot._fireCmd('add', ctx);
      assert.equal((ctx as any)._replyCalls.length, 0, 'reply should not be called in group');
    });

    it('sends search prompt in a private chat', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      const ctx = makeCtx({ chat: { id: 9002, type: 'private' } });
      await bot._fireCmd('add', ctx);
      assert.equal((ctx as any)._replyCalls.length, 1, 'reply should be called once');
      const replyText = (ctx as any)._replyCalls[0][0] as string;
      assert.ok(replyText.includes('חיפוש'), 'reply should mention search');
    });
  });

  describe('search:cancel callback', () => {
    it('calls reply/editMessageText (returns to alerts menu)', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      let editCalled = false;
      const ctx = makeCtx({
        chat: { id: 9003, type: 'private' },
        editMessageText: async () => { editCalled = true; },
      });
      await bot._fireCb('search:cancel', ctx);
      assert.equal(editCalled, true, 'editMessageText should be called on cancel');
    });
  });

  describe('st:<id> subscription toggle', () => {
    it('subscribes city on first tap', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      const chatId = 9010;
      const cityId = 511; // אבו גוש
      const cityName = 'אבו גוש';

      // Ensure not subscribed before
      assert.equal(isSubscribed(chatId, cityName), false);

      const ctx = makeCtx({
        chat: { id: chatId, type: 'private' },
        callbackQuery: { message: { text: `🔍 תוצאות עבור "${cityName}":` } },
        editMessageText: async () => {},
      });

      await bot._fireCb(`st:${cityId}`, ctx);
      assert.equal(isSubscribed(chatId, cityName), true, 'city should be subscribed after first tap');
    });

    it('unsubscribes city on second tap (toggle)', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      const chatId = 9011;
      const cityId = 511;
      const cityName = 'אבו גוש';

      const ctx = makeCtx({
        chat: { id: chatId, type: 'private' },
        callbackQuery: { message: { text: `🔍 תוצאות עבור "${cityName}":` } },
        editMessageText: async () => {},
      });

      // First tap — subscribe
      await bot._fireCb(`st:${cityId}`, ctx);
      assert.equal(isSubscribed(chatId, cityName), true);

      // Second tap — unsubscribe
      await bot._fireCb(`st:${cityId}`, ctx);
      assert.equal(isSubscribed(chatId, cityName), false, 'city should be unsubscribed after second tap');
    });

    it('answers with error for unknown city id', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      let answeredWith = '';
      const ctx = makeCtx({
        chat: { id: 9012, type: 'private' },
        answerCallbackQuery: async (msg?: string) => { answeredWith = msg ?? ''; },
      });

      await bot._fireCb('st:99999', ctx);
      assert.ok(answeredWith.length > 0, 'should answer with error message for unknown city');
    });
  });

  describe('message:text handler', () => {
    it('passes through when user is not in search mode', async () => {
      const bot = buildMockBot();
      registerSearchHandler(bot as unknown as Bot);

      let nextCalled = false;
      const ctx: any = makeCtx({
        chat: { id: 9020, type: 'private' },
        message: { text: 'hello' },
      });
      // Fire as message handler
      const noop = async () => { nextCalled = true; };
      for (const h of (bot as any)._getMessageHandlers?.() ?? []) {
        await h(ctx, noop);
      }
      // The _fireMsg helper calls all message handlers
      await bot._fireMsg(ctx);
      // chatId 9020 was never put in searchingUsers by /add, so no reply should be sent
      assert.equal(ctx._replyCalls.length, 0, 'no reply should be sent when not in search mode');
    });
  });
});
