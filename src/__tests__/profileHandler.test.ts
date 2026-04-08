import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  upsertUser,
  getProfile,
  updateProfile,
  completeOnboarding,
} from '../db/userRepository';
import { buildProfileSummary } from '../bot/profileHandler';

describe('profileHandler', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  describe('buildProfileSummary', () => {
    it('renders correctly with all fields set', () => {
      const { text, keyboard } = buildProfileSummary('יונתן', 'אבו גוש', 'he');
      assert.ok(text.includes('הפרופיל שלי'));
      assert.ok(text.includes('יונתן'));
      assert.ok(text.includes('אבו גוש'));
      assert.ok(text.includes('עברית'));
      assert.ok(text.includes('✓'));
      assert.ok(keyboard);
    });

    it('renders correctly with null fields', () => {
      const { text } = buildProfileSummary(null, null, 'he');
      assert.ok(text.includes('לא הוגדר'));
      assert.ok(text.includes('לא הוגדרה'));
      assert.ok(text.includes('עברית'));
    });

    it('shows Hebrew locale with checkmark', () => {
      const { text } = buildProfileSummary(null, null, 'he');
      assert.ok(text.includes('עברית ✓'));
    });
  });

  describe('profile edit via updateProfile', () => {
    it('updates display_name', () => {
      upsertUser(8001);
      updateProfile(8001, { display_name: 'שם חדש' });
      assert.equal(getProfile(8001)?.display_name, 'שם חדש');
    });

    it('updates home_city', () => {
      upsertUser(8002);
      updateProfile(8002, { home_city: 'אבו גוש' });
      assert.equal(getProfile(8002)?.home_city, 'אבו גוש');
    });

    it('updates multiple fields at once', () => {
      upsertUser(8003);
      updateProfile(8003, { display_name: 'Test', home_city: 'אבו גוש' });
      const profile = getProfile(8003);
      assert.equal(profile?.display_name, 'Test');
      assert.equal(profile?.home_city, 'אבו גוש');
    });

    it('does nothing with empty patch', () => {
      upsertUser(8004);
      updateProfile(8004, { display_name: 'Before' });
      updateProfile(8004, {});
      assert.equal(getProfile(8004)?.display_name, 'Before');
    });
  });

  describe('profile defaults', () => {
    it('new user has null name and city', () => {
      upsertUser(8010);
      const profile = getProfile(8010);
      assert.equal(profile?.display_name, null);
      assert.equal(profile?.home_city, null);
    });

    it('new user has he locale', () => {
      upsertUser(8011);
      assert.equal(getProfile(8011)?.locale, 'he');
    });

    it('new user has onboarding not completed', () => {
      upsertUser(8012);
      assert.equal(getProfile(8012)?.onboarding_completed, false);
    });

    it('completed user has onboarding_completed true', () => {
      upsertUser(8013);
      completeOnboarding(8013);
      assert.equal(getProfile(8013)?.onboarding_completed, true);
    });
  });

  describe('buildProfileSummary with connectionCode', () => {
    it('renders connection code inside <code> tag', () => {
      const { text } = buildProfileSummary('יונתן', 'תל אביב', 'he', '123456');
      assert.ok(text.includes('<code>123456</code>'), 'should wrap code in <code> tag');
    });

    it('shows dash when connectionCode is null', () => {
      const { text } = buildProfileSummary('יונתן', 'תל אביב', 'he', null);
      assert.ok(text.includes('—'), 'should show dash for null code');
      assert.ok(!text.includes('<code>'), 'should not render <code> tag for null');
    });

    it('shows dash when connectionCode is undefined (not passed)', () => {
      const { text } = buildProfileSummary('יונתן', 'תל אביב', 'he');
      assert.ok(text.includes('—'), 'should show dash when code is not provided');
    });

    it('escapes HTML special chars in connectionCode', () => {
      const { text } = buildProfileSummary('יונתן', 'תל אביב', 'he', '<script>alert(1)</script>');
      assert.ok(!text.includes('<script>'), 'should not contain raw <script> tag');
      assert.ok(text.includes('&lt;script&gt;'), 'should HTML-escape special chars');
    });
  });

  // I4 — name input edge cases via the bot's text handler. The handler at
  // src/bot/profileHandler.ts:170-178 stripHtmls the input, trims it, then
  // rejects empty/over-50-char results. Existing tests only verified
  // updateProfile() at the repository level, not the validation flow.
  describe('name input via bot.on(message:text) handler', () => {
    // Tiny mock bot that only records what we need: the name-edit callback
    // setter and the text handler.
    function buildMockBot() {
      const callbacks: Array<[string | RegExp, (ctx: import('grammy').Context) => Promise<void>]> = [];
      let textHandler: ((ctx: import('grammy').Context, next: () => Promise<void>) => Promise<void>) | null = null;
      return {
        command: () => {},
        callbackQuery: (pat: string | RegExp, h: (ctx: import('grammy').Context) => Promise<void>) => {
          callbacks.push([pat, h]);
        },
        on: (_evt: string, h: (ctx: import('grammy').Context, next: () => Promise<void>) => Promise<void>) => {
          textHandler = h;
        },
        catch: () => {},
        _fireCb: async (data: string, ctx: import('grammy').Context) => {
          for (const [pat, h] of callbacks) {
            if (typeof pat === 'string' && pat === data) { await h(ctx); return; }
            if (pat instanceof RegExp && pat.test(data)) {
              (ctx as unknown as { match: RegExpMatchArray | null }).match = data.match(pat);
              await h(ctx);
              return;
            }
          }
        },
        _fireText: async (ctx: import('grammy').Context) => {
          if (textHandler) await textHandler(ctx, async () => undefined);
        },
      };
    }

    function makeCtx(chatId: number, text: string) {
      const replyCalls: [string, unknown?][] = [];
      const editCalls: [string, unknown?][] = [];
      const ctx: unknown = {
        chat: { id: chatId, type: 'private' },
        message: { text, message_id: 1 },
        match: null,
        reply: async (t: string, opts?: unknown) => { replyCalls.push([t, opts]); },
        editMessageText: async (t: string, opts?: unknown) => { editCalls.push([t, opts]); },
        answerCallbackQuery: async () => undefined,
        api: { sendMessage: async () => ({ message_id: 1 }) },
        _replyCalls: replyCalls,
        _editCalls: editCalls,
      };
      return ctx as import('grammy').Context;
    }

    async function setupNameEdit(chatId: number) {
      const { registerProfileHandler } = await import('../bot/profileHandler.js');
      const bot = buildMockBot();
      registerProfileHandler(bot as unknown as import('grammy').Bot);
      upsertUser(chatId);
      // Put user into "name edit" pending state by firing the callback.
      const ctx = makeCtx(chatId, '');
      await bot._fireCb('pf:edit_name', ctx);
      return bot;
    }

    it('rejects name longer than 50 characters with the validation reply', async () => {
      const chatId = 8101;
      const bot = await setupNameEdit(chatId);
      const longName = 'א'.repeat(51);
      const ctx = makeCtx(chatId, longName);
      await bot._fireText(ctx);

      const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown?][] })._replyCalls;
      assert.ok(replyCalls.length >= 1, 'must reply with validation error');
      assert.match(replyCalls[0]![0], /1 ל-50/, 'reply must mention the 1-50 character limit');
      assert.equal(getProfile(chatId)?.display_name, null, 'profile must NOT be updated');
    });

    it('rejects empty name (whitespace-only after strip+trim)', async () => {
      const chatId = 8102;
      const bot = await setupNameEdit(chatId);
      const ctx = makeCtx(chatId, '   ');
      await bot._fireText(ctx);

      const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown?][] })._replyCalls;
      assert.match(replyCalls[0]![0], /1 ל-50/);
      assert.equal(getProfile(chatId)?.display_name, null);
    });

    it('rejects name that becomes empty after stripHtml (HTML-only input)', async () => {
      const chatId = 8103;
      const bot = await setupNameEdit(chatId);
      // Pure HTML markup — stripHtml leaves nothing.
      const ctx = makeCtx(chatId, '<b></b>');
      await bot._fireText(ctx);

      const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown?][] })._replyCalls;
      assert.match(replyCalls[0]![0], /1 ל-50/);
      assert.equal(getProfile(chatId)?.display_name, null);
    });

    it('strips HTML tags from name input but keeps the visible text', async () => {
      const chatId = 8104;
      const bot = await setupNameEdit(chatId);
      const ctx = makeCtx(chatId, '<b>יונתן</b>');
      await bot._fireText(ctx);

      assert.equal(
        getProfile(chatId)?.display_name,
        'יונתן',
        'tags must be stripped, the visible text kept'
      );
    });

    it('accepts a valid 50-character name (boundary value)', async () => {
      const chatId = 8105;
      const bot = await setupNameEdit(chatId);
      const exactlyFifty = 'א'.repeat(50);
      const ctx = makeCtx(chatId, exactlyFifty);
      await bot._fireText(ctx);
      assert.equal(getProfile(chatId)?.display_name, exactlyFifty);
    });

    it('accepts a 1-character name (lower boundary)', async () => {
      const chatId = 8106;
      const bot = await setupNameEdit(chatId);
      const ctx = makeCtx(chatId, 'א');
      await bot._fireText(ctx);
      assert.equal(getProfile(chatId)?.display_name, 'א');
    });
  });
});
