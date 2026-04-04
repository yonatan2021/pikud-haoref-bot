import { getCityData } from '../cityLookup.js';

/**
 * Returns a compact summary: "N אזורים · M ערים" when cities span multiple zones,
 * or "M ערים" for single-zone or unzoned alerts.
 * Returns null for empty city lists.
 */
export function buildSummaryLine(cities: string[]): string | null {
  if (cities.length === 0) return null;
  const zones = new Set<string>();
  for (const cityName of cities) {
    const zone = getCityData(cityName)?.zone;
    if (zone) zones.add(zone);
  }
  const zoneCount = zones.size;
  const cityWord = cities.length === 1 ? 'עיר' : 'ערים';
  if (zoneCount > 1) return `${zoneCount} אזורים · ${cities.length} ${cityWord}`;
  return `${cities.length} ${cityWord}`;
}
