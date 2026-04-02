import { Bot } from 'grammy';
import { registerOnboardingHandler } from './onboardingHandler.js';
import { registerProfileHandler } from './profileHandler.js';
import { registerMenuHandler } from './menuHandler.js';
import { registerZoneHandler } from './zoneHandler.js';
import { registerSearchHandler } from './searchHandler.js';
import { registerSettingsHandler } from './settingsHandler.js';
import { registerStatsHandler } from './statsHandler.js';
import { registerHistoryHandler } from './historyHandler.js';
import { registerConnectHandler } from './connectHandler.js';
import { registerPrivacyHandler } from './privacyHandler.js';
import { registerTodayHandler } from './todayHandler.js';
import { log } from '../logger.js';

export async function setupBotHandlers(bot: Bot): Promise<void> {
  // Onboarding text handler must be registered BEFORE other text handlers
  registerOnboardingHandler(bot);
  registerProfileHandler(bot);
  registerMenuHandler(bot);
  registerZoneHandler(bot);
  registerSearchHandler(bot);
  registerSettingsHandler(bot);
  registerStatsHandler(bot);
  registerHistoryHandler(bot);
  registerConnectHandler(bot);
  registerPrivacyHandler(bot);
  registerTodayHandler(bot);

  bot.catch((err) => {
    log('error', 'Bot', `Unhandled error: ${String(err)}`);
  });

  await bot.api.setMyCommands([
    { command: 'start',    description: 'פתח את התפריט הראשי' },
    { command: 'profile',  description: 'הפרופיל שלי' },
    { command: 'add',      description: 'הוסף עיר להתראות' },
    { command: 'zones',    description: 'הוסף ערים לפי אזור' },
    { command: 'mycities', description: 'הערים שנרשמת אליהן' },
    { command: 'settings', description: 'הגדרות והעדפות' },
    { command: 'stats',    description: 'סטטיסטיקת 24 שעות אחרונות' },
    { command: 'history',  description: 'היסטוריית התראות לאזורך' },
    { command: 'connect',  description: 'חיבור עם חברים' },
    { command: 'contacts', description: 'אנשי הקשר שלי' },
    { command: 'privacy',  description: 'הגדרות פרטיות' },
    { command: 'today',    description: 'סיכום יומי' },
  ]);
}
