import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  getMonthlyCount,
  incrementMonthlyCount,
  isMonthlyLimitReached,
  initUsageCache,
} from '../db/mapboxUsageRepository';

describe('mapboxUsageRepository', () => {
  let savedEnv: NodeJS.ProcessEnv;

  before(() => {
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM mapbox_usage').run();
    // Reset in-memory cache to match cleared DB state
    initUsageCache();
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  after(() => {
    closeDb();
  });

  describe('getMonthlyCount', () => {
    it('returns 0 when no row exists for the month', () => {
      assert.equal(getMonthlyCount('2026-03'), 0);
    });

    it('returns the stored count for an existing month', () => {
      incrementMonthlyCount('2026-03');
      incrementMonthlyCount('2026-03');
      assert.equal(getMonthlyCount('2026-03'), 2);
    });
  });

  describe('incrementMonthlyCount', () => {
    it('creates a row with count 1 on first call', () => {
      incrementMonthlyCount('2026-03');
      assert.equal(getMonthlyCount('2026-03'), 1);
    });

    it('increments an existing row on subsequent calls', () => {
      incrementMonthlyCount('2026-03');
      incrementMonthlyCount('2026-03');
      incrementMonthlyCount('2026-03');
      assert.equal(getMonthlyCount('2026-03'), 3);
    });

    it('returns the updated count', () => {
      const result = incrementMonthlyCount('2026-03');
      assert.equal(result, 1);
      const result2 = incrementMonthlyCount('2026-03');
      assert.equal(result2, 2);
    });

    it('increments independently per month', () => {
      incrementMonthlyCount('2026-03');
      incrementMonthlyCount('2026-03');
      incrementMonthlyCount('2026-04');
      assert.equal(getMonthlyCount('2026-03'), 2);
      assert.equal(getMonthlyCount('2026-04'), 1);
    });
  });

  describe('isMonthlyLimitReached', () => {
    it('returns false when MAPBOX_MONTHLY_LIMIT is not set', () => {
      delete process.env.MAPBOX_MONTHLY_LIMIT;
      assert.equal(isMonthlyLimitReached(), false);
    });

    it('returns false when MAPBOX_MONTHLY_LIMIT is empty string', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = '';
      assert.equal(isMonthlyLimitReached(), false);
    });

    it('returns false when MAPBOX_MONTHLY_LIMIT is not a valid number', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = 'abc';
      assert.equal(isMonthlyLimitReached(), false);
    });

    it('returns false when count is below the limit', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = '5';
      const currentMonth = new Date().toISOString().slice(0, 7);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      assert.equal(isMonthlyLimitReached(), false);
    });

    it('returns true when count equals the limit (boundary)', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = '3';
      const currentMonth = new Date().toISOString().slice(0, 7);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      assert.equal(isMonthlyLimitReached(), true);
    });

    it('returns true when count exceeds the limit', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = '2';
      const currentMonth = new Date().toISOString().slice(0, 7);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      assert.equal(isMonthlyLimitReached(), true);
    });
  });

  describe('initUsageCache', () => {
    it('seeds memCount from DB — isMonthlyLimitReached reflects persisted count', () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      process.env.MAPBOX_MONTHLY_LIMIT = '3';

      // Write 3 increments directly to DB without going through in-memory path
      // by calling incrementMonthlyCount (which also updates memCount),
      // then re-seeding from DB to verify initUsageCache reads the persisted value
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);
      incrementMonthlyCount(currentMonth);

      // Verify DB has the count persisted
      assert.equal(getMonthlyCount(currentMonth), 3);

      // Re-initialize cache from DB — should reflect the 3 persisted increments
      initUsageCache();

      assert.equal(isMonthlyLimitReached(), true);
    });

    it('returns true after incrementing to the limit using in-memory counter', () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      process.env.MAPBOX_MONTHLY_LIMIT = '2';

      incrementMonthlyCount(currentMonth);
      assert.equal(isMonthlyLimitReached(), false);

      incrementMonthlyCount(currentMonth);
      assert.equal(isMonthlyLimitReached(), true);
    });

    it('resets counter on month rollover', () => {
      process.env.MAPBOX_MONTHLY_LIMIT = '2';

      // Seed cache for January
      getDb()
        .prepare(
          `INSERT INTO mapbox_usage (month, request_count) VALUES ('2026-01', 2)
           ON CONFLICT(month) DO UPDATE SET request_count = 2`
        )
        .run();

      // Manually set cache to January with count 2 by calling initUsageCache
      // while the DB row exists (we need to manipulate currentMonth to test rollover,
      // so instead we call incrementMonthlyCount with a past month to prime memMonth)
      incrementMonthlyCount('2026-01');
      incrementMonthlyCount('2026-01');

      // Now call increment for February — should reset memCount to 1
      const result = incrementMonthlyCount('2026-02');
      assert.equal(result, 1);

      // DB count for Feb should also be 1
      assert.equal(getMonthlyCount('2026-02'), 1);
    });
  });
});
