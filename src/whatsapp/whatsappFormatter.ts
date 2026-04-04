import type { Alert } from '../types.js';
import { getCityData } from '../cityLookup.js';
import { getEmoji, getTitleHe, getInstructionsPrefix } from '../config/templateCache.js';
import { getUrgencyForCountdown } from '../config/urgency.js';
import { buildSummaryLine } from '../utils/summaryLine.js';

const MAX_CITIES_PER_ZONE = 25;

// ─── Zone header ─────────────────────────────────────────────────────────────

/** Plain-text zone header — mirrors Telegram's `▸ <b>Zone</b> (count)  ⏱ X שנ׳` */
export function buildWAZoneHeader(zone: string, count: number, minCountdown: number | null): string {
  const countdownSuffix =
    minCountdown !== null && minCountdown > 0 ? `  ⏱ ${minCountdown} שנ׳` : '';
  return `▸ *${zone}* (${count})${countdownSuffix}`;
}

// ─── City list ────────────────────────────────────────────────────────────────

/** Sorted (Hebrew locale), capped at 25 cities — mirrors buildCityList from telegramBot.ts */
export function buildWACityList(cities: string[]): string {
  if (cities.length === 0) return '';
  const sorted = [...cities].sort((a, b) => a.localeCompare(b, 'he'));
  const displayed = sorted.slice(0, MAX_CITIES_PER_ZONE);
  const remaining = sorted.length - MAX_CITIES_PER_ZONE;
  const cityStr = displayed.join(', ');
  if (remaining <= 0) return cityStr;
  return `${cityStr}\nועוד ${remaining} ערים נוספות`;
}

// ─── Zoned city list (regular alerts) ────────────────────────────────────────

/** Groups cities by zone with headers — mirrors buildZonedCityList from telegramBot.ts */
export function buildWAZonedCityList(cities: string[]): string {
  if (cities.length === 0) return '';

  const zoneMap = new Map<string, { cities: string[]; minCountdown: number }>();
  const noZone: string[] = [];

  for (const cityName of cities) {
    const cityData = getCityData(cityName);
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
    const countdown = isFinite(minCountdown) && minCountdown > 0 ? minCountdown : null;
    const urgencyEmoji = countdown !== null ? `${getUrgencyForCountdown(countdown).emoji} ` : '';
    const baseHeader = buildWAZoneHeader(zone, zoneCities.length, countdown);
    // Inject urgency emoji after the ▸ prefix: "▸ urgencyEmoji *zone* (count)  ⏱ X שנ׳"
    const header = urgencyEmoji ? baseHeader.replace('▸ ', `▸ ${urgencyEmoji}`) : baseHeader;
    sections.push(`${header}\n${buildWACityList(zoneCities)}`);
  }

  if (noZone.length > 0) {
    const sortedNoZone = [...noZone].sort((a, b) => a.localeCompare(b, 'he'));
    sections.push(`▸ ערים נוספות\n${buildWACityList(sortedNoZone)}`);
  }

  return sections.join('\n\n');
}

// ─── Zone-only list (newsFlash) ───────────────────────────────────────────────

/** Zone names + count only, no individual cities — mirrors buildZoneOnlyList from telegramBot.ts */
export function buildWAZoneOnlyList(cities: string[]): string {
  if (cities.length === 0) return '';

  const zoneMap = new Map<string, { count: number; minCountdown: number }>();

  for (const cityName of cities) {
    const cityData = getCityData(cityName);
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
    const countdown = isFinite(minCountdown) && minCountdown > 0 ? minCountdown : null;
    sections.push(buildWAZoneHeader(zone, count, countdown));
  }

  return sections.join('\n');
}

// ─── Main formatter ───────────────────────────────────────────────────────────

export function formatAlertForWhatsApp(alert: Alert): string {
  const emoji = getEmoji(alert.type);
  const title = getTitleHe(alert.type);
  const timeStr = new Date(alert.receivedAt ?? Date.now()).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const summaryLine = buildSummaryLine(alert.cities);
  const summaryPart = summaryLine ? `\n${summaryLine}` : '';
  const parts: string[] = [`${emoji} *${title}*\n⏰ ${timeStr}${summaryPart}`];

  if (alert.instructions) {
    const prefix = getInstructionsPrefix(alert.type);
    parts.push(prefix ? `${prefix} ${alert.instructions}` : alert.instructions);
  }

  const cityList =
    alert.type === 'newsFlash'
      ? buildWAZoneOnlyList(alert.cities)
      : buildWAZonedCityList(alert.cities);

  if (cityList) parts.push(cityList);

  return parts.join('\n\n');
}
