import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getSubscriptionCount } from '../db/subscriptionRepository.js';
import { upsertUser } from '../db/userRepository.js';

export function buildMainMenu(cityCount: number): { text: string; keyboard: InlineKeyboard } {
  const inviteLink = process.env.TELEGRAM_INVITE_LINK;
  const keyboard = new InlineKeyboard();

  if (inviteLink) {
    keyboard.url('📢 הצטרף לערוץ', inviteLink).row();
  }

  keyboard
    .text(`🔔 ניהול התראות שלי${cityCount > 0 ? ` (${cityCount})` : ''}`, 'menu:alerts')
    .row()
    .text('📍 הוסף התראות לפי אזור', 'menu:zones')
    .row()
    .text('⚙️ הגדרות', 'menu:settings');

  const text = cityCount > 0
    ? `🔔 <b>בוט פיקוד העורף</b>\n\nאתה רשום להתראות על <b>${cityCount} ערים</b>.`
    : '🔔 <b>בוט פיקוד העורף</b>\n\nקבל התראות אישיות על ערים שאתה בוחר.';

  return { text, keyboard };
}

export function registerMenuHandler(bot: Bot): void {
  bot.command('start', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    upsertUser(chatId);
    const count = getSubscriptionCount(chatId);
    const { text, keyboard } = buildMainMenu(count);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('menu:main', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const count = getSubscriptionCount(chatId);
    const { text, keyboard } = buildMainMenu(count);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('menu:alerts', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const count = getSubscriptionCount(chatId);
    const keyboard = new InlineKeyboard()
      .text('🔍 חפש עיר', 'search:start')
      .text('📋 הערים שלי', 'mycities:0')
      .row()
      .text('🔕 בטל הכל', 'settings:clearall')
      .text('↩️ חזור', 'menu:main');
    const text = count > 0
      ? `🔔 <b>ניהול התראות</b>\n\nאתה רשום ל-<b>${count} ערים</b>.`
      : '🔔 <b>ניהול התראות</b>\n\nעדיין לא נרשמת לאף עיר.';
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
}
