import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getUser, setFormat, setQuietHours, upsertUser } from '../db/userRepository.js';
import {
  removeSubscription,
  removeAllSubscriptions,
  getUserCities,
  getSubscriptionCount,
} from '../db/subscriptionRepository.js';
import { getCityData } from '../cityLookup.js';
import { escapeHtml } from '../telegramBot.js';

const PAGE_SIZE = 15;

function buildSettingsMenu(chatId: number): { text: string; keyboard: InlineKeyboard } {
  const user = getUser(chatId);
  const format = user?.format ?? 'short';
  const shortMark = format === 'short' ? '●' : '○';
  const detailMark = format === 'detailed' ? '●' : '○';
  const quietEnabled = (user?.quiet_hours_enabled ?? 0) === 1;
  const quietLabel = quietEnabled ? 'פעיל ✓' : 'כבוי';

  const keyboard = new InlineKeyboard()
    .text(`${shortMark} קצר`, 'fmt:short')
    .text(`${detailMark} מפורט`, 'fmt:detailed')
    .row()
    .text(`🔕 שעות שקט: ${quietLabel}`, 'quiet:toggle')
    .row()
    .text('🔕 בטל כל המנויים', 'settings:clearall')
    .row()
    .text('↩️ חזור', 'menu:main');

  const text =
    '⚙️ <b>הגדרות</b>\n\n' +
    '<b>פורמט התראות:</b>\n' +
    '• קצר — "🔴 טילים | תל אביב, רמת גן"\n' +
    '• מפורט — אותה הודעה כמו בערוץ (ללא תמונה)';

  return { text, keyboard };
}

function buildMyCitiesPage(chatId: number, page: number): { text: string; keyboard: InlineKeyboard } {
  const cities = getUserCities(chatId);
  const totalPages = Math.max(1, Math.ceil(cities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = cities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  slice.forEach((cityName) => {
    const city = getCityData(cityName);
    const cityId = city?.id ?? 0;
    keyboard.text(`❌ ${escapeHtml(cityName)}`, `rm:${cityId}:${safePage}`).row();
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
    upsertUser(chatId);
    const { text, keyboard } = buildSettingsMenu(chatId);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.command('mycities', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
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
  });

  bot.callbackQuery('menu:settings', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const { text, keyboard } = buildSettingsMenu(chatId);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^fmt:(short|detailed)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const format = ctx.match![1] as 'short' | 'detailed';
    setFormat(chatId, format);
    const { text, keyboard } = buildSettingsMenu(chatId);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('quiet:toggle', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const user = getUser(chatId);
    const current = (user?.quiet_hours_enabled ?? 0) === 1;
    setQuietHours(chatId, !current);
    const { text, keyboard } = buildSettingsMenu(chatId);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('settings:clearall', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
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
  });

  bot.callbackQuery('settings:clearall:ok', async (ctx: Context) => {
    await ctx.answerCallbackQuery('✅ כל המנויים בוטלו');
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    removeAllSubscriptions(chatId);
    await ctx.editMessageText('✅ כל המנויים בוטלו.', {
      reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
    });
  });

  bot.callbackQuery(/^mycities:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
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
  });

  bot.callbackQuery('noop', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
  });

  // rm:CITY_ID:PAGE — remove city by numeric ID, return to given page
  bot.callbackQuery(/^rm:(\d+):(\d+)$/, async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
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
  });
}
