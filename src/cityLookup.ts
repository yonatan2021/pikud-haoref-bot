import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { CityEntry, PolygonCoords, PolygonsMap } from './types';
import { normalizeCityName } from './alertPoller';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const citiesData: CityEntry[] = require('pikud-haoref-api/cities.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const polygonsData: PolygonsMap = require('pikud-haoref-api/polygons.json');

export function getCityData(name: string): CityEntry | null {
  const normalized = normalizeCityName(name);
  return (
    citiesData.find((c) => normalizeCityName(c.name) === normalized) ?? null
  );
}

export function getCityById(id: number): CityEntry | null {
  return citiesData.find((c) => c.id === id) ?? null;
}

export function getCitiesByZone(zone: string): CityEntry[] {
  return citiesData
    .filter((c) => c.zone === zone && c.id !== 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function searchCities(query: string): CityEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return citiesData
    .filter((c) => c.id !== 0 && c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .slice(0, 20);
}

export function getPolygonCoords(cityId: number): PolygonCoords | null {
  return polygonsData[String(cityId)] ?? null;
}

export function buildGeoJSON(
  cityIds: number[]
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
        fill: '#FF0000',
        'fill-opacity': 0.3,
        stroke: '#FF0000',
        'stroke-width': 2,
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
