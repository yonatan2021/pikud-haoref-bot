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
  setOnboardingStep,
  completeOnboarding,
  isOnboardingCompleted,
} from '../db/userRepository';
import {
  buildNamePrompt,
  buildCityPrompt,
  buildCityResults,
  buildConfirmPrompt,
  isInOnboarding,
} from '../bot/onboardingHandler';

describe('onboardingHandler', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  describe('step transitions', () => {
    it('name -> city -> confirm -> completed', () => {
      const chatId = 9001;
      upsertUser(chatId);

      setOnboardingStep(chatId, 'name');
      assert.equal(getProfile(chatId)?.onboarding_step, 'name');
      assert.equal(isInOnboarding(chatId), true);

      updateProfile(chatId, { display_name: 'יונתן' });
      setOnboardingStep(chatId, 'city');
      assert.equal(getProfile(chatId)?.onboarding_step, 'city');
      assert.equal(getProfile(chatId)?.display_name, 'יונתן');

      updateProfile(chatId, { home_city: 'אבו גוש' });
      setOnboardingStep(chatId, 'confirm');
      assert.equal(getProfile(chatId)?.onboarding_step, 'confirm');
      assert.equal(getProfile(chatId)?.home_city, 'אבו גוש');

      completeOnboarding(chatId);
      assert.equal(isOnboardingCompleted(chatId), true);
      assert.equal(getProfile(chatId)?.onboarding_step, null);
      assert.equal(isInOnboarding(chatId), false);
    });

    it('skip name goes to city step', () => {
      const chatId = 9002;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'name');
      setOnboardingStep(chatId, 'city');
      const profile = getProfile(chatId);
      assert.equal(profile?.onboarding_step, 'city');
      assert.equal(profile?.display_name, null);
    });

    it('skip city goes to confirm step', () => {
      const chatId = 9003;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'name');
      updateProfile(chatId, { display_name: 'Test' });
      setOnboardingStep(chatId, 'city');
      setOnboardingStep(chatId, 'confirm');
      const profile = getProfile(chatId);
      assert.equal(profile?.onboarding_step, 'confirm');
      assert.equal(profile?.home_city, null);
    });

    it('confirm completes onboarding and clears step', () => {
      const chatId = 9004;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'confirm');
      completeOnboarding(chatId);
      assert.equal(isOnboardingCompleted(chatId), true);
      assert.equal(getProfile(chatId)?.onboarding_step, null);
    });

    it('restart resets to name step', () => {
      const chatId = 9005;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'confirm');
      updateProfile(chatId, { display_name: 'Before' });
      setOnboardingStep(chatId, 'name');
      assert.equal(getProfile(chatId)?.onboarding_step, 'name');
      assert.equal(isInOnboarding(chatId), true);
    });
  });

  describe('isInOnboarding', () => {
    it('returns false for non-existent user', () => {
      assert.equal(isInOnboarding(99999), false);
    });

    it('returns false for user with null step', () => {
      upsertUser(9010);
      assert.equal(isInOnboarding(9010), false);
    });

    it('returns false for completed user', () => {
      upsertUser(9011);
      setOnboardingStep(9011, 'name');
      completeOnboarding(9011);
      assert.equal(isInOnboarding(9011), false);
    });

    it('returns true for user mid-onboarding', () => {
      upsertUser(9012);
      setOnboardingStep(9012, 'city');
      assert.equal(isInOnboarding(9012), true);
    });
  });

  describe('message builders', () => {
    it('buildNamePrompt returns welcome text with skip button', () => {
      const { text, keyboard } = buildNamePrompt();
      assert.ok(text.includes('ברוך הבא'));
      assert.ok(text.includes('מה השם שלך'));
      assert.ok(keyboard);
    });

    it('buildCityPrompt returns city prompt', () => {
      const { text, keyboard } = buildCityPrompt();
      assert.ok(text.includes('עיר מגורים'));
      assert.ok(keyboard);
    });

    it('buildCityResults shows up to 5 results', () => {
      const cities = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `עיר ${i + 1}`,
      }));
      const { text, keyboard } = buildCityResults(cities);
      assert.ok(text.includes('בחר עיר'));
      assert.ok(keyboard);
    });

    it('buildConfirmPrompt shows name and city when set', () => {
      const { text } = buildConfirmPrompt('יונתן', 'אבו גוש');
      assert.ok(text.includes('יונתן'));
      assert.ok(text.includes('אבו גוש'));
      assert.ok(text.includes('סיכום'));
    });

    it('buildConfirmPrompt shows fallback for null fields', () => {
      const { text } = buildConfirmPrompt(null, null);
      assert.ok(text.includes('לא הוגדר'));
      assert.ok(text.includes('לא הוגדרה'));
    });
  });

  describe('name validation', () => {
    it('accepts valid name', () => {
      upsertUser(9020);
      updateProfile(9020, { display_name: 'Valid' });
      assert.equal(getProfile(9020)?.display_name, 'Valid');
    });

    it('accepts name up to 50 chars', () => {
      upsertUser(9021);
      const longName = 'א'.repeat(50);
      updateProfile(9021, { display_name: longName });
      assert.equal(getProfile(9021)?.display_name, longName);
    });
  });

  // I5 — invalid city ID in ob:city callback. The handler regex matches
  // \d+ but doesn't verify the city actually exists in cities.json. The
  // null-check at src/bot/onboardingHandler.ts:179 is the safety net.
  // Existing tests never exercised this branch via the real callback path.
  describe('ob:city callback — invalid city ID handling', () => {
    function buildMockBot() {
      const callbacks: Array<[string | RegExp, (ctx: import('grammy').Context) => Promise<void>]> = [];
      return {
        command: () => {},
        callbackQuery: (pat: string | RegExp, h: (ctx: import('grammy').Context) => Promise<void>) => {
          callbacks.push([pat, h]);
        },
        on: () => {},
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
      };
    }

    function makeCtx(chatId: number, callbackData: string) {
      const replyCalls: [string, unknown?][] = [];
      const editCalls: [string, unknown?][] = [];
      const ctx: unknown = {
        chat: { id: chatId, type: 'private' },
        message: { message_id: 1 },
        callbackQuery: { data: callbackData, id: 'cb-1' },
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

    it('ob:city with non-existent city ID replies with error and does NOT advance step', async () => {
      const { registerOnboardingHandler } = await import('../bot/onboardingHandler.js');
      const chatId = 9_100;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'city');

      const bot = buildMockBot();
      registerOnboardingHandler(bot as unknown as import('grammy').Bot);

      // 999_999 is far outside any real city ID range — getCityById returns undefined.
      const ctx = makeCtx(chatId, 'ob:city:999999');
      await bot._fireCb('ob:city:999999', ctx);

      const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown?][] })._replyCalls;
      assert.ok(replyCalls.length >= 1, 'must reply with the "city not found" error');
      assert.match(replyCalls[0]![0], /עיר לא נמצאה/);

      // Profile must NOT have a home_city set, and the step must still be 'city'.
      assert.equal(getProfile(chatId)?.home_city, null);
      assert.equal(getProfile(chatId)?.onboarding_step, 'city', 'step must NOT advance to confirm');
    });

    it('ob:city with a real city ID (511 = אבו גוש) sets home_city and advances to confirm', async () => {
      const { registerOnboardingHandler } = await import('../bot/onboardingHandler.js');
      const chatId = 9_101;
      upsertUser(chatId);
      setOnboardingStep(chatId, 'city');

      const bot = buildMockBot();
      registerOnboardingHandler(bot as unknown as import('grammy').Bot);

      const ctx = makeCtx(chatId, 'ob:city:511');
      await bot._fireCb('ob:city:511', ctx);

      assert.equal(getProfile(chatId)?.home_city, 'אבו גוש');
      assert.equal(getProfile(chatId)?.onboarding_step, 'confirm');
    });

    it('ob:confirm with a stale home_city (no longer in cities.json) still completes onboarding', async () => {
      // Edge case: a user's stored home_city points to a city that has been
      // removed from cities.json since they set it. The auto-subscription
      // should silently skip but onboarding must still complete.
      const { registerOnboardingHandler } = await import('../bot/onboardingHandler.js');
      const chatId = 9_102;
      upsertUser(chatId);
      // Force a bogus home_city directly into the DB.
      updateProfile(chatId, { home_city: 'עיר שלא קיימת בשום מקום' });
      setOnboardingStep(chatId, 'confirm');

      const bot = buildMockBot();
      registerOnboardingHandler(bot as unknown as import('grammy').Bot);

      const ctx = makeCtx(chatId, 'ob:confirm');
      await bot._fireCb('ob:confirm', ctx);

      // Onboarding must be marked complete despite the stale home_city.
      assert.equal(
        isOnboardingCompleted(chatId),
        true,
        'completeOnboarding must run even when home_city resolution fails'
      );
    });
  });
});
