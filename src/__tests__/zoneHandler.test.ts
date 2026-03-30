import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { registerZoneHandler } from '../bot/zoneHandler.js';
import { isSubscribed, getUserCities } from '../db/subscriptionRepository.js';
import { SUPER_REGIONS } from '../config/zones.js';
import { getCitiesByZone } from '../cityLookup.js';
import { initDb } from '../db/schema.js';
import type { Bot, Context } from 'grammy';

// DB_PATH=:memory: is set in npm test environment
before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

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
        if (typeof pat === 'string' && pat === data) { await handler(ctx); return; }
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
  let editText = '';
  const ctx: any = {
    chat: { id: 2000, type: 'private' },
    message: null,
    callbackQuery: null,
    match: null,
    reply: async (...args: unknown[]) => { replyCalls.push(args); return {}; },
    editMessageText: async (text: string) => { editText = text; },
    answerCallbackQuery: async () => {},
    _replyCalls: replyCalls,
    _getEditText: () => editText,
    ...overrides,
  };
  return ctx as unknown as Context;
}

// Use super region 0 (צפון), zone 0 (גליל עליון) — 86 cities, stable
const SR_IDX = 0;
const ZONE_IDX = 0;
const ZONE_NAME = SUPER_REGIONS[SR_IDX].zones[ZONE_IDX];

describe('registerZoneHandler', () => {
  describe('/zones command', () => {
    it('does nothing in a group chat', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      const ctx = makeCtx({ chat: { id: 8001, type: 'supergroup' } });
      await bot._fireCmd('zones', ctx);
      assert.equal((ctx as any)._replyCalls.length, 0, 'reply should not be called in group');
    });

    it('sends super-region keyboard in private chat', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      const ctx = makeCtx({ chat: { id: 8002, type: 'private' } });
      await bot._fireCmd('zones', ctx);
      assert.equal((ctx as any)._replyCalls.length, 1, 'reply should be called once');
      const replyText = (ctx as any)._replyCalls[0][0] as string;
      assert.ok(replyText.includes('אזור'), 'reply should mention area/zone');
    });
  });

  describe('zone:<sr>:<z> callback', () => {
    it('calls editMessageText with city list', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      let editCalled = false;
      const ctx = makeCtx({
        chat: { id: 8010, type: 'private' },
        editMessageText: async (text: string) => { editCalled = true; },
      });

      await bot._fireCb(`zone:${SR_IDX}:${ZONE_IDX}`, ctx);
      assert.equal(editCalled, true, 'editMessageText should be called');
    });

    it('includes ct: prefix in rendered keyboard buttons', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      // Capture keyboard to verify ct: buttons exist
      let capturedKeyboard: any = null;
      const ctx = makeCtx({
        chat: { id: 8011, type: 'private' },
        editMessageText: async (_text: string, opts?: any) => {
          capturedKeyboard = opts?.reply_markup;
        },
      });

      await bot._fireCb(`zone:${SR_IDX}:${ZONE_IDX}`, ctx);
      assert.ok(capturedKeyboard !== null, 'keyboard should be provided');
      // InlineKeyboard.inline_keyboard is an array of rows of buttons
      const allButtons = capturedKeyboard.inline_keyboard.flat() as Array<{ text: string; callback_data: string }>;
      const ctButtons = allButtons.filter((b) => b.callback_data?.startsWith('ct:'));
      assert.ok(ctButtons.length > 0, 'Should have ct: buttons for cities');
    });
  });

  describe('ca:<sr>:<z>:<page> — select all in zone', () => {
    it('subscribes all cities in the zone', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      const chatId = 8020;
      const ctx = makeCtx({
        chat: { id: chatId, type: 'private' },
        editMessageText: async () => {},
      });

      await bot._fireCb(`ca:${SR_IDX}:${ZONE_IDX}:0`, ctx);

      const subscribed = getUserCities(chatId);
      const zoneCities = getCitiesByZone(ZONE_NAME);
      assert.ok(subscribed.length > 0, 'Should have subscribed some cities');
      // All zone cities should now be subscribed
      for (const city of zoneCities) {
        assert.ok(
          isSubscribed(chatId, city.name),
          `Expected ${city.name} to be subscribed after ca:`,
        );
      }
    });
  });

  describe('cr:<sr>:<z>:<page> — remove all in zone', () => {
    it('unsubscribes all cities in the zone', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      const chatId = 8021;
      // First subscribe all via ca:
      await bot._fireCb(`ca:${SR_IDX}:${ZONE_IDX}:0`, makeCtx({
        chat: { id: chatId, type: 'private' },
        editMessageText: async () => {},
      }));

      const afterAdd = getUserCities(chatId);
      assert.ok(afterAdd.length > 0, 'Setup: some cities should be subscribed first');

      // Now remove all via cr:
      await bot._fireCb(`cr:${SR_IDX}:${ZONE_IDX}:0`, makeCtx({
        chat: { id: chatId, type: 'private' },
        editMessageText: async () => {},
      }));

      const zoneCities = getCitiesByZone(ZONE_NAME);
      for (const city of zoneCities) {
        assert.equal(
          isSubscribed(chatId, city.name),
          false,
          `Expected ${city.name} to be unsubscribed after cr:`,
        );
      }
    });
  });

  describe('noop callback', () => {
    it('calls answerCallbackQuery without error', async () => {
      const bot = buildMockBot();
      registerZoneHandler(bot as unknown as Bot);

      let answered = false;
      const ctx = makeCtx({
        answerCallbackQuery: async () => { answered = true; },
      });

      await bot._fireCb('noop', ctx);
      assert.equal(answered, true, 'noop should call answerCallbackQuery');
    });
  });
});
