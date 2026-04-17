import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot, editAlert, setCityLimitProvider } from './telegramBot';
import { getActiveMessage, trackMessage, loadActiveMessages, setWindowCloseCallback, clearAllCloseTimers } from './alertWindowTracker';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb, closeDb } from './db/schema';
import { initializeCache, setMapboxToken } from './mapService';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers, shouldSkipForQuietHours } from './services/dmDispatcher';
import { dmQueue } from './services/dmQueue.js';
import { shouldSkipMap } from './alertHelpers';
import { dispatchSafetyPrompts } from './services/safetyPromptService';
import { setSafetyStatusHandlerDeps } from './bot/safetyStatusHandler';
import { handleNewAlert } from './alertHandler';
import { createShutdown } from './shutdown.js';
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
import { initSubscriptionCache, getUsersByHomeCityInCities } from './db/subscriptionRepository.js';
import { initUsageCache } from './db/mapboxUsageRepository.js';
import { createAllClearTracker } from './services/allClearTracker.js';
import { createAllClearService } from './services/allClearService.js';
import { renderAllClearTemplate } from './telegramBot.js';
import { getCityData } from './cityLookup.js';
import { initAlertSerial, getNextAlertSerial } from './config/alertSerial.js';
import { getDensityLabel } from './config/alertDensity.js';
import { pruneExpiredContacts } from './db/contactRepository.js';
import { pruneExpiredSafetyStatuses } from './db/safetyStatusRepository.js';
import { pruneOldPrompts } from './db/safetyPromptRepository.js';
import { fireCommunityPulse } from './services/communityPulseService.js';
import { scheduleNeighborCheck, cancelAll as cancelNeighborCheckAll } from './services/neighborCheckService.js';
import { setNeighborCheckHandlerDb } from './bot/neighborCheckHandler.js';
import { initCrypto } from './dashboard/crypto.js';
import { getSetting, setSetting } from './dashboard/settingsRepository.js';
import { resolveConfig, resolveRequiredConfigs, ConfigMissingError, SECRET_KEYS, envKeyFor, getNumber, getBool } from './config/configResolver.js';
import { isCryptoReady } from './dashboard/crypto.js';
import { getPrimaryLocalIPv4Address } from './localNetwork.js';

// Prevent broken-pipe errors from crashing the bot when a stdout consumer exits.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err;
});

// DASHBOARD_SECRET is the only hard-required env var (bootstrap: encryption + auth).
// All other config is resolved from DB → env fallback after initDb().
const dashboardSecretBoot = process.env.DASHBOARD_SECRET;

function buildLocalDashboardUrl(port: number, localIp: string | null): string {
  const host = localIp ?? 'localhost';
  return `http://${host}:${port}/dashboard`;
}

function buildLocalHealthUrl(port: number, localIp: string | null): string {
  const host = localIp ?? 'localhost';
  return `http://${host}:${port}/health`;
}

/**
 * One-time migration: copies secrets from .env to encrypted DB storage.
 * Only migrates keys that: (1) exist in env, (2) don't exist in DB, (3) weren't
 * intentionally deleted via the dashboard (_deleted_secrets tracking).
 */
function autoMigrateEnvSecrets(db: ReturnType<typeof getDb>): void {
  try {
    const deletedRaw = getSetting(db, '_deleted_secrets');
    const deletedKeys: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
    let migrated = 0;

    for (const key of SECRET_KEYS) {
      const envName = envKeyFor(key);
      const envValue = process.env[envName];
      if (!envValue) continue;

      const existing = getSetting(db, key);
      if (existing !== null) continue;

      if (deletedKeys.includes(key)) continue;

      setSetting(db, key, envValue);
      migrated++;
      log('info', 'Migration', `${key} הועבר מ-.env למסד הנתונים (מוצפן)`);
    }

    if (migrated > 0) {
      log('success', 'Migration', `${migrated} סודות הועברו מ-.env למסד הנתונים`);
    }
  } catch (err) {
    log('warn', 'Migration', `מיגרציה אוטומטית נכשלה — ממשיך עם ערכי env: ${err}`);
  }
}

(async () => {
  let alertsToday = 0;
  let resolvedConfig: Record<string, string>;
  try {
    initDb();

    // Init crypto (envelope encryption for secrets in DB)
    if (dashboardSecretBoot) {
      initCrypto(getDb(), dashboardSecretBoot);
    }

    // Auto-migrate secrets from env to encrypted DB (first run / upgrade path)
    if (isCryptoReady()) {
      autoMigrateEnvSecrets(getDb());
    }

    // Resolve all required config from DB → env fallback
    resolvedConfig = resolveRequiredConfigs(getDb(), [
      'telegram_bot_token',
      'telegram_chat_id',
      'mapbox_access_token',
    ]);

    // Inject resolved Mapbox token into mapService module cache
    setMapboxToken(resolvedConfig['mapbox_access_token']);

    initSubscriptionCache();
    initUsageCache();
    initializeCache();
    loadActiveMessages();
    loadTemplateCache();
    loadRoutingCache(getDb());
    // Hot-configurable DM queue concurrency — read per drain() decision.
    dmQueue.setConcurrencyProvider(() => getNumber(getDb(), 'dm_queue_concurrency', 10));
    setCityLimitProvider(() => getNumber(getDb(), 'map_city_display_limit', 25));
    setMenuHandlerDb(getDb());
    setSafetyStatusHandlerDeps(getDb());
    setNeighborCheckHandlerDb(getDb());
    alertsToday = countAlertsToday();
    initAlertSerial(alertsToday);
  } catch (err) {
    if (err instanceof ConfigMissingError) {
      log('error', 'Init', err.message);
      process.exit(1);
    }
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

  const dashboardSecret = dashboardSecretBoot;
  const rawDashboardPort = parseInt(process.env.DASHBOARD_PORT ?? '4000', 10);
  const dashboardPort = Number.isFinite(rawDashboardPort) && rawDashboardPort > 0 ? rawDashboardPort : 4000;
  const localIp = getPrimaryLocalIPv4Address();
  const dashboardUrl = buildLocalDashboardUrl(dashboardPort, localIp);
  const healthUrl = buildLocalHealthUrl(resolvedHealthPort, localIp);

  const bot = getBot(resolvedConfig['telegram_bot_token']);
  await setupBotHandlers(bot);

  // Wire community pulse: fires when an alert window expires (lazy expiry in getActiveMessage).
  // MUST NOT fire in loadActiveMessages() — stale startup pruning must not trigger pulses.
  setWindowCloseCallback((alertType, tracked) => {
    fireCommunityPulse(getDb(), bot, alertType, tracked).catch((err) =>
      log('error', 'CommunityPulse', `fireCommunityPulse error: ${String(err)}`)
    );
  });

  const tgListenerEnabled = resolveConfig(getDb(), 'telegram_listener_enabled') === 'true'
    || process.env.TELEGRAM_LISTENER_ENABLED === 'true';

  if (tgListenerEnabled) {
    const tgApiId = resolveConfig(getDb(), 'telegram_api_id') ?? process.env['TELEGRAM_API_ID'];
    const tgApiHash = resolveConfig(getDb(), 'telegram_api_hash') ?? process.env['TELEGRAM_API_HASH'];
    if (!tgApiId || !tgApiHash) {
      throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH are required when Telegram Listener is enabled');
    }
    // Inject credentials so telegramListenerClient uses them instead of process.env
    const { setApiCredentials } = await import('./telegram-listener/telegramListenerClient.js');
    setApiCredentials(tgApiId, tgApiHash);
  }

  try {
    if (tgListenerEnabled) {
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
    chatId: resolvedConfig['telegram_chat_id'],
    sendTelegram: async (chatId, topicId, text) => {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(topicId != null ? { message_thread_id: topicId } : {}),
      });
    },
    getUsersByHomeCityInCities,
    shouldSkipForQuietHours,
    sendDm: async (userId, text) => {
      dmQueue.enqueueAll([{ chatId: String(userId), text }]);
    },
    renderTemplate: renderAllClearTemplate,
    bot,   // enables stale safety-prompt cleanup on all-clear
  });

  const allClearTracker = createAllClearTracker({
    getCityZone: (city) => getCityData(city)?.zone,
    // Read on every recordAlert() so dashboard edits to
    // `all_clear_quiet_window_seconds` take effect without restart.
    getQuietWindowMs: () => getNumber(getDb(), 'all_clear_quiet_window_seconds', 600) * 1000,
    onAllClear: (events) => {
      allClearService.handleAllClear(events).catch(err =>
        log('error', 'Index', `handleAllClear נכשל: ${String(err)}`)
      );
    },
  });

  // (Graceful shutdown wiring is registered AFTER the interval handles
  //  declared further down, so the shutdown function captures real values
  //  rather than uninitialised bindings — see lines after the
  //  safetyPruneInterval declaration below.)

  poller.on('newAlert', async (alert: Alert) => {
    updateLastAlertAt();
    const chatId = resolvedConfig['telegram_chat_id'];

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
      shouldSkipMap: (alertType, instructions) =>
        shouldSkipMap(alertType, instructions, () => getBool(getDb(), 'mapbox_skip_drills', false)),
      getTopicId,
      insertAlertHistory,
      broadcastToWhatsApp,
      dispatchSafetyPrompts: (alert) => dispatchSafetyPrompts(getDb(), alert, bot),
      scheduleNeighborCheck: (alert) => scheduleNeighborCheck(getDb(), bot, alert),
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

  // Prune expired safety statuses + old safety prompts every 6 hours
  const safetyPruneInterval = setInterval(() => {
    const statusCount = pruneExpiredSafetyStatuses(getDb());
    const promptCount = pruneOldPrompts(getDb());
    if (statusCount > 0 || promptCount > 0) {
      log('info', 'SAFETY', `נוקו ${statusCount} סטטוסים ו-${promptCount} פרומפטים ישנים`);
    }
  }, 6 * 60 * 60 * 1000);

  // Graceful shutdown — stop accepting work, drain in-flight, close storage.
  // Wired AFTER both interval handles are declared so the createShutdown
  // call captures real values, not uninitialised bindings. The actual
  // step sequence lives in src/shutdown.ts and is unit-tested in
  // src/__tests__/shutdown.test.ts. Step order is load-bearing — see the
  // saved memory pattern_graceful_shutdown.md.
  const shutdown = createShutdown({
    contactCleanupInterval,
    safetyPruneInterval,
    allClearTracker,
    poller,
    bot,
    healthServer,
    dashboardHttpServer,
    whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true',
    disconnectWhatsApp,
    tgListenerEnabled,
    disconnectTelegramListener: () => disconnectTelegramListener(getDb()),
    closeDb,
    clearAlertWindowTimers: clearAllCloseTimers,
    cancelNeighborCheckTimers: cancelNeighborCheckAll,
  });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT',  () => { void shutdown('SIGINT');  });

  logStartupHeader('0.5.0', [
    { name: 'Health Server', detail: healthOk ? toVisualRtl(`פורט ${resolvedHealthPort}`) : toVisualRtl('נכשל בהפעלה'), ok: healthOk, url: healthOk ? healthUrl : undefined },
    { name: 'Alert Poller',  detail: toVisualRtl('כל 2 שניות'),                                                ok: true },
    { name: 'Dashboard',     detail: dashboardSecret ? toVisualRtl(`פורט ${dashboardPort}`) : toVisualRtl('כבוי (אין DASHBOARD_SECRET)'), ok: !!dashboardSecret, url: dashboardSecret ? dashboardUrl : undefined },
    { name: 'Database',      detail: toVisualRtl('מאותחל'),                                                ok: true },
    { name: 'WhatsApp',      detail: toVisualRtl(process.env.WHATSAPP_ENABLED === 'true' ? 'מופעל' : 'כבוי'), ok: process.env.WHATSAPP_ENABLED === 'true' },
    { name: 'TG Listener',  detail: toVisualRtl(tgListenerEnabled ? 'מופעל' : 'כבוי'), ok: tgListenerEnabled },
  ], alertsToday);

  logSectionDivider();

  bot.start().catch((err) => {
    log('error', 'Bot', `שגיאה בהפעלת הבוט: ${err}`);
    process.exit(1);
  });
})();
