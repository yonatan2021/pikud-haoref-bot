import { Bot, InputFile } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { Alert } from './types';
import { getCityData } from './cityLookup';
import { getEmoji, getTitleHe, getInstructionsPrefix } from './config/templateCache.js';
import { log } from './logger.js';
export { DEFAULT_ALERT_TYPE_HE as ALERT_TYPE_HE, DEFAULT_ALERT_TYPE_EMOJI as ALERT_TYPE_EMOJI } from './config/alertTypeDefaults.js';

const MAX_CITIES_DISPLAYED = 25;

/** Telegram's hard caption limit for photo messages (sendPhoto / editMessageCaption). */
export const TELEGRAM_CAPTION_MAX = 1024;
const TRUNCATION_SUFFIX = '\n<i>…</i>';

/** Truncates a formatted message to fit within the photo caption limit.
 *  Cuts at the last zone-section boundary (\n\n) that fits, so HTML tags are never split. */
export function truncateToCaptionLimit(message: string): string {
  if (message.length <= TELEGRAM_CAPTION_MAX) return message;
  const limit = TELEGRAM_CAPTION_MAX - TRUNCATION_SUFFIX.length;
  const boundary = message.lastIndexOf('\n\n', limit);
  const cutAt = boundary > 0 ? boundary : limit;
  return message.slice(0, cutAt) + TRUNCATION_SUFFIX;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildCityList(cities: string[]): string {
  if (cities.length === 0) return '';
  const displayed = cities.slice(0, MAX_CITIES_DISPLAYED);
  const remaining = cities.length - MAX_CITIES_DISPLAYED;
  const cityStr = displayed.map(escapeHtml).join(', ');
  if (remaining <= 0) return cityStr;
  return `${cityStr}\n<i>ועוד ${remaining} ערים נוספות</i>`;
}

export function buildZonedCityList(cities: string[]): string {
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

  const sections: string[] = [];

  for (const [zone, { cities: zoneCities, minCountdown }] of zoneMap) {
    const sorted = [...zoneCities].sort((a, b) => a.localeCompare(b, 'he'));
    const countdownSuffix =
      minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ <b>${minCountdown} שנ׳</b>` : '';
    const zoneCount = ` (${sorted.length})`;
    sections.push(`▸ <b>${escapeHtml(zone)}</b>${zoneCount}${countdownSuffix}\n${buildCityList(sorted)}`);
  }

  if (noZone.length > 0) {
    const sortedNoZone = [...noZone].sort((a, b) => a.localeCompare(b, 'he'));
    sections.push(`▸ <i>ערים נוספות</i>\n${buildCityList(sortedNoZone)}`);
  }

  return sections.join('\n\n');
}

export function formatAlertMessage(alert: Alert): string {
  const emoji = getEmoji(alert.type);
  const title = getTitleHe(alert.type);

  const now = new Date(alert.receivedAt ?? Date.now());
  const timeStr = now.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const cityCountSuffix = alert.cities.length > 0 ? `  ·  ${alert.cities.length} ערים` : '';
  const parts: string[] = [
    `${emoji} <b>${escapeHtml(title)}</b>\n⏰ ${escapeHtml(timeStr)}${cityCountSuffix}`,
  ];

  let instructionsPart: string | null = null;
  if (alert.instructions) {
    const prefix = getInstructionsPrefix(alert.type);
    instructionsPart = prefix
      ? `${prefix} <i>${escapeHtml(alert.instructions)}</i>`
      : `<i>${escapeHtml(alert.instructions)}</i>`;
  }

  const zonedList = buildZonedCityList(alert.cities);

  // Instructions appear before cities so they are visible in push notification previews
  if (instructionsPart) parts.push(instructionsPart);
  if (zonedList) parts.push(zonedList);

  return parts.join('\n\n');
}

let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN חסר בקובץ .env');
    botInstance = new Bot(token);
    botInstance.api.config.use(autoRetry());
  }
  return botInstance;
}

export interface SentMessage {
  messageId: number;
  hasPhoto: boolean;
}

export async function sendAlert(
  alert: Alert,
  imageBuffer: Buffer | null,
  messageThreadId?: number
): Promise<SentMessage> {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID חסר בקובץ .env');

  const message = formatAlertMessage(alert);
  const threadOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};
  const topicStr = messageThreadId ? ` → topic ${messageThreadId}` : '';

  try {
    if (imageBuffer && message.length <= TELEGRAM_CAPTION_MAX) {
      const sent = await bot.api.sendPhoto(chatId, new InputFile(imageBuffer, 'map.png'), {
        caption: message,
        parse_mode: 'HTML',
        ...threadOptions,
      });
      log('info', 'Bot', `Sent ${alert.type} — ${alert.cities.length} cities + map${topicStr}`);
      return { messageId: sent.message_id, hasPhoto: true };
    } else {
      if (imageBuffer) {
        log('warn', 'Bot', `Caption too long (${message.length} chars) — sending as text-only`);
      }
      const sent = await bot.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        ...threadOptions,
      });
      log('info', 'Bot', `Sent ${alert.type} — ${alert.cities.length} cities${topicStr}`);
      return { messageId: sent.message_id, hasPhoto: false };
    }
  } catch (err) {
    log('error', 'Bot', `Error sending message: ${String(err)}`);
    throw err;
  }
}

/** Exported for testing — determines which Telegram API method to use for editing. */
export function selectEditMethod(
  hasPhoto: boolean,
  imageBuffer: Buffer | null
): 'media' | 'caption' | 'text' {
  if (hasPhoto && imageBuffer) return 'media';
  if (hasPhoto) return 'caption';
  return 'text';
}

// ─── Edit error classifiers ────────────────────────────────────────────────

/** Telegram "message is not modified" — content unchanged, treat as success. */
export function isUnmodifiedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('message is not modified');
}

/** Telegram errors indicating the media cannot be replaced — degrade to caption edit. */
export function isMediaEditError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('MEDIA_EDIT_FAILED') ||
    err.message.includes("media can't be edited") ||
    err.message.includes('wrong type of the web page content')
  );
}

/** Telegram errors indicating the message no longer exists — re-throw so caller sends fresh. */
export function isMessageGoneError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('message to edit not found') ||
    err.message.includes("message can't be edited")
  );
}

// ─── Bot API interface (subset used by the edit chain) ────────────────────

export interface EditBotApi {
  editMessageMedia(
    chatId: string,
    messageId: number,
    media: { type: 'photo'; media: InputFile; caption?: string; parse_mode?: string }
  ): Promise<unknown>;
  editMessageCaption(
    chatId: string,
    messageId: number,
    other?: { caption?: string; parse_mode?: string }
  ): Promise<unknown>;
  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    other?: { parse_mode?: string }
  ): Promise<unknown>;
}

/**
 * Exported for testing — implements the three-step degraded edit chain.
 *
 * Step 1: editMessageMedia (photo + caption)
 * Step 2: on non-trivial media failure → editMessageCaption (keep photo, update caption only)
 * Step 3: on any further failure → editMessageText (remove photo, plain text)
 *
 * Re-throws only on isMessageGoneError so that alertHandler can send a fresh message.
 */
export async function _editAlertChain(
  api: EditBotApi,
  tracked: { messageId: number; chatId: string; hasPhoto: boolean },
  alert: Alert,
  imageBuffer: Buffer | null
): Promise<void> {
  const message = formatAlertMessage(alert);
  const method = selectEditMethod(tracked.hasPhoto, imageBuffer);

  if (method === 'media') {
    try {
      const caption = truncateToCaptionLimit(message);
      await api.editMessageMedia(tracked.chatId, tracked.messageId, {
        type: 'photo',
        media: new InputFile(imageBuffer!, 'map.png'),
        caption,
        parse_mode: 'HTML',
      });
      log('info', 'Bot',
        `Updated message ${tracked.messageId}: ${alert.type} — ${alert.cities.length} cities + map (media)`
      );
      return;
    } catch (err) {
      if (isUnmodifiedError(err)) {
        log('warn', 'Bot', `Message ${tracked.messageId} not modified (media step) — treating as success`);
        return;
      }
      if (isMessageGoneError(err)) {
        throw err;
      }
      // isMediaEditError or any other error → degrade to caption
      log('warn', 'Bot', `editMessageMedia failed (${String(err)}) — degrading to caption edit`);
    }
  }

  if (method === 'media' || method === 'caption') {
    try {
      const caption = truncateToCaptionLimit(message);
      await api.editMessageCaption(tracked.chatId, tracked.messageId, {
        caption,
        parse_mode: 'HTML',
      });
      log('info', 'Bot',
        `Updated message ${tracked.messageId}: ${alert.type} — ${alert.cities.length} cities (caption)`
      );
      return;
    } catch (err) {
      if (isUnmodifiedError(err)) {
        log('warn', 'Bot', `Message ${tracked.messageId} not modified (caption step) — treating as success`);
        return;
      }
      if (isMessageGoneError(err)) {
        throw err;
      }
      // Any other error → degrade to text
      log('warn', 'Bot', `editMessageCaption failed (${String(err)}) — degrading to text edit`);
    }
  }

  // Final step: plain text edit
  try {
    await api.editMessageText(tracked.chatId, tracked.messageId, message, {
      parse_mode: 'HTML',
    });
    log('info', 'Bot',
      `Updated message ${tracked.messageId}: ${alert.type} — ${alert.cities.length} cities (text)`
    );
  } catch (err) {
    if (isUnmodifiedError(err)) {
      log('warn', 'Bot', `Message ${tracked.messageId} not modified (text step) — treating as success`);
      return;
    }
    throw err;
  }
}

export async function editAlert(
  tracked: { messageId: number; chatId: string; hasPhoto: boolean },
  alert: Alert,
  imageBuffer: Buffer | null
): Promise<void> {
  const bot = getBot();
  await _editAlertChain(bot.api as unknown as EditBotApi, tracked, alert, imageBuffer);
}
