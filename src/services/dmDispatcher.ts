import { Alert } from '../types.js';
import { getUsersForCities } from '../db/subscriptionRepository.js';
import { getEmoji, getTitleHe } from '../config/templateCache.js';
import { getCityData } from '../cityLookup.js';
import { ALERT_TYPE_CATEGORY } from '../topicRouter.js';
import { dmQueue, type DmTask } from './dmQueue.js';
import { log } from '../logger.js';
import { renderCountdownBar } from '../config/urgency.js';

/**
 * Returns a personal relevance indicator based on the subscriber's home city.
 * - 🔴 באזורך — home_city is directly in the alert
 * - 🟡 באזור קרוב — home_city shares a zone with an alert city
 * - 🟢 לא באזורך — no geographic match
 * Returns null if home_city is not set or alert has no cities.
 */
export function getRelevanceIndicator(homeCity: string | null, alertCities: string[]): string | null {
  if (!homeCity || alertCities.length === 0) return null;

  if (alertCities.includes(homeCity)) return '🔴 באזורך';

  const homeCityData = getCityData(homeCity);
  if (homeCityData?.zone) {
    for (const city of alertCities) {
      const cityData = getCityData(city);
      if (cityData?.zone === homeCityData.zone) return '🟡 באזור קרוב';
    }
  }

  return '🟢 לא באזורך';
}

function getMinCountdown(cityNames: string[]): number {
  let min = Infinity;
  for (const name of cityNames) {
    const cd = getCityData(name)?.countdown ?? 0;
    if (cd > 0) min = Math.min(min, cd);
  }
  return isFinite(min) ? min : 0;
}

export function buildShortMessage(alert: Alert): string {
  const emoji = getEmoji(alert.type);
  const title = getTitleHe(alert.type);
  const cities = alert.cities.slice(0, 10).join(', ');
  const more = alert.cities.length > 10 ? ` ועוד ${alert.cities.length - 10}` : '';
  const cd = getMinCountdown(alert.cities);
  const cdSuffix = cd > 0 ? ` | ⏱ ${cd}שנ׳` : '';
  return `${emoji} ${title} | ${cities}${more}${cdSuffix}`;
}

export function buildAlertDmMessage(alert: Alert, homeCity?: string | null): string {
  const emoji = getEmoji(alert.type);
  const title = getTitleHe(alert.type);
  const category = ALERT_TYPE_CATEGORY[alert.type] ?? 'general';
  const isDrill = category === 'drills';
  const isNationwide = alert.cities.length === 0;

  const parts: string[] = [];

  const relevance = getRelevanceIndicator(homeCity ?? null, alert.cities);
  if (relevance) parts.push(relevance);

  // Only say "באזורך" when the home city is actually in the alert,
  // or when the subscriber has no home city set (relevance = null).
  // "🟡 באזור קרוב" and "🟢 לא באזורך" get a plain title — the
  // relevance indicator already tells the full story.
  const homeInAlert = relevance === '🔴 באזורך' || homeCity == null;
  const titleLine = isNationwide
    ? `${emoji} ${title}`
    : homeInAlert
      ? `${emoji} ${title} באזורך`
      : `${emoji} ${title}`;
  parts.push(titleLine);

  const locationLine = isNationwide
    ? '📍 ברחבי הארץ'
    : `📍 ${alert.cities.slice(0, 10).join(', ')}${alert.cities.length > 10 ? ` ועוד ${alert.cities.length - 10}` : ''}`;

  const cd = getMinCountdown(alert.cities);
  if (!cd && alert.instructions) {
    parts.push(alert.instructions);
  }

  parts.push(locationLine);

  if (cd > 0) {
    const drillSuffix = isDrill ? ' (תרגיל)' : '';
    const bar = renderCountdownBar(cd);
    const barPrefix = bar ? `${bar}  ` : '';
    parts.push(`${barPrefix}⏱ יש לך ${cd} שניות להיכנס למרחב מוגן${drillSuffix}`);
  }

  return parts.join('\n');
}

function isPreliminaryAlert(instructions?: string): boolean {
  if (!instructions) return false;
  return (
    instructions.includes('בדקות הקרובות') ||
    instructions.includes('התראה מקדימה') ||
    instructions.includes('צפויות להתקבל')
  );
}

export function buildNewsFlashDmMessage(alert: Alert, homeCity?: string | null): string {
  const isPreliminary = isPreliminaryAlert(alert.instructions);

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

  const headline = isPreliminary
    ? `⚠️ התראה מקדימה${allLabels.length > 0 ? ' באזורך' : ''}`
    : `📢 הודעה מיוחדת`;

  const parts: string[] = [];

  const relevance = getRelevanceIndicator(homeCity ?? null, alert.cities);
  if (relevance) parts.push(relevance);

  parts.push(headline);

  if (alert.instructions) {
    parts.push(alert.instructions);
  }

  if (allLabels.length > 0) {
    parts.push(`📍 ${allLabels.join(', ')}`);
  }

  return parts.join('\n');
}

// Issue 3: format param removed — DM format was unified; short/detailed produce identical output.
// NotificationFormat is still stored in the DB and shown in the UI settings panel.
export function buildDmText(alert: Alert, homeCity?: string | null): string {
  if (alert.type === 'newsFlash') return buildNewsFlashDmMessage(alert, homeCity);
  return buildAlertDmMessage(alert, homeCity);
}

function getIsraelHour(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour');
  if (!hourPart) {
    // Fallback to 12 (midday) — outside the quiet window — so a failure delivers rather than suppresses.
    log('error', 'DM', 'getIsraelHour: לא נמצא חלק שעה מ-Intl.DateTimeFormat — ברירת מחדל 12');
  }
  return parseInt(hourPart?.value ?? '12', 10);
}

// Quiet hours: 23:00–06:00 Israel time (Asia/Jerusalem).
// Suppressed window: [23:00, 06:00) — 23:00 inclusive, 06:00 exclusive (alerts at exactly 06:00 are delivered).
// Only 'drills' and 'general' categories are suppressed — security, nature,
// and environmental alerts always get through regardless of user preference.
// NOTE: 'newsFlash' maps to category 'general' (see ALERT_TYPE_CATEGORY in topicRouter.ts)
// and IS suppressed during quiet hours. This is intentional — newsFlash is informational
// (all-clear / announcements), not an immediate security threat.
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

// Issue 8: `now` is injectable for deterministic quiet-hours testing
export function notifySubscribers(
  alert: Alert,
  enqueueAll: (tasks: DmTask[]) => void = (tasks) => dmQueue.enqueueAll(tasks),
  now: Date = new Date()
): void {
  try {
    const subscribers = getUsersForCities(alert.cities);
    const noMatch = subscribers.length === 0 && alert.cities.length > 0 ? ' (אין התאמת עיר)' : '';
    log('info', 'DM', `📨 ${subscribers.length} מנויים · ${alert.cities.length} ערים · ${alert.type}${noMatch}`);
    if (subscribers.length === 0) return;

    const afterQuietHours = subscribers.filter(
      ({ quiet_hours_enabled }) => !shouldSkipForQuietHours(alert.type, quiet_hours_enabled, now)
    );

    // Snooze filter: mirrors quiet-hours category logic — only suppresses drills/general.
    // Security, nature, and environmental alerts always pass through even when muted.
    // muted_until is already fetched by getUsersForCities — no extra DB call per subscriber.
    const category = ALERT_TYPE_CATEGORY[alert.type] ?? 'general';
    const muteApplies = category === 'drills' || category === 'general';
    const afterMute = muteApplies
      ? afterQuietHours.filter(({ muted_until }) => !muted_until || new Date(muted_until) <= now)
      : afterQuietHours;

    const tasks = afterMute.map(({ chat_id, matchedCities, home_city }) => {
      const personalAlert: Alert = { ...alert, cities: matchedCities };
      return { chatId: String(chat_id), text: buildDmText(personalAlert, home_city) };
    });

    const skippedQH = subscribers.length - afterQuietHours.length;
    const skippedMuted = afterQuietHours.length - afterMute.length;
    if (skippedQH > 0) {
      log('info', 'DM', `🔕 שעות שקט: ${skippedQH} מנויים דולגו (${alert.type})`);
    }
    if (skippedMuted > 0) {
      log('info', 'DM', `🔇 מושתק: ${skippedMuted} מנויים דולגו (${alert.type})`);
    }

    enqueueAll(tasks);
  } catch (err) {
    log('error', 'DM', `כישלון בשליחת התראות type=${alert.type}: ${err}`);
  }
}
