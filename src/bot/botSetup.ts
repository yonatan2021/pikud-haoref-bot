import { Bot } from 'grammy';
import { registerMenuHandler } from './menuHandler.js';
import { registerZoneHandler } from './zoneHandler.js';
import { registerSearchHandler } from './searchHandler.js';
import { registerSettingsHandler } from './settingsHandler.js';

export async function setupBotHandlers(bot: Bot): Promise<void> {
  registerMenuHandler(bot);
  registerZoneHandler(bot);
  registerSearchHandler(bot);
  registerSettingsHandler(bot);

  bot.catch((err) => {
    console.error('[Bot] שגיאה לא מטופלת:', err);
  });

  await bot.api.setMyCommands([
    { command: 'start',    description: 'פתח את התפריט הראשי' },
    { command: 'add',      description: 'הוסף עיר להתראות' },
    { command: 'zones',    description: 'הוסף ערים לפי אזור' },
    { command: 'mycities', description: 'הערים שנרשמת אליהן' },
    { command: 'settings', description: 'הגדרות והעדפות' },
  ]);
}
