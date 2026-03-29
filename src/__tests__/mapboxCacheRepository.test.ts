import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  loadCacheEntries,
  saveCacheEntry,
  deleteCacheEntry,
  pruneCacheEntries,
} from '../db/mapboxCacheRepository';

const KEY_A = 'missiles:אבו גוש|אביעזר';
const KEY_B = 'earthQuake:חיפה|נשר';
const IMAGE_A = Buffer.from('fake-image-a');
const IMAGE_B = Buffer.from('fake-image-b');

describe('mapboxCacheRepository', () => {
  before(() => {
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM mapbox_image_cache').run();
  });

  after(() => {
    closeDb();
  });

  describe('loadCacheEntries', () => {
    it('returns empty array when table is empty', () => {
      const entries = loadCacheEntries(20);
      assert.deepEqual(entries, []);
    });

    it('returns saved entry with correct key and buffer', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].key, KEY_A);
      assert.deepEqual(entries[0].buffer, IMAGE_A);
    });

    it('returns multiple entries', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 2);
    });

    it('respects maxSize limit', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      const entries = loadCacheEntries(1);
      assert.equal(entries.length, 1);
    });

    it('returns entries ordered by created_at ascending (oldest first)', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      // Small delay not needed — SQLite datetime has second resolution,
      // so use a direct UPDATE to fake the order
      getDb()
        .prepare(`UPDATE mapbox_image_cache SET created_at = '2020-01-01 00:00:00' WHERE cache_key = ?`)
        .run(KEY_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      const entries = loadCacheEntries(20);
      assert.equal(entries[0].key, KEY_A);
      assert.equal(entries[1].key, KEY_B);
    });
  });

  describe('saveCacheEntry', () => {
    it('inserts a new entry', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 1);
    });

    it('overwrites an existing entry with the same key (upsert)', () => {
      const updated = Buffer.from('updated-image');
      saveCacheEntry(KEY_A, IMAGE_A);
      saveCacheEntry(KEY_A, updated);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 1);
      assert.deepEqual(entries[0].buffer, updated);
    });
  });

  describe('pruneCacheEntries', () => {
    it('removes rows beyond maxSize, keeping the newest', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      getDb()
        .prepare(`UPDATE mapbox_image_cache SET created_at = '2020-01-01 00:00:00' WHERE cache_key = ?`)
        .run(KEY_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      pruneCacheEntries(1);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].key, KEY_B);
    });

    it('is a no-op when row count is within maxSize', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      pruneCacheEntries(5);
      assert.equal(loadCacheEntries(20).length, 2);
    });

    it('deletes all rows when maxSize is 0', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      pruneCacheEntries(0);
      assert.equal(loadCacheEntries(20).length, 0);
    });
  });

  describe('deleteCacheEntry', () => {
    it('removes an existing entry by key', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      deleteCacheEntry(KEY_A);
      const entries = loadCacheEntries(20);
      assert.deepEqual(entries, []);
    });

    it('is a no-op when key does not exist', () => {
      assert.doesNotThrow(() => deleteCacheEntry('nonexistent-key'));
    });

    it('only deletes the targeted key', () => {
      saveCacheEntry(KEY_A, IMAGE_A);
      saveCacheEntry(KEY_B, IMAGE_B);
      deleteCacheEntry(KEY_A);
      const entries = loadCacheEntries(20);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].key, KEY_B);
    });
  });
});
