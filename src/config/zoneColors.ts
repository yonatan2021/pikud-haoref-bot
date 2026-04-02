import { SUPER_REGIONS } from './zones.js';

/** Hand-picked palette — 28 distinct, accessible colors for zone theming on maps. */
const ZONE_PALETTE: readonly string[] = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5',
  '#00ACC1', '#00897B', '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300',
  '#FB8C00', '#F4511E', '#6D4C41', '#757575', '#546E7A', '#AD1457', '#6A1B9A',
  '#283593', '#0277BD', '#00695C', '#2E7D32', '#9E9D24', '#FF6F00', '#BF360C',
];

/** All 28 zone names in the stable order they appear in SUPER_REGIONS. */
const zoneNames: readonly string[] = SUPER_REGIONS.flatMap((sr) => sr.zones);

/** Deterministic zone → hex color mapping. Same zone always maps to the same color. */
export const ZONE_COLORS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(zoneNames.map((name, i) => [name, ZONE_PALETTE[i % ZONE_PALETTE.length]]))
);

/** Returns the stable color for a zone name, or fallback red for unknown zones. */
export function getZoneColor(zoneName: string): string {
  return ZONE_COLORS[zoneName] ?? '#FF0000';
}
