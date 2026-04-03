import crypto from 'crypto';
import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import {
  getUser,
  setConnectionCode,
  findUserByConnectionCode,
  upsertUser,
} from '../db/userRepository.js';
import {
  getContactByPair,
  getContactById,
  acceptContact,
  rejectContact,
  removeContact,
  listContacts,
  getPendingCountForUser,
  createContactWithPermissions,
  getPermissions,
  type Contact,
} from '../db/contactRepository.js';
import { getSetting } from '../dashboard/settingsRepository.js';
import { getDb } from '../db/schema.js';
import { log } from '../logger.js';

const CONTACTS_PER_PAGE = 5;
const MAX_PENDING_REQUESTS = 10;
const MAX_CODE_RETRIES = 10;
const FAILURE_BLOCK_THRESHOLD = 5;
const FAILURE_BLOCK_MS = 60_000;

/** Cooldown for code lookups — 5s between attempts. Map exposed for test reset. */
const LOOKUP_COOLDOWN_MS = 5000;
const lookupCooldownMap = new Map<number, number>();

const lookupCooldown = {
  isOnCooldown(userId: number): boolean {
    const expiry = lookupCooldownMap.get(userId);
    if (expiry === undefined) return false;
    if (Date.now() >= expiry) {
      lookupCooldownMap.delete(userId);
      return false;
    }
    return true;
  },
  setCooldown(userId: number): void {
    lookupCooldownMap.set(userId, Date.now() + LOOKUP_COOLDOWN_MS);
  },
};

/** Track consecutive lookup failures per user */
const failureCounts = new Map<number, { count: number; blockedUntil: number }>();

function isBlocked(userId: number): boolean {
  const entry = failureCounts.get(userId);
  if (!entry) return false;
  if (Date.now() >= entry.blockedUntil) {
    failureCounts.delete(userId);
    return false;
  }
  return entry.count >= FAILURE_BLOCK_THRESHOLD;
}

function recordFailure(userId: number): void {
  const entry = failureCounts.get(userId);
  const count = (entry?.count ?? 0) + 1;
  failureCounts.set(userId, {
    count,
    blockedUntil: count >= FAILURE_BLOCK_THRESHOLD
      ? Date.now() + FAILURE_BLOCK_MS
      : entry?.blockedUntil ?? 0,
  });
}

function clearFailures(userId: number): void {
  failureCounts.delete(userId);
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function parsePrivacyDefaults(): Record<string, boolean> {
  const raw = getSetting(getDb(), 'privacy_defaults');
  if (!raw) return { safety_status: true, home_city: false, update_time: true };
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch (err) {
    log('error', 'Connect', `Failed to parse privacy_defaults setting: ${String(err)}. Using hardcoded defaults.`);
    return { safety_status: true, home_city: false, update_time: true };
  }
}

/** Get or generate a connection code for a user */
function ensureConnectionCode(chatId: number): string {
  const user = getUser(chatId);
  if (user?.connection_code) return user.connection_code;

  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = generateCode();
    if (!findUserByConnectionCode(code)) {
      try {
        setConnectionCode(chatId, code);
        return code;
      } catch (err) {
        log('error', 'Connect', `setConnectionCode failed for ${chatId}: ${String(err)}`);
        throw err;
      }
    }
  }
  log('error', 'Connect', `Code generation exhausted ${MAX_CODE_RETRIES} retries for user ${chatId}`);
  throw new Error('Failed to generate unique connection code after retries');
}

function buildContactsPage(
  userId: number,
  page: number
): { text: string; keyboard: InlineKeyboard } {
  if (!Number.isInteger(page) || page < 0) {
    log('warn', 'Connect', `Invalid page requested: ${page} — clamping to 0`);
    page = 0;
  }

  const accepted = listContacts(userId, 'accepted');
  const total = accepted.length;
  const totalPages = Math.max(1, Math.ceil(total / CONTACTS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * CONTACTS_PER_PAGE;
  const slice = accepted.slice(start, start + CONTACTS_PER_PAGE);

  if (total === 0) {
    return {
      text: '👥 <b>אנשי הקשר שלי</b>\n\nאין לך אנשי קשר עדיין.\nשלח /connect כדי לחבר מישהו.',
      keyboard: new InlineKeyboard().text('↩️ חזור', 'menu:main'),
    };
  }

  const permissions = new Map<number, ReturnType<typeof getPermissions>>();
  for (const c of slice) {
    const perms = getPermissions(c.id);
    if (!perms) {
      log('error', 'Connect', `Contact ${c.id} has no permissions record — data integrity issue`);
    }
    permissions.set(c.id, perms);
  }

  const lines = ['👥 <b>אנשי הקשר שלי</b>', ''];
  for (const contact of slice) {
    const otherId = contact.user_id === userId ? contact.contact_id : contact.user_id;
    const other = getUser(otherId);
    const name = other?.display_name ?? 'משתמש';
    const perms = permissions.get(contact.id);
    const cityLine = perms?.home_city && other?.home_city ? ` — ${other.home_city}` : '';
    lines.push(`• ${name}${cityLine}`);
  }

  const keyboard = new InlineKeyboard();
  for (const contact of slice) {
    const otherId = contact.user_id === userId ? contact.contact_id : contact.user_id;
    const other = getUser(otherId);
    const name = other?.display_name ?? 'משתמש';
    keyboard
      .text(`🔒 ${name}`, `cx:perm:${contact.id}`)
      .text('❌', `cx:rm:${contact.id}`)
      .row();
  }

  if (totalPages > 1) {
    if (safePage > 0) keyboard.text('◀️', `cx:page:${safePage - 1}`);
    keyboard.text(`${safePage + 1}/${totalPages}`, 'noop');
    if (safePage < totalPages - 1) keyboard.text('▶️', `cx:page:${safePage + 1}`);
    keyboard.row();
  }

  keyboard.text('↩️ חזור', 'menu:main');
  return { text: lines.join('\n'), keyboard };
}

export function registerConnectHandler(bot: Bot): void {
  // /connect — show code or connect to someone
  bot.command('connect', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    upsertUser(chatId);

    const args = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const codeArg = args[0]?.trim();

    if (!codeArg) {
      // Show own code
      const code = ensureConnectionCode(chatId);
      await ctx.reply(
        `🔗 <b>קוד החיבור שלך</b>\n\n📋 ${code}\n\nשלח את הקוד הזה לחברים כדי שיוכלו להתחבר אליך.\nלחיבור עם חבר, שלח /connect ואחריו את הקוד שלו.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Connect to someone by code
    if (!/^\d{6}$/.test(codeArg)) {
      await ctx.reply('❌ קוד לא תקין. הקוד חייב להיות 6 ספרות.');
      return;
    }

    if (isBlocked(chatId)) {
      await ctx.reply('⏳ יותר מדי ניסיונות שגויים. נסה שוב בעוד דקה.');
      return;
    }

    if (lookupCooldown.isOnCooldown(chatId)) {
      await ctx.reply('⏳ נסה שוב בעוד כמה שניות.');
      return;
    }
    lookupCooldown.setCooldown(chatId);

    const target = findUserByConnectionCode(codeArg);
    if (!target) {
      recordFailure(chatId);
      await ctx.reply('❌ לא נמצא משתמש עם הקוד הזה.');
      return;
    }

    clearFailures(chatId);

    if (target.chat_id === chatId) {
      await ctx.reply('❌ אי אפשר להתחבר לעצמך.');
      return;
    }

    // Check both directions for existing contact
    const existingForward = getContactByPair(chatId, target.chat_id);
    const existingReverse = getContactByPair(target.chat_id, chatId);
    if (existingForward || existingReverse) {
      await ctx.reply('ℹ️ כבר קיים חיבור עם המשתמש הזה.');
      return;
    }

    if (getPendingCountForUser(target.chat_id) >= MAX_PENDING_REQUESTS) {
      await ctx.reply('❌ למשתמש יש יותר מדי בקשות ממתינות. נסה שוב מאוחר יותר.');
      return;
    }

    const defaults = parsePrivacyDefaults();
    const contact = createContactWithPermissions(chatId, target.chat_id, defaults);

    log('info', 'Connect', `User ${chatId} sent connection request to ${target.chat_id}`);

    // Notify target
    const requesterName = getUser(chatId)?.display_name ?? 'משתמש';
    const keyboard = new InlineKeyboard()
      .text('✅ אישור', `cn:accept:${contact.id}`)
      .text('❌ דחייה', `cn:reject:${contact.id}`);

    try {
      await ctx.api.sendMessage(
        target.chat_id,
        `📨 <b>בקשת חיבור חדשה</b>\n${requesterName} רוצה להתחבר אליך.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('warn', 'Connect', `Failed to notify target ${target.chat_id}: ${String(err)}`);
    }

    await ctx.reply('✅ בקשת החיבור נשלחה! תקבל הודעה כשהצד השני יאשר.');
  });

  // Accept connection request
  bot.callbackQuery(/^cn:accept:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const contactId = parseInt(ctx.match![1]);
    const contact = getContactById(contactId);
    if (!contact || contact.status !== 'pending') {
      await ctx.editMessageText('ℹ️ הבקשה כבר טופלה.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId !== contact.contact_id) return;

    try {
      acceptContact(contactId);
    } catch (err) {
      log('error', 'Connect', `Failed to accept contact ${contactId}: ${String(err)}`);
      await ctx.editMessageText('❌ שגיאת שרת — נסה שוב.');
      return;
    }
    log('info', 'Connect', `Contact ${contactId} accepted`);

    const targetName = getUser(contact.contact_id)?.display_name ?? 'משתמש';
    await ctx.editMessageText(
      `✅ <b>חיבור אושר</b>\nאתה ו-${getUser(contact.user_id)?.display_name ?? 'משתמש'} מחוברים כעת.`,
      { parse_mode: 'HTML' }
    );

    // Notify requester
    try {
      await ctx.api.sendMessage(
        contact.user_id,
        `✅ ${targetName} אישר/ה את בקשת החיבור שלך!`
      );
    } catch (err) {
      log('error', 'Connect', `Failed to notify requester ${contact.user_id}: ${String(err)}`);
    }
  });

  // Reject connection request
  bot.callbackQuery(/^cn:reject:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const contactId = parseInt(ctx.match![1]);
    const contact = getContactById(contactId);
    if (!contact || contact.status !== 'pending') {
      await ctx.editMessageText('ℹ️ הבקשה כבר טופלה.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId !== contact.contact_id) return;

    try {
      rejectContact(contactId);
    } catch (err) {
      log('error', 'Connect', `Failed to reject contact ${contactId}: ${String(err)}`);
      await ctx.editMessageText('❌ שגיאת שרת — נסה שוב.');
      return;
    }
    log('info', 'Connect', `Contact ${contactId} rejected`);

    await ctx.editMessageText('❌ <b>בקשת החיבור נדחתה.</b>', { parse_mode: 'HTML' });

    // Notify requester
    try {
      await ctx.api.sendMessage(
        contact.user_id,
        '❌ בקשת החיבור שלך נדחתה.'
      );
    } catch (err) {
      log('error', 'Connect', `Failed to notify requester ${contact.user_id}: ${String(err)}`);
    }
  });

  // /contacts — show accepted contacts
  bot.command('contacts', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    upsertUser(chatId);
    const { text, keyboard } = buildContactsPage(chatId, 0);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Contacts pagination
  bot.callbackQuery(/^cx:page:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const page = parseInt(ctx.match![1]);
    const { text, keyboard } = buildContactsPage(chatId, page);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Remove contact
  bot.callbackQuery(/^cx:rm:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const contactId = parseInt(ctx.match![1]);
    const contact = getContactById(contactId);
    if (!contact) return;

    // Verify this user is part of the contact pair
    if (contact.user_id !== chatId && contact.contact_id !== chatId) return;

    try {
      removeContact(contactId);
    } catch (err) {
      log('error', 'Connect', `Failed to remove contact ${contactId}: ${String(err)}`);
      await ctx.answerCallbackQuery({ text: '❌ שגיאת שרת — נסה שוב', show_alert: true });
      return;
    }
    log('info', 'Connect', `User ${chatId} removed contact ${contactId}`);
    const { text, keyboard } = buildContactsPage(chatId, 0);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Permission editing — stub for v0.4.3
  bot.callbackQuery(/^cx:perm:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery({
      text: '🔜 ניהול הרשאות — בקרוב בגרסה הבאה',
      show_alert: true,
    });
  });
}

/** Exposed for testing — clear to reset anti-spam state between test runs */
export { buildContactsPage, ensureConnectionCode, parsePrivacyDefaults, isBlocked, recordFailure, clearFailures, failureCounts, lookupCooldownMap };
