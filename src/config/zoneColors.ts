import { SUPER_REGIONS } from './zones.js';

/** Hand-picked palette — 33 distinct, accessible colors for zone theming on maps. */
const ZONE_PALETTE: readonly string[] = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5',
  '#00ACC1', '#00897B', '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300',
  '#FB8C00', '#F4511E', '#6D4C41', '#757575', '#546E7A', '#AD1457', '#6A1B9A',
  '#283593', '#0277BD', '#00695C', '#2E7D32', '#9E9D24', '#FF6F00', '#BF360C',
  '#4DB6AC', '#EF9A9A', '#80CBC4', '#FFE082', '#B0BEC5',
];

/** All zone names in the stable order they appear in SUPER_REGIONS. */
const zoneNames: readonly string[] = SUPER_REGIONS.flatMap((sr) => sr.zones);

// Invariant: palette must cover exactly as many zones as SUPER_REGIONS defines.
// If this throws at startup, add colors to ZONE_PALETTE or remove zones from zones.ts.
if (zoneNames.length !== ZONE_PALETTE.length) {
  throw new Error(
    `[zoneColors] Zone count (${zoneNames.length}) !== palette size (${ZONE_PALETTE.length}). Update ZONE_PALETTE in zoneColors.ts.`
  );
}

/** Deterministic zone → hex color mapping. Same zone always maps to the same color. */
export const ZONE_COLORS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(zoneNames.map((name, i) => [name, ZONE_PALETTE[i]]))
);

/** Returns the stable color for a zone name, or fallback red for unknown zones. */
export function getZoneColor(zoneName: string): string {
  return ZONE_COLORS[zoneName] ?? '#FF0000';
}
