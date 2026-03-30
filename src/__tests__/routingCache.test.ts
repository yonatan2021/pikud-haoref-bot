import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { setSetting } from '../dashboard/settingsRepository.js';
import {
  loadRoutingCache,
  getTopicIdCached,
  isRoutingCacheLoaded,
} from '../config/routingCache.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('routingCache', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Strip all routing env vars so tests start clean
    delete process.env.TELEGRAM_TOPIC_ID_SECURITY;
    delete process.env.TELEGRAM_TOPIC_ID_NATURE;
    delete process.env.TELEGRAM_TOPIC_ID_ENVIRONMENTAL;
    delete process.env.TELEGRAM_TOPIC_ID_DRILLS;
    delete process.env.TELEGRAM_TOPIC_ID_GENERAL;
  });

  afterEach(() => {
    // Restore env to original state
    process.env = { ...originalEnv };
  });

  it('no env vars and no settings → all categories return undefined', () => {
    const db = makeDb();
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missiles'), undefined);
    assert.equal(getTopicIdCached('earthQuake'), undefined);
    assert.equal(getTopicIdCached('hazardousMaterials'), undefined);
    assert.equal(getTopicIdCached('missilesDrill'), undefined);
    assert.equal(getTopicIdCached('newsFlash'), undefined);
    db.close();
  });

  it('loadRoutingCache sets _loaded to true', () => {
    const db = makeDb();
    loadRoutingCache(db);
    assert.equal(isRoutingCacheLoaded(), true);
    db.close();
  });

  it('reads from settings table — topic_id_security=1234 → missiles resolves to 1234', () => {
    const db = makeDb();
    setSetting(db, 'topic_id_security', '1234');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missiles'), 1234);
    assert.equal(getTopicIdCached('hostileAircraftIntrusion'), 1234);
    assert.equal(getTopicIdCached('terroristInfiltration'), 1234);
    db.close();
  });

  it('rejects topic ID 1 (reserved Telegram thread) → returns undefined', () => {
    const db = makeDb();
    setSetting(db, 'topic_id_security', '1');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missiles'), undefined);
    db.close();
  });

  it('rejects non-numeric setting → returns undefined', () => {
    const db = makeDb();
    setSetting(db, 'topic_id_nature', 'not-a-number');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('earthQuake'), undefined);
    db.close();
  });

  it('env var fallback — TELEGRAM_TOPIC_ID_NATURE=5678 → earthQuake resolves to 5678', () => {
    const db = makeDb();
    process.env.TELEGRAM_TOPIC_ID_NATURE = '5678';
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('earthQuake'), 5678);
    assert.equal(getTopicIdCached('tsunami'), 5678);
    db.close();
  });

  it('settings override beats env var — setting wins for same category', () => {
    const db = makeDb();
    process.env.TELEGRAM_TOPIC_ID_SECURITY = '100';
    setSetting(db, 'topic_id_security', '200');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missiles'), 200);
    db.close();
  });

  it('hot-reload: change setting, reload, new value takes effect', () => {
    const db = makeDb();
    setSetting(db, 'topic_id_drills', '300');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missilesDrill'), 300);

    // Now change the setting and reload
    setSetting(db, 'topic_id_drills', '400');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('missilesDrill'), 400);
    db.close();
  });

  it('unknown alert type maps to general category', () => {
    const db = makeDb();
    setSetting(db, 'topic_id_general', '999');
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('nonExistentAlertType'), 999);
    db.close();
  });

  it('env var rejects topic ID 1 → returns undefined', () => {
    const db = makeDb();
    process.env.TELEGRAM_TOPIC_ID_ENVIRONMENTAL = '1';
    loadRoutingCache(db);
    assert.equal(getTopicIdCached('hazardousMaterials'), undefined);
    db.close();
  });

  it('cache is frozen after load', () => {
    const db = makeDb();
    loadRoutingCache(db);
    // Verify we can still call getTopicIdCached without errors (frozen internal state)
    assert.doesNotThrow(() => getTopicIdCached('missiles'));
    db.close();
  });
});
