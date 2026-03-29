import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot, editAlert } from './telegramBot';
import { getActiveMessage, trackMessage, loadActiveMessages } from './alertWindowTracker';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb } from './db/schema';
import { initializeCache } from './mapService';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers } from './services/dmDispatcher';
import { shouldSkipMap } from './alertHelpers';
import { handleNewAlert } from './alertHandler';
import { insertAlert as insertAlertHistory, countAlertsToday } from './db/alertHistoryRepository.js';
import { startHealthServer } from './healthServer.js';
import { updateLastAlertAt } from './metrics.js';
import { startDashboardServer } from './dashboard/server.js';
import { getDb } from './db/schema.js';
import { log, logStartupHeader, logSectionDivider } from './logger.js';
import { toVisualRtl } from './loggerUtils.js';

// Prevent broken-pipe errors from crashing the bot when a stdout consumer exits.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err;
});

const REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    log('error', 'Init', `חסר משתנה סביבה: ${envVar}`);
    log('error', 'Init', 'העתק env.example ל-.env ומלא את הערכים הנדרשים');
    process.exit(1);
  }
}

(async () => {
  let alertsToday = 0;
  try {
    initDb();
    initializeCache();
    loadActiveMessages();
    alertsToday = countAlertsToday();
  } catch (err) {
    log('error', 'Init', `כישלון אתחול מסד נתונים — הבוט לא יכול להתחיל: ${err}`);
    process.exit(1);
  }

  const rawHealthPort = parseInt(process.env.HEALTH_PORT ?? '3000', 10);
  const resolvedHealthPort = isNaN(rawHealthPort) ? 3000 : rawHealthPort;
  if (process.env.HEALTH_PORT && isNaN(rawHealthPort)) {
    log('warn', 'Init', 'HEALTH_PORT אינו מספר תקין — חוזר לפורט 3000');
  }
  const healthServer = startHealthServer(resolvedHealthPort);
  // Wait for actual bind result before printing the startup header.
  const healthOk = await new Promise<boolean>((resolve) => {
    healthServer.once('listening', () => resolve(true));
    healthServer.once('error', () => resolve(false));
  });

  const dashboardSecret = process.env.DASHBOARD_SECRET;
  const rawDashboardPort = parseInt(process.env.DASHBOARD_PORT ?? '4000', 10);
  const dashboardPort = Number.isFinite(rawDashboardPort) && rawDashboardPort > 0 ? rawDashboardPort : 4000;

  const bot = getBot();
  await setupBotHandlers(bot);

  if (dashboardSecret) {
    startDashboardServer(getDb(), bot, dashboardPort, dashboardSecret);
  }

  const poller = new AlertPoller();

  poller.on('newAlert', async (alert: Alert) => {
    updateLastAlertAt();
    const chatId = process.env.TELEGRAM_CHAT_ID!;
    await handleNewAlert(alert, {
      chatId,
      generateMapImage,
      sendAlert,
      editAlert,
      getActiveMessage,
      trackMessage,
      notifySubscribers,
      shouldSkipMap,
      getTopicId,
      insertAlertHistory,
    });
  });

  poller.start(2000);

  logStartupHeader('0.2.1', [
    { name: 'Health Server', detail: healthOk ? toVisualRtl(`פורט ${resolvedHealthPort}`) : toVisualRtl('נכשל בהפעלה'), ok: healthOk, url: healthOk ? `http://localhost:${resolvedHealthPort}` : undefined },
    { name: 'Alert Poller',  detail: toVisualRtl('כל 2 שניות'),                                                ok: true },
    { name: 'Dashboard',     detail: dashboardSecret ? toVisualRtl(`פורט ${dashboardPort}`) : toVisualRtl('כבוי (אין DASHBOARD_SECRET)'), ok: !!dashboardSecret, url: dashboardSecret ? `http://localhost:${dashboardPort}` : undefined },
    { name: 'Database',      detail: toVisualRtl('מאותחל'),                                                ok: true },
  ], alertsToday);

  logSectionDivider();

  bot.start().catch((err) => {
    log('error', 'Bot', `שגיאה בהפעלת הבוט: ${err}`);
    process.exit(1);
  });
})();
