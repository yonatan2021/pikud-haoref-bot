import { Bot } from 'grammy';
import type { Context } from 'grammy';

/** 7 days expressed in hours — matches the alert_history retention window */
const HISTORY_WINDOW_HOURS = 168;
import { upsertUser } from '../db/userRepository.js';
import { getUserCities, getSubscriptionCount } from '../db/subscriptionRepository.js';
import {
  getAlertsForCity,
  getAlertsForCities,
  getRecentAlerts,
} from '../db/alertHistoryRepository.js';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE, escapeHtml } from '../telegramBot.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

export function formatRelativeHe(firedAt: string): string {
  const diffMs = Date.now() - new Date(firedAt.replace(' ', 'T') + 'Z').getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return diffMin === 1 ? 'לפני דקה' : `לפני ${diffMin} דקות`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    if (diffHours === 1) return 'לפני שעה';
    if (diffHours === 2) return 'לפני שעתיים';
    return `לפני ${diffHours} שעות`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'אתמול';
  if (diffDays === 2) return 'לפני יומיים';
  return `לפני ${diffDays} ימים`;
}

export function buildHistoryMessage(rows: AlertHistoryRow[]): string {
  if (rows.length === 0) return 'אין התראות אחרונות.';

  const lines: string[] = [];
  for (const row of rows) {
    const emoji = ALERT_TYPE_EMOJI[row.type] ?? '⚠️';
    const title = ALERT_TYPE_HE[row.type] ?? escapeHtml(row.type);
    // Cap at 5 cities per row to keep messages short; overflow count shown inline
    const displayed = row.cities.slice(0, 5).map(escapeHtml).join(', ');
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
    try {
      upsertUser(chatId);
      const cityArg = String(ctx.match ?? '').trim();
      if (cityArg.length > 100) {
        await ctx.reply('שם העיר ארוך מדי.');
        return;
      }
      const safeCityArg = escapeHtml(cityArg);

      if (cityArg.length > 0) {
        const rows = getAlertsForCity(cityArg, 10);
        await ctx.reply(
          `📋 <b>10 התראות אחרונות — ${safeCityArg}</b>\n\n${buildHistoryMessage(rows)}`,
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

      const rows = getRecentAlerts(HISTORY_WINDOW_HOURS).slice(0, 10);
      const tip =
        '\n\nℹ️ אלו ההתראות האחרונות בכל הארץ.\n' +
        'כדי לקבל התראות לאזורך בלבד, הוסף ערים עם /zones\n' +
        'לחיפוש עיר ספציפית: /history [שם עיר]';
      await ctx.reply(
        `📋 <b>10 התראות אחרונות</b>\n\n${buildHistoryMessage(rows)}${tip}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[History] Command failed:', err);
      await ctx.reply('אירעה שגיאה בטעינת היסטוריית ההתראות. נסה שוב מאוחר יותר.').catch((e) =>
        console.error('[History] Failed to send error reply:', e)
      );
    }
  });
}
