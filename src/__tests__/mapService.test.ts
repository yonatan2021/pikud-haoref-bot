import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Ensure data dir exists for SQLite
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { maxCacheSize, clearImageCache, _seedCache, generateMapImage, _buildMarkersUrl, SIMPLIFY_TOLERANCE, SIMPLIFY_TOLERANCE_AGGRESSIVE, getAlertColor, ALERT_TYPE_COLOR } from '../mapService';
import { buildGeoJSON } from '../cityLookup';
import { initDb, getDb } from '../db/schema';
import { getMonthlyCount, incrementMonthlyCount, isMonthlyLimitReached } from '../db/mapboxUsageRepository';
import { getCityData } from '../cityLookup';

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

describe('alert type color map', () => {
  it('covers all known alert types from ALERT_TYPE_HE', () => {
    const knownTypes = [
      'missiles', 'earthQuake', 'tsunami', 'hostileAircraftIntrusion',
      'hazardousMaterials', 'terroristInfiltration', 'radiologicalEvent',
      'newsFlash', 'general', 'unknown',
      'missilesDrill', 'earthQuakeDrill', 'tsunamiDrill',
      'hostileAircraftIntrusionDrill', 'hazardousMaterialsDrill',
      'terroristInfiltrationDrill', 'radiologicalEventDrill', 'generalDrill',
    ];
    for (const type of knownTypes) {
      assert.ok(ALERT_TYPE_COLOR[type], `Missing color for alert type: ${type}`);
    }
  });

  it('falls back to red for an unrecognised alert type', () => {
    assert.equal(getAlertColor('unknownXyz'), '#FF0000');
  });

  it('returns the mapped color for missiles', () => {
    assert.equal(getAlertColor('missiles'), '#FF0000');
  });

  it('returns a distinct color for drills vs. security alerts', () => {
    assert.notEqual(getAlertColor('missilesDrill'), getAlertColor('missiles'));
  });

  it('buildGeoJSON passes the color to all feature properties', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const fc = buildGeoJSON([city.id], '#0080FF');
    assert.ok(fc.features.length > 0, 'expected at least one polygon feature');
    for (const feature of fc.features) {
      assert.equal(feature.properties?.fill, '#0080FF');
      assert.equal(feature.properties?.stroke, '#0080FF');
    }
  });
});

describe('simplification tolerances', () => {
  it('SIMPLIFY_TOLERANCE is 0.0003 for sharper polygon edges', () => {
    assert.equal(SIMPLIFY_TOLERANCE, 0.0003);
  });

  it('SIMPLIFY_TOLERANCE_AGGRESSIVE is 0.003 for long-URL fallback', () => {
    assert.equal(SIMPLIFY_TOLERANCE_AGGRESSIVE, 0.003);
  });
});

describe('_buildMarkersUrl', () => {
  it('returns null when cityIds array is empty', () => {
    const result = _buildMarkersUrl([]);
    assert.equal(result, null);
  });

  it('returns null when no city IDs match any known city', () => {
    const result = _buildMarkersUrl([-1, -999]);
    assert.equal(result, null);
  });

  it('returns a Mapbox pin marker URL for a single valid city', () => {
    // אבו גוש id=511 — stable entry in cities.json
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש to exist in city data');

    const result = _buildMarkersUrl([city.id]);

    assert.ok(result !== null, 'expected a URL, got null');
    assert.ok(result!.includes('pin-s+FF0000'), 'URL must use red pin markers');
    assert.ok(
      result!.includes(`${city.lng.toFixed(4)},${city.lat.toFixed(4)}`),
      'URL must contain city coordinates in (lng,lat) order'
    );
    assert.ok(result!.includes('mapbox.com'), 'URL must point to Mapbox API');
    assert.ok(result!.includes('/auto/'), 'URL must use auto-fit viewport');
  });

  it('includes one marker per city when given multiple city IDs', () => {
    // אבו גוש id=511, אבו סנאן id=1470 — stable entries in cities.json
    const city1 = getCityData('אבו גוש');
    const city2 = getCityData('אבו סנאן');
    assert.ok(city1 && city2, 'test requires both cities to exist in city data');

    const result = _buildMarkersUrl([city1.id, city2.id]);

    assert.ok(result !== null);
    const pinCount = (result!.match(/pin-s\+FF0000/g) ?? []).length;
    assert.equal(pinCount, 2, 'expected one pin marker per city');
  });

  it('skips city IDs that have no matching entry and still returns a URL for valid ones', () => {
    // אבו גוש id=511 — stable entry in cities.json
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש to exist in city data');

    const result = _buildMarkersUrl([-999, city.id]);

    assert.ok(result !== null, 'should return URL for the one valid city');
    const pinCount = (result!.match(/pin-s\+FF0000/g) ?? []).length;
    assert.equal(pinCount, 1, 'only the valid city should produce a pin');
  });
});
