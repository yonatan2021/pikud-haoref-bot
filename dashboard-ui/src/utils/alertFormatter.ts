// NOTE: Parallel backend implementation in src/dashboard/routes/messages.ts (formatWithTemplate).
// Changes to the format must be applied to both files.

export interface CityData {
  name: string;
  zone?: string;
  countdown?: number;
}

export interface TemplateOverride {
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
}

const MAX_CITIES_PER_ZONE = 25;
export const TELEGRAM_CAPTION_MAX = 1024;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCityListForZone(cities: string[]): string {
  const displayed = cities.slice(0, MAX_CITIES_PER_ZONE);
  const remaining = cities.length - MAX_CITIES_PER_ZONE;
  const cityStr = displayed.map(escapeHtml).join(', ');
  if (remaining <= 0) return cityStr;
  return `${cityStr}\n<i>ועוד ${remaining} ערים נוספות</i>`;
}

export function buildZonedCityListFE(
  cities: string[],
  cityDataMap: Map<string, CityData>
): string {
  if (cities.length === 0) return '';

  const zoneMap = new Map<string, { cities: string[]; minCountdown: number }>();
  const noZone: string[] = [];

  for (const cityName of cities) {
    const cityData = cityDataMap.get(cityName);
    const zone = cityData?.zone;
    if (zone) {
      const existing = zoneMap.get(zone) ?? { cities: [], minCountdown: Infinity };
      const countdown = cityData?.countdown ?? 0;
      zoneMap.set(zone, {
        cities: [...existing.cities, cityName],
        minCountdown: countdown > 0 ? Math.min(existing.minCountdown, countdown) : existing.minCountdown,
      });
    } else {
      noZone.push(cityName);
    }
  }

  const sections: string[] = [];

  for (const [zone, { cities: zoneCities, minCountdown }] of zoneMap) {
    const sorted = [...zoneCities].sort((a, b) => a.localeCompare(b, 'he'));
    const countdownSuffix =
      minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ <b>${minCountdown} שנ׳</b>` : '';
    const zoneCount = ` (${sorted.length})`;
    sections.push(`▸ <b>${escapeHtml(zone)}</b>${zoneCount}${countdownSuffix}\n${buildCityListForZone(sorted)}`);
  }

  if (noZone.length > 0) {
    const sortedNoZone = [...noZone].sort((a, b) => a.localeCompare(b, 'he'));
    sections.push(`▸ <i>ערים נוספות</i>\n${buildCityListForZone(sortedNoZone)}`);
  }

  return sections.join('\n\n');
}

export function formatAlertMessageFE(
  cities: string[],
  instructions: string | undefined,
  template: TemplateOverride,
  cityDataMap: Map<string, CityData>,
  now?: Date
): string {
  const date = now ?? new Date();
  const timeStr = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const cityCountPart = cities.length > 0 ? `  ·  ${cities.length} ערים` : '';
  const header = `${template.emoji} <b>${escapeHtml(template.titleHe)}</b>\n⏰ ${timeStr}${cityCountPart}`;

  const parts: string[] = [header];

  if (instructions) {
    const prefix = template.instructionsPrefix;
    const instructionLine = prefix
      ? `${escapeHtml(prefix)} <i>${escapeHtml(instructions)}</i>`
      : `<i>${escapeHtml(instructions)}</i>`;
    parts.push(instructionLine);
  }

  const cityList = buildZonedCityListFE(cities, cityDataMap);
  if (cityList) {
    parts.push(cityList);
  }

  return parts.join('\n\n');
}

export function getCharCount(html: string): number {
  return html.length;
}

// ─── WhatsApp plain-text formatters ──────────────────────────────────────────
// NOTE: Parallel backend implementation in src/dashboard/routes/messages.ts (formatWithTemplateWA).
// Changes to the format must be applied to both files.

const MAX_WA_CITIES_PER_ZONE = 25;

function buildWACityListFE(cities: string[]): string {
  if (cities.length === 0) return '';
  const sorted = [...cities].sort((a, b) => a.localeCompare(b, 'he'));
  const displayed = sorted.slice(0, MAX_WA_CITIES_PER_ZONE);
  const remaining = sorted.length - MAX_WA_CITIES_PER_ZONE;
  const cityStr = displayed.join(', ');
  if (remaining <= 0) return cityStr;
  return `${cityStr}\nועוד ${remaining} ערים נוספות`;
}

function buildWAZoneHeaderFE(zone: string, count: number, minCountdown: number): string {
  const countdownSuffix =
    minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ ${minCountdown} שנ׳` : '';
  return `▸ *${zone}* (${count})${countdownSuffix}`;
}

export function buildWAZonedCityListFE(
  cities: string[],
  cityDataMap: Map<string, CityData>
): string {
  if (cities.length === 0) return '';

  const zoneMap = new Map<string, { cities: string[]; minCountdown: number }>();
  const noZone: string[] = [];

  for (const cityName of cities) {
    const cityData = cityDataMap.get(cityName);
    const zone = cityData?.zone;
    if (zone) {
      const existing = zoneMap.get(zone) ?? { cities: [], minCountdown: Infinity };
      const countdown = cityData?.countdown ?? 0;
      zoneMap.set(zone, {
        cities: [...existing.cities, cityName],
        minCountdown: countdown > 0 ? Math.min(existing.minCountdown, countdown) : existing.minCountdown,
      });
    } else {
      noZone.push(cityName);
    }
  }

  const sections: string[] = [];

  for (const [zone, { cities: zoneCities, minCountdown }] of zoneMap) {
    const header = buildWAZoneHeaderFE(zone, zoneCities.length, minCountdown);
    sections.push(`${header}\n${buildWACityListFE(zoneCities)}`);
  }

  if (noZone.length > 0) {
    const sortedNoZone = [...noZone].sort((a, b) => a.localeCompare(b, 'he'));
    sections.push(`▸ ערים נוספות\n${buildWACityListFE(sortedNoZone)}`);
  }

  return sections.join('\n\n');
}

export function buildWAZoneOnlyListFE(
  cities: string[],
  cityDataMap: Map<string, CityData>
): string {
  if (cities.length === 0) return '';

  const zoneMap = new Map<string, { count: number; minCountdown: number }>();

  for (const cityName of cities) {
    const cityData = cityDataMap.get(cityName);
    const zone = cityData?.zone;
    if (!zone) continue;
    const existing = zoneMap.get(zone) ?? { count: 0, minCountdown: Infinity };
    const countdown = cityData?.countdown ?? 0;
    zoneMap.set(zone, {
      count: existing.count + 1,
      minCountdown: countdown > 0 ? Math.min(existing.minCountdown, countdown) : existing.minCountdown,
    });
  }

  if (zoneMap.size === 0) return '';

  const sections: string[] = [];
  for (const [zone, { count, minCountdown }] of zoneMap) {
    sections.push(buildWAZoneHeaderFE(zone, count, minCountdown));
  }

  return sections.join('\n');
}

export function formatAlertMessageWAFE(
  alertType: string,
  cities: string[],
  instructions: string | undefined,
  template: TemplateOverride,
  cityDataMap: Map<string, CityData>,
  now?: Date
): string {
  const date = now ?? new Date();
  const timeStr = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const cityCountPart = cities.length > 0 ? `  ·  ${cities.length} ערים` : '';
  const header = `${template.emoji} *${template.titleHe}*\n⏰ ${timeStr}${cityCountPart}`;

  const parts: string[] = [header];

  if (instructions) {
    const prefix = template.instructionsPrefix;
    parts.push(prefix ? `${prefix} ${instructions}` : instructions);
  }

  const cityList =
    alertType === 'newsFlash'
      ? buildWAZoneOnlyListFE(cities, cityDataMap)
      : buildWAZonedCityListFE(cities, cityDataMap);

  if (cityList) parts.push(cityList);

  return parts.join('\n\n');
}
