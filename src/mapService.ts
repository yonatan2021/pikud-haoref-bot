import axios from 'axios';
import simplify from '@turf/simplify';
import bbox from '@turf/bbox';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
import type { FeatureCollection, Polygon } from 'geojson';
import { Alert } from './types';
import { getCityData, buildGeoJSON } from './cityLookup';
import { isMonthlyLimitReached, incrementMonthlyCount } from './db/mapboxUsageRepository.js';

const MAPBOX_URL_MAX_LENGTH = 8000;
const SIMPLIFY_TOLERANCE = 0.001;

interface CacheEntry {
  buffer: Buffer;
}

const imageCache = new Map<string, CacheEntry>();

function buildCacheKey(alert: Alert): string {
  return `${alert.type}:${[...alert.cities].sort().join('|')}`;
}

function maxCacheSize(): number {
  const raw = process.env.MAPBOX_IMAGE_CACHE_SIZE;
  const parsed = parseInt(raw ?? '', 10);
  return isNaN(parsed) || parsed <= 0 ? 20 : parsed;
}

function buildMapboxUrl(geojson: FeatureCollection<Polygon>): string {
  const encoded = encodeURIComponent(JSON.stringify(geojson));
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? '';
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `geojson(${encoded})/auto/800x500@2x?access_token=${token}`
  );
}

function simplifyFeatureCollection(
  fc: FeatureCollection<Polygon>
): FeatureCollection<Polygon> {
  return simplify(fc as Parameters<typeof simplify>[0], {
    tolerance: SIMPLIFY_TOLERANCE,
    highQuality: false,
    mutate: false,
  }) as FeatureCollection<Polygon>;
}

function buildBboxFeatureCollection(
  fc: FeatureCollection<Polygon>
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
      fill: '#FF0000',
      'fill-opacity': 0.2,
      stroke: '#FF0000',
      'stroke-width': 2,
      'stroke-opacity': 0.8,
    }
  );
  return featureCollection([bboxPoly]) as FeatureCollection<Polygon>;
}

export async function generateMapImage(alert: Alert): Promise<Buffer | null> {
  try {
    const cacheKey = buildCacheKey(alert);
    const cached = imageCache.get(cacheKey);
    if (cached) {
      console.log('[MapService] תמונה נמצאה ב-cache — מדלג על בקשת Mapbox');
      return cached.buffer;
    }

    if (isMonthlyLimitReached()) {
      console.warn('[MapService] הגעת למגבלה החודשית של Mapbox — שולח ללא תמונה');
      return null;
    }

    const cityIds: number[] = [];

    for (const cityName of alert.cities) {
      const cityData = getCityData(cityName);
      if (!cityData) {
        console.warn(`[MapService] עיר לא נמצאה: ${cityName}`);
        continue;
      }
      cityIds.push(cityData.id);
    }

    if (cityIds.length === 0) {
      console.warn('[MapService] אין פוליגונים — שולח ללא תמונה');
      return null;
    }

    const geojson = buildGeoJSON(cityIds);

    if (geojson.features.length === 0) {
      console.warn('[MapService] לא נמצאו פוליגונים בקבצי הנתונים — שולח ללא תמונה');
      return null;
    }

    // ניסיון 1: פוליגונים מפושטים
    const simplified = simplifyFeatureCollection(geojson);
    let url = buildMapboxUrl(simplified);

    // ניסיון 2: bounding box אם URL ארוך מדי
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      console.warn('[MapService] URL ארוך מדי — עובר ל-bounding box');
      const bboxFc = buildBboxFeatureCollection(geojson);
      url = buildMapboxUrl(bboxFc);
    }

    // ניסיון 3: אין תמונה
    if (url.length > MAPBOX_URL_MAX_LENGTH) {
      console.warn('[MapService] URL עדיין ארוך — שולח ללא תמונה');
      return null;
    }

    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
    });
    const buffer = Buffer.from(response.data);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const newCount = incrementMonthlyCount(currentMonth);
    console.log(`[MapService] בקשת Mapbox מספר ${newCount} לחודש ${currentMonth}`);

    if (imageCache.size >= maxCacheSize()) {
      const oldestKey = imageCache.keys().next().value;
      if (oldestKey !== undefined) {
        imageCache.delete(oldestKey);
      }
    }
    imageCache.set(cacheKey, { buffer });

    return buffer;
  } catch (err) {
    console.error('[MapService] שגיאה ביצירת תמונת מפה:', err);
    return null;
  }
}
