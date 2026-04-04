// NOTE: Parallel backend implementation in src/dashboard/routes/messages.ts (formatWithTemplate).
// Changes to the format must be applied to both files.
//
// URGENCY_EMOJIS mirrors URGENCY_LEVELS in src/config/urgency.ts.
// Cannot import directly — this file runs in the browser (no Node modules).
// Keep in sync manually when urgency thresholds change.
const URGENCY_EMOJIS = [
  { maxSeconds: 15, emoji: '🔴' },
  { maxSeconds: 30, emoji: '🟠' },
  { maxSeconds: 60, emoji: '🟡' },
  { maxSeconds: 180, emoji: '🟢' },
  { maxSeconds: Infinity, emoji: '🔵' },
] as const;

function getUrgencyEmoji(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '';
  return URGENCY_EMOJIS.find((u) => seconds <= u.maxSeconds)?.emoji ?? '🔵';
}

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

  // Sort zones by urgency: most urgent (lowest countdown) first
  const sortedZones = [...zoneMap.entries()].sort(
    (a, b) => a[1].minCountdown - b[1].minCountdown
  );

  const sections: string[] = [];

  for (const [zone, { cities: zoneCities, minCountdown }] of sortedZones) {
    const sorted = [...zoneCities].sort((a, b) => a.localeCompare(b, 'he'));
    const countdownSuffix =
      minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ <b>${minCountdown} שנ׳</b>` : '';
    const urgencyPrefix = minCountdown > 0 && isFinite(minCountdown)
      ? `${getUrgencyEmoji(minCountdown)} ` : '';
    const zoneCount = ` (${sorted.length})`;
    sections.push(`▸ ${urgencyPrefix}<b>${escapeHtml(zone)}</b>${zoneCount}${countdownSuffix}\n${buildCityListForZone(sorted)}`);
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

  // NOTE: Intentionally duplicates buildSummaryLine() from src/utils/summaryLine.ts.
  // Cannot import that module here — it uses getCityData() (Node-only, reads cities.json).
  // Keep in sync if summary line format changes.
  const zoneCt = [...new Set(
    cities.map(c => cityDataMap.get(c)?.zone).filter((z): z is string => !!z)
  )].length;
  const cityWord = cities.length === 1 ? 'עיר' : 'ערים';
  const summaryLine = cities.length > 0
    ? (zoneCt > 1 ? `${zoneCt} אזורים · ${cities.length} ${cityWord}` : `${cities.length} ${cityWord}`)
    : null;
  const headerLines = [`${template.emoji} <b>${escapeHtml(template.titleHe)}</b>`, `⏰ ${timeStr}`];
  if (summaryLine) headerLines.push(summaryLine);
  const header = headerLines.join('\n');

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
