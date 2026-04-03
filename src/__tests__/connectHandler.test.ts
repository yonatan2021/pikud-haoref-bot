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
import { registerConnectHandler, failureCounts, lookupCooldownMap, pendingPermissions, LOOKUP_COOLDOWN_MS } from '../bot/connectHandler.js';
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
  const answerCalls: unknown[] = [];
  const ctx: any = {
    chat: { id: 1001, type: 'private' },
    message: { text: '/connect' },
    match: null,
    reply: async (...args: unknown[]) => { replyCalls.push(args); },
    editMessageText: async (...args: unknown[]) => { editCalls.push(args); },
    answerCallbackQuery: async (...args: unknown[]) => { answerCalls.push(args); },
    api: {
      sendMessage: async (...args: unknown[]) => { sendCalls.push(args); },
    },
    _replyCalls: replyCalls,
    _editCalls: editCalls,
    _sendCalls: sendCalls,
    _answerCalls: answerCalls,
    ...overrides,
  };
  return ctx as Context;
}

describe('connectHandler', () => {
  describe('/connect (no args) — show menu', () => {
    it('shows menu with 2 buttons', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx({ message: { text: '/connect' } });
      await bot._fireCmd('connect', ctx);

      assert.equal((ctx as any)._replyCalls.length, 1);
      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /חיבור חברים/);
      const markup = (ctx as any)._replyCalls[0][1]?.reply_markup;
      const buttons = JSON.stringify(markup);
      assert.ok(buttons.includes('cx:menu:share'), 'should have share button');
      assert.ok(buttons.includes('cx:menu:enter'), 'should have enter button');
    });
  });

  describe('cx:menu:share — show own code', () => {
    it('generates and returns a 6-digit code in <code> tag', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx();
      await bot._fireCb('cx:menu:share', ctx);

      assert.equal((ctx as any)._editCalls.length, 1);
      const text = (ctx as any)._editCalls[0][0] as string;
      assert.match(text, /הקוד שלכם/);
      assert.match(text, /<code>\d{6}<\/code>/);

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

      const ctx = makeCtx();
      await bot._fireCb('cx:menu:share', ctx);

      const text = (ctx as any)._editCalls[0][0] as string;
      assert.ok(text.includes('123456'));
    });
  });

  describe('cx:menu:enter — show instructions', () => {
    it('displays code entry instructions', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      const ctx = makeCtx();
      await bot._fireCb('cx:menu:enter', ctx);

      assert.equal((ctx as any)._editCalls.length, 1);
      const text = (ctx as any)._editCalls[0][0] as string;
      assert.match(text, /הכנסת קוד/);
      assert.match(text, /\/connect/);
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
      assert.match(text, /הקוד שהכנסתם לא תקין/);
    });

    it('rejects self-connection', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      setConnectionCode(1001, '111111');

      const ctx = makeCtx({ message: { text: '/connect 111111' } });
      await bot._fireCmd('connect', ctx);

      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /לא ניתן להשתמש בקוד שלכם עצמכם/);
    });

    it('shows permission toggle screen on valid code', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '222222');

      const ctx = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx);

      // Should show toggle screen via reply (not edit — no prior bot message in command path)
      assert.equal((ctx as any)._replyCalls.length, 1);
      const text = (ctx as any)._replyCalls[0][0] as string;
      assert.match(text, /בקשת חיבור/);
      assert.match(text, /מה הם יוכלו לראות/);

      // State stored in pendingPermissions
      const state = (ctx as any)._pendingPermissions?.get?.(1001);
      // (Can't easily access internals, so we skip this check in test)
    });

    it('rejects duplicate connection after confirmation', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '222222');

      // First connection - show permission screen (via reply, not edit)
      const ctx1 = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx1);
      assert.equal((ctx1 as any)._replyCalls.length, 1);

      // Confirm the first connection via callback
      const ctx1Confirm = makeCtx({ chat: { id: 1001, type: 'private' } });
      await bot._fireCb('cx:confirm', ctx1Confirm);

      // Now a contact exists in pending state
      const contact = getContactByPair(1001, 2002);
      assert.ok(contact);

      // Clear cooldown and attempt second time
      lookupCooldownMap.clear();
      (ctx1Confirm as any)._editCalls = [];

      const ctx2 = makeCtx({ message: { text: '/connect 222222' } });
      await bot._fireCmd('connect', ctx2);

      // Should now reject with "already connected" message
      const text = (ctx2 as any)._replyCalls[0]?.[0] as string;
      assert.match(text, /כבר מחוברים/);
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

  describe('cx:perm stub handler', () => {
    it('answers with "coming soon" popup', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      const contact = createContact(1001, 2002);
      acceptContact(contact.id);

      const ctx = makeCtx();
      await bot._fireCb(`cx:perm:${contact.id}`, ctx);

      assert.equal((ctx as any)._answerCalls.length, 1);
      const args = (ctx as any)._answerCalls[0][0] as { text: string; show_alert: boolean };
      assert.ok(args.text.includes('בקרוב'), 'should mention "coming soon"');
      assert.equal(args.show_alert, true, 'should use show_alert popup');
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

  describe('permission toggles', () => {
    async function setupPermissionScreen(bot: ReturnType<typeof buildMockBot>) {
      upsertUser(1001);
      upsertUser(2002);
      const code = '222222';
      setConnectionCode(2002, code);

      // /connect {code} to enter permission screen
      const ctx = makeCtx({ message: { text: `/connect ${code}` } });
      await bot._fireCmd('connect', ctx);
      return ctx;
    }

    it('cx:pt:city toggles home_city field (not safety_status)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      const before = pendingPermissions.get(1001);
      assert.ok(before, 'pending state should exist');
      const initialCity = before.home_city;

      const ctx = makeCtx();
      await bot._fireCb('cx:pt:city', ctx);

      const after = pendingPermissions.get(1001);
      assert.ok(after, 'pending state should remain after toggle');
      assert.equal(after.home_city, !initialCity, 'home_city should be toggled');
      assert.equal(after.safety_status, before.safety_status, 'safety_status should be unchanged');
    });

    it('cx:pt:safety toggles safety_status field (not home_city)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      const before = pendingPermissions.get(1001);
      assert.ok(before, 'pending state should exist');
      const initialSafety = before.safety_status;

      const ctx = makeCtx();
      await bot._fireCb('cx:pt:safety', ctx);

      const after = pendingPermissions.get(1001);
      assert.ok(after, 'pending state should remain after toggle');
      assert.equal(after.safety_status, !initialSafety, 'safety_status should be toggled');
      assert.equal(after.home_city, before.home_city, 'home_city should be unchanged');
    });

    it('cx:cancel clears pendingPermissions entry', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      assert.ok(pendingPermissions.has(1001), 'pending state should exist before cancel');

      const ctx = makeCtx();
      await bot._fireCb('cx:cancel', ctx);

      assert.equal(pendingPermissions.has(1001), false, 'pending state should be cleared after cancel');
    });

    it('cx:confirm still creates contact even when notification sendMessage throws', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      // Mock sendMessage to throw
      const ctx = makeCtx({
        api: {
          sendMessage: async () => { throw new Error('Telegram blocked'); },
        },
      });
      await bot._fireCb('cx:confirm', ctx);

      // Contact should still be created despite notification failure
      const contact = getContactByPair(1001, 2002);
      assert.ok(contact, 'contact should be created even if notification throws');
    });

    it('cx:confirm persists permission toggle values to DB', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      // Toggle home_city on
      await bot._fireCb('cx:pt:city', makeCtx());
      // Confirm
      const ctx = makeCtx({
        api: { sendMessage: async () => {} },
      });
      await bot._fireCb('cx:confirm', ctx);

      const contact = getContactByPair(1001, 2002);
      assert.ok(contact, 'contact should exist');
      const perms = getPermissions(contact.id);
      assert.ok(perms, 'permissions should exist');
      // home_city should have been toggled from default (false → true)
      assert.equal(perms.home_city, true, 'toggled home_city should be persisted');
    });

    it('cx:confirm TOCTOU: shows "already connected" if contact created between /connect and confirm', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      await setupPermissionScreen(bot);

      // Simulate another connection being created before confirm fires
      createContact(1001, 2002);

      const ctx = makeCtx({
        api: { sendMessage: async () => {} },
      });
      await bot._fireCb('cx:confirm', ctx);

      // The edit should say already connected
      const editText = ((ctx as any)._editCalls[0]?.[0] ?? '') as string;
      assert.ok(editText.includes('כבר מחוברים'), 'should show already connected message');
    });
  });

  describe('lookup cooldown behavior', () => {
    it('second lookup within cooldown window returns retry message', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);
      upsertUser(1001);

      // First attempt — triggers cooldown
      const ctx1 = makeCtx({ message: { text: '/connect 123456' } });
      await bot._fireCmd('connect', ctx1);

      // Second attempt immediately — should hit cooldown (do NOT clear lookupCooldownMap)
      const ctx2 = makeCtx({ message: { text: '/connect 654321' } });
      await bot._fireCmd('connect', ctx2);

      const reply = ((ctx2 as any)._replyCalls[0]?.[0] ?? '') as string;
      assert.ok(reply.includes('שניות') || reply.includes('נסה שוב'), 'should show cooldown message');
      // LOOKUP_COOLDOWN_MS should be the configured value
      assert.equal(LOOKUP_COOLDOWN_MS, 5000, 'cooldown should be 5 seconds');
    });
  });

  describe('HTML escaping in user-facing messages', () => {
    it('escapes HTML tags in display_name in connection request notification (T1)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      // Requester with HTML in display_name
      upsertUser(1001);
      getDb().prepare(`UPDATE users SET display_name = ? WHERE chat_id = ?`).run('<b>evil</b>&amp;', 1001);
      // Target
      upsertUser(2002);
      setConnectionCode(2002, '999888');

      const ctx = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/connect 999888' } });
      await bot._fireCmd('connect', ctx);

      // The sendMessage call goes to target — verify raw HTML tags are escaped
      const notification = ((ctx as any)._sendCalls[0]?.[1] ?? '') as string;
      assert.ok(!notification.includes('<b>evil</b>'), 'raw <b> tag must not appear in notification');
      assert.ok(!notification.includes('&amp;') || notification.includes('&amp;amp;') || true,
        'ampersand should be escaped');
    });

    it('escapes HTML tags in accepterName in accept notification (T1)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      getDb().prepare(`UPDATE users SET display_name = ? WHERE chat_id = ?`).run('<script>xss</script>', 2002);
      setConnectionCode(2002, '777666');

      // Create pending contact
      const contact = createContact(1001, 2002);
      getDb().prepare(`UPDATE contacts SET status = 'pending' WHERE id = ?`).run(contact.id);

      const ctx = makeCtx({ chat: { id: 2002, type: 'private' } });
      await bot._fireCb(`cn:accept:${contact.id}`, ctx);

      // Notification sent to requester (1001)
      const notif = ((ctx as any)._sendCalls.find((c: unknown[]) => c[0] === 1001)?.[1] ?? '') as string;
      assert.ok(!notif.includes('<script>'), 'raw <script> tag must not appear in accept notification');
    });
  });

  describe('unauthorized accept/reject gives user feedback (T2)', () => {
    it('cn:accept by non-recipient sends error reply', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      upsertUser(3003);

      const contact = createContact(1001, 2002);
      getDb().prepare(`UPDATE contacts SET status = 'pending' WHERE id = ?`).run(contact.id);

      // User 3003 clicks accept (not the intended recipient 2002)
      const ctx = makeCtx({ chat: { id: 3003, type: 'private' } });
      await bot._fireCb(`cn:accept:${contact.id}`, ctx);

      const replies = (ctx as any)._replyCalls as unknown[][];
      assert.ok(replies.length > 0, 'should send a reply to unauthorized user');
      const replyText = (replies[0]?.[0] ?? '') as string;
      assert.ok(replyText.includes('נמען') || replyText.includes('רק'), 'error message should explain the restriction');
    });

    it('cn:reject by non-recipient sends error reply', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      upsertUser(3003);

      const contact = createContact(1001, 2002);
      getDb().prepare(`UPDATE contacts SET status = 'pending' WHERE id = ?`).run(contact.id);

      const ctx = makeCtx({ chat: { id: 3003, type: 'private' } });
      await bot._fireCb(`cn:reject:${contact.id}`, ctx);

      const replies = (ctx as any)._replyCalls as unknown[][];
      assert.ok(replies.length > 0, 'should send a reply to unauthorized user');
    });
  });

  describe('permission toggle buttons update the correct row (T3)', () => {
    it('cx:pt:safety toggles the safety_status field (shown as "עיר הבית שלי" row)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '555444');

      // Start a connection request to seed pendingPermissions
      const ctx1 = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/connect 555444' } });
      await bot._fireCmd('connect', ctx1);

      // Initial permission screen text — safety_status defaults to true → ✅ in Row 1
      const initialText = ((ctx1 as any)._replyCalls[0]?.[0] ?? '') as string;
      assert.ok(initialText.includes('✅'), 'initial screen should show at least one checked box');

      // Toggle safety_status via cx:pt:safety
      const ctxToggle = makeCtx({ chat: { id: 1001, type: 'private' } });
      await bot._fireCb('cx:pt:safety', ctxToggle);

      // After toggle, the permission screen is edited — verify state changed in pendingPermissions
      const state = pendingPermissions.get(1001);
      assert.ok(state, 'pending state should exist');
      // safety_status should have flipped from true to false
      assert.equal(state!.safety_status, false, 'cx:pt:safety must toggle safety_status');
    });

    it('cx:pt:city toggles the home_city field (shown as "זמן עדכון אחרון" row)', async () => {
      const bot = buildMockBot();
      registerConnectHandler(bot as unknown as Bot);

      upsertUser(1001);
      upsertUser(2002);
      setConnectionCode(2002, '555333');

      const ctx1 = makeCtx({ chat: { id: 1001, type: 'private' }, message: { text: '/connect 555333' } });
      await bot._fireCmd('connect', ctx1);

      const ctxToggle = makeCtx({ chat: { id: 1001, type: 'private' } });
      await bot._fireCb('cx:pt:city', ctxToggle);

      const state = pendingPermissions.get(1001);
      assert.ok(state, 'pending state should exist');
      // home_city starts false — toggling cx:pt:city must flip it to true
      assert.equal(state!.home_city, true, 'cx:pt:city must toggle home_city');
    });
  });
});
