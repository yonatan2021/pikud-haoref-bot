import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { upsertUser } from '../db/userRepository.js';
import { getUserCities, getSubscriptionCount } from '../db/subscriptionRepository.js';
import {
  getAlertsForCity,
  getAlertsForCities,
  getRecentAlerts,
} from '../db/alertHistoryRepository.js';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

export function formatRelativeHe(firedAt: string): string {
  const diffMs = Date.now() - new Date(firedAt.replace(' ', 'T') + 'Z').getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 48) return `לפני ${diffHours} שעות`;
  const diffDays = Math.floor(diffHours / 24);
  return `לפני ${diffDays} ימים`;
}

export function buildHistoryMessage(rows: AlertHistoryRow[]): string {
  if (rows.length === 0) return 'אין התראות אחרונות.';

  const lines: string[] = [];
  for (const row of rows) {
    const emoji = ALERT_TYPE_EMOJI[row.type] ?? '⚠️';
    const title = ALERT_TYPE_HE[row.type] ?? row.type;
    const displayed = row.cities.slice(0, 5).join(', ');
    const overflow = row.cities.length > 5 ? ` (+${row.cities.length - 5})` : '';
    lines.push(`${emoji} ${title} — ${displayed}${overflow}`);
    lines.push(`⏱ ${formatRelativeHe(row.fired_at)}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function registerHistoryHandler(bot: Bot): void {
  bot.command('history', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    upsertUser(chatId);
    const cityArg = String(ctx.match ?? '').trim();

    if (cityArg.length > 0) {
      const rows = getAlertsForCity(cityArg, 10);
      await ctx.reply(
        `📋 <b>10 התראות אחרונות — ${cityArg}</b>\n\n${buildHistoryMessage(rows)}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (getSubscriptionCount(chatId) > 0) {
      const rows = getAlertsForCities(getUserCities(chatId), 10);
      await ctx.reply(
        `📋 <b>10 התראות אחרונות לאזורך</b>\n\n${buildHistoryMessage(rows)}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const rows = getRecentAlerts(168).slice(0, 10);
    const tip =
      '\n\nℹ️ אלו ההתראות האחרונות בכל הארץ.\n' +
      'כדי לקבל התראות לאזורך בלבד, הוסף ערים עם /zones\n' +
      'לחיפוש עיר ספציפית: /history [שם עיר]';
    await ctx.reply(
      `📋 <b>10 התראות אחרונות</b>\n\n${buildHistoryMessage(rows)}${tip}`,
      { parse_mode: 'HTML' }
    );
  });
}
