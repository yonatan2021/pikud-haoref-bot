import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getUser, setQuietHours, setMutedUntil, isMuted, upsertUser } from '../db/userRepository.js';
import {
  removeSubscription,
  removeAllSubscriptions,
  getUserCities,
  getSubscriptionCount,
} from '../db/subscriptionRepository.js';
import { getCityData } from '../cityLookup.js';
import { escapeHtml } from '../telegramBot.js';
import { log } from '../logger.js';

const PAGE_SIZE = 15;

export function buildSettingsMenu(chatId: number): { text: string; keyboard: InlineKeyboard } {
  const user = getUser(chatId);
  const quietEnabled = user?.quiet_hours_enabled ?? false;
  const quietLabel = quietEnabled ? 'פעיל ✓' : 'כבוי';
  const muted = isMuted(chatId);

  const keyboard = new InlineKeyboard()
    .text(`🔕 שעות שקט: ${quietLabel}`, 'quiet:toggle')
    .row();

  if (muted) {
    keyboard.text('🔔 בטל השתקה', 'snooze:clear').row();
  } else {
    keyboard
      .text('🔇 השתק שעה', 'snooze:1h')
      .text('🔇 4 שעות', 'snooze:4h')
      .text('🔇 24 שעות', 'snooze:24h')
      .row();
  }

  keyboard
    .text('🔕 בטל כל המנויים', 'settings:clearall')
    .row()
    .text('↩️ חזור', 'menu:main');

  const muteNote = muted && user?.muted_until
    ? `\n\n🔇 <b>התראות מושתקות</b> עד ${new Date(user.muted_until).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  const text =
    '⚙️ <b>הגדרות</b>\n\n' +
    '📱 התראות ישלחו בפורמט אישי מותאם' +
    muteNote;

  return { text, keyboard };
}

export function buildMyCitiesPage(chatId: number, page: number): { text: string; keyboard: InlineKeyboard } {
  const cities = getUserCities(chatId);
  const totalPages = Math.max(1, Math.ceil(cities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = cities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  slice.forEach((cityName) => {
    const city = getCityData(cityName);
    const cityId = city?.id ?? 0;
    const zone = city?.zone;
    const label = zone
      ? `❌ ${escapeHtml(cityName)} · ${escapeHtml(zone)}`
      : `❌ ${escapeHtml(cityName)}`;
    keyboard.text(label, `rm:${cityId}:${safePage}`).row();
  });

  if (safePage > 0) keyboard.text('‹ הקודם', `mycities:${safePage - 1}`);
  if (totalPages > 1) keyboard.text(`${safePage + 1}/${totalPages}`, 'noop');
  if (safePage < totalPages - 1) keyboard.text('הבא ›', `mycities:${safePage + 1}`);
  if (totalPages > 1) keyboard.row();

  keyboard.text('↩️ חזור', 'menu:alerts');

  return {
    text: `📋 <b>הערים שלי</b> (${cities.length}):`,
    keyboard,
  };
}

export function registerSettingsHandler(bot: Bot): void {
  bot.command('settings', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
      const { text, keyboard } = buildSettingsMenu(chatId);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `/settings נכשל: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Settings', `כישלון בשליחת תשובת שגיאה: ${e}`)
      );
    }
  });

  bot.command('mycities', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
      const count = getSubscriptionCount(chatId);
      if (count === 0) {
        await ctx.reply('📋 אין ערים רשומות.', {
          reply_markup: new InlineKeyboard()
            .text('📍 הוסף לפי אזור', 'menu:zones')
            .text('↩️ תפריט', 'menu:main'),
        });
        return;
      }
      const { text, keyboard } = buildMyCitiesPage(chatId, 0);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `/mycities נכשל: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Settings', `כישלון בשליחת תשובת שגיאה: ${e}`)
      );
    }
  });

  bot.callbackQuery('menu:settings', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const { text, keyboard } = buildSettingsMenu(chatId);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `menu:settings נכשל: ${err}`);
    }
  });

  bot.callbackQuery('quiet:toggle', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const user = getUser(chatId);
      const current = user?.quiet_hours_enabled ?? false;
      setQuietHours(chatId, !current);
      const { text, keyboard } = buildSettingsMenu(chatId);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `quiet:toggle נכשל: ${err}`);
    }
  });

  bot.callbackQuery(/^snooze:(1h|4h|24h|clear)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const action = ctx.match![1];
      if (action === 'clear') {
        setMutedUntil(chatId, null);
      } else {
        const hours = action === '1h' ? 1 : action === '4h' ? 4 : 24;
        setMutedUntil(chatId, new Date(Date.now() + hours * 3_600_000));
      }
      const { text, keyboard } = buildSettingsMenu(chatId);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `snooze callback נכשל: ${err}`);
    }
  });

  bot.callbackQuery('settings:clearall', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const count = getSubscriptionCount(chatId);
      if (count === 0) {
        await ctx.editMessageText('אין מנויים פעילים.', {
          reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
        });
        return;
      }
      const keyboard = new InlineKeyboard()
        .text('✅ כן, בטל הכל', 'settings:clearall:ok')
        .text('❌ ביטול', 'menu:settings');
      await ctx.editMessageText(`⚠️ בטוח? תוסר מ-<b>${count} ערים</b>.`, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } catch (err) {
      log('error', 'Settings', `settings:clearall נכשל: ${err}`);
    }
  });

  bot.callbackQuery('settings:clearall:ok', async (ctx: Context) => {
    await ctx.answerCallbackQuery('✅ כל המנויים בוטלו');
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      removeAllSubscriptions(chatId);
      await ctx.editMessageText('✅ כל המנויים בוטלו.', {
        reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
      });
    } catch (err) {
      log('error', 'Settings', `settings:clearall:ok נכשל: ${err}`);
    }
  });

  bot.callbackQuery(/^mycities:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const page = parseInt(ctx.match![1]);
      const count = getSubscriptionCount(chatId);
      if (count === 0) {
        await ctx.editMessageText('📋 אין ערים רשומות.', {
          reply_markup: new InlineKeyboard()
            .text('📍 הוסף לפי אזור', 'menu:zones')
            .text('↩️ חזור', 'menu:alerts'),
        });
        return;
      }
      const { text, keyboard } = buildMyCitiesPage(chatId, page);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `mycities callback נכשל: ${err}`);
    }
  });

  bot.callbackQuery('noop', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
  });

  // rm:CITY_ID:PAGE — remove city by numeric ID, return to given page
  bot.callbackQuery(/^rm:(\d+):(\d+)$/, async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const cityId = parseInt(ctx.match![1]);
      const page = parseInt(ctx.match![2]);

      const { getCityById } = await import('../cityLookup.js');
      const city = getCityById(cityId);
      if (!city) {
        await ctx.answerCallbackQuery('עיר לא נמצאה');
        return;
      }
      removeSubscription(chatId, city.name);
      await ctx.answerCallbackQuery(`❌ הוסר: ${city.name}`);

      const remaining = getSubscriptionCount(chatId);
      if (remaining === 0) {
        await ctx.editMessageText('📋 אין ערים רשומות.', {
          reply_markup: new InlineKeyboard()
            .text('📍 הוסף לפי אזור', 'menu:zones')
            .text('↩️ חזור', 'menu:alerts'),
        });
        return;
      }
      const { text, keyboard } = buildMyCitiesPage(chatId, page);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Settings', `rm callback נכשל: ${err}`);
      await ctx.answerCallbackQuery().catch((e) =>
        log('error', 'Settings', `כישלון ב-answerCallbackQuery אחרי שגיאת rm: ${e}`)
      );
    }
  });
}
