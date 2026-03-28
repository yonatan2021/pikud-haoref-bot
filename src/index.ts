import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot, editAlert } from './telegramBot';
import { getActiveMessage, trackMessage, loadActiveMessages } from './alertWindowTracker';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb } from './db/schema';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers } from './services/dmDispatcher';
import { shouldSkipMap } from './alertHelpers';
import { handleNewAlert } from './alertHandler';
import { insertAlert as insertAlertHistory } from './db/alertHistoryRepository.js';

const REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`[Error] Missing env var: ${envVar}`);
    console.error('Copy env.example to .env and fill in the required values');
    process.exit(1);
  }
}

(async () => {
  try {
    initDb();
    loadActiveMessages();
  } catch (err) {
    console.error('[Init] Database init failed — bot cannot start:', err);
    process.exit(1);
  }

  const bot = getBot();
  await setupBotHandlers(bot);

  const poller = new AlertPoller();

  poller.on('newAlert', async (alert: Alert) => {
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
  console.log('🤖 Pikud HaOref bot v0.1.3 active — polling every 2 seconds');

  bot.start().catch((err) => {
    console.error('[Bot] Bot startup error:', err);
    process.exit(1);
  });
})();
