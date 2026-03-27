import 'dotenv/config';
import { AlertPoller } from './alertPoller';
import { generateMapImage } from './mapService';
import { sendAlert, getBot } from './telegramBot';
import { getTopicId } from './topicRouter';
import { Alert } from './types';
import { initDb } from './db/schema';
import { setupBotHandlers } from './bot/botSetup';
import { notifySubscribers } from './services/dmDispatcher';

const REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`[Error] משתנה סביבה חסר: ${envVar}`);
    console.error('העתק את env.example לקובץ .env ומלא את הערכים הנדרשים');
    process.exit(1);
  }
}

(async () => {
  initDb();

  const bot = getBot();
  await setupBotHandlers(bot);

  const poller = new AlertPoller();

  poller.on('newAlert', async (alert: Alert) => {
    try {
      const imageBuffer = await generateMapImage(alert);
      const topicId = getTopicId(alert.type);
      await sendAlert(alert, imageBuffer, topicId);
    } catch (err) {
      console.error('[Index] שגיאה בטיפול בהתרעה:', err);
    }

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
