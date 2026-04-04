import { Bot } from 'grammy';
import type { Context } from 'grammy';
import {
  getAlertsToday,
  getDailyCountsForMonth,
  type AlertHistoryRow,
} from '../db/alertHistoryRepository.js';
import { getUserCities } from '../db/subscriptionRepository.js';
import { ALERT_TYPE_CATEGORY, type AlertCategory } from '../config/alertCategories.js';
import { ALERT_TYPE_EMOJI } from '../telegramBot.js';
import { getDensityLabel } from '../config/alertDensity.js';

const CATEGORY_LABEL: Readonly<Record<AlertCategory, string>> = {
  security: '🔴 ביטחוני',
  nature: '🌍 אסונות טבע',
  environmental: '☢️ סביבתי',
  drills: '🔵 תרגיל',
  general: '📢 כללי',
  whatsapp: '📲 WhatsApp',
};

const MAX_TIMELINE_EVENTS = 15;
const MAX_CITIES_PER_LINE = 3;

/** Formats today's alerts as a compact chronological timeline string. */
export function buildTodayTimeline(alerts: AlertHistoryRow[]): string {
  if (alerts.length === 0) return '';

  const displayed = alerts.length > MAX_TIMELINE_EVENTS
    ? alerts.slice(alerts.length - MAX_TIMELINE_EVENTS)
    : alerts;

  const overflowCount = alerts.length - displayed.length;
  const lines: string[] = [];

  if (overflowCount > 0) {
    lines.push(`<i>...ועוד ${overflowCount} אירועים קודמים</i>`);
  }

  for (const alert of displayed) {
    const emoji = ALERT_TYPE_EMOJI[alert.type] ?? '⚠️';
    const timeStr = new Date(alert.fired_at).toLocaleTimeString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    let cityPart = '';
    if (alert.cities.length > 0) {
      const shown = alert.cities.slice(0, MAX_CITIES_PER_LINE).join(', ');
      const overflow = alert.cities.length > MAX_CITIES_PER_LINE
        ? ` (+${alert.cities.length - MAX_CITIES_PER_LINE})`
        : '';
      cityPart = ` · ${shown}${overflow}`;
    }

    lines.push(`${timeStr} · ${emoji}${cityPart}`);
  }

  return lines.join('\n');
}

export function buildTodayMessage(
  alerts: AlertHistoryRow[],
  userCities: string[],
  monthlyCounts: number[] = [],
): string {
  const total = alerts.length;

  const byCat = new Map<AlertCategory, number>();
  let userMatchCount = 0;

  for (const alert of alerts) {
    const cat = ALERT_TYPE_CATEGORY[alert.type] ?? 'general';
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    if (userCities.length > 0 && alert.cities.some((c) => userCities.includes(c))) {
      userMatchCount++;
    }
  }

  const lines: string[] = [`📅 <b>סיכום יומי</b>`];

  if (total === 0) {
    lines.push('');
    lines.push('אין התראות היום עד כה.');
    return lines.join('\n');
  }

  const density = getDensityLabel(total, monthlyCounts);
  const densitySuffix = density === 'חריג' ? ' · ⚠️ יום חריג' : density === 'רגיל' ? ' · 📊 יום רגיל' : '';

  lines.push('');
  lines.push(`סה"כ היום: <b>${total}</b> התראות${densitySuffix}`);
  lines.push('');

  const sortedCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    lines.push(`${CATEGORY_LABEL[cat]}: ${count}`);
  }

  if (userCities.length > 0) {
    lines.push('');
    if (userMatchCount > 0) {
      lines.push(`🏠 <b>${userMatchCount}</b> התראות באזורך`);
    } else {
      lines.push('🏠 לא היו התראות באזורך היום');
    }
  }

  const timeline = buildTodayTimeline(alerts);
  if (timeline) {
    lines.push('');
    lines.push('──────────────');
    lines.push('📋 <b>ציר זמן</b>');
    lines.push('');
    lines.push(timeline);
  }

  return lines.join('\n');
}

export function registerTodayHandler(bot: Bot): void {
  bot.command('today', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    const alerts = getAlertsToday();
    const userCities = getUserCities(chatId);
    const monthlyCounts = getDailyCountsForMonth();
    await ctx.reply(buildTodayMessage(alerts, userCities, monthlyCounts), { parse_mode: 'HTML' });
  });
}
