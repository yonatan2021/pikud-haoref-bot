import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists before importing db modules
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  addSubscription,
  removeSubscription,
  removeAllSubscriptions,
  getUserCities,
  getUsersForCities,
  isSubscribed,
  getSubscriptionCount,
} from '../db/subscriptionRepository';
import { upsertUser, setFormat, deleteUser } from '../db/userRepository';

describe('subscriptionService', () => {
  const CHAT_A = 111111;
  const CHAT_B = 222222;

  before(() => {
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  after(() => {
    closeDb();
  });

  describe('upsertUser', () => {
    it('creates user with default short format', () => {
      upsertUser(CHAT_A);
      const row = getDb().prepare('SELECT * FROM users WHERE chat_id = ?').get(CHAT_A) as { format: string } | undefined;
      assert.ok(row);
      assert.equal(row.format, 'short');
    });

    it('does not overwrite existing user on repeat call', () => {
      upsertUser(CHAT_A);
      setFormat(CHAT_A, 'detailed');
      upsertUser(CHAT_A);
      const row = getDb().prepare('SELECT format FROM users WHERE chat_id = ?').get(CHAT_A) as { format: string };
      assert.equal(row.format, 'detailed');
    });
  });

  describe('addSubscription / isSubscribed', () => {
    it('adds a city subscription', () => {
      addSubscription(CHAT_A, 'תל אביב');
      assert.ok(isSubscribed(CHAT_A, 'תל אביב'));
    });

    it('is idempotent', () => {
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'תל אביב');
      assert.equal(getSubscriptionCount(CHAT_A), 1);
    });

    it('returns false for unsubscribed city', () => {
      upsertUser(CHAT_A);
      assert.equal(isSubscribed(CHAT_A, 'תל אביב'), false);
    });
  });

  describe('removeSubscription', () => {
    it('removes a specific city without affecting others', () => {
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'רמת גן');
      removeSubscription(CHAT_A, 'תל אביב');
      assert.equal(isSubscribed(CHAT_A, 'תל אביב'), false);
      assert.ok(isSubscribed(CHAT_A, 'רמת גן'));
    });
  });

  describe('removeAllSubscriptions', () => {
    it('removes all cities for a user', () => {
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'רמת גן');
      removeAllSubscriptions(CHAT_A);
      assert.equal(getSubscriptionCount(CHAT_A), 0);
    });

    it('does not affect other users', () => {
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_B, 'חיפה');
      removeAllSubscriptions(CHAT_A);
      assert.ok(isSubscribed(CHAT_B, 'חיפה'));
    });
  });

  describe('getUserCities', () => {
    it('returns cities sorted alphabetically', () => {
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'אשדוד');
      addSubscription(CHAT_A, 'חיפה');
      const cities = getUserCities(CHAT_A);
      assert.equal(cities.length, 3);
      assert.deepEqual(cities, [...cities].sort((a, b) => a.localeCompare(b, 'he')));
    });
  });

  describe('getUsersForCities', () => {
    it('returns subscribers for matching cities', () => {
      upsertUser(CHAT_A);
      upsertUser(CHAT_B);
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_B, 'חיפה');
      addSubscription(CHAT_B, 'תל אביב');
      const subs = getUsersForCities(['תל אביב']);
      const chatIds = subs.map((s) => s.chat_id).sort();
      assert.deepEqual(chatIds, [CHAT_A, CHAT_B].sort());
    });

    it('populates matchedCities with only the cities that matched', () => {
      upsertUser(CHAT_A);
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'רמת גן');
      const subs = getUsersForCities(['תל אביב']);
      assert.equal(subs.length, 1);
      assert.deepEqual(subs[0].matchedCities, ['תל אביב']);
    });

    it('includes all matched cities when user has multiple matching subscriptions', () => {
      upsertUser(CHAT_A);
      addSubscription(CHAT_A, 'תל אביב');
      addSubscription(CHAT_A, 'רמת גן');
      const subs = getUsersForCities(['תל אביב', 'רמת גן']);
      assert.equal(subs.length, 1);
      assert.equal(subs[0].matchedCities.length, 2);
      assert.ok(subs[0].matchedCities.includes('תל אביב'));
      assert.ok(subs[0].matchedCities.includes('רמת גן'));
    });

    it('returns the correct format for each user', () => {
      upsertUser(CHAT_A);
      setFormat(CHAT_A, 'detailed');
      addSubscription(CHAT_A, 'תל אביב');
      const subs = getUsersForCities(['תל אביב']);
      assert.equal(subs[0].format, 'detailed');
    });

    it('includes quiet_hours_enabled field defaulting to 0', () => {
      upsertUser(CHAT_A);
      addSubscription(CHAT_A, 'תל אביב');
      const subs = getUsersForCities(['תל אביב']);
      assert.equal(typeof subs[0].quiet_hours_enabled, 'number');
      assert.equal(subs[0].quiet_hours_enabled, 0);
    });

    it('returns empty array when city list is empty', () => {
      assert.deepEqual(getUsersForCities([]), []);
    });
  });

  describe('deleteUser', () => {
    it('cascades to subscriptions', () => {
      upsertUser(CHAT_A);
      addSubscription(CHAT_A, 'תל אביב');
      deleteUser(CHAT_A);
      assert.equal(getSubscriptionCount(CHAT_A), 0);
    });
  });
});
