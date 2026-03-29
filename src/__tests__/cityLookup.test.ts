import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCityById,
  getCitiesByZone,
  searchCities,
  getPolygonCoords,
  buildGeoJSON,
  expandGeoJSONBounds,
} from '../cityLookup.js';

// City 511 = אבו גוש, zone = בית שמש — a stable, well-known entry in cities.json
const KNOWN_CITY_ID = 511;
const KNOWN_CITY_ZONE = 'בית שמש';

describe('getCityById', () => {
  it('returns city entry for valid id', () => {
    const city = getCityById(KNOWN_CITY_ID);
    assert.ok(city !== null);
    assert.equal(city.id, KNOWN_CITY_ID);
    assert.ok(typeof city.name === 'string' && city.name.length > 0);
    assert.ok(typeof city.zone === 'string');
    assert.ok(typeof city.countdown === 'number');
  });

  it('returns null for unknown id', () => {
    assert.equal(getCityById(-999), null);
  });
});

describe('searchCities', () => {
  it('returns non-empty array for multi-char Hebrew query', () => {
    const results = searchCities('תל');
    assert.ok(results.length > 0, 'Expected results for תל');
    for (const city of results) {
      assert.ok(
        city.name.toLowerCase().includes('תל'),
        `city ${city.name} does not include query`,
      );
    }
  });

  it('returns empty array for single-char query', () => {
    assert.deepEqual(searchCities('x'), []);
  });

  it('returns empty array for empty query', () => {
    assert.deepEqual(searchCities(''), []);
  });

  it('caps results at 20', () => {
    // 'א' is a common prefix — likely yields many matches
    const results = searchCities('אב');
    assert.ok(results.length <= 20);
  });

  it('excludes placeholder city with id 0', () => {
    // id=0 is "בחר הכל" (Select All) — should never appear in search results
    const results = searchCities('בחר');
    assert.ok(results.every((c) => c.id !== 0));
  });
});

describe('getCitiesByZone', () => {
  it('returns cities in a valid zone', () => {
    const cities = getCitiesByZone(KNOWN_CITY_ZONE);
    assert.ok(cities.length > 0, `Expected cities in zone ${KNOWN_CITY_ZONE}`);
    assert.ok(cities.every((c) => c.zone === KNOWN_CITY_ZONE));
  });

  it('excludes placeholder city with id 0', () => {
    const cities = getCitiesByZone(KNOWN_CITY_ZONE);
    assert.ok(cities.every((c) => c.id !== 0));
  });

  it('returns empty array for unknown zone', () => {
    assert.deepEqual(getCitiesByZone('zone-that-does-not-exist'), []);
  });

  it('returns cities sorted by Hebrew name', () => {
    const cities = getCitiesByZone(KNOWN_CITY_ZONE);
    for (let i = 0; i < cities.length - 1; i++) {
      const cmp = cities[i].name.localeCompare(cities[i + 1].name, 'he');
      assert.ok(cmp <= 0, `Expected ${cities[i].name} ≤ ${cities[i + 1].name}`);
    }
  });
});

describe('getPolygonCoords', () => {
  it('returns coordinate array for city with polygon', () => {
    const coords = getPolygonCoords(KNOWN_CITY_ID);
    assert.ok(coords !== null, 'Expected polygon for city 511');
    assert.ok(Array.isArray(coords) && coords.length >= 3);
    // Each element is [lat, lng] pair
    for (const pair of coords) {
      assert.equal(pair.length, 2);
      assert.ok(typeof pair[0] === 'number');
      assert.ok(typeof pair[1] === 'number');
    }
  });

  it('returns null for unknown city id', () => {
    assert.equal(getPolygonCoords(-1), null);
  });
});

describe('buildGeoJSON', () => {
  it('returns empty FeatureCollection for empty input', () => {
    const result = buildGeoJSON([]);
    assert.equal(result.type, 'FeatureCollection');
    assert.deepEqual(result.features, []);
  });

  it('returns FeatureCollection with one Polygon for valid city', () => {
    const result = buildGeoJSON([KNOWN_CITY_ID]);
    assert.equal(result.type, 'FeatureCollection');
    assert.equal(result.features.length, 1);
    assert.equal(result.features[0].geometry.type, 'Polygon');
  });

  it('swaps [lat, lng] to [lng, lat] for GeoJSON output', () => {
    // polygons.json stores [lat, lng]; GeoJSON requires [lng, lat]
    // City 511: lat=31.80686, lng=35.11038 — polygon first coord is [lat, lng] raw
    const rawCoords = getPolygonCoords(KNOWN_CITY_ID)!;
    const [rawLat, rawLng] = rawCoords[0];

    const result = buildGeoJSON([KNOWN_CITY_ID]);
    const ring = result.features[0].geometry.coordinates[0];
    // GeoJSON convention: first element = longitude, second = latitude
    assert.equal(ring[0][0], rawLng, 'First element of GeoJSON coord should be longitude');
    assert.equal(ring[0][1], rawLat, 'Second element of GeoJSON coord should be latitude');
  });

  it('closes the polygon ring', () => {
    const result = buildGeoJSON([KNOWN_CITY_ID]);
    const ring = result.features[0].geometry.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    assert.equal(first[0], last[0], 'Ring first lng should equal last lng');
    assert.equal(first[1], last[1], 'Ring first lat should equal last lat');
  });

  it('skips city ids without polygon data', () => {
    // -1 has no polygon — should produce zero features
    const result = buildGeoJSON([-1]);
    assert.equal(result.features.length, 0);
  });

  it('accepts custom color in feature properties', () => {
    const result = buildGeoJSON([KNOWN_CITY_ID], '#00FF00');
    assert.equal(result.features[0].properties?.fill, '#00FF00');
    assert.equal(result.features[0].properties?.stroke, '#00FF00');
  });
});

describe('expandGeoJSONBounds', () => {
  it('returns same object when span is already large enough', () => {
    // Build a large bounding box that exceeds MIN_SPAN_DEG (0.45) in both dimensions
    const largeGeoJSON = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[34.0, 31.0], [35.0, 31.0], [35.0, 32.0], [34.0, 32.0], [34.0, 31.0]]],
        },
      }],
    };
    const result = expandGeoJSONBounds(largeGeoJSON);
    assert.equal(result.features.length, 1, 'No padding feature should be added');
  });

  it('adds a padding feature when the bounding box is smaller than MIN_SPAN_DEG', () => {
    // Build a tiny bounding box (single city polygon)
    const tiny = buildGeoJSON([KNOWN_CITY_ID]);
    const expanded = expandGeoJSONBounds(tiny);
    // Should have original feature + 1 invisible padding rectangle
    assert.ok(
      expanded.features.length > tiny.features.length,
      'Should add padding feature for small bounding box',
    );
    // Padding feature has zero opacity
    const padding = expanded.features[expanded.features.length - 1];
    assert.equal(padding.properties?.['fill-opacity'], 0);
    assert.equal(padding.properties?.['stroke-opacity'], 0);
  });

  it('returns FeatureCollection type even for empty input', () => {
    const empty = buildGeoJSON([]);
    const result = expandGeoJSONBounds(empty);
    assert.equal(result.type, 'FeatureCollection');
  });
});
