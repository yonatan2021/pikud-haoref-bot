import axios from 'axios';
import simplify from '@turf/simplify';
import bbox from '@turf/bbox';
import union from '@turf/union';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
import type { FeatureCollection, Polygon, MultiPolygon, Feature } from 'geojson';
import { Alert, CityEntry } from './types';
import { getCityData, getCityById, buildGeoJSON, expandGeoJSONBounds, getCityIdsByZones, extractZoneNamesFromText } from './cityLookup';
import { isPreliminaryAlert } from './alertHelpers.js';
import { isMonthlyLimitReached, incrementMonthlyCount } from './db/mapboxUsageRepository.js';
import { loadCacheEntries, saveCacheEntry, deleteCacheEntry, pruneCacheEntries } from './db/mapboxCacheRepository.js';
import { getZoneColor } from './config/zoneColors.js';
import { log } from './logger.js';

const MAPBOX_URL_MAX_LENGTH = 8000;
export const SIMPLIFY_TOLERANCE = 0.0003;
export const SIMPLIFY_TOLERANCE_AGGRESSIVE = 0.003;

/** Mapbox Static Images API output dimensions (width×height@scale). */
const MAP_DIMENSIONS = '800x500@2x';

/** Minimum viewport span in degrees to guarantee ~50 km of geographic context.
 *  Must match MIN_SPAN_DEG in cityLookup.ts. */
const MAP_MIN_SPAN_DEG = 0.45;

export const ALERT_TYPE_COLOR: Record<string, string> = {
  missiles:                       '#FF0000',
  earthQuake:                     '#FF8C00',
  tsunami:                        '#0080FF',
  hazardousMaterials:             '#FFCC00',
  terroristInfiltration:          '#FF4500',
  radiologicalEvent:              '#9900CC',
  hostileAircraftIntrusion:       '#FF6600',
  newsFlash:                      '#808080',
  general:                        '#808080',
  missilesDrill:                  '#3399FF',
  earthQuakeDrill:                '#3399FF',
  tsunamiDrill:                   '#3399FF',
  hostileAircraftIntrusionDrill:  '#3399FF',
  hazardousMaterialsDrill:        '#3399FF',
  terroristInfiltrationDrill:     '#3399FF',
  radiologicalEventDrill:         '#3399FF',
  generalDrill:                   '#3399FF',
  unknown:                        '#FF0000',
};

export function getAlertColor(alertType: string): string {
  return ALERT_TYPE_COLOR[alertType] ?? '#FF0000';
}

/** Returns the Mapbox style ID based on Israel local time.
 *  Streets (06:00–18:00) for daytime; navigation-night for nighttime.
 *  Accepts an optional `now` for testability. Exported for testing. */
export function getCurrentMapStyle(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
  const hour = parseInt(hourStr, 10) % 24; // guard: some impls return '24' at midnight
  return hour >= 6 && hour < 18 ? 'mapbox/streets-v12' : 'mapbox/navigation-night-v1';
}

/** Returns the pixel padding to use based on the number of alerted cities.
 *  Fewer cities = more padding for geographic context; many cities already span a large area.
 *  Exported for testing. */
export function getAdaptivePadding(cityCount: number): number {
  if (cityCount <= 3) return 80;
  if (cityCount <= 15) return 50;
  return 30;
}

interface CacheEntry {
  buffer: Buffer;
}

const imageCache = new Map<string, CacheEntry>();

function buildCacheKey(alert: Alert, style: string): string {
  const period = (style.includes('dark') || style.includes('night')) ? 'night' : 'day';
  return `${period}:${alert.type}:${[...alert.cities].sort().join('|')}`;
}

export function maxCacheSize(): number {
  const raw = process.env.MAPBOX_IMAGE_CACHE_SIZE;
  const parsed = parseInt(raw ?? '', 10);
  return isNaN(parsed) || parsed <= 0 ? 20 : parsed;
}

/**
 * Populates the in-memory image cache from the persistent SQLite cache.
 * Call once at startup (after initDb()) so that cached images survive bot restarts.
 */
export function initializeCache(): void {
  const size = maxCacheSize();
  pruneCacheEntries(size);
  const entries = loadCacheEntries(size);
  for (const { key, buffer } of entries) {
    imageCache.set(key, { buffer });
  }
}

/** Exported for testing — clears the in-memory image cache. */
export function clearImageCache(): void {
  imageCache.clear();
}

/** Exported for testing — seeds the cache with a known buffer to simulate a prior Mapbox request. */
export function _seedCache(alert: Alert, buffer: Buffer): void {
  imageCache.set(buildCacheKey(alert, getCurrentMapStyle()), { buffer });
}

function buildMapboxUrl(geojson: FeatureCollection<Polygon>, style: string, padding: number): string {
  const encoded = encodeURIComponent(JSON.stringify(geojson));
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? '';
  return (
    `https://api.mapbox.com/styles/v1/${style}/static/` +
    `geojson(${encoded})/auto/${MAP_DIMENSIONS}?padding=${padding}&access_token=${token}`
  );
}

function simplifyFeatureCollection(
  fc: FeatureCollection<Polygon>,
  tolerance: number = SIMPLIFY_TOLERANCE
): FeatureCollection<Polygon> {
  return simplify(fc as Parameters<typeof simplify>[0], {
    tolerance,
    highQuality: false,
    mutate: false,
  }) as FeatureCollection<Polygon>;
}

/** Builds a Mapbox Static Images URL using compact pin markers — one per city center.
 *  Uses alert-type color and large pins (pin-l) for better visibility.
 *  Returns null when no valid city entries are found. Exported for testing. */
export function _buildMarkersUrl(
  cityIds: number[],
  alertType: string = 'unknown',
  style: string = getCurrentMapStyle(),
  padding: number = getAdaptivePadding(cityIds.length),
): string | null {
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? '';
  const hex = getAlertColor(alertType).replace('#', '');
  const markers = cityIds
    .map((id) => getCityById(id))
    .filter((city): city is CityEntry => city !== null)
    .map((city) => `pin-l+${hex}(${city.lng.toFixed(4)},${city.lat.toFixed(4)})`)
    .join(',');

  if (!markers) return null;

  return (
    `https://api.mapbox.com/styles/v1/${style}/static/` +
    `${markers}/auto/${MAP_DIMENSIONS}?padding=${padding}&access_token=${token}`
  );
}

/** Builds a pin marker URL that also includes an invisible GeoJSON bounding box to guarantee
 *  at least MAP_MIN_SPAN_DEG (~50 km) of geographic context in the Mapbox auto viewport.
 *  Falls back to returning null when no valid cities are found or the combined URL is too long. */
function buildMarkersWithPaddingUrl(
  cityIds: number[],
  alertType: string,
  style: string,
  padding: number,
): string | null {
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? '';
  const hex = getAlertColor(alertType).replace('#', '');

  const cities = cityIds
    .map((id) => getCityById(id))
    .filter((city): city is CityEntry => city !== null);

  if (cities.length === 0) return null;

  const markers = cities
    .map((city) => `pin-l+${hex}(${city.lng.toFixed(4)},${city.lat.toFixed(4)})`)
    .join(',');

  // Build an invisible GeoJSON bbox centered on the pin cluster to force
  // the Mapbox auto-zoom to pull back by at least MAP_MIN_SPAN_DEG in each dimension.
  const lngs = cities.map((c) => c.lng);
  const lats = cities.map((c) => c.lat);
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const half = MAP_MIN_SPAN_DEG / 2;

  const paddingBox = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { fill: '#000000', 'fill-opacity': 0, stroke: '#000000', 'stroke-opacity': 0, 'stroke-width': 0 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [centerLng - half, centerLat - half],
          [centerLng + half, centerLat - half],
          [centerLng + half, centerLat + half],
          [centerLng - half, centerLat + half],
          [centerLng - half, centerLat - half],
        ]],
      },
    }],
  });

  const url = (
    `https://api.mapbox.com/styles/v1/${style}/static/` +
    `${markers},geojson(${encodeURIComponent(paddingBox)})/auto/${MAP_DIMENSIONS}?padding=${padding}&access_token=${token}`
  );

  return url.length <= MAPBOX_URL_MAX_LENGTH ? url : null;
}

function buildBboxFeatureCollection(
  fc: FeatureCollection<Polygon>,
  color: string = '#FF0000'
): FeatureCollection<Polygon> {
  const [minLng, minLat, maxLng, maxLat] = bbox(fc);
  const bboxPoly = turfPolygon(
    [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
    {
      fill: color,
      'fill-opacity': 0.2,
      stroke: color,
      'stroke-width': 2,
      'stroke-opacity': 0.8,
    }
  );
  return featureCollection([bboxPoly]) as FeatureCollection<Polygon>;
}

/** Israel geographic bounds — used to clamp map viewport for alerts near the northern border. */
const ISRAEL_BOUNDS = {
  minLng: 34.25,
  maxLng: 35.90,
  minLat: 29.45,
  maxLat: 33.27,  // Metula (northernmost point)
} as const;

/**
 * Clamps every coordinate in a FeatureCollection<Polygon> to Israel's geographic extent.
 * Prevents the Mapbox viewport from spilling into Lebanon, Jordan, or Egypt when
 * building a bounding-box fallback for alerts near the border.
 *
 * NOTE: Coordinate-wise clamping produces correct results only for rectangular (bbox)
 * polygons. For arbitrary polygon shapes, independently clamping each coordinate can
 * produce invalid geometry (e.g. collapsed edges or self-intersecting rings).
 * Use this function only on axis-aligned bounding-box feature collections.
 * Exported for testing.
 */
export function clampFeatureCollectionToIsrael(
  fc: FeatureCollection<Polygon>,
): FeatureCollection<Polygon> {
  const { minLng, maxLng, minLat, maxLat } = ISRAEL_BOUNDS;
  const clampLng = (v: number) => Math.max(minLng, Math.min(maxLng, v));
  const clampLat = (v: number) => Math.max(minLat, Math.min(maxLat, v));

  const features = fc.features.map((f) => ({
    ...f,
    geometry: {
      ...f.geometry,
      coordinates: f.geometry.coordinates.map((ring) =>
        (ring as [number, number][]).map(([lng, lat]) => [clampLng(lng), clampLat(lat)])
      ),
    },
  }));

  return { ...fc, features } as FeatureCollection<Polygon>;
}

/** Merges all city polygons in `rawGeojson` into a minimal set of shapes via @turf/union,
 *  then simplifies the result and builds a Mapbox Static Images URL.
 *
 *  For dense alerts (e.g. 100 Tel-Aviv-area cities), union typically collapses hundreds of
 *  individual polygons into 3–10 merged "blobs", shrinking the encoded URL by 10–20× and
 *  keeping it below the 8 000-char Mapbox limit while still rendering as filled regions.
 *
 *  Returns null when the feature collection is empty, when @turf/union returns null
 *  (no valid intersection topology), or when the resulting URL still exceeds the limit.
 *  Exported for testing. */
export function _buildUnionedPolygonsUrl(
  rawGeojson: FeatureCollection<Polygon>,
  color: string,
  style: string,
  padding: number,
  isPreliminaryDerived: boolean = false,
): string | null {
  if (rawGeojson.features.length === 0) return null;

  // @turf/union requires ≥ 2 geometries — pass through single-feature collections unchanged
  const merged = rawGeojson.features.length === 1
    ? rawGeojson.features[0] as Feature<Polygon | MultiPolygon>
    : union(
        featureCollection(rawGeojson.features as Feature<Polygon | MultiPolygon>[]),
        { properties: { fill: color, 'fill-opacity': 0.5, stroke: color, 'stroke-width': 4, 'stroke-opacity': 0.8 } },
      );
  if (!merged) return null;

  // Split MultiPolygon back into individual Polygon features — Mapbox reads
  // fill/stroke properties per Feature, not per ring.
  const props = { fill: color, 'fill-opacity': 0.5, stroke: color, 'stroke-width': 4, 'stroke-opacity': 0.8 };
  const flatFeatures: Feature<Polygon>[] = merged.geometry.type === 'Polygon'
    ? [{ type: 'Feature', properties: props, geometry: merged.geometry as Polygon }]
    : (merged.geometry as MultiPolygon).coordinates.map((coords) => ({
        type: 'Feature' as const,
        properties: props,
        geometry: { type: 'Polygon' as const, coordinates: coords },
      }));

  if (flatFeatures.length === 0) return null;

  const baseFeatures: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: flatFeatures };
  const boundsAdjusted = isPreliminaryDerived
    ? clampFeatureCollectionToIsrael(baseFeatures)
    : expandGeoJSONBounds(baseFeatures);
  const simplified = simplifyFeatureCollection(boundsAdjusted, SIMPLIFY_TOLERANCE_AGGRESSIVE);

  const url = buildMapboxUrl(simplified, style, padding);
  return url.length <= MAPBOX_URL_MAX_LENGTH ? url : null;
}

export async function generateMapImage(alert: Alert): Promise<Buffer | null> {
  try {
    // Compute style once to avoid inconsistency if the 06:00/18:00 boundary is crossed
    // between cache-key construction and URL building.
    const style = getCurrentMapStyle();
    const cacheKey = buildCacheKey(alert, style);
    const cached = imageCache.get(cacheKey);
    if (cached) {
      log('info', 'MapService', 'Cache hit — skipping Mapbox request');
      return cached.buffer;
    }

    if (isMonthlyLimitReached()) {
      log('warn', 'MapService', 'Monthly Mapbox limit reached — sending without map');
      return null;
    }

    const cityIds: number[] = [];

    for (const cityName of alert.cities) {
      const cityData = getCityData(cityName);
      if (!cityData) {
        log('warn', 'MapService', `City not found: ${cityName}`);
        continue;
      }
      cityIds.push(cityData.id);
    }

    let isPreliminaryDerived = false;

    // Pre-warning path: no cities → derive zone polygons from instructions text
    if (cityIds.length === 0 && isPreliminaryAlert(alert.instructions)) {
      const zoneNames = extractZoneNamesFromText(alert.instructions ?? '');
      if (zoneNames.length > 0) {
        cityIds.push(...getCityIdsByZones(zoneNames));
        isPreliminaryDerived = true;
        log('info', 'MapService', `Pre-warning: derived ${cityIds.length} city IDs from zones: ${zoneNames.join(', ')}`);
      }
    }

    if (cityIds.length === 0) {
      log('warn', 'MapService', 'No polygons — sending without map');
      return null;
    }

    const padding = getAdaptivePadding(cityIds.length);
    const color = getAlertColor(alert.type);
    const rawGeojson = buildGeoJSON(cityIds, color, getZoneColor);

    if (rawGeojson.features.length === 0) {
      // Strategy 0: cities are in cities.json but have no polygon shapes —
      // try pin markers with an invisible bbox to guarantee geographic context.
      log('warn', 'MapService', 'No polygons in data files — trying pin markers');
      const markersUrl = buildMarkersWithPaddingUrl(cityIds, alert.type, style, padding)
        ?? _buildMarkersUrl(cityIds, alert.type, style, padding);
      if (!markersUrl) {
        log('warn', 'MapService', 'No valid city coordinates — sending without map');
        return null;
      }
      return await fetchAndCacheImage(markersUrl, cacheKey);
    }

    // Skip bounds expansion for preliminary-derived alerts — they already span hundreds of km,
    // and expansion pushes the northern edge into Lebanon.
    const geojson = isPreliminaryDerived ? rawGeojson : expandGeoJSONBounds(rawGeojson);

    // ניסיון 1: פוליגונים מפושטים
    const simplified = simplifyFeatureCollection(geojson);
    let url = buildMapboxUrl(simplified, style, padding);

    // ניסיון 2: פוליגונים עם פישוט אגרסיבי יותר
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      log('warn', 'MapService', 'URL too long — trying aggressive simplification');
      url = buildMapboxUrl(simplifyFeatureCollection(geojson, SIMPLIFY_TOLERANCE_AGGRESSIVE), style, padding);
    }

    // ניסיון 2.5: איחוד פוליגונים חופפים → כמה כתמים מאוחדים במקום מאות צורות נפרדות
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      log('warn', 'MapService', 'URL still too long — trying polygon union');
      const unionUrl = _buildUnionedPolygonsUrl(rawGeojson, color, style, padding, isPreliminaryDerived);
      if (unionUrl) url = unionUrl;
    }

    // ניסיון 3: סמני מרכז עיר (pin markers) — קומפקטי בהרבה מפוליגונים
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      log('warn', 'MapService', 'URL still too long — falling back to city markers');
      const markersUrl = _buildMarkersUrl(cityIds, alert.type, style, padding);
      if (markersUrl) url = markersUrl;
    }

    // ניסיון 4: bounding box
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      log('warn', 'MapService', 'URL still too long — falling back to bounding box');
      const bboxFc = buildBboxFeatureCollection(geojson, color);
      // Clamp bbox to Israel's extent for preliminary alerts near the northern border —
      // prevents the fallback rectangle from including Lebanese territory.
      const finalFc = isPreliminaryDerived ? clampFeatureCollectionToIsrael(bboxFc) : bboxFc;
      url = buildMapboxUrl(finalFc, style, padding);
    }

    // ניסיון 5: אין תמונה
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      log('warn', 'MapService', 'URL still too long — sending without map');
      return null;
    }

    return await fetchAndCacheImage(url, cacheKey);
  } catch (err) {
    log('error', 'MapService', `Error generating map image: ${String(err)}`);
    return null;
  }
}

/** Fetches a Mapbox image URL, persists it in cache, and increments the monthly usage counter. */
async function fetchAndCacheImage(url: string, cacheKey: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 10_000,
  });
  const contentType = (response.headers['content-type'] as string | undefined) ?? '';
  if (!contentType.startsWith('image/')) {
    log('error', 'MapService', `Mapbox החזיר content-type לא תקין: "${contentType}" — ייתכן שהתקבלה שגיאת HTML`);
    throw new Error(`Invalid Mapbox content-type: ${contentType}`);
  }
  const buffer = Buffer.from(response.data);

  // Cache the result (FIFO eviction: Map iterates in insertion order)
  if (imageCache.size >= maxCacheSize()) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey !== undefined) {
      imageCache.delete(oldestKey);
      deleteCacheEntry(oldestKey);
    }
  }
  imageCache.set(cacheKey, { buffer });
  saveCacheEntry(cacheKey, buffer);

  // Increment usage counter separately — failure here must not discard the image
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const newCount = incrementMonthlyCount(currentMonth);
    log('info', 'MapService', `Mapbox request #${newCount} for ${currentMonth}`);
  } catch (countErr) {
    log('error', 'MapService', `Mapbox counter update failed — possible desync: ${String(countErr)}`);
  }

  return buffer;
}
