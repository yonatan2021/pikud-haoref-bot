import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { getRecentAlerts, type AlertHistoryRow } from '../db/alertHistoryRepository.js';
import { getUserCities } from '../db/subscriptionRepository.js';
import { ALERT_TYPE_CATEGORY, type AlertCategory } from '../config/alertCategories.js';

const CATEGORY_LABEL: Readonly<Record<AlertCategory, string>> = {
  security: '🔴 ביטחוני',
  nature: '🌍 אסונות טבע',
  environmental: '☢️ סביבתי',
  drills: '🔵 תרגיל',
  general: '📢 כללי',
  whatsapp: '📲 WhatsApp',
};

export function buildTodayMessage(alerts: AlertHistoryRow[], userCities: string[]): string {
  const total = alerts.length;

  // Count by category
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

  lines.push('');
  lines.push(`סה"כ היום: <b>${total}</b> התראות`);
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

  return lines.join('\n');
}

export function registerTodayHandler(bot: Bot): void {
  bot.command('today', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    const alerts = getRecentAlerts(24);
    const userCities = getUserCities(chatId);
    await ctx.reply(buildTodayMessage(alerts, userCities), { parse_mode: 'HTML' });
  });
}
