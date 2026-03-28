import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { upsertUser } from '../db/userRepository.js';
import { getUserCities } from '../db/subscriptionRepository.js';
import { getRecentAlerts } from '../db/alertHistoryRepository.js';
import { ALERT_TYPE_CATEGORY } from '../topicRouter.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

const CATEGORY_LINES: { key: string; label: string }[] = [
  { key: 'security',      label: '🔴 ביטחוני' },
  { key: 'nature',        label: '🌍 אסונות טבע' },
  { key: 'environmental', label: '☢️ סביבתי' },
  { key: 'drills',        label: '🔵 תרגילים' },
  { key: 'general',       label: '📢 הודעות כלליות' },
];

export function buildStatsMessage(rows: AlertHistoryRow[], userCities: string[]): string {
  const counts: Record<string, number> = {
    security: 0, nature: 0, environmental: 0, drills: 0, general: 0,
  };
  for (const row of rows) {
    const cat = ALERT_TYPE_CATEGORY[row.type] ?? 'general';
    counts[cat]++;
  }

  const lines = [
    '📊 <b>סטטיסטיקת 24 שעות אחרונות</b>',
    '',
    ...CATEGORY_LINES.map(({ key, label }) => `${label} — ${counts[key]}`),
    '──────────────────',
    `סה"כ: <b>${rows.length}</b> התראות`,
  ];

  if (userCities.length > 0) {
    const citySet = new Set(userCities);
    const personalCount = rows.filter((r) => r.cities.some((c) => citySet.has(c))).length;
    lines.push('', `מתוכן, <b>${personalCount}</b> נגעו לאזורך ✓`);
  }

  return lines.join('\n');
}

export function registerStatsHandler(bot: Bot): void {
  bot.command('stats', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
      const rows = getRecentAlerts(24);
      const userCities = getUserCities(chatId);
      await ctx.reply(buildStatsMessage(rows, userCities), { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Stats] Command failed:', err);
      await ctx.reply('אירעה שגיאה בטעינת הסטטיסטיקה. נסה שוב מאוחר יותר.').catch((e) =>
        console.error('[Stats] Failed to send error reply:', e)
      );
    }
  });
}
