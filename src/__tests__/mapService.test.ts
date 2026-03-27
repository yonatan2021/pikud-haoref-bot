import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Ensure data dir exists for SQLite
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { maxCacheSize, clearImageCache, _seedCache, generateMapImage } from '../mapService';
import { initDb, getDb } from '../db/schema';
import { getMonthlyCount, incrementMonthlyCount, isMonthlyLimitReached } from '../db/mapboxUsageRepository';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function cleanupDb(): void {
  getDb().prepare('DELETE FROM mapbox_usage').run();
}

describe('maxCacheSize', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.MAPBOX_IMAGE_CACHE_SIZE;
    delete process.env.MAPBOX_IMAGE_CACHE_SIZE;
  });

  afterEach(() => {
    if (saved !== undefined) {
      process.env.MAPBOX_IMAGE_CACHE_SIZE = saved;
    } else {
      delete process.env.MAPBOX_IMAGE_CACHE_SIZE;
    }
  });

  it('defaults to 20 when env var is not set', () => {
    assert.equal(maxCacheSize(), 20);
  });

  it('defaults to 20 when env var is zero', () => {
    process.env.MAPBOX_IMAGE_CACHE_SIZE = '0';
    assert.equal(maxCacheSize(), 20);
  });

  it('defaults to 20 when env var is invalid', () => {
    process.env.MAPBOX_IMAGE_CACHE_SIZE = 'abc';
    assert.equal(maxCacheSize(), 20);
  });

  it('uses the configured value when valid', () => {
    process.env.MAPBOX_IMAGE_CACHE_SIZE = '50';
    assert.equal(maxCacheSize(), 50);
  });
});

describe('generateMapImage — cache hit', () => {
  let savedLimit: string | undefined;

  before(() => initDb());

  beforeEach(() => {
    clearImageCache();
    cleanupDb();
    savedLimit = process.env.MAPBOX_MONTHLY_LIMIT;
    delete process.env.MAPBOX_MONTHLY_LIMIT;
  });

  afterEach(() => {
    if (savedLimit !== undefined) {
      process.env.MAPBOX_MONTHLY_LIMIT = savedLimit;
    } else {
      delete process.env.MAPBOX_MONTHLY_LIMIT;
    }
  });

  it('returns cached buffer without making a Mapbox HTTP request', async () => {
    const alert = { type: 'missiles', cities: ['תל אביב'] };
    const fakeBuffer = Buffer.from('fake-image-data');
    _seedCache(alert, fakeBuffer);

    const initialCount = getMonthlyCount(currentMonth());
    const result = await generateMapImage(alert);

    assert.equal(result, fakeBuffer);
    assert.equal(getMonthlyCount(currentMonth()), initialCount);
  });
});

describe('generateMapImage — monthly limit guard', () => {
  let savedLimit: string | undefined;

  before(() => initDb());

  beforeEach(() => {
    clearImageCache();
    cleanupDb();
    savedLimit = process.env.MAPBOX_MONTHLY_LIMIT;
  });

  afterEach(() => {
    if (savedLimit !== undefined) {
      process.env.MAPBOX_MONTHLY_LIMIT = savedLimit;
    } else {
      delete process.env.MAPBOX_MONTHLY_LIMIT;
    }
    cleanupDb();
  });

  it('returns null when monthly limit is reached', async () => {
    process.env.MAPBOX_MONTHLY_LIMIT = '1';
    incrementMonthlyCount(currentMonth());

    const alert = { type: 'missiles', cities: ['תל אביב'] };
    const result = await generateMapImage(alert);

    assert.equal(result, null);
    assert.equal(getMonthlyCount(currentMonth()), 1);
  });

  it('does not apply limit when MAPBOX_MONTHLY_LIMIT is not set', () => {
    delete process.env.MAPBOX_MONTHLY_LIMIT;
    assert.equal(isMonthlyLimitReached(), false);
  });
});
