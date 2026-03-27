import { Alert } from '../types.js';
import { getUsersForCities } from '../db/subscriptionRepository.js';
import { deleteUser } from '../db/userRepository.js';
import { formatAlertMessage, getBot, ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot.js';
import { getCityData } from '../cityLookup.js';

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

export async function notifySubscribers(alert: Alert): Promise<void> {
  const subscribers = getUsersForCities(alert.cities);
  console.log(
    `[DM] ${alert.type} — ${alert.cities.length} cities, ${subscribers.length} subscriber(s)` +
    (subscribers.length === 0 && alert.cities.length > 0 ? ' (no city match)' : '')
  );
  if (subscribers.length === 0) return;

  const bot = getBot();
  const detailedMessage = formatAlertMessage(alert);
  const shortMessage = buildShortMessage(alert);
  const newsFlashMessage = alert.type === 'newsFlash' ? buildNewsFlashDmMessage(alert) : null;

  for (const { chat_id, format } of subscribers) {
    const text = newsFlashMessage ?? (format === 'detailed' ? detailedMessage : shortMessage);
    try {
      await bot.api.sendMessage(chat_id, text, { parse_mode: 'HTML' });
    } catch (err: unknown) {
      const isBlocked =
        err instanceof Error &&
        (err.message.includes('bot was blocked') ||
          err.message.includes('user is deactivated') ||
          err.message.includes('chat not found'));
      if (isBlocked) {
        console.log(`[DM] User ${chat_id} blocked the bot — removing subscriptions`);
        deleteUser(chat_id);
      } else {
        console.error(`[DM] Error sending to ${chat_id}:`, err);
      }
    }
  }
}
