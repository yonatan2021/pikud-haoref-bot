import { Bot } from 'grammy';
import { registerMenuHandler } from './menuHandler.js';
import { registerZoneHandler } from './zoneHandler.js';
import { registerSearchHandler } from './searchHandler.js';
import { registerSettingsHandler } from './settingsHandler.js';
import { registerStatsHandler } from './statsHandler.js';
import { registerHistoryHandler } from './historyHandler.js';
import { log } from '../logger.js';

export async function setupBotHandlers(bot: Bot): Promise<void> {
  // Group /start — must be registered before registerMenuHandler so it fires first
  bot.command('start', async (ctx) => {
    if (ctx.chat?.type === 'private') return;
    try {
      const username = ctx.me?.username;
      const link = username ? `t.me/${username}` : 'הבוט';
      await ctx.reply(
        `הבוט פועל רק בצ׳אט פרטי. לחץ כאן להתחיל 👉 ${link}`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    } catch (err) {
      log('error', 'Bot', `Group /start reply failed: ${String(err)}`);
    }
  });

  registerMenuHandler(bot);
  registerZoneHandler(bot);
  registerSearchHandler(bot);
  registerSettingsHandler(bot);
  registerStatsHandler(bot);
  registerHistoryHandler(bot);

  bot.catch((err) => {
    log('error', 'Bot', `Unhandled error: ${String(err)}`);
  });

  await bot.api.setMyCommands([
    { command: 'start',    description: 'פתח את התפריט הראשי' },
    { command: 'add',      description: 'הוסף עיר להתראות' },
    { command: 'zones',    description: 'הוסף ערים לפי אזור' },
    { command: 'mycities', description: 'הערים שנרשמת אליהן' },
    { command: 'settings', description: 'הגדרות והעדפות' },
    { command: 'stats',    description: 'סטטיסטיקת 24 שעות אחרונות' },
    { command: 'history',  description: 'היסטוריית התראות לאזורך' },
  ]);
}
