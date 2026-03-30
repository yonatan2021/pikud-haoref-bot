import type { Alert } from '../types.js';
import { getCityData } from '../cityLookup.js';
import { getAllCached } from '../config/templateCache.js';

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
  lines.push(`🕐 ${time}`);

  if (alert.instructions) {
    lines.push('');
    lines.push(`📌 ${alert.instructions}`);
  }

  lines.push('');

  const { zones, unzoned } = groupCitiesByZone(alert.cities);

  for (const group of zones) {
    const countdownSuffix =
      group.minCountdown !== null ? ` — ⏱ ${group.minCountdown} שנ׳` : '';
    lines.push(`📍 *${group.zone}*${countdownSuffix}`);
    lines.push(group.cities.join(', '));
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
