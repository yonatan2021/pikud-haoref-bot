import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';
import { CityEntry, PolygonCoords, PolygonsMap } from './types';
import { normalizeCityName } from './alertPoller';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const citiesData: CityEntry[] = require('pikud-haoref-api/cities.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const polygonsData: PolygonsMap = require('pikud-haoref-api/polygons.json');

// O(1) lookup maps built once at module load — city data never changes at runtime
const byNormalizedName = new Map<string, CityEntry>(
  citiesData.map((c) => [normalizeCityName(c.name), c])
);
const byId = new Map<number, CityEntry>(
  citiesData.map((c) => [c.id, c])
);
const byZone = new Map<string, CityEntry[]>();
for (const c of citiesData) {
  if (c.id === 0) continue;
  const list = byZone.get(c.zone) ?? [];
  list.push(c);
  byZone.set(c.zone, list);
}
// Pre-sort each zone list once at load — getCitiesByZone returns a copy so no mutations
for (const [zone, list] of byZone) {
  byZone.set(zone, list.sort((a, b) => a.name.localeCompare(b.name, 'he')));
}

export function getCityData(name: string): CityEntry | null {
  return byNormalizedName.get(normalizeCityName(name)) ?? null;
}

export function getCityById(id: number): CityEntry | null {
  return byId.get(id) ?? null;
}

export function getCitiesByZone(zone: string): CityEntry[] {
  return [...(byZone.get(zone) ?? [])];
}

// Bounded FIFO cache for search results — city names are static, no invalidation needed
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map<string, CityEntry[]>();

export function searchCities(query: string): CityEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const cached = searchCache.get(q);
  if (cached) return cached;
  const results = citiesData
    .filter((c) => c.id !== 0 && c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .slice(0, 20);
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value!);
  }
  searchCache.set(q, results);
  return results;
}

export function getPolygonCoords(cityId: number): PolygonCoords | null {
  return polygonsData[String(cityId)] ?? null;
}

export function buildGeoJSON(
  cityIds: number[],
  color: string = '#FF0000'
): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];

  for (const id of cityIds) {
    const coords = getPolygonCoords(id);
    if (!coords || coords.length < 3) continue;

    // pikud-haoref stores [lat, lng]; GeoJSON requires [lng, lat]
    const ring: [number, number][] = coords.map(([lat, lng]) => [lng, lat]);

    // Close the ring if not already closed
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }

    features.push({
      type: 'Feature',
      properties: {
        fill: color,
        'fill-opacity': 0.4,
        stroke: color,
        'stroke-width': 3,
        'stroke-opacity': 0.8,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Minimum span (degrees) that guarantees ~50 km of geographic context around alerted areas. */
const MIN_SPAN_DEG = 0.45;

/**
 * Expands a GeoJSON FeatureCollection to ensure the Mapbox auto-zoom shows at least
 * ~50 km of context. When the bounding box of all features is smaller than MIN_SPAN_DEG
 * in either dimension, an invisible padding rectangle is added so the auto viewport
 * pulls back far enough to include surrounding geography.
 */
export function expandGeoJSONBounds(
  geojson: FeatureCollection<Polygon>,
): FeatureCollection<Polygon> {
  const lngs: number[] = [];
  const lats: number[] = [];

  for (const feature of geojson.features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring as Position[]) {
        lngs.push(lng);
        lats.push(lat);
      }
    }
  }

  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;

  if (spanLng >= MIN_SPAN_DEG && spanLat >= MIN_SPAN_DEG) return geojson;

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const halfLng = Math.max(spanLng, MIN_SPAN_DEG) / 2;
  const halfLat = Math.max(spanLat, MIN_SPAN_DEG) / 2;

  const paddingBox: Feature<Polygon> = {
    type: 'Feature',
    properties: {
      fill: '#000000',
      'fill-opacity': 0,
      stroke: '#000000',
      'stroke-opacity': 0,
      'stroke-width': 0,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [centerLng - halfLng, centerLat - halfLat],
        [centerLng + halfLng, centerLat - halfLat],
        [centerLng + halfLng, centerLat + halfLat],
        [centerLng - halfLng, centerLat + halfLat],
        [centerLng - halfLng, centerLat - halfLat],
      ]],
    },
  };

  return { ...geojson, features: [...geojson.features, paddingBox] };
}
