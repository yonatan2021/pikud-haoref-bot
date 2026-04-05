import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot, editAlert } from './telegramBot';
import { getActiveMessage, trackMessage, loadActiveMessages } from './alertWindowTracker';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb, closeDb } from './db/schema';
import { initializeCache } from './mapService';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers, shouldSkipForQuietHours } from './services/dmDispatcher';
import { dmQueue } from './services/dmQueue.js';
import { shouldSkipMap } from './alertHelpers';
import { handleNewAlert } from './alertHandler';
import { insertAlert as insertAlertHistory, countAlertsToday, getDailyCountsForMonth } from './db/alertHistoryRepository.js';
import { startHealthServer } from './healthServer.js';
import { updateLastAlertAt } from './metrics.js';
import { startDashboardServer } from './dashboard/server.js';
import { getDb } from './db/schema.js';
import { log, logStartupHeader, logSectionDivider } from './logger.js';
import { toVisualRtl } from './loggerUtils.js';
import { loadTemplateCache } from './config/templateCache.js';
import { loadRoutingCache } from './config/routingCache.js';
import { setMenuHandlerDb } from './bot/menuHandler.js';
import { initialize as initWhatsApp, disconnect as disconnectWhatsApp, setMessageCallback } from './whatsapp/whatsappService.js';
import { createBroadcaster } from './whatsapp/whatsappBroadcaster.js';
import { createMessageHandler } from './whatsapp/whatsappListenerService.js';
import { initializeTelegramListener } from './telegram-listener/telegramListenerService.js';
import { disconnect as disconnectTelegramListener } from './telegram-listener/telegramListenerClient.js';
import { InputFile } from 'grammy';
import { initSubscriptionCache, getUserIdsByZone, getUsersByHomeCityInCities } from './db/subscriptionRepository.js';
import { initUsageCache } from './db/mapboxUsageRepository.js';
import { createAllClearTracker } from './services/allClearTracker.js';
import { createAllClearService } from './services/allClearService.js';
import { renderAllClearTemplate } from './telegramBot.js';
import { getCityData } from './cityLookup.js';
import { initAlertSerial, getNextAlertSerial } from './config/alertSerial.js';
import { getDensityLabel } from './config/alertDensity.js';
import { pruneExpiredContacts } from './db/contactRepository.js';

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
    initSubscriptionCache();
    initUsageCache();
    initializeCache();
    loadActiveMessages();
    loadTemplateCache();
    loadRoutingCache(getDb());
    setMenuHandlerDb(getDb());
    alertsToday = countAlertsToday();
    initAlertSerial(alertsToday);
  } catch (err) {
    log('error', 'Init', `כישלון אתחול מסד נתונים — הבוט לא יכול להתחיל: ${err}`);
    process.exit(1);
  }

  try {
    initWhatsApp();
  } catch (err) {
    log('warn', 'Init', `WhatsApp אתחול נכשל — ממשיך ללא WhatsApp: ${err}`);
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

  if (process.env.TELEGRAM_LISTENER_ENABLED === 'true') {
    for (const key of ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH']) {
      if (!process.env[key]) throw new Error(`${key} is required when TELEGRAM_LISTENER_ENABLED=true`);
    }
  }

  try {
    if (process.env.TELEGRAM_LISTENER_ENABLED === 'true') {
      await initializeTelegramListener(getDb(), bot);
    }
  } catch (err) {
    log('warn', 'Init', `Telegram Listener אתחול נכשל — ממשיך ללא: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }

  // Wire WhatsApp→Telegram listener. setMessageCallback is safe to call even when
  // WHATSAPP_ENABLED=false — the callback is stored but the message event never fires.
  const sendMediaToTelegram = async (
    chatId: string,
    buffer: Buffer,
    mimetype: string,
    caption: string,
    threadId?: number
  ): Promise<void> => {
    const threadOpts = threadId != null ? { message_thread_id: threadId } : {};
    if (mimetype.startsWith('image/')) {
      await bot.api.sendPhoto(chatId, new InputFile(buffer, 'media.jpg'), {
        caption,
        parse_mode: 'HTML',
        ...threadOpts,
      });
    } else if (mimetype.startsWith('video/')) {
      await bot.api.sendVideo(chatId, new InputFile(buffer, 'media.mp4'), {
        caption,
        parse_mode: 'HTML',
        ...threadOpts,
      });
    } else {
      await bot.api.sendDocument(chatId, new InputFile(buffer, 'media'), {
        caption,
        parse_mode: 'HTML',
        ...threadOpts,
      });
    }
  };

  setMessageCallback(
    createMessageHandler(getDb(), async (chatId, text, threadId) => {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(threadId != null ? { message_thread_id: threadId } : {}),
      });
    }, sendMediaToTelegram)
  );

  const dashboardHttpServer = dashboardSecret
    ? startDashboardServer(getDb(), bot, dashboardPort, dashboardSecret)
    : null;

  const poller = new AlertPoller();
  const broadcastToWhatsApp = process.env.WHATSAPP_ENABLED === 'true'
    ? createBroadcaster(getDb())
    : undefined;

  const allClearService = createAllClearService({
    db: getDb(),
    chatId: process.env.TELEGRAM_CHAT_ID!,
    sendTelegram: async (chatId, topicId, text) => {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(topicId != null ? { message_thread_id: topicId } : {}),
      });
    },
    getUserIdsByZone,
    getUsersByHomeCityInCities,
    shouldSkipForQuietHours,
    sendDm: async (userId, text) => {
      dmQueue.enqueueAll([{ chatId: String(userId), text }]);
    },
    renderTemplate: renderAllClearTemplate,
  });

  const allClearTracker = createAllClearTracker({
    getCityZone: (city) => getCityData(city)?.zone,
    onAllClear: (events) => {
      allClearService.handleAllClear(events).catch(err =>
        log('error', 'Index', `handleAllClear נכשל: ${String(err)}`)
      );
    },
  });

  // Graceful shutdown — stop accepting work, drain in-flight, close storage
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // Force exit after 10s if cleanup hangs (e.g. stuck WA or bot.stop())
    const forceTimer = setTimeout(() => {
      log('warn', 'Init', 'Shutdown timeout — יוצא בכוח');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    log('info', 'Init', `${signal} — מבצע כיבוי מסודר...`);
    clearInterval(contactCleanupInterval);
    allClearTracker.clearAll();
    poller.stop();
    try { await bot.stop(); } catch { /* ignore */ }
    healthServer.close();
    if (dashboardHttpServer) { dashboardHttpServer.close(); }
    if (process.env.WHATSAPP_ENABLED === 'true') {
      try { await disconnectWhatsApp(); } catch { /* ignore */ }
    }
    if (process.env.TELEGRAM_LISTENER_ENABLED === 'true') {
      try { await disconnectTelegramListener(getDb()); } catch { /* ignore */ }
    }
    try { closeDb(); } catch { /* ignore */ }
    process.exit(0);
  }
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT',  () => { void shutdown('SIGINT');  });

  poller.on('newAlert', async (alert: Alert) => {
    updateLastAlertAt();
    const chatId = process.env.TELEGRAM_CHAT_ID!;

    // Extract unique zones from the alert cities for all-clear tracking
    const alertZones = [...new Set(
      alert.cities
        .map((city) => getCityData(city)?.zone)
        .filter((z): z is string => z != null)
    )];

    // Official "האירוע הסתיים" newsFlash cancels the pending timer — no double notification.
    const isOfficialAllClear =
      alert.type === 'newsFlash' &&
      (alert.instructions ?? '').includes('האירוע הסתיים');

    if (alertZones.length > 0) {
      if (isOfficialAllClear) {
        allClearTracker.cancelAlert(alertZones);
      } else {
        allClearTracker.recordAlert(alertZones, alert.type, alert.cities);
      }
    }

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
      broadcastToWhatsApp,
      getNextSerial: getNextAlertSerial,
      getDensityHint: () => getDensityLabel(countAlertsToday(), getDailyCountsForMonth()),
    });
  });

  poller.start(2000);

  // Prune expired pending contact requests every 6 hours
  const CONTACT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const contactCleanupInterval = setInterval(() => {
    const pruned = pruneExpiredContacts();
    if (pruned > 0) {
      log('info', 'Cleanup', `הוסרו ${pruned} בקשות קשר שפגו`);
    }
  }, CONTACT_CLEANUP_INTERVAL_MS);

  logStartupHeader('0.4.4', [
    { name: 'Health Server', detail: healthOk ? toVisualRtl(`פורט ${resolvedHealthPort}`) : toVisualRtl('נכשל בהפעלה'), ok: healthOk, url: healthOk ? `http://localhost:${resolvedHealthPort}/health` : undefined },
    { name: 'Alert Poller',  detail: toVisualRtl('כל 2 שניות'),                                                ok: true },
    { name: 'Dashboard',     detail: dashboardSecret ? toVisualRtl(`פורט ${dashboardPort}`) : toVisualRtl('כבוי (אין DASHBOARD_SECRET)'), ok: !!dashboardSecret, url: dashboardSecret ? `http://localhost:${dashboardPort}/dashboard` : undefined },
    { name: 'Database',      detail: toVisualRtl('מאותחל'),                                                ok: true },
    { name: 'WhatsApp',      detail: toVisualRtl(process.env.WHATSAPP_ENABLED === 'true' ? 'מופעל' : 'כבוי'), ok: process.env.WHATSAPP_ENABLED === 'true' },
    { name: 'TG Listener',  detail: toVisualRtl(process.env.TELEGRAM_LISTENER_ENABLED === 'true' ? 'מופעל' : 'כבוי'), ok: process.env.TELEGRAM_LISTENER_ENABLED === 'true' },
  ], alertsToday);

  logSectionDivider();

  bot.start().catch((err) => {
    log('error', 'Bot', `שגיאה בהפעלת הבוט: ${err}`);
    process.exit(1);
  });
})();
