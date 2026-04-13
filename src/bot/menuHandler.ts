import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type Database from 'better-sqlite3';
import { getSubscriptionCount } from '../db/subscriptionRepository.js';
import { upsertUser, isOnboardingCompleted, completeOnboarding, getProfile, setOnboardingStep, setDmActive, getUser } from '../db/userRepository.js';
import { getRecentAlerts } from '../db/alertHistoryRepository.js';
import { listContacts, getPermissions } from '../db/contactRepository.js';
import { upsertSafetyStatusWithTtl, getSafetyStatus } from '../db/safetyStatusRepository.js';
import { getUnansweredPromptsForUser } from '../db/safetyPromptRepository.js';
import { sendStepMessage } from './onboardingHandler.js';
import { getSetting } from '../dashboard/settingsRepository.js';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE, escapeHtml } from '../telegramBot.js';
import { formatRelativeHe } from './historyHandler.js';
import { log } from '../logger.js';
import { dmQueue } from '../services/dmQueue.js';
import type { DmTask } from '../services/dmQueue.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

let _db: Database.Database | null = null;

/** Call once at startup (after initDb) to enable runtime invite-link overrides from the dashboard. */
export function setMenuHandlerDb(db: Database.Database): void {
  _db = db;
}

export interface MainMenuOptions {
  hasAcceptedContacts?: boolean;
  quickOkEnabled?: boolean;
}

export function buildMainMenu(
  cityCount: number,
  lastAlert?: Pick<AlertHistoryRow, 'type' | 'fired_at'>,
  options?: MainMenuOptions
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

  if (options?.hasAcceptedContacts && options?.quickOkEnabled !== false) {
    keyboard.row().text('✅ הכל בסדר — לכולם', 'menu:quickok');
  }

  const lastAlertLine = lastAlert
    ? `\n\n📡 ההתרעה האחרונה: ${formatRelativeHe(lastAlert.fired_at)} — ${ALERT_TYPE_EMOJI[lastAlert.type] ?? '⚠️'} ${ALERT_TYPE_HE[lastAlert.type] ?? lastAlert.type}`
    : '';

  const text = cityCount > 0
    ? `🔔 <b>בוט פיקוד העורף</b>\n\nאתה רשום להתראות על <b>${cityCount} ערים</b>.${lastAlertLine}`
    : `🔔 <b>בוט פיקוד העורף</b>\n\nקבל התראות אישיות על ערים שאתה בוחר.${lastAlertLine}`;

  return { text, keyboard };
}

/** Query whether the user has accepted contacts with safety_status permission. */
function getQuickOkOptions(chatId: number): MainMenuOptions {
  const user = getUser(chatId);
  const contacts = listContacts(chatId, 'accepted');
  const hasAcceptedContacts = contacts.some(c => {
    const perms = getPermissions(c.id);
    return perms?.safety_status;
  });
  return { hasAcceptedContacts, quickOkEnabled: user?.social_quick_ok_enabled ?? true };
}

/**
 * Build a safety reminder banner if the user has unanswered prompts.
 * Returns the banner HTML string, or empty string if no banner needed.
 */
function buildSafetyBanner(chatId: number): string {
  if (!_db) return '';
  const user = getUser(chatId);
  if (user?.social_banner_enabled === false) return '';

  const unanswered = getUnansweredPromptsForUser(_db, chatId);
  if (unanswered.length === 0) return '';

  // Extract city from fingerprint (format: "type:city1|city2|...")
  const fp = unanswered[0].fingerprint;
  const colonIdx = fp.indexOf(':');
  const citiesPart = colonIdx >= 0 ? fp.slice(colonIdx + 1) : '';
  const firstCity = citiesPart.split('|')[0] || '';
  const cityText = firstCity ? ` ב${escapeHtml(firstCity)}` : '';

  return `⚠️ <b>לא עדכנת סטטוס</b> אחרי האזעקה${cityText} · לחץ לעדכון`;
}

export function registerMenuHandler(bot: Bot): void {
  // Single source of truth for /start: private chat opens the main menu (or onboarding for new users).
  bot.command('start', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
      // Re-enable DM delivery — user is active again (may have previously blocked and unblocked).
      setDmActive(chatId, true);

      // Gate new users into onboarding
      if (!isOnboardingCompleted(chatId)) {
        // Safety valve: user has subscriptions → they're a real user, backfill the flag
        const subCount = getSubscriptionCount(chatId);
        if (subCount > 0) {
          completeOnboarding(chatId);
          log('info', 'Menu', `Backfilled onboarding_completed for legacy user ${chatId}`);
          const lastAlert = getRecentAlerts(168)[0];
          const opts = getQuickOkOptions(chatId);
          const { text, keyboard } = buildMainMenu(subCount, lastAlert, opts);
          await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
          return;
        }

        const profile = getProfile(chatId);
        const step = profile?.onboarding_step;
        if (step === null || step === undefined) {
          // First time — start onboarding
          setOnboardingStep(chatId, 'name');
          await sendStepMessage(ctx, 'name', chatId);
        } else {
          // Resume from saved step
          await sendStepMessage(ctx, step, chatId);
        }
        return;
      }

      const count = getSubscriptionCount(chatId);
      const lastAlert = getRecentAlerts(168)[0];
      const opts = getQuickOkOptions(chatId);
      const { text: menuText, keyboard } = buildMainMenu(count, lastAlert, opts);

      // #216 — reminder banner for unanswered safety prompts
      const bannerText = buildSafetyBanner(chatId);
      if (bannerText) {
        keyboard.row()
          .text('✅ הכל בסדר', 'quickok:confirm')
          .text('📊 עדכן סטטוס', 'banner:status');
      }
      const text = bannerText ? `${bannerText}\n\n${menuText}` : menuText;

      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Menu', `/start failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Menu', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery('menu:main', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const count = getSubscriptionCount(chatId);
    const lastAlert = getRecentAlerts(168)[0];
    const opts = getQuickOkOptions(chatId);
    const { text, keyboard } = buildMainMenu(count, lastAlert, opts);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // --- Quick "הכל בסדר" broadcast (v0.5.2, #215) ---

  bot.callbackQuery('menu:quickok', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const user = getUser(chatId);
      if (user?.social_quick_ok_enabled === false) {
        await ctx.editMessageText('תכונה זו כבויה. הפעל אותה בהגדרות חברתיות.', {
          reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
        });
        return;
      }
      const contacts = listContacts(chatId, 'accepted');
      const withSafetyPerm = contacts.filter(c => {
        const perms = getPermissions(c.id);
        return perms?.safety_status;
      });
      if (withSafetyPerm.length === 0) {
        await ctx.editMessageText('אין אנשי קשר עם הרשאת סטטוס ביטחוני.', {
          reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
        });
        return;
      }
      const keyboard = new InlineKeyboard()
        .text(`✅ כן, שלח ל-${withSafetyPerm.length} אנשי קשר`, 'quickok:confirm')
        .row()
        .text('❌ ביטול', 'menu:main');
      await ctx.editMessageText(
        `✅ <b>הכל בסדר — שליחה מהירה</b>\n\nלשלוח עדכון "הכל בסדר" ל-<b>${withSafetyPerm.length}</b> אנשי קשר?`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'Menu', `menu:quickok נכשל: ${err}`);
    }
  });

  bot.callbackQuery('quickok:confirm', async (ctx: Context) => {
    await ctx.answerCallbackQuery('✅ נשלח!');
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      // TOCTOU re-verify
      const user = getUser(chatId);
      if (user?.social_quick_ok_enabled === false) return;

      // Upsert safety status with 6h TTL
      if (_db) upsertSafetyStatusWithTtl(_db, chatId, 'ok', 6);

      const displayName = escapeHtml(user?.display_name ?? `משתמש #${chatId}`);
      const timeStr = new Date().toLocaleTimeString('he-IL', {
        timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const msgText = `✅ <b>${displayName}</b> דיווח שהוא בסדר · ${timeStr}`;

      const contacts = listContacts(chatId, 'accepted');
      const tasks: DmTask[] = [];
      for (const contact of contacts) {
        const perms = getPermissions(contact.id);
        if (!perms?.safety_status) continue;
        const otherChatId = contact.user_id === chatId ? contact.contact_id : contact.user_id;
        tasks.push({ chatId: String(otherChatId), text: msgText });
      }
      if (tasks.length > 0) dmQueue.enqueueAll(tasks);

      log('info', 'Menu', `quickok: ${chatId} broadcast to ${tasks.length} contacts`);
      await ctx.editMessageText('✅ עדכון "הכל בסדר" נשלח לכל אנשי הקשר שלך.', {
        reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
      });
    } catch (err) {
      log('error', 'Menu', `quickok:confirm נכשל: ${err}`);
    }
  });

  // #216 — banner:status redirects to /status
  bot.callbackQuery('banner:status', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.editMessageText('💬 שלח <b>/status</b> כדי לעדכן את הסטטוס שלך.', {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
      });
    } catch (err) {
      log('error', 'Menu', `banner:status נכשל: ${err}`);
    }
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
