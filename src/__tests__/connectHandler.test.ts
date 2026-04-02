import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db/schema.js';
import { upsertUser, setConnectionCode, getUser } from '../db/userRepository.js';
import {
  getContactByPair,
  getContactById,
  getPermissions,
  createContact,
  acceptContact,
} from '../db/contactRepository.js';
import { registerConnectHandler, failureCounts, lookupCooldownMap } from '../bot/connectHandler.js';
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
  failureCounts.clear();
  lookupCooldownMap.clear();
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
  const sendCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 1001, type: 'private' },
    message: { text: '/connect' },
    match: null,
    reply: async (...args: unknown[]) => { replyCalls.push(args); },
    editMessageText: async (...args: unknown[]) => { editCalls.push(args); },
    answerCallbackQuery: async () => {},
    api: {
      sendMessage: async (...args: unknown[]) => { sendCalls.push(args); },
    },
    _replyCalls: replyCalls,
    _editCalls: editCalls,
    _sendCalls: sendCalls,
    ...overrides,
  };
  return ctx as Context;
}

describe('connectHandler', () => {
  describe('/connect (no args) — show own code', () => {
    it('generates and returns a 6-digit code', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx({ message: { text: '/connect' } });
      await bot._fireCmd('connect', ctx);

      assert.equal((ctx as any)._replyCalls.length, 1);
      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /קוד החיבור שלך/);
      assert.match(text, /\d{6}/);

      // Code persisted
      const user = getUser(1001);
      assert.ok(user?.connection_code);
      assert.match(user!.connection_code!, /^\d{6}$/);
    });

    it('reuses existing code on second call', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      setConnectionCode(1001, '123456');

      const ctx = makeCtx({ message: { text: '/connect' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.ok(text.includes('123456'));
    });
  });

  describe('/connect {code} — connect to someone', () => {
    it('rejects invalid code format', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx({ message: { text: '/connect abc' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /קוד לא תקין/);
    });

    it('rejects self-connection', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      setConnectionCode(1001, '111111');

      const ctx = makeCtx({ message: { text: '/connect 111111' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /אי אפשר להתחבר לעצמך/);
    });

    it('creates a pending contact on valid code', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '222222');

      const ctx = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /בקשת החיבור נשלחה/);

      const contact = getContactByPair(1001, 2002);
      assert.ok(contact);
      assert.equal(contact!.status, 'pending');

      // Default permissions created
      const perms = getPermissions(contact!.id);
      assert.ok(perms);
      assert.equal(perms!.safety_status, true);
      assert.equal(perms!.home_city, false);
    });

    it('notifies target user', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '222222');

      const ctx = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx);

      // api.sendMessage called with target chat_id
      assert.equal((ctx as any)._sendCalls.length, 1);
      assert.equal((ctx as any)._sendCalls[0][0], 2002);
    });

    it('rejects duplicate connection', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '222222');

      // First connection
      const ctx1 = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx1);

      // Clear cooldown so second attempt reaches the duplicate check
      lookupCooldownMap.clear();

      // Second attempt
      const ctx2 = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx2);

      const text = (ctx2 as any)._replyCalls[0][0] as string;
      assert.match(text, /כבר קיים חיבור/);
    });

    it('rejects when target has too many pending requests', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(2002);
      setConnectionCode(2002, '222222');

      // Create 10 pending requests from other users
      for (let i = 3000; i < 3010; i++) {
        upsertUser(i);
        createContact(i, 2002);
      }

      upsertUser(1001);
      const ctx = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /יותר מדי בקשות ממתינות/);
    });
  });

  describe('accept/reject callbacks', () => {
    it('accept updates status and notifies requester', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);

      const ctx = makeCtx({
        chat: { id: 2002, type: 'private' },
      });
      await bot._fireCb(`cn:accept:${contact.id}`, ctx);

      const updated = getContactById(contact.id);
      assert.equal(updated!.status, 'accepted');
      assert.equal((ctx as any)._sendCalls.length, 1);
      assert.equal((ctx as any)._sendCalls[0][0], 1001);
    });

    it('reject updates status and notifies requester', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);

      const ctx = makeCtx({
        chat: { id: 2002, type: 'private' },
      });
      await bot._fireCb(`cn:reject:${contact.id}`, ctx);

      const updated = getContactById(contact.id);
      assert.equal(updated!.status, 'rejected');
    });

    it('ignores accept from non-target user', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);

      // Attacker tries to accept from wrong chat
      const ctx = makeCtx({
        chat: { id: 9999, type: 'private' },
      });
      await bot._fireCb(`cn:accept:${contact.id}`, ctx);

      const updated = getContactById(contact.id);
      assert.equal(updated!.status, 'pending');
    });
  });

  describe('/contacts — show accepted contacts', () => {
    it('shows empty state when no contacts', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx();
      await bot._fireCmd('contacts', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /אין לך אנשי קשר/);
    });

    it('shows accepted contacts', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      acceptContact(contact.id);

      const ctx = makeCtx();
      await bot._fireCmd('contacts', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /אנשי הקשר שלי/);
    });

    it('paginates contacts', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      // Create 7 accepted contacts
      for (let i = 2000; i < 2007; i++) {
        upsertUser(i);
        const c = createContact(1001, i);
        acceptContact(c.id);
      }

      const ctx = makeCtx();
      await bot._fireCmd('contacts', ctx);

      const replyArgs = (ctx as any)._replyCalls[0];
      const markup = replyArgs[1]?.reply_markup;
      const buttons = JSON.stringify(markup);
      assert.ok(buttons.includes('cx:page:1'), 'should have next page button');
    });
  });

  describe('remove contact', () => {
    it('removes contact and refreshes list', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      acceptContact(contact.id);

      const ctx = makeCtx();
      await bot._fireCb(`cx:rm:${contact.id}`, ctx);

      const removed = getContactById(contact.id);
      assert.equal(removed, undefined);
    });

    it('ignores remove from unrelated user', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      acceptContact(contact.id);

      const ctx = makeCtx({ chat: { id: 9999, type: 'private' } });
      await bot._fireCb(`cx:rm:${contact.id}`, ctx);

      const stillThere = getContactById(contact.id);
      assert.ok(stillThere);
    });
  });

  describe('anti-spam: failure throttle', () => {
    it('blocks after 5 consecutive failures', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);

      // Send 5 invalid codes (need to bypass cooldown)
      for (let i = 0; i < 5; i++) {
        const ctx = makeCtx({ message: { text: `/connect ${100000 + i}` } });
        await bot._fireCmd('connect', ctx);
      }

      // 6th attempt should be blocked
      const ctx = makeCtx({ message: { text: '/connect 999999' } });
      await bot._fireCmd('connect', ctx);

      const lastReply = (ctx as any)._replyCalls[0][0] as string;
      assert.ok(
        lastReply.includes('יותר מדי ניסיונות') || lastReply.includes('נסה שוב'),
        'should show throttle message'
      );
    });
  });
});
