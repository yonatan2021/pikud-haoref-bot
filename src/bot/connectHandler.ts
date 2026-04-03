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
import { escapeHtml } from '../textUtils.js';

const CONTACTS_PER_PAGE = 5;
const MAX_PENDING_REQUESTS = 10;
const MAX_CODE_RETRIES = 10;
const FAILURE_BLOCK_THRESHOLD = 5;
export const FAILURE_BLOCK_MS = 60_000;
/** Default display name when a user has none set */
const UNNAMED_USER = 'משתמש';
/** How long a pending permission state lives before being pruned (10 minutes) */
const PENDING_PERMISSIONS_TTL_MS = 10 * 60_000;

/** Cooldown for code lookups — 5s between attempts. Map exposed for test reset. */
export const LOOKUP_COOLDOWN_MS = 5000;
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

/** Store pending permission state during connection flow (ephemeral) */
interface PendingPermissionState {
  targetId: number;
  targetName: string;
  safety_status: boolean;
  home_city: boolean;
  expiresAt: number;
}
const pendingPermissions = new Map<number, PendingPermissionState>();

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
  return String(crypto.randomInt(100000, 1000000));
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
  const effectivePage = Number.isInteger(page) && page >= 0 ? page : 0;
  if (effectivePage !== page) {
    log('warn', 'Connect', `Invalid page requested: ${page} — clamping to 0`);
  }

  const accepted = listContacts(userId, 'accepted');
  const total = accepted.length;
  const totalPages = Math.max(1, Math.ceil(total / CONTACTS_PER_PAGE));
  const safePage = Math.min(effectivePage, totalPages - 1);
  const start = safePage * CONTACTS_PER_PAGE;
  const slice = accepted.slice(start, start + CONTACTS_PER_PAGE);

  if (total === 0) {
    return {
      text: '👥 <b>אנשי הקשר שלי</b>\n\nאין לך אנשי קשר עדיין.\nלחיבור חבר חדש: /connect',
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
    const name = other?.display_name ?? UNNAMED_USER;
    const perms = permissions.get(contact.id);
    const cityLine = perms?.home_city && other?.home_city ? ` — ${escapeHtml(other.home_city)}` : '';
    lines.push(`• ${escapeHtml(name)}${cityLine}`);
  }

  const keyboard = new InlineKeyboard();
  for (const contact of slice) {
    const otherId = contact.user_id === userId ? contact.contact_id : contact.user_id;
    const other = getUser(otherId);
    const name = other?.display_name ?? UNNAMED_USER;
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

/** Build permission toggle screen payload (pure — no side effects) */
function buildPermissionScreenPayload(
  targetName: string,
  state: PendingPermissionState
): { text: string; keyboard: InlineKeyboard } {
  const safetyCheck = state.safety_status ? '✅' : '☐';
  const cityCheck   = state.home_city ? '✅' : '☐';

  const text = `📤 <b>בקשת חיבור ל${escapeHtml(targetName)}</b>\n\nכשהם יאשרו — מה הם יוכלו לראות עליכם?\n\n${safetyCheck} <b>עיר הבית שלי</b>\n<i>כדי שיוכלו לדעת אם הגעתם לאזור בטוח</i>\n\n${cityCheck} <b>זמן עדכון אחרון</b>\n<i>כדי שיוכלו לדעת שראיתם את ההתראה</i>`;

  const keyboard = new InlineKeyboard()
    .text('🔄 עיר הבית', `cx:pt:safety`)
    .text('🔄 זמן עדכון', `cx:pt:city`)
    .row()
    .text('💾 שמור ושלח בקשה', `cx:confirm`)
    .text('❌ ביטול', `cx:cancel`)
    .row();

  return { text, keyboard };
}

/** Edit an existing bot message with the permission toggle screen (used by toggle callbacks) */
function buildAndSendPermissionScreen(ctx: Context, chatId: number, targetName: string): void {
  const state = pendingPermissions.get(chatId);
  if (!state) return;

  const { text, keyboard } = buildPermissionScreenPayload(targetName, state);
  ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch((err) => {
    log('warn', 'Connect', `Failed to edit permission screen: ${String(err)}`);
    ctx.reply('❌ שגיאת עדכון — נסה שוב').catch(() => undefined);
  });
}

export function registerConnectHandler(bot: Bot): void {
  // Prune abandoned pending permission states every 5 minutes to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [id, state] of pendingPermissions) {
      if (now > state.expiresAt) pendingPermissions.delete(id);
    }
  }, 5 * 60_000).unref();

  // /connect — show menu or connect to someone
  bot.command('connect', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
    } catch (err) {
      log('error', 'Connect', `Failed to upsert user ${chatId}: ${String(err)}`);
      await ctx.reply('❌ שגיאת שרת — נסה שוב.');
      return;
    }

    const args = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const codeArg = args[0]?.trim();

    if (!codeArg) {
      // Show menu: share code or enter code
      const keyboard = new InlineKeyboard()
        .text('📤 שתפו את הקוד שלכם', 'cx:menu:share')
        .text('📥 הכנסו קוד של חבר', 'cx:menu:enter')
        .row()
        .text('↩️ חזור', 'menu:main');

      await ctx.reply(
        `🔗 <b>חיבור חברים</b>\n\nחברו אנשים קרובים כדי שתוכלו לדעת שכולם בסדר בזמן אזעקה.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    // Connect to someone by code
    if (!/^\d{6}$/.test(codeArg)) {
      await ctx.reply('❌ הקוד שהכנסתם לא תקין — חייב להיות בדיוק 6 ספרות.');
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
      await ctx.reply('❌ לא מצאנו אף אחד עם הקוד הזה. בדקו שהעתקתם נכון.');
      return;
    }

    clearFailures(chatId);

    if (target.chat_id === chatId) {
      await ctx.reply('❌ לא ניתן להשתמש בקוד שלכם עצמכם 😊');
      return;
    }

    // Check both directions for existing contact
    const existingForward = getContactByPair(chatId, target.chat_id);
    const existingReverse = getContactByPair(target.chat_id, chatId);
    if (existingForward || existingReverse) {
      await ctx.reply('ℹ️ אתם כבר מחוברים עם המשתמש הזה.');
      return;
    }

    if (getPendingCountForUser(target.chat_id) >= MAX_PENDING_REQUESTS) {
      await ctx.reply('❌ למשתמש יש יותר מדי בקשות ממתינות. נסה שוב מאוחר יותר.');
      return;
    }

    // Store pending state + show permission toggles
    const targetName = target.display_name ?? UNNAMED_USER;
    const defaults = parsePrivacyDefaults();
    pendingPermissions.set(chatId, {
      targetId: target.chat_id,
      targetName,
      safety_status: defaults.safety_status ?? true,
      home_city: defaults.home_city ?? false,
      expiresAt: Date.now() + PENDING_PERMISSIONS_TTL_MS,
    });

    // Use reply (not edit) — there is no prior bot message to edit in the command path
    const pendingState = pendingPermissions.get(chatId);
    if (pendingState) {
      const { text, keyboard } = buildPermissionScreenPayload(targetName, pendingState);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  });

  // Menu: Share own code
  bot.callbackQuery('cx:menu:share', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const code = ensureConnectionCode(chatId);
    const keyboard = new InlineKeyboard().text('↩️ חזור', 'menu:main');

    await ctx.editMessageText(
      `📤 <b>הקוד שלכם</b>\n\nשלחו את הקוד הזה לחבר שתרצו להתחבר אליו:\n\n<code>${code}</code>\n\nכשהם יכניסו אותו הם ישלחו לכם בקשת חיבור — ותוכלו לאשר.`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  });

  // Menu: Enter code from a friend
  bot.callbackQuery('cx:menu:enter', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('↩️ חזור', 'menu:main');

    await ctx.editMessageText(
      `📥 <b>הכנסת קוד</b>\n\nבקשו מהחבר לשלוח לכם את הקוד שלהם, ואז שלחו:\n\n<code>/connect 123456</code>`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  });

  // Toggle: Safety status
  bot.callbackQuery('cx:pt:safety', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = pendingPermissions.get(chatId);
    if (!state) {
      await ctx.reply('❌ הסשן פג תוקף. נסה שוב: /connect');
      return;
    }

    pendingPermissions.set(chatId, { ...state, safety_status: !state.safety_status });
    buildAndSendPermissionScreen(ctx, chatId, state.targetName);
  });

  // Toggle: Home city
  bot.callbackQuery('cx:pt:city', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = pendingPermissions.get(chatId);
    if (!state) {
      await ctx.reply('❌ הסשן פג תוקף. נסה שוב: /connect');
      return;
    }

    pendingPermissions.set(chatId, { ...state, home_city: !state.home_city });
    buildAndSendPermissionScreen(ctx, chatId, state.targetName);
  });

  // Confirm and send request
  bot.callbackQuery('cx:confirm', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = pendingPermissions.get(chatId);
    if (!state) {
      await ctx.reply('❌ הסשן פג תוקף. נסה שוב: /connect');
      return;
    }

    // Re-validate at confirm time (TOCTOU guard) — duplicate/pending might have changed since /connect
    const existingForward = getContactByPair(chatId, state.targetId);
    const existingReverse = getContactByPair(state.targetId, chatId);
    if (existingForward || existingReverse) {
      pendingPermissions.delete(chatId);
      await ctx.editMessageText('ℹ️ כבר מחוברים עם המשתמש הזה.');
      return;
    }

    if (getPendingCountForUser(state.targetId) >= MAX_PENDING_REQUESTS) {
      pendingPermissions.delete(chatId);
      await ctx.editMessageText('❌ יותר מדי בקשות ממתינות. נסה שוב מאוחר יותר.');
      return;
    }

    // Create contact with selected permissions
    const contact = createContactWithPermissions(chatId, state.targetId, {
      safety_status: state.safety_status,
      home_city: state.home_city,
    });

    log('info', 'Connect', `User ${chatId} sent connection request to ${state.targetId} with permissions: safety=${state.safety_status}, city=${state.home_city}`);

    // Notify target
    const requesterName = getUser(chatId)?.display_name ?? UNNAMED_USER;
    const keyboard = new InlineKeyboard()
      .text('✅ אישור', `cn:accept:${contact.id}`)
      .text('❌ דחייה', `cn:reject:${contact.id}`);

    try {
      await ctx.api.sendMessage(
        state.targetId,
        `📨 <b>בקשת חיבור חדשה</b>\n\n${escapeHtml(requesterName)} שלח/ה לכם בקשת חיבור ורוצה להתחבר אליכם.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('warn', 'Connect', `Failed to notify target ${state.targetId}: ${String(err)}`);
    }

    pendingPermissions.delete(chatId);
    await ctx.editMessageText('✅ בקשת החיבור נשלחה! תקבל הודעה כשהם יאשרו.', { parse_mode: 'HTML' });
  });

  // Cancel request
  bot.callbackQuery('cx:cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    pendingPermissions.delete(chatId);
    await ctx.editMessageText('❌ <b>ביטול</b>\n\nחזרת לתפריט הראשי: /connect', { parse_mode: 'HTML' });
  });

  // Accept connection request
  bot.callbackQuery(/^cn:accept:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const raw = ctx.match?.[1];
    if (!raw) return;
    const contactId = parseInt(raw, 10);
    if (isNaN(contactId)) return;
    const contact = getContactById(contactId);
    if (!contact || contact.status !== 'pending') {
      await ctx.editMessageText('ℹ️ הבקשה כבר טופלה.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId !== contact.contact_id) {
      await ctx.reply('❌ רק הנמען יכול להגיב לבקשה זו.');
      return;
    }

    try {
      acceptContact(contactId);
    } catch (err) {
      log('error', 'Connect', `Failed to accept contact ${contactId}: ${String(err)}`);
      await ctx.editMessageText('❌ שגיאת שרת — נסה שוב.');
      return;
    }
    log('info', 'Connect', `Contact ${contactId} accepted`);

    const requesterName = getUser(contact.user_id)?.display_name ?? UNNAMED_USER;
    const accepterName = getUser(contact.contact_id)?.display_name ?? UNNAMED_USER;
    await ctx.editMessageText(
      `✅ <b>חיבור אושר</b>\nאתה ו-${escapeHtml(requesterName)} מחוברים כעת.`,
      { parse_mode: 'HTML' }
    );

    // Build permission summary for requester
    const perms = getPermissions(contactId);
    const sharedList: string[] = [];
    if (perms?.safety_status) sharedList.push('עיר הבית שלך');
    if (perms?.home_city) sharedList.push('זמן עדכון אחרון');

    const sharedText = sharedList.length > 0
      ? `הם יכולים עכשיו לראות:\n${sharedList.map(s => `• ${s}`).join('\n')}\n\nלשינוי הגדרות: /contacts`
      : `לא שתפת כל מידע נוסף בעת החיבור.`;

    // Notify requester with permission summary
    try {
      await ctx.api.sendMessage(
        contact.user_id,
        `✅ <b>${escapeHtml(accepterName)} אישרו את הבקשה!</b>\n\n${sharedText}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      log('error', 'Connect', `Failed to notify requester ${contact.user_id}: ${String(err)}`);
    }
  });

  // Reject connection request
  bot.callbackQuery(/^cn:reject:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const raw = ctx.match?.[1];
    if (!raw) return;
    const contactId = parseInt(raw, 10);
    if (isNaN(contactId)) return;
    const contact = getContactById(contactId);
    if (!contact || contact.status !== 'pending') {
      await ctx.editMessageText('ℹ️ הבקשה כבר טופלה.');
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId !== contact.contact_id) {
      await ctx.reply('❌ רק הנמען יכול להגיב לבקשה זו.');
      return;
    }

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
    try {
      upsertUser(chatId);
    } catch (err) {
      log('error', 'Connect', `Failed to upsert user ${chatId}: ${String(err)}`);
      await ctx.reply('❌ שגיאת שרת — נסה שוב.');
      return;
    }
    const { text, keyboard } = buildContactsPage(chatId, 0);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Contacts pagination
  bot.callbackQuery(/^cx:page:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const rawPage = ctx.match?.[1];
    if (!rawPage) return;
    const page = parseInt(rawPage, 10);
    if (isNaN(page)) return;
    const { text, keyboard } = buildContactsPage(chatId, page);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Remove contact
  bot.callbackQuery(/^cx:rm:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const rawRm = ctx.match?.[1];
    if (!rawRm) return;
    const contactId = parseInt(rawRm, 10);
    if (isNaN(contactId)) return;
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
export { buildContactsPage, ensureConnectionCode, parsePrivacyDefaults, isBlocked, recordFailure, clearFailures, failureCounts, lookupCooldownMap, pendingPermissions };
