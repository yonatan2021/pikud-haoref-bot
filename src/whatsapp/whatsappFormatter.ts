import type { Alert } from '../types.js';
import { getCityData } from '../cityLookup.js';
import { getAllCached } from '../config/templateCache.js';
import { getSuperRegionByZone } from '../config/zones.js';
import { getUrgencyForCountdown } from '../config/urgency.js';
import { buildSummaryLine } from '../utils/summaryLine.js';

const MAX_CITIES_PER_ZONE = 25;

function getCurrentTimeIL(): string {
  return new Date().toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

interface ZoneGroup {
  zone: string;
  cities: string[];
  minCountdown: number | null;
}

function groupCitiesByZone(cities: string[]): { zones: ZoneGroup[]; unzoned: string[] } {
  const zoneMap = new Map<string, ZoneGroup>();
  const unzoned: string[] = [];

  for (const cityName of cities) {
    const data = getCityData(cityName);
    if (!data || !data.zone) {
      unzoned.push(cityName);
      continue;
    }

    const existing = zoneMap.get(data.zone);
    const countdown = data.countdown > 0 ? data.countdown : null;

    if (!existing) {
      zoneMap.set(data.zone, {
        zone: data.zone,
        cities: [cityName],
        minCountdown: countdown,
      });
    } else {
      zoneMap.set(data.zone, {
        ...existing,
        cities: [...existing.cities, cityName],
        minCountdown:
          countdown !== null
            ? existing.minCountdown === null
              ? countdown
              : Math.min(existing.minCountdown, countdown)
            : existing.minCountdown,
      });
    }
  }

  return { zones: Array.from(zoneMap.values()), unzoned };
}

export function formatAlertForWhatsApp(alert: Alert): string {
  const cache = getAllCached();
  const entry = cache[alert.type];
  const emoji = entry?.emoji ?? '⚠️';
  const titleHe = entry?.titleHe ?? 'התרעה';
  const time = getCurrentTimeIL();

  const lines: string[] = [];
  lines.push(`${emoji} *${titleHe}*`);
  lines.push(`⏰ ${time}`);

  const summaryLine = buildSummaryLine(alert.cities);
  if (summaryLine) lines.push(summaryLine);

  if (alert.instructions) {
    lines.push('');
    lines.push(`📌 ${alert.instructions}`);
  }

  lines.push('');

  const { zones, unzoned } = groupCitiesByZone(alert.cities);

  // Sort zones by urgency: most urgent (lowest countdown) first
  const sortedZones = [...zones].sort(
    (a, b) => (a.minCountdown ?? Infinity) - (b.minCountdown ?? Infinity)
  );

  for (const group of sortedZones) {
    const urgency = getUrgencyForCountdown(group.minCountdown ?? Infinity);
    const urgencyPrefix = group.minCountdown !== null ? `${urgency.emoji} ` : '';
    const countdownSuffix =
      group.minCountdown !== null && isFinite(group.minCountdown) ? `  ⏱ ${group.minCountdown} שנ׳` : '';
    const srEmoji = getSuperRegionByZone(group.zone)?.name.split(' ')[0] ?? '';
    const srPrefix = srEmoji ? `${srEmoji} ` : '';
    const sorted = [...group.cities].sort((a, b) => a.localeCompare(b, 'he'));
    const displayed = sorted.slice(0, MAX_CITIES_PER_ZONE);
    const remaining = sorted.length - MAX_CITIES_PER_ZONE;
    const cityList =
      remaining > 0 ? `${displayed.join(', ')}\nועוד ${remaining} ערים נוספות` : displayed.join(', ');
    const header = `▸ ${srPrefix}${urgencyPrefix}*${group.zone}* (${group.cities.length})${countdownSuffix}`;
    lines.push(header);
    lines.push(cityList);
    lines.push('');
  }

  if (unzoned.length > 0) {
    lines.push(unzoned.join(', '));
    lines.push('');
  }

  // Remove trailing empty line
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}
