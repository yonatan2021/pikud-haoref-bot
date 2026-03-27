import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb } from '../db/schema';
import {
  getMonthlyCount,
  incrementMonthlyCount,
  isMonthlyLimitReached,
} from '../db/mapboxUsageRepository';

describe('mapboxUsageRepository', () => {
  let savedEnv: NodeJS.ProcessEnv;

  before(() => {
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM mapbox_usage').run();
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  after(() => {
    getDb().close();
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
});
