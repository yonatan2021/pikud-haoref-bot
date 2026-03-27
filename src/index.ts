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
import { isDrillAlert, shouldSkipMap } from './alertHelpers';

const REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'];

function isUnmodifiedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('message is not modified');
}

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`[Error] משתנה סביבה חסר: ${envVar}`);
    console.error('העתק את env.example לקובץ .env ומלא את הערכים הנדרשים');
    process.exit(1);
  }
}

(async () => {
  try {
    initDb();
  } catch (err) {
    console.error('[Init] שגיאה באתחול מסד הנתונים — הבוט לא יכול לפעול:', err);
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

        try {
          await editAlert(active, mergedAlert, imageBuffer);
          trackMessage(alert.type, { ...active, alert: mergedAlert });
        } catch (editErr) {
          if (isUnmodifiedError(editErr)) {
            // Telegram 400 "message is not modified" — content already up-to-date, treat as success
            trackMessage(alert.type, { ...active, alert: mergedAlert });
            return;
          }
          console.warn('[Index] עריכת הודעה נכשלה — שולח הודעה חדשה:', editErr);
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
              `[Index] גם עריכה וגם שליחת הודעה חדשה נכשלו. editErr: ${editErr}. sendErr: ${sendErr}`
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
      console.error('[Index] שגיאה בטיפול בהתרעה:', err);
    }

    // DM notifications (unchanged)
    try {
      await notifySubscribers(alert);
    } catch (err) {
      console.error('[Index] שגיאה בשליחת DMs:', err);
    }
  });

  poller.start(2000);
  console.log('🤖 בוט פיקוד העורף פעיל — סוקר כל 2 שניות');

  bot.start().catch((err) => {
    console.error('[Bot] שגיאה בהפעלת הבוט:', err);
    process.exit(1);
  });
})();
