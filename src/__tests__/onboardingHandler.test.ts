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
});
