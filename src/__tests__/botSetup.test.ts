import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupBotHandlers } from '../bot/botSetup.js';
import { initDb } from '../db/schema.js';
import type { Bot } from 'grammy';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

function buildMockBot() {
  const registeredCommands: string[] = [];
  const registeredCallbacks: Array<string | RegExp> = [];
  let catchHandler: unknown = null;
  let setMyCommandsArg: unknown = null;

  const bot: any = {
    command: (name: string) => { registeredCommands.push(name); },
    callbackQuery: (pat: string | RegExp) => { registeredCallbacks.push(pat); },
    on: () => {},
    catch: (handler: unknown) => { catchHandler = handler; },
    api: {
      setMyCommands: async (cmds: unknown) => { setMyCommandsArg = cmds; },
    },
    _registeredCommands: registeredCommands,
    _registeredCallbacks: registeredCallbacks,
    _getCatchHandler: () => catchHandler,
    _getSetMyCommandsArg: () => setMyCommandsArg,
  };
  return bot;
}

describe('setupBotHandlers', () => {
  it('registers all expected commands', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    const expected = ['start', 'profile', 'add', 'zones', 'mycities', 'settings', 'stats', 'history', 'connect', 'contacts', 'privacy', 'today', 'legend', 'status'];
    assert.equal(bot._registeredCommands.length, expected.length, 'should register exactly 14 commands');
    for (const cmd of expected) {
      assert.ok(
        bot._registeredCommands.includes(cmd),
        `Expected command /${cmd} to be registered`,
      );
    }
    assert.equal(
      bot._registeredCommands.filter((cmd: string) => cmd === 'start').length,
      1,
      'Expected exactly one /start handler registration',
    );
  });

  it('registers a noop callback handler', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    const hasNoop = bot._registeredCallbacks.some(
      (p: string | RegExp) => typeof p === 'string' && p === 'noop',
    );
    assert.equal(hasNoop, true, 'noop callback must be registered for pagination buttons');
  });

  it('registers all safety status callback patterns', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    const patterns = bot._registeredCallbacks;

    const hasSafetyContacts = patterns.some(
      (p: string | RegExp) => typeof p === 'string' && p === 'safety:contacts',
    );
    assert.equal(hasSafetyContacts, true, 'safety:contacts callback must be registered');

    const hasSafetyBack = patterns.some(
      (p: string | RegExp) => typeof p === 'string' && p === 'safety:back',
    );
    assert.equal(hasSafetyBack, true, 'safety:back callback must be registered');

    const hasSafetyResponse = patterns.some(
      (p: string | RegExp) => p instanceof RegExp && p.source === '^safety:(ok|help|dismiss):\\d+$',
    );
    assert.equal(hasSafetyResponse, true, 'safety response regex callback must be registered');
  });

  it('registers safety callbacks before menu callbacks', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    const patterns = bot._registeredCallbacks;
    const safetyIdx = patterns.findIndex(
      (p: string | RegExp) => typeof p === 'string' && p === 'safety:contacts',
    );
    const menuIdx = patterns.findIndex(
      (p: string | RegExp) => typeof p === 'string' && p === 'menu:main',
    );

    assert.ok(safetyIdx !== -1, 'safety:contacts must be registered');
    assert.ok(menuIdx !== -1, 'menu:main must be registered');
    assert.ok(
      safetyIdx < menuIdx,
      `safety callbacks (idx ${safetyIdx}) must be registered before menu callbacks (idx ${menuIdx})`,
    );
  });

  it('registers a global error handler via bot.catch()', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    assert.ok(bot._getCatchHandler() !== null, 'bot.catch() should have been called');
    assert.equal(typeof bot._getCatchHandler(), 'function', 'catch handler should be a function');
  });

  it('calls bot.api.setMyCommands with all 14 commands', async () => {
    const bot = buildMockBot();
    await setupBotHandlers(bot as unknown as Bot);

    const cmds = bot._getSetMyCommandsArg() as Array<{ command: string; description: string }>;
    assert.ok(Array.isArray(cmds), 'setMyCommands should receive an array');
    assert.equal(cmds.length, 14, 'setMyCommands should receive exactly 14 commands');

    const commandNames = cmds.map((c) => c.command);
    for (const name of ['start', 'profile', 'add', 'zones', 'mycities', 'settings', 'stats', 'history', 'connect', 'contacts', 'privacy', 'today', 'legend', 'status']) {
      assert.ok(commandNames.includes(name), `setMyCommands should include /${name}`);
    }
    // Each command must have a non-empty Hebrew description
    for (const cmd of cmds) {
      assert.ok(typeof cmd.description === 'string' && cmd.description.length > 0,
        `/${cmd.command} must have a non-empty description`);
    }
  });
});
