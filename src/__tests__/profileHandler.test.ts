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
});
