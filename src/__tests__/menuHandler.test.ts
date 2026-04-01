import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildMainMenu, registerMenuHandler } from '../bot/menuHandler';
import { initDb } from '../db/schema.js';
import type { Bot, Context } from 'grammy';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

function buildMockBot() {
  const commands: Record<string, (ctx: Context) => Promise<void>> = {};
  return {
    command: (name: string, handler: (ctx: Context) => Promise<void>) => {
      commands[name] = handler;
    },
    callbackQuery: () => {},
    on: () => {},
    catch: () => {},
    _fireCmd: async (name: string, ctx: Context) => commands[name]?.(ctx),
  };
}

function makeCtx(overrides: Record<string, unknown> = {}): Context {
  const replyCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 7000, type: 'private' },
    message: { message_id: 123 },
    me: { username: 'pikud_bot' },
    reply: async (...args: unknown[]) => { replyCalls.push(args); },
    _replyCalls: replyCalls,
    ...overrides,
  };
  return ctx as unknown as Context;
}

describe('buildMainMenu — last alert indicator', () => {
  it('shows 📡 line when lastAlert is provided', () => {
    const { text } = buildMainMenu(3, { type: 'missiles', fired_at: '2026-03-28 10:00:00' });
    assert.ok(text.includes('📡'), 'should include 📡 indicator');
    assert.ok(text.includes('🔴'), 'should include missile emoji');
    assert.ok(text.includes('התרעת טילים'), 'should include Hebrew alert type');
  });

  it('does not show 📡 line when lastAlert is undefined', () => {
    const { text } = buildMainMenu(0, undefined);
    assert.ok(!text.includes('📡'), 'should not include 📡 when no alert history');
  });

  it('shows city count in text when cityCount > 0', () => {
    const { text } = buildMainMenu(5);
    assert.ok(text.includes('5'), 'should include city count');
  });

  it('shows fallback ⚠️ for unknown alert type', () => {
    const { text } = buildMainMenu(0, { type: 'unknownXyz', fired_at: '2026-03-28 10:00:00' });
    assert.ok(text.includes('⚠️'), 'should fallback to ⚠️ for unknown type');
  });
});

describe('registerMenuHandler — /start routing', () => {
  it('replies with the main menu in private chat', async () => {
    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);

    const ctx = makeCtx({ chat: { id: 7001, type: 'private' } });
    await bot._fireCmd('start', ctx);

    assert.equal((ctx as any)._replyCalls.length, 1, 'should reply once in private chat');
    const [text, opts] = (ctx as any)._replyCalls[0] as [string, { reply_markup?: unknown }];
    assert.ok(text.includes('בוט פיקוד העורף'), 'should show the main menu title');
    assert.ok(opts.reply_markup, 'should include the inline keyboard');
  });

  it('does nothing in group chat', async () => {
    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);

    const ctx = makeCtx({ chat: { id: 7002, type: 'supergroup' } });
    await bot._fireCmd('start', ctx);

    assert.equal((ctx as any)._replyCalls.length, 0, 'should not reply in group chat');
  });
});
