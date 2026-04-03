import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db/schema.js';
import { upsertUser } from '../db/userRepository.js';
import {
  createContact,
  acceptContact,
  createDefaultPermissions,
  getPermissions,
} from '../db/contactRepository.js';
import { setSetting, getSetting } from '../dashboard/settingsRepository.js';
import { registerPrivacyHandler, getPrivacyDefaults } from '../bot/privacyHandler.js';
import { registerConnectHandler } from '../bot/connectHandler.js';
import type { Bot, Context } from 'grammy';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM contact_permissions').run();
  db.prepare('DELETE FROM contacts').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM settings').run();
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
  const editCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 1001, type: 'private' },
    message: { text: '/privacy' },
    match: null,
    reply: async (...args: unknown[]) => { replyCalls.push(args); },
    editMessageText: async (...args: unknown[]) => { editCalls.push(args); },
    answerCallbackQuery: async () => {},
    api: { sendMessage: async () => {} },
    _replyCalls: replyCalls,
    _editCalls: editCalls,
    ...overrides,
  };
  return ctx as Context;
}

describe('privacyHandler', () => {
  describe('getPrivacyDefaults()', () => {
    it('returns hardcoded defaults when no setting exists', () => {
      const defaults = getPrivacyDefaults();
      assert.equal(defaults.safety_status, true);
      assert.equal(defaults.home_city, false);
      assert.equal(defaults.update_time, true);
    });

    it('reads from settings table when set', () => {
      const db = getDb();
      setSetting(db, 'privacy_defaults', JSON.stringify({
        safety_status: false,
        home_city: true,
        update_time: false,
      }));

      const defaults = getPrivacyDefaults();
      assert.equal(defaults.safety_status, false);
      assert.equal(defaults.home_city, true);
      assert.equal(defaults.update_time, false);
    });

    it('handles malformed JSON gracefully', () => {
      const db = getDb();
      setSetting(db, 'privacy_defaults', 'not json');

      const defaults = getPrivacyDefaults();
      // Falls back to hardcoded defaults
      assert.equal(defaults.safety_status, true);
      assert.equal(defaults.home_city, false);
    });
  });

  describe('/privacy — show default privacy toggles', () => {
    it('shows default privacy settings', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx();
      await bot._fireCmd('privacy', ctx);

      assert.equal((ctx as any)._replyCalls.length, 1);
      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /הגדרות פרטיות/);
      assert.match(text, /סטטוס ביטחון/);
    });
  });

  describe('pv:toggle — toggle default privacy field', () => {
    it('toggles safety_status default', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx();
      await bot._fireCb('pv:toggle:safety_status', ctx);

      // After toggle, safety_status should be false (was true by default)
      const updated = getPrivacyDefaults();
      assert.equal(updated.safety_status, false);
    });

    it('persists toggle to settings table', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      await bot._fireCb('pv:toggle:home_city', makeCtx());

      const raw = getSetting(getDb(), 'privacy_defaults');
      assert.ok(raw);
      const parsed = JSON.parse(raw!);
      assert.equal(parsed.home_city, true);
    });
  });

  describe('cx:perm — per-contact permissions view', () => {
    it('shows permissions for a contact', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      acceptContact(contact.id);
      createDefaultPermissions(contact.id);

      const ctx = makeCtx();
      await bot._fireCb(`cx:perm:${contact.id}`, ctx);

      assert.equal((ctx as any)._editCalls.length, 1);
      const text = (ctx as any)._editCalls[0][0] as string;
      assert.match(text, /הרשאות לאיש קשר/);
    });

    it('ignores request from unrelated user', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      createDefaultPermissions(contact.id);

      const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
      await bot._fireCb(`cx:perm:${contact.id}`, ctx);

      // No edit should happen
      assert.equal((ctx as any)._editCalls.length, 0);
    });
  });

  describe('cp:toggle — toggle per-contact permission', () => {
    it('toggles a per-contact permission field', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      createDefaultPermissions(contact.id);

      const permsBefore = getPermissions(contact.id);
      assert.equal(permsBefore!.home_city, false);

      const ctx = makeCtx();
      await bot._fireCb(`cp:toggle:${contact.id}:home_city`, ctx);

      const permsAfter = getPermissions(contact.id);
      assert.equal(permsAfter!.home_city, true);
    });

    it('ignores toggle from unrelated user', async () => {
      const bot = buildMockBot();
      registerPrivacyHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      createDefaultPermissions(contact.id);

      const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
      await bot._fireCb(`cp:toggle:${contact.id}:home_city`, ctx);

      // Permission should not change
      const perms = getPermissions(contact.id);
      assert.equal(perms!.home_city, false);
    });
  });

  describe('defaults applied on contact creation', () => {
    it('uses custom privacy defaults for new contact permissions', () => {
      const db = getDb();
      setSetting(db, 'privacy_defaults', JSON.stringify({
        safety_status: false,
        home_city: true,
        update_time: false,
      }));

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);

      const defaults = getPrivacyDefaults();
      createDefaultPermissions(contact.id, defaults);

      const perms = getPermissions(contact.id);
      assert.equal(perms!.safety_status, false);
      assert.equal(perms!.home_city, true);
      assert.equal(perms!.update_time, false);
    });
  });
});
