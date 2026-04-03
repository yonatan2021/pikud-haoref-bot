import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  addSubscription,
  removeSubscription,
  removeAllSubscriptions,
  getUsersForCities,
  initSubscriptionCache,
  updateSubscriberData,
} from '../db/subscriptionRepository';
import { setFormat, setQuietHours, setMutedUntil } from '../db/userRepository';

describe('subscriptionRepository — in-memory cache', () => {
  before(() => {
    initDb();
  });

  after(() => {
    closeDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
    // Reset cache state between tests by re-initialising with empty DB
    initSubscriptionCache();
  });

  it('initSubscriptionCache: getUsersForCities returns correct results matching DB query', () => {
    // Populate DB manually before calling initSubscriptionCache
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(101);
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(101, 'תל אביב');
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(101, 'חיפה');

    initSubscriptionCache();

    const results = getUsersForCities(['תל אביב']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 101);
    assert.deepEqual(results[0].matchedCities, ['תל אביב']);
    assert.equal(results[0].format, 'short');
    assert.equal(results[0].quiet_hours_enabled, false);
    assert.equal(results[0].muted_until, null);
  });

  it('initSubscriptionCache: returns all matched cities for a subscriber', () => {
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(102);
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(102, 'תל אביב');
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(102, 'חיפה');

    initSubscriptionCache();

    const results = getUsersForCities(['תל אביב', 'חיפה']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 102);
    assert.equal(results[0].matchedCities.length, 2);
    assert.ok(results[0].matchedCities.includes('תל אביב'));
    assert.ok(results[0].matchedCities.includes('חיפה'));
  });

  it('initSubscriptionCache: multiple subscribers for same city', () => {
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(201);
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(202);
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(201, 'ירושלים');
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(202, 'ירושלים');

    initSubscriptionCache();

    const results = getUsersForCities(['ירושלים']);
    assert.equal(results.length, 2);
    const ids = results.map((r) => r.chat_id).sort();
    assert.deepEqual(ids, [201, 202]);
  });

  it('addSubscription: getUsersForCities immediately returns updated results without re-init', () => {
    initSubscriptionCache(); // start with empty cache

    addSubscription(301, 'באר שבע');

    const results = getUsersForCities(['באר שבע']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 301);
    assert.deepEqual(results[0].matchedCities, ['באר שבע']);
  });

  it('addSubscription: second city for existing subscriber is added to cache', () => {
    addSubscription(302, 'רחובות');
    addSubscription(302, 'נס ציונה');

    const results = getUsersForCities(['רחובות', 'נס ציונה']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 302);
    assert.ok(results[0].matchedCities.includes('רחובות'));
    assert.ok(results[0].matchedCities.includes('נס ציונה'));
  });

  it('removeSubscription: removed city is no longer returned for user', () => {
    addSubscription(401, 'אשדוד');
    addSubscription(401, 'אשקלון');

    removeSubscription(401, 'אשדוד');

    const results = getUsersForCities(['אשדוד', 'אשקלון']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 401);
    assert.deepEqual(results[0].matchedCities, ['אשקלון']);
  });

  it('removeSubscription: user not returned at all when last city removed', () => {
    addSubscription(402, 'נתניה');

    removeSubscription(402, 'נתניה');

    const results = getUsersForCities(['נתניה']);
    assert.equal(results.length, 0);
  });

  it('removeAllSubscriptions: user gets no results after removing all', () => {
    addSubscription(501, 'פתח תקווה');
    addSubscription(501, 'רמת גן');
    addSubscription(501, 'גבעתיים');

    removeAllSubscriptions(501);

    const results = getUsersForCities(['פתח תקווה', 'רמת גן', 'גבעתיים']);
    assert.equal(results.length, 0);
  });

  it('removeAllSubscriptions: only removes target user, other subscribers unaffected', () => {
    addSubscription(601, 'חולון');
    addSubscription(602, 'חולון');

    removeAllSubscriptions(601);

    const results = getUsersForCities(['חולון']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chat_id, 602);
  });

  it('getUsersForCities: returns empty array for empty city list', () => {
    addSubscription(701, 'כפר סבא');
    const results = getUsersForCities([]);
    assert.deepEqual(results, []);
  });
});

describe('subscriptionRepository — cache invalidation via userRepository setters', () => {
  before(() => {
    initDb();
  });

  after(() => {
    closeDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
    initSubscriptionCache();
  });

  it('setFormat: cache reflects updated format without re-init', () => {
    addSubscription(801, 'תל אביב');
    setFormat(801, 'detailed');

    const results = getUsersForCities(['תל אביב']);
    assert.equal(results.length, 1);
    assert.equal(results[0].format, 'detailed');
  });

  it('setQuietHours: cache reflects updated quiet_hours_enabled without re-init', () => {
    addSubscription(802, 'חיפה');
    setQuietHours(802, true);

    const results = getUsersForCities(['חיפה']);
    assert.equal(results.length, 1);
    assert.equal(results[0].quiet_hours_enabled, true);
  });

  it('setMutedUntil: cache reflects updated muted_until without re-init', () => {
    addSubscription(803, 'ירושלים');
    const futureDate = new Date(Date.now() + 3600 * 1000);
    setMutedUntil(803, futureDate);

    const results = getUsersForCities(['ירושלים']);
    assert.equal(results.length, 1);
    assert.notEqual(results[0].muted_until, null);
  });

  it('removeSubscription: user removed from cache when last subscription removed', () => {
    addSubscription(804, 'באר שבע');

    removeSubscription(804, 'באר שבע');

    const results = getUsersForCities(['באר שבע']);
    assert.equal(results.length, 0);
  });

  it('updateSubscriberData: home_city patch updates cached value', () => {
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(901);
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(901, 'חיפה');
    initSubscriptionCache();

    updateSubscriberData(901, { home_city: 'תל אביב' });

    const results = getUsersForCities(['חיפה']);
    assert.equal(results.length, 1);
    assert.equal(results[0].home_city, 'תל אביב');
  });

  it('updateSubscriberData: home_city null clears cached value', () => {
    getDb().prepare('INSERT OR IGNORE INTO users (chat_id, home_city) VALUES (?, ?)').run(902, 'חיפה');
    getDb().prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(902, 'חיפה');
    initSubscriptionCache();

    updateSubscriberData(902, { home_city: null });

    const results = getUsersForCities(['חיפה']);
    assert.equal(results.length, 1);
    assert.equal(results[0].home_city, null);
  });
});
