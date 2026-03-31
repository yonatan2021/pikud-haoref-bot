import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type Database from 'better-sqlite3';
import { getSubscriptionCount } from '../db/subscriptionRepository.js';
import { upsertUser } from '../db/userRepository.js';
import { getRecentAlerts } from '../db/alertHistoryRepository.js';
import { getSetting } from '../dashboard/settingsRepository.js';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot.js';
import { formatRelativeHe } from './historyHandler.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

let _db: Database.Database | null = null;

/** Call once at startup (after initDb) to enable runtime invite-link overrides from the dashboard. */
export function setMenuHandlerDb(db: Database.Database): void {
  _db = db;
}

export function buildMainMenu(
  cityCount: number,
  lastAlert?: Pick<AlertHistoryRow, 'type' | 'fired_at'>
): { text: string; keyboard: InlineKeyboard } {
  const inviteLink = (_db && getSetting(_db, 'telegram_invite_link')) || process.env.TELEGRAM_INVITE_LINK;
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

  const lastAlertLine = lastAlert
    ? `\n\n📡 ההתרעה האחרונה: ${formatRelativeHe(lastAlert.fired_at)} — ${ALERT_TYPE_EMOJI[lastAlert.type] ?? '⚠️'} ${ALERT_TYPE_HE[lastAlert.type] ?? lastAlert.type}`
    : '';

  const text = cityCount > 0
    ? `🔔 <b>בוט פיקוד העורף</b>\n\nאתה רשום להתראות על <b>${cityCount} ערים</b>.${lastAlertLine}`
    : `🔔 <b>בוט פיקוד העורף</b>\n\nקבל התראות אישיות על ערים שאתה בוחר.${lastAlertLine}`;

  return { text, keyboard };
}

export function registerMenuHandler(bot: Bot): void {
  bot.command('start', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    upsertUser(chatId);
    const count = getSubscriptionCount(chatId);
    const lastAlert = getRecentAlerts(168)[0];
    const { text, keyboard } = buildMainMenu(count, lastAlert);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('menu:main', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const count = getSubscriptionCount(chatId);
    const lastAlert = getRecentAlerts(168)[0];
    const { text, keyboard } = buildMainMenu(count, lastAlert);
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
