import { getEmoji, getTitleHe, getInstructionsPrefix } from './templateCache.js';
import { getCityData } from '../cityLookup.js';
import { buildActionCard } from '../telegramBot.js';
import { getUrgencyForCountdown } from './urgency.js';
import type { Alert } from '../types.js';

export interface ZoneSection {
  zone: string;
  cities: string[];
  minCountdown: number;
  urgencyEmoji: string;
  urgencyLabel: string;
}

export interface AlertLayoutParts {
  actionCard: string | null;
  emoji: string;
  titleHe: string;
  time: string;
  cityCount: number;
  summaryLine: string;
  instructions: string | null;
  instructionsPrefix: string;
  zoneSections: ZoneSection[];
  unzonedCities: string[];
}

export function buildAlertLayout(alert: Alert): AlertLayoutParts {
  const emoji = getEmoji(alert.type);
  const titleHe = getTitleHe(alert.type);
  const instructionsPrefix = getInstructionsPrefix(alert.type);
  const actionCard = buildActionCard(alert.type);

  const now = new Date(alert.receivedAt ?? Date.now());
  const time = now.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const zoneMap = new Map<string, { cities: string[]; minCountdown: number }>();
  const unzonedCities: string[] = [];

  for (const cityName of alert.cities) {
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
      unzonedCities.push(cityName);
    }
  }

  // Sort zones by urgency (most urgent first)
  const sortedEntries = [...zoneMap.entries()].sort(
    (a, b) => a[1].minCountdown - b[1].minCountdown
  );

  const zoneSections: ZoneSection[] = sortedEntries.map(([zone, { cities, minCountdown }]) => {
    const urgency = getUrgencyForCountdown(minCountdown);
    return {
      zone,
      cities: [...cities].sort((a, b) => a.localeCompare(b, 'he')),
      minCountdown,
      urgencyEmoji: urgency.emoji,
      urgencyLabel: urgency.label,
    };
  });

  const zoneCount = zoneSections.length + (unzonedCities.length > 0 ? 1 : 0);
  const cityCount = alert.cities.length;
  const summaryLine = cityCount === 0
    ? 'ברחבי הארץ'
    : `${cityCount} ערים ב-${zoneCount} אזורים`;

  return {
    actionCard,
    emoji,
    titleHe,
    time,
    cityCount,
    summaryLine,
    instructions: alert.instructions ?? null,
    instructionsPrefix,
    zoneSections,
    unzonedCities: [...unzonedCities].sort((a, b) => a.localeCompare(b, 'he')),
  };
}
