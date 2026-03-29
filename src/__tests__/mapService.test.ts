import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Ensure data dir exists for SQLite
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { maxCacheSize, clearImageCache, _seedCache, generateMapImage, _buildMarkersUrl, SIMPLIFY_TOLERANCE, SIMPLIFY_TOLERANCE_AGGRESSIVE, getAlertColor, ALERT_TYPE_COLOR, getCurrentMapStyle } from '../mapService';
import { buildGeoJSON, expandGeoJSONBounds } from '../cityLookup';
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
    assert.ok(result!.includes('pin-l+FF0000'), 'URL must use large red pin markers for unknown alert type');
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
    const pinCount = (result!.match(/pin-l\+FF0000/g) ?? []).length;
    assert.equal(pinCount, 2, 'expected one pin marker per city');
  });

  it('skips city IDs that have no matching entry and still returns a URL for valid ones', () => {
    // אבו גוש id=511 — stable entry in cities.json
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש to exist in city data');

    const result = _buildMarkersUrl([-999, city.id]);

    assert.ok(result !== null, 'should return URL for the one valid city');
    const pinCount = (result!.match(/pin-l\+FF0000/g) ?? []).length;
    assert.equal(pinCount, 1, 'only the valid city should produce a pin');
  });

  it('uses alert-type color instead of hardcoded red', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש to exist in city data');

    const result = _buildMarkersUrl([city.id], 'missiles');
    assert.ok(result !== null);
    // missiles → #FF0000 (still red, but via getAlertColor — not hardcoded)
    assert.ok(result!.includes('pin-l+FF0000'), 'missiles should produce red pin-l markers');

    const tsunamiResult = _buildMarkersUrl([city.id], 'tsunami');
    assert.ok(tsunamiResult !== null);
    // tsunami → #0080FF
    assert.ok(tsunamiResult!.includes('pin-l+0080FF'), 'tsunami should produce blue pin-l markers');
  });
});

describe('getCurrentMapStyle', () => {
  it('returns light style during daytime hours (06:00 Israel time)', () => {
    // 04:00 UTC = 06:00 Israel time (UTC+2 in winter)
    const result = getCurrentMapStyle(new Date('2026-01-15T04:00:00Z'));
    assert.equal(result, 'mapbox/light-v11');
  });

  it('returns light style at noon (12:00 Israel time)', () => {
    // 10:00 UTC = 12:00 Israel time
    const result = getCurrentMapStyle(new Date('2026-01-15T10:00:00Z'));
    assert.equal(result, 'mapbox/light-v11');
  });

  it('returns light style at 17:59 Israel time (last minute of day window)', () => {
    // 15:59 UTC = 17:59 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-15T15:59:00Z'));
    assert.equal(result, 'mapbox/light-v11');
  });

  it('returns dark style at 18:00 Israel time (first minute of night window)', () => {
    // 16:00 UTC = 18:00 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-15T16:00:00Z'));
    assert.equal(result, 'mapbox/dark-v11');
  });

  it('returns dark style at midnight Israel time', () => {
    // 22:00 UTC = 00:00 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-14T22:00:00Z'));
    assert.equal(result, 'mapbox/dark-v11');
  });
});

describe('expandGeoJSONBounds', () => {
  function makePointGeojson(lng: number, lat: number) {
    // A tiny 1-point-wide polygon (degenerate) that simulates a very small city
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: { fill: '#FF0000', 'fill-opacity': 0.4, stroke: '#FF0000', 'stroke-width': 3, 'stroke-opacity': 0.8 },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
        },
      }],
    };
  }

  it('adds a padding bbox feature when span is below 0.45°', () => {
    // A tiny polygon (~1 km span) centered around Tel Aviv
    const tiny = makePointGeojson(34.78, 32.08);
    const expanded = expandGeoJSONBounds(tiny);

    assert.equal(expanded.features.length, 2, 'should have original feature + padding bbox');
    const padding = expanded.features[1];
    assert.equal(padding.properties?.['fill-opacity'], 0, 'padding bbox should be invisible');
    assert.equal(padding.properties?.['stroke-opacity'], 0, 'padding bbox stroke should be invisible');
  });

  it('does not add a padding feature when span already exceeds 0.45°', () => {
    // A polygon that spans >0.45° in both dimensions (e.g., a large alert area)
    const large = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[34.0, 31.5], [34.6, 31.5], [34.6, 32.1], [34.0, 32.1], [34.0, 31.5]]],
        },
      }],
    };
    const result = expandGeoJSONBounds(large);
    assert.equal(result.features.length, 1, 'large area should not gain extra features');
  });

  it('returns an immutable copy — does not mutate the original', () => {
    const tiny = makePointGeojson(34.78, 32.08);
    const original = { ...tiny, features: [...tiny.features] };
    expandGeoJSONBounds(tiny);
    assert.equal(tiny.features.length, original.features.length, 'original should not be mutated');
  });
});
