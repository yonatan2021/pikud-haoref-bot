import { Alert } from '../types.js';
import { getUsersForCities } from '../db/subscriptionRepository.js';
import { formatAlertMessage, ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot.js';
import { getCityData } from '../cityLookup.js';
import type { NotificationFormat } from '../db/userRepository.js';
import { ALERT_TYPE_CATEGORY } from '../topicRouter.js';
import { dmQueue } from './dmQueue.js';

function buildShortMessage(alert: Alert): string {
  const emoji = ALERT_TYPE_EMOJI[alert.type] ?? '⚠️';
  const title = ALERT_TYPE_HE[alert.type] ?? ALERT_TYPE_HE.unknown ?? 'התרעה';
  const cities = alert.cities.slice(0, 10).join(', ');
  const more = alert.cities.length > 10 ? ` ועוד ${alert.cities.length - 10}` : '';
  return `${emoji} ${title} | ${cities}${more}`;
}

export function buildNewsFlashDmMessage(alert: Alert): string {
  const emoji = ALERT_TYPE_EMOJI['newsFlash'] ?? '📢';
  const title = ALERT_TYPE_HE['newsFlash'] ?? 'הודעה מיוחדת';

  const seenZones = new Set<string>();
  const seenCities = new Set<string>();
  const zones: string[] = [];
  const noZoneCities: string[] = [];

  for (const city of alert.cities) {
    const zone = getCityData(city)?.zone;
    if (zone) {
      if (!seenZones.has(zone)) {
        seenZones.add(zone);
        zones.push(zone);
      }
    } else {
      if (!seenCities.has(city)) {
        seenCities.add(city);
        noZoneCities.push(city);
      }
    }
  }

  const allLabels = [...zones, ...noZoneCities];

  const parts: string[] = [];
  if (allLabels.length > 0) {
    parts.push(`${emoji} ${title} | ${allLabels.join(', ')}`);
  } else {
    parts.push(`${emoji} ${title}`);
  }

  if (alert.instructions) {
    parts.push(alert.instructions);
  }

  return parts.join('\n');
}

export function buildDmText(alert: Alert, format: NotificationFormat): string {
  if (alert.type === 'newsFlash') return buildNewsFlashDmMessage(alert);
  if (format === 'detailed') return formatAlertMessage(alert);
  return buildShortMessage(alert);
}

function getIsraelHour(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour');
  return parseInt(hourPart?.value ?? '0', 10);
}

// Quiet hours: 23:00–06:00 Israel time (Asia/Jerusalem).
// Only 'drills' and 'general' categories are suppressed — security, nature,
// and environmental alerts always get through regardless of user preference.
export function shouldSkipForQuietHours(
  alertType: string,
  quietEnabled: boolean,
  now: Date = new Date()
): boolean {
  if (!quietEnabled) return false;
  const hour = getIsraelHour(now);
  if (!(hour >= 23 || hour < 6)) return false;
  const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
  return category === 'drills' || category === 'general';
}

export function notifySubscribers(alert: Alert): void {
  try {
    const subscribers = getUsersForCities(alert.cities);
    console.log(
      `[DM] ${alert.type} — ${alert.cities.length} cities, ${subscribers.length} subscriber(s)` +
      (subscribers.length === 0 && alert.cities.length > 0 ? ' (no city match)' : '')
    );
    if (subscribers.length === 0) return;

    const tasks = subscribers
      .filter(({ quiet_hours_enabled }) => !shouldSkipForQuietHours(alert.type, quiet_hours_enabled))
      .map(({ chat_id, format, matchedCities }) => {
        const personalAlert: Alert = { ...alert, cities: matchedCities };
        return { chatId: String(chat_id), text: buildDmText(personalAlert, format) };
      });

    const skipped = subscribers.length - tasks.length;
    if (skipped > 0) {
      console.log(`[DM] Quiet hours: skipped ${skipped} subscriber(s) for type ${alert.type}`);
    }

    dmQueue.enqueueAll(tasks);
  } catch (err) {
    console.error(`[DM] Failed to dispatch notifications for alert type=${alert.type}:`, err);
  }
}
