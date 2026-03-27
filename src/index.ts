import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot, editAlert } from './telegramBot';
import { getActiveMessage, trackMessage } from './alertWindowTracker';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb } from './db/schema';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers } from './services/dmDispatcher';
import { shouldSkipMap } from './alertHelpers';

const REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'];

function isUnmodifiedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('message is not modified');
}

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
  } catch (err) {
    console.error('[Init] Database init failed — bot cannot start:', err);
    process.exit(1);
  }

  const bot = getBot();
  await setupBotHandlers(bot);

  const poller = new AlertPoller();

  poller.on('newAlert', async (alert: Alert) => {
    const chatId = process.env.TELEGRAM_CHAT_ID!;
    const skipMap = shouldSkipMap(alert.type);
    const topicId = getTopicId(alert.type);

    // Channel broadcast
    try {
      const active = getActiveMessage(alert.type);

      if (active) {
        const mergedAlert: Alert = {
          ...active.alert,
          cities: Array.from(new Set([...active.alert.cities, ...alert.cities])),
          instructions: alert.instructions ?? active.alert.instructions,
        };
        const imageBuffer = skipMap ? null : await generateMapImage(mergedAlert);

        let editHandled = false;
        try {
          await editAlert(active, mergedAlert, imageBuffer);
          trackMessage(alert.type, { ...active, alert: mergedAlert });
          editHandled = true;
        } catch (editErr) {
          if (isUnmodifiedError(editErr)) {
            // Telegram 400 "message is not modified" — content already up-to-date, treat as success
            trackMessage(alert.type, { ...active, alert: mergedAlert });
            editHandled = true;
          }
        }
        if (!editHandled) {
          console.warn('[Index] Edit failed — sending new message:');
          try {
            const sent = await sendAlert(mergedAlert, imageBuffer, topicId);
            trackMessage(alert.type, {
              messageId: sent.messageId,
              chatId,
              topicId,
              alert: mergedAlert,
              sentAt: Date.now(),
              hasPhoto: sent.hasPhoto,
            });
          } catch (sendErr) {
            throw new Error(
              `[Index] Sending new message failed. sendErr: ${sendErr}`
            );
          }
        }
      } else {
        const imageBuffer = skipMap ? null : await generateMapImage(alert);
        const sent = await sendAlert(alert, imageBuffer, topicId);
        trackMessage(alert.type, {
          messageId: sent.messageId,
          chatId,
          topicId,
          alert,
          sentAt: Date.now(),
          hasPhoto: sent.hasPhoto,
        });
      }
    } catch (err) {
      console.error('[Index] Error handling alert:', err);
    }

    // DM notifications (unchanged)
    try {
      await notifySubscribers(alert);
    } catch (err) {
      console.error('[Index] Error sending DMs:', err);
    }
  });

  poller.start(2000);
  console.log('🤖 Pikud HaOref bot v0.1.3 active — polling every 2 seconds');

  bot.start().catch((err) => {
    console.error('[Bot] Bot startup error:', err);
    process.exit(1);
  });
})();
