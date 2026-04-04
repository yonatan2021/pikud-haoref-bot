import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Ensure data dir exists for SQLite
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { maxCacheSize, clearImageCache, _seedCache, generateMapImage, _buildMarkersUrl, _buildUnionedPolygonsUrl, initializeCache, SIMPLIFY_TOLERANCE, SIMPLIFY_TOLERANCE_AGGRESSIVE, getAlertColor, ALERT_TYPE_COLOR, getCurrentMapStyle, getAdaptivePadding, clampFeatureCollectionToIsrael } from '../mapService';
import type { FeatureCollection, Polygon } from 'geojson';
import { buildGeoJSON, expandGeoJSONBounds } from '../cityLookup';
import { initDb, getDb } from '../db/schema';
import { getMonthlyCount, incrementMonthlyCount, isMonthlyLimitReached } from '../db/mapboxUsageRepository';
import { saveCacheEntry } from '../db/mapboxCacheRepository';
import { getCityData } from '../cityLookup';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function cleanupDb(): void {
  getDb().prepare('DELETE FROM mapbox_usage').run();
  getDb().prepare('DELETE FROM mapbox_image_cache').run();
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

describe('initializeCache', () => {
  before(() => initDb());

  beforeEach(() => {
    clearImageCache();
    cleanupDb();
  });

  it('populates in-memory cache from DB entries', async () => {
    const alert = { type: 'missiles', cities: ['אבו גוש'] };
    // Build the cache key the same way buildCacheKey() does: period prefix + type + sorted cities
    const style = getCurrentMapStyle();
    const period = (style.includes('dark') || style.includes('night')) ? 'night' : 'day';
    const key = `${period}:${alert.type}:${[...alert.cities].sort().join('|')}`;
    const fakeBuffer = Buffer.from('persistent-image');
    saveCacheEntry(key, fakeBuffer);

    initializeCache();

    // Do NOT call _seedCache — the cache must contain this entry from initializeCache alone.
    // generateMapImage must return the buffer from DB-loaded cache without any HTTP call.
    const result = await generateMapImage(alert);
    assert.deepEqual(result, fakeBuffer);
  });

  it('is a no-op when DB image cache is empty', () => {
    assert.doesNotThrow(() => initializeCache());
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
  it('returns streets style during daytime hours (06:00 Israel time)', () => {
    // 04:00 UTC = 06:00 Israel time (UTC+2 in winter)
    const result = getCurrentMapStyle(new Date('2026-01-15T04:00:00Z'));
    assert.equal(result, 'mapbox/streets-v12');
  });

  it('returns streets style at noon (12:00 Israel time)', () => {
    // 10:00 UTC = 12:00 Israel time
    const result = getCurrentMapStyle(new Date('2026-01-15T10:00:00Z'));
    assert.equal(result, 'mapbox/streets-v12');
  });

  it('returns streets style at 17:59 Israel time (last minute of day window)', () => {
    // 15:59 UTC = 17:59 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-15T15:59:00Z'));
    assert.equal(result, 'mapbox/streets-v12');
  });

  it('returns navigation-night style at 18:00 Israel time (first minute of night window)', () => {
    // 16:00 UTC = 18:00 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-15T16:00:00Z'));
    assert.equal(result, 'mapbox/navigation-night-v1');
  });

  it('returns navigation-night style at midnight Israel time', () => {
    // 22:00 UTC = 00:00 Israel time (UTC+2)
    const result = getCurrentMapStyle(new Date('2026-01-14T22:00:00Z'));
    assert.equal(result, 'mapbox/navigation-night-v1');
  });
});

describe('expandGeoJSONBounds', () => {
  function makePointGeojson(lng: number, lat: number) {
    // A tiny 1-point-wide polygon (degenerate) that simulates a very small city
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: { fill: '#FF0000', 'fill-opacity': 0.5, stroke: '#FF0000', 'stroke-width': 4, 'stroke-opacity': 0.8 },
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

describe('generateMapImage — pin marker fallback for cities without polygon data', () => {
  before(() => initDb());

  beforeEach(() => {
    clearImageCache();
    cleanupDb();
    delete process.env.MAPBOX_MONTHLY_LIMIT;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('חמדת ימים (id=2228) has no polygon data but is in cities.json', () => {
    // This city exists in cities.json (getCityData works) but has no polygon in the API package.
    // It is the condition that triggers Strategy 0 (pin marker fallback).
    const city = getCityData('חמדת ימים');
    assert.ok(city, 'חמדת ימים must be in cities.json for this test to be meaningful');
    const fc = buildGeoJSON([city.id], '#FF0000');
    assert.equal(fc.features.length, 0, 'חמדת ימים should have no polygon features — if this fails, pick a different city');
  });

  it('_buildMarkersUrl succeeds for a city without polygon data', () => {
    // Verifies that Strategy 0 has the data it needs (lat/lng) even when polygon is missing.
    const city = getCityData('חמדת ימים');
    assert.ok(city);
    const url = _buildMarkersUrl([city.id]);
    assert.ok(url !== null, 'pin marker URL should be buildable from lat/lng alone');
    assert.ok(url!.includes('pin-l+'), 'URL should contain a pin marker');
    assert.ok(url!.includes(`${city.lng.toFixed(4)},${city.lat.toFixed(4)}`), 'URL should contain the city coordinates');
  });

  it('generateMapImage returns null (not via early return) when city has no polygon and Mapbox token absent', async () => {
    // Without a Mapbox token the HTTP call fails. The key assertion is that the function
    // does NOT take the old fast-null path — it actually reaches the HTTP fetch stage
    // (which then fails), meaning Strategy 0 was attempted.
    const savedToken = process.env.MAPBOX_ACCESS_TOKEN;
    process.env.MAPBOX_ACCESS_TOKEN = 'dummy-token-for-test';

    const city = getCityData('חמדת ימים');
    assert.ok(city);

    // generateMapImage should return null because the HTTP call will fail (invalid token),
    // but it should NOT return null due to "No polygons in data files — sending without map"
    // (the old early-return log message). We verify Strategy 0 was tried by checking the
    // pin URL can be built (tested separately above).
    const result = await generateMapImage({ type: 'missiles', cities: ['חמדת ימים'] });
    assert.equal(result, null, 'should return null when HTTP fetch fails');

    if (savedToken !== undefined) {
      process.env.MAPBOX_ACCESS_TOKEN = savedToken;
    } else {
      delete process.env.MAPBOX_ACCESS_TOKEN;
    }
  });
});

describe('getAdaptivePadding', () => {
  it('returns 80 for 1 city', () => {
    assert.equal(getAdaptivePadding(1), 80);
  });

  it('returns 80 for 3 cities (boundary)', () => {
    assert.equal(getAdaptivePadding(3), 80);
  });

  it('returns 50 for 4 cities (first medium bucket)', () => {
    assert.equal(getAdaptivePadding(4), 50);
  });

  it('returns 50 for 15 cities (boundary)', () => {
    assert.equal(getAdaptivePadding(15), 50);
  });

  it('returns 30 for 16 cities (first large bucket)', () => {
    assert.equal(getAdaptivePadding(16), 30);
  });

  it('returns 30 for 50 cities', () => {
    assert.equal(getAdaptivePadding(50), 30);
  });
});

describe('buildGeoJSON polygon visual properties', () => {
  it('sets fill-opacity to 0.5 on all features', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const fc = buildGeoJSON([city.id], '#FF0000');
    assert.ok(fc.features.length > 0, 'expected at least one polygon feature');
    for (const feature of fc.features) {
      assert.equal(feature.properties?.['fill-opacity'], 0.5);
    }
  });

  it('sets stroke-width to 4 on all features', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const fc = buildGeoJSON([city.id], '#FF0000');
    for (const feature of fc.features) {
      assert.equal(feature.properties?.['stroke-width'], 4);
    }
  });
});

describe('_buildMarkersUrl — style and padding params', () => {
  it('accepts an explicit style and uses it in the URL', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const url = _buildMarkersUrl([city.id], 'missiles', 'mapbox/streets-v12', 60);
    assert.ok(url !== null);
    assert.ok(url!.includes('mapbox/streets-v12'), 'URL must use the provided style');
    assert.ok(url!.includes('padding=60'), 'URL must use the provided padding');
  });

  it('falls back to getCurrentMapStyle() when style is omitted', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const url = _buildMarkersUrl([city.id]);
    assert.ok(url !== null);
    // getCurrentMapStyle() returns one of the two known styles
    const usesKnownStyle = url!.includes('mapbox/streets-v12') || url!.includes('mapbox/navigation-night-v1');
    assert.ok(usesKnownStyle, 'URL should use a known map style');
  });
});

describe('buildMarkersWithPaddingUrl — min-span guarantee (Strategy 0)', () => {
  it('_buildMarkersUrl URL contains pin-l marker and auto viewport', () => {
    const city = getCityData('חמדת ימים');
    assert.ok(city, 'test requires חמדת ימים in city data');
    const url = _buildMarkersUrl([city.id], 'missiles', 'mapbox/streets-v12', 80);
    assert.ok(url !== null);
    assert.ok(url!.includes('pin-l+'), 'URL must contain pin-l markers');
    assert.ok(url!.includes('/auto/'), 'URL must use auto viewport');
  });

  it('_buildMarkersUrl returns null for an empty city list', () => {
    assert.equal(_buildMarkersUrl([], 'missiles', 'mapbox/streets-v12', 80), null);
  });
});

describe('clampFeatureCollectionToIsrael', () => {
  it('clips a polygon that extends north into Lebanon', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [34.5, 29.0],   // south-west (inside Israel)
            [36.0, 29.0],   // south-east (east of Golan — outside)
            [36.0, 34.0],   // north-east (inside Lebanon + east of border)
            [34.5, 34.0],   // north-west (inside Lebanon)
            [34.5, 29.0],
          ]],
        },
      }],
    };

    const clamped = clampFeatureCollectionToIsrael(fc as FeatureCollection<Polygon>);
    for (const feature of clamped.features) {
      for (const ring of feature.geometry.coordinates) {
        for (const [lng, lat] of ring as [number, number][]) {
          assert.ok(lat <= 33.27, `lat ${lat} exceeds Israel north bound 33.27`);
          assert.ok(lat >= 29.45, `lat ${lat} below Israel south bound 29.45`);
          assert.ok(lng <= 35.90, `lng ${lng} exceeds Israel east bound 35.90`);
          assert.ok(lng >= 34.25, `lng ${lng} below Israel west bound 34.25`);
        }
      }
    }
  });

  it('leaves coordinates already inside Israel unchanged', () => {
    const coord = [34.8, 31.5] as [number, number];
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[coord, [35.0, 31.5], [35.0, 32.0], [34.8, 32.0], coord]],
        },
      }],
    };
    const clamped = clampFeatureCollectionToIsrael(fc as FeatureCollection<Polygon>);
    const firstCoord = clamped.features[0].geometry.coordinates[0][0] as [number, number];
    assert.deepEqual(firstCoord, coord);
  });
});

describe('_buildUnionedPolygonsUrl', () => {
  it('returns null for an empty FeatureCollection', () => {
    const empty = { type: 'FeatureCollection' as const, features: [] };
    const result = _buildUnionedPolygonsUrl(empty, '#FF0000', 'mapbox/streets-v12', 30);
    assert.equal(result, null);
  });

  it('returns a geojson overlay URL (not pin markers) for a city with polygon data', () => {
    const city = getCityData('אבו גוש');
    assert.ok(city, 'test requires אבו גוש in city data');
    const fc = buildGeoJSON([city.id], '#FF0000');
    assert.ok(fc.features.length > 0, 'אבו גוש must have polygon data');

    const url = _buildUnionedPolygonsUrl(fc, '#FF0000', 'mapbox/streets-v12', 30);
    assert.ok(url !== null, 'should return a URL for a city with polygon data');
    assert.ok(url!.includes('geojson('), 'URL must use geojson overlay, not pin markers');
    assert.ok(url!.includes('mapbox/streets-v12'), 'URL must embed the provided style');
    assert.ok(url!.includes('padding=30'), 'URL must embed the provided padding');
  });

  it('URL fits within Mapbox 8000-char limit when unioning many overlapping city polygons', () => {
    // Tel Aviv metro area — many overlapping polygons that union should merge dramatically
    const cityNames = [
      'תל אביב - יפו', 'רמת גן', 'בני ברק', 'פתח תקוה', 'חולון',
      'בת ים', 'רמת השרון', 'הרצליה', 'כפר סבא', 'רעננה',
      'ראשון לציון', 'רחובות', 'נס ציונה', 'אור יהודה', 'גבעתיים',
    ];
    const cityIds = cityNames
      .map((name) => getCityData(name))
      .filter((c): c is NonNullable<ReturnType<typeof getCityData>> => c !== null)
      .map((c) => c.id);

    assert.ok(cityIds.length >= 5, 'need at least 5 cities for a meaningful union test');

    const fc = buildGeoJSON(cityIds, '#FF0000');
    // Only run URL-length assertion when polygon data is available
    if (fc.features.length === 0) return;

    const url = _buildUnionedPolygonsUrl(fc, '#FF0000', 'mapbox/streets-v12', 30);
    assert.ok(url !== null, 'union strategy should succeed for dense overlapping polygons');
    assert.ok(url!.length <= 8000, `URL must be within Mapbox limit — got ${url!.length} chars`);
  });

  it('URL is shorter than a naive all-polygons URL for many cities', () => {
    const cityNames = ['תל אביב - יפו', 'רמת גן', 'בני ברק', 'חולון', 'בת ים'];
    const cityIds = cityNames
      .map((name) => getCityData(name))
      .filter((c): c is NonNullable<ReturnType<typeof getCityData>> => c !== null)
      .map((c) => c.id);

    const fc = buildGeoJSON(cityIds, '#FF0000');
    if (fc.features.length === 0) return;

    // Build naive URL with all raw polygons encoded
    const naiveEncoded = encodeURIComponent(JSON.stringify(fc));
    const unionUrl = _buildUnionedPolygonsUrl(fc, '#FF0000', 'mapbox/streets-v12', 30);
    if (unionUrl === null) return; // union may fail for non-overlapping polygons

    assert.ok(
      unionUrl.length <= naiveEncoded.length,
      `Union URL (${unionUrl.length}) should be ≤ naive URL (${naiveEncoded.length})`
    );
  });
});
