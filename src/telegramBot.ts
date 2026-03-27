import { Bot, InputFile } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { Alert } from './types';
import { getCityData } from './cityLookup';

export const ALERT_TYPE_HE: Record<string, string> = {
  missiles: 'התרעת טילים',
  earthQuake: 'רעידת אדמה',
  tsunami: 'צונאמי',
  hostileAircraftIntrusion: 'חדירת כלי טיס עוין',
  hazardousMaterials: 'חומרים מסוכנים',
  terroristInfiltration: 'חדירת מחבלים',
  radiologicalEvent: 'אירוע רדיולוגי',
  newsFlash: 'הודעה מיוחדת',
  general: 'התרעה כללית',
  missilesDrill: 'תרגיל — התרעת טילים',
  earthQuakeDrill: 'תרגיל — רעידת אדמה',
  tsunamiDrill: 'תרגיל — צונאמי',
  hostileAircraftIntrusionDrill: 'תרגיל — חדירת כלי טיס',
  hazardousMaterialsDrill: 'תרגיל — חומרים מסוכנים',
  terroristInfiltrationDrill: 'תרגיל — חדירת מחבלים',
  radiologicalEventDrill: 'תרגיל — אירוע רדיולוגי',
  generalDrill: 'תרגיל כללי',
  unknown: 'התרעה',
};

export const ALERT_TYPE_EMOJI: Record<string, string> = {
  missiles: '🔴',
  earthQuake: '🟠',
  tsunami: '🌊',
  hostileAircraftIntrusion: '✈️',
  hazardousMaterials: '☢️',
  terroristInfiltration: '⚠️',
  radiologicalEvent: '☢️',
  newsFlash: '📢',
  general: '⚠️',
  missilesDrill: '🔵',
  earthQuakeDrill: '🔵',
  tsunamiDrill: '🔵',
  hostileAircraftIntrusionDrill: '🔵',
  hazardousMaterialsDrill: '🔵',
  terroristInfiltrationDrill: '🔵',
  radiologicalEventDrill: '🔵',
  generalDrill: '🔵',
  unknown: '⚠️',
};

const MAX_CITIES_DISPLAYED = 25;

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

export function formatAlertMessage(alert: Alert): string {
  const emoji = ALERT_TYPE_EMOJI[alert.type] ?? '⚠️';
  const title = ALERT_TYPE_HE[alert.type] ?? ALERT_TYPE_HE.unknown;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let zoneStr = '';
  for (const cityName of alert.cities) {
    const cityData = getCityData(cityName);
    if (cityData?.zone) {
      zoneStr = cityData.zone;
      break;
    }
  }

  const zonePart = zoneStr ? `  ·  📍 ${escapeHtml(zoneStr)}` : '';

  const parts: string[] = [];
  parts.push(`${emoji}  <b>${escapeHtml(title)}</b>\n🕐 ${escapeHtml(timeStr)}${zonePart}`);

  const cityList = buildCityList(alert.cities);
  if (cityList) parts.push(cityList);

  if (alert.instructions) {
    parts.push(`🛡 <i>${escapeHtml(alert.instructions)}</i>`);
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

export async function sendAlert(
  alert: Alert,
  imageBuffer: Buffer | null,
  messageThreadId?: number
): Promise<void> {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID חסר בקובץ .env');

  const message = formatAlertMessage(alert);
  const threadOptions = messageThreadId ? { message_thread_id: messageThreadId } : {};

  try {
    if (imageBuffer) {
      await bot.api.sendPhoto(chatId, new InputFile(imageBuffer, 'map.png'), {
        caption: message,
        parse_mode: 'HTML',
        ...threadOptions,
      });
    } else {
      await bot.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        ...threadOptions,
      });
    }
    const topicStr = messageThreadId ? ` → topic ${messageThreadId}` : '';
    console.log(
      `[Telegram] נשלח: ${alert.type} — ${alert.cities.length} ערים${imageBuffer ? ' + מפה' : ''}${topicStr}`
    );
  } catch (err) {
    console.error('[Telegram] שגיאה בשליחת הודעה:', err);
    throw err;
  }
}
