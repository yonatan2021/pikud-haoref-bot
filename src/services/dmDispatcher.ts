import { Alert } from '../types.js';
import { getUsersForCities } from '../db/subscriptionRepository.js';
import { deleteUser } from '../db/userRepository.js';
import { formatAlertMessage, getBot, ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot.js';

function buildShortMessage(alert: Alert): string {
  const emoji = ALERT_TYPE_EMOJI[alert.type] ?? '⚠️';
  const title = ALERT_TYPE_HE[alert.type] ?? ALERT_TYPE_HE.unknown ?? 'התרעה';
  const cities = alert.cities.slice(0, 10).join(', ');
  const more = alert.cities.length > 10 ? ` ועוד ${alert.cities.length - 10}` : '';
  return `${emoji} ${title} | ${cities}${more}`;
}

export async function notifySubscribers(alert: Alert): Promise<void> {
  const subscribers = getUsersForCities(alert.cities);
  if (subscribers.length === 0) return;

  const bot = getBot();
  const detailedMessage = formatAlertMessage(alert);
  const shortMessage = buildShortMessage(alert);

  for (const { chat_id, format } of subscribers) {
    const text = format === 'detailed' ? detailedMessage : shortMessage;
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
