import { Bot, InputFile } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { Alert } from './types';
import { getCityData } from './cityLookup';
import { getEmoji, getTitleHe, getInstructionsPrefix, getBodyTemplate, getAllCached } from './config/templateCache.js';
import { DEFAULT_ALERT_TYPE_HE, DEFAULT_ALERT_TYPE_EMOJI } from './config/alertTypeDefaults.js';
import { getUrgencyForCountdown } from './config/urgency.js';
import { getSuperRegionByZone } from './config/zones.js';
import { buildSummaryLine } from './utils/summaryLine.js';
import { log } from './logger.js';
export { DEFAULT_ALERT_TYPE_HE as ALERT_TYPE_HE, DEFAULT_ALERT_TYPE_EMOJI as ALERT_TYPE_EMOJI } from './config/alertTypeDefaults.js';

const MAX_CITIES_DISPLAYED = 25;

/** Alert types that require shelter action (excludes newsFlash, generalDrill, general, unknown). */
const SHELTER_TYPES = new Set([
  'missiles', 'terroristInfiltration', 'earthQuake', 'tsunami',
  'hazardousMaterials', 'radiologicalEvent', 'unconventionalWeapons', 'hostileAircraftIntrusion',
  'missilesDrill', 'terroristInfiltrationDrill', 'earthQuakeDrill', 'tsunamiDrill',
  'hazardousMaterialsDrill', 'radiologicalEventDrill', 'unconventionalWeaponsDrill',
  'hostileAircraftIntrusionDrill',
]);

/** Returns a shelter action card line for alert types that require immediate action, or null. */
export function buildActionCard(alertType: string): string | null {
  if (!SHELTER_TYPES.has(alertType)) return null;
  const prefix = getInstructionsPrefix(alertType);
  return `\u200F🛡 <b>${prefix ? escapeHtml(prefix) + ' ' : ''}היכנסו למרחב מוגן!</b>`;
}

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

/** Determines send mode: photo (with truncated caption) when image available, text otherwise. */
export function buildSendPayload(
  message: string,
  imageBuffer: Buffer | null
): { mode: 'photo'; caption: string } | { mode: 'text'; text: string } {
  if (imageBuffer) {
    return { mode: 'photo', caption: truncateToCaptionLimit(message) };
  }
  return { mode: 'text', text: message };
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

  // Sort zones by urgency: most urgent (lowest countdown) first; stable for equal values
  const sortedZones = [...zoneMap.entries()].sort(
    (a, b) => a[1].minCountdown - b[1].minCountdown
  );

  const sections: string[] = [];

  for (const [zone, { cities: zoneCities, minCountdown }] of sortedZones) {
    const sorted = [...zoneCities].sort((a, b) => a.localeCompare(b, 'he'));
    const urgency = getUrgencyForCountdown(minCountdown);
    const urgencyPrefix = minCountdown > 0 && isFinite(minCountdown) ? `${urgency.emoji} ` : '';
    const countdownSuffix =
      minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ <b>${minCountdown} שנ׳</b>` : '';
    const zoneCount = ` (${sorted.length})`;
    const srEmoji = getSuperRegionByZone(zone)?.name.split(' ')[0] ?? '';
    const srPrefix = srEmoji ? `${srEmoji} ` : '';
    sections.push(`\u200F▸ ${srPrefix}${urgencyPrefix}<b>${escapeHtml(zone)}</b>${zoneCount}${countdownSuffix}\n${buildCityList(sorted)}`);
  }

  if (noZone.length > 0) {
    const sortedNoZone = [...noZone].sort((a, b) => a.localeCompare(b, 'he'));
    sections.push(`\u200F▸ <i>ערים נוספות</i>\n${buildCityList(sortedNoZone)}`);
  }

  return sections.join('\n\n');
}

/** Zone-summary list for newsFlash alerts — shows zone names + count + countdown only.
 *  Individual city names are omitted to keep preliminary warnings concise. */
export function buildZoneOnlyList(cities: string[]): string {
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
    const countdownSuffix =
      minCountdown > 0 && isFinite(minCountdown) ? `  ⏱ <b>${minCountdown} שנ׳</b>` : '';
    const srEmoji = getSuperRegionByZone(zone)?.name.split(' ')[0] ?? '';
    const srPrefix = srEmoji ? `${srEmoji} ` : '';
    sections.push(`\u200F▸ ${srPrefix}<b>${escapeHtml(zone)}</b> (${count})${countdownSuffix}`);
  }

  return sections.join('\n');
}

// ─── Template rendering engine ───────────────────────────────────────────

/** Maps Hebrew placeholders (used in dashboard UI) to English TemplateVars keys. */
const PLACEHOLDER_MAP: ReadonlyArray<readonly [string, string]> = [
  ['זמן', 'time'],
  ['ערים', 'cities'],
  ['מספר_ערים', 'cityCount'],
  ['כותרת', 'title'],
  ['אמוגי', 'emoji'],
] as const;

export interface TemplateVars {
  time: string;
  cities: string;
  cityCount: number;
  title: string;
  emoji: string;
}

/** Renders a body template by substituting {{placeholder}} variables.
 *  Normalizes whitespace inside braces; leaves unclosed/unknown placeholders as literal text. */
export function renderBodyTemplate(template: string, vars: TemplateVars): string {
  // Normalize: {{ ערים }} → {{ערים}}
  let result = template.replace(/\{\{\s+/g, '{{').replace(/\s+\}\}/g, '}}');
  for (const [heKey, enKey] of PLACEHOLDER_MAP) {
    const value = String(vars[enKey as keyof TemplateVars]);
    result = result.split(`{{${heKey}}}`).join(value);
  }
  return result;
}

export function formatAlertMessage(alert: Alert, serial?: number, density?: 'חריג' | 'רגיל' | null): string {
  const actionCard = buildActionCard(alert.type);
  const emoji = getEmoji(alert.type);
  const title = getTitleHe(alert.type);

  const now = new Date(alert.receivedAt ?? Date.now());
  const timeStr = now.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const cityList =
    alert.type === 'newsFlash'
      ? buildZoneOnlyList(alert.cities)
      : buildZonedCityList(alert.cities);

  // If a custom body template exists, render it and return early
  const bodyTemplate = getBodyTemplate(alert.type);
  if (bodyTemplate) {
    return renderBodyTemplate(bodyTemplate, {
      time: timeStr,
      cities: cityList,
      cityCount: alert.cities.length,
      title,
      emoji,
    });
  }

  // Default assembly (no custom template)
  const summaryLine = buildSummaryLine(alert.cities);
  const parts: string[] = [];

  if (actionCard) parts.push(actionCard);

  const headerLines = [`\u200F${emoji} <b>${escapeHtml(title)}</b>`, `⏰ ${escapeHtml(timeStr)}`];
  if (summaryLine) headerLines.push(summaryLine);
  parts.push(headerLines.join('\n'));

  let instructionsPart: string | null = null;
  if (alert.instructions) {
    const prefix = getInstructionsPrefix(alert.type);
    instructionsPart = prefix
      ? `${prefix} <i>${escapeHtml(alert.instructions)}</i>`
      : `<i>${escapeHtml(alert.instructions)}</i>`;
  }

  // Instructions appear before cities so they are visible in push notification previews
  if (instructionsPart) parts.push(instructionsPart);
  if (cityList) parts.push(cityList);

  if (serial != null) {
    const dateStr = now.toLocaleDateString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const densitySuffix = density === 'חריג' ? ` \u00B7 \u26A0\uFE0F ${escapeHtml('חריג')}` : '';
    parts.push(`<i>#${serial} \u00B7 ${escapeHtml(dateStr)}${densitySuffix}</i>`);
  }

  return parts.join('\n\n');
}

/** Formats an all-clear closure message for a zone.
 * @deprecated Use renderAllClearTemplate instead — supports dashboard-managed template. */
export function formatAllClearMessage(zoneName: string): string {
  return `✅ <b>הסתיים</b>\nהאזהרה באזור הבא הסתיימה:\n📍 ${escapeHtml(zoneName)}`;
}

// Fallback closing text when no template is seeded in the DB yet.
const DEFAULT_ALL_CLEAR_CLOSING = 'נשמו. אתם בטוחים. 🕊';

/**
 * Renders the all-clear closure message using the dashboard-managed template.
 *
 * Reads emoji, title, and closing text from the `all_clear` entry in the
 * template cache (editable via the dashboard Messages page). Falls back to
 * built-in defaults when the template has not been seeded yet.
 *
 * Placeholders resolved:
 *   {{zone}}          — zone name (e.g. "גליל עליון")
 *   {{alertTypeHe}}   — Hebrew alert name (e.g. "התרעת טילים")
 *   {{alertTypeEmoji}} — alert emoji (e.g. "🔴")
 */
export function renderAllClearTemplate(zone: string, alertType: string): string {
  const entry = getAllCached()['all_clear'];

  const emoji = entry?.emoji ?? '✅';
  const titleHe = entry?.titleHe ?? 'שקט חזר';
  const closingText = entry?.instructionsPrefix ?? DEFAULT_ALL_CLEAR_CLOSING;

  const alertTypeEmoji = DEFAULT_ALERT_TYPE_EMOJI[alertType] ?? '⚠️';
  const alertTypeHe = DEFAULT_ALERT_TYPE_HE[alertType] ?? alertType;

  const parts = [
    `${emoji} <b>${escapeHtml(titleHe)}</b>`,
    `${alertTypeEmoji} <b>${escapeHtml(alertTypeHe)}</b> באזור <b>${escapeHtml(zone)}</b> הסתיימה.`,
  ];

  if (closingText) {
    parts.push(escapeHtml(closingText));
  }

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
  messageThreadId?: number,
  serial?: number,
  density?: 'חריג' | 'רגיל' | null
): Promise<SentMessage> {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID חסר בקובץ .env');

  const message = formatAlertMessage(alert, serial, density);
  const threadOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};
  const topicStr = messageThreadId ? ` → topic ${messageThreadId}` : '';
  const payload = buildSendPayload(message, imageBuffer);

  try {
    if (payload.mode === 'photo') {
      if (payload.caption.length < message.length) {
        log('warn', 'Bot', `Caption truncated (${message.length} → ${payload.caption.length} chars) — sending photo with shorter caption`);
      }
      const sent = await bot.api.sendPhoto(chatId, new InputFile(imageBuffer!, 'map.png'), {
        caption: payload.caption,
        parse_mode: 'HTML',
        ...threadOptions,
      });
      log('info', 'Bot', `Sent ${alert.type} — ${alert.cities.length} cities + map${topicStr}`);
      return { messageId: sent.message_id, hasPhoto: true };
    } else {
      const sent = await bot.api.sendMessage(chatId, payload.text, {
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
  imageBuffer: Buffer | null,
  serial?: number,
  density?: 'חריג' | 'רגיל' | null
): Promise<void> {
  const message = formatAlertMessage(alert, serial, density);
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
        log('info', 'Bot', `Message ${tracked.messageId} not modified (media step) — treating as success`);
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
        log('info', 'Bot', `Message ${tracked.messageId} not modified (caption step) — treating as success`);
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
      log('info', 'Bot', `Message ${tracked.messageId} not modified (text step) — treating as success`);
      return;
    }
    throw err;
  }
}

export async function editAlert(
  tracked: { messageId: number; chatId: string; hasPhoto: boolean },
  alert: Alert,
  imageBuffer: Buffer | null,
  serial?: number,
  density?: 'חריג' | 'רגיל' | null
): Promise<void> {
  const bot = getBot();
  await _editAlertChain(bot.api as unknown as EditBotApi, tracked, alert, imageBuffer, serial, density);
}
