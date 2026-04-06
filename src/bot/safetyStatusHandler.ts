import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { upsertSafetyStatus, getSafetyStatus } from '../db/safetyStatusRepository.js';
import type { SafetyStatusRow } from '../db/safetyStatusRepository.js';
import { markPromptResponded, getSafetyPromptById } from '../db/safetyPromptRepository.js';
import { listContacts, getPermissions } from '../db/contactRepository.js';
import { getUser } from '../db/userRepository.js';
import { createUserCooldown } from './userCooldown.js';
import { formatRelativeTime, formatTimeUntil } from '../textUtils.js';
import { log } from '../logger.js';

// Set before registering (called from index.ts after initDb).
let _db: Database.Database | null = null;

export function setSafetyStatusHandlerDeps(db: Database.Database): void {
  _db = db;
}

type SafetyStatus = 'ok' | 'help' | 'dismissed';

const CONFIRMATION: Record<SafetyStatus, string> = {
  ok:        '✅ <b>מצוין! שמחים שאתה בסדר.</b>\nאנשי הקשר המורשים עודכנו.',
  help:      '⚠️ <b>אנחנו כאן.</b>\nאנשי הקשר המורשים עודכנו ויוכלו לסייע.',
  dismissed: '🔇 <b>ההתראה נסגרה.</b>',
};

function buildOwnStatusText(status: SafetyStatusRow): string {
  const emoji = status.status === 'ok' ? '✅' :
                status.status === 'help' ? '⚠️' : '🔇';
  const label = status.status === 'ok' ? 'בסדר' :
                status.status === 'help' ? 'זקוק לעזרה' : 'התעלם';
  return (
    `🛡️ <b>הסטטוס שלך</b>\n\n` +
    `${emoji} ${label}  ·  ${formatRelativeTime(status.updated_at)}` +
    `  ·  פג תוקף ${formatTimeUntil(status.expires_at)}`
  );
}

function statusEmoji(s: string): string {
  return s === 'ok' ? '✅' : s === 'help' ? '⚠️' : '🔇';
}

function statusLabel(s: string): string {
  return s === 'ok' ? 'בסדר' : s === 'help' ? 'זקוק לעזרה' : 'התעלם';
}

function backKeyboard() {
  return {
    inline_keyboard: [[{ text: '◀️ חזרה', callback_data: 'safety:back' }]],
  };
}

function mainStatusKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ בסדר',          callback_data: 'safety:ok:0'    },
        { text: '⚠️ זקוק לעזרה',   callback_data: 'safety:help:0'  },
      ],
      [
        { text: '👥 סטטוס אנשי קשר', callback_data: 'safety:contacts' },
      ],
    ],
  };
}

function parseCallback(data: string): { status: SafetyStatus; promptId: number } | null {
  const m = data.match(/^safety:(ok|help|dismiss):(\d+)$/);
  if (!m) return null;
  const key = m[1];
  const promptId = Number(m[2]);
  const status: SafetyStatus = key === 'ok' ? 'ok' : key === 'help' ? 'help' : 'dismissed';
  return { status, promptId };
}

export function registerSafetyStatusHandler(bot: Bot): void {
  const cooldown = createUserCooldown(1000);

  bot.command('status', async (ctx) => {
    const chatId = ctx.from?.id;
    if (!chatId || !_db) return;

    const status = getSafetyStatus(_db, chatId);
    const text = status
      ? buildOwnStatusText(status)
      : '🛡️ <b>הסטטוס שלך</b>\n\nאין סטטוס פעיל כרגע.';

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainStatusKeyboard() });
  });

  bot.callbackQuery('safety:contacts', async (ctx) => {
    const chatId = ctx.from?.id;
    try {
      if (!chatId || !_db) return;
      const contacts = listContacts(chatId, 'accepted');

      if (contacts.length === 0) {
        await ctx.editMessageText(
          'אין אנשי קשר פעילים. השתמש ב-/connect כדי להתחבר.',
          { parse_mode: 'HTML', reply_markup: backKeyboard() }
        );
        return;
      }

      const visibleLines: string[] = [];
      let hiddenCount = 0;

      for (const contact of contacts) {
        const perms = getPermissions(contact.id);
        if (!perms?.safety_status) {
          hiddenCount++;
          continue;
        }
        const otherChatId = contact.user_id === chatId ? contact.contact_id : contact.user_id;
        const contactStatus = getSafetyStatus(_db, otherChatId);
        const user = getUser(otherChatId);
        const name = user?.display_name ?? `משתמש #${otherChatId}`;
        const statusStr = contactStatus
          ? `${statusEmoji(contactStatus.status)} ${statusLabel(contactStatus.status)}  ·  ${formatRelativeTime(contactStatus.updated_at)}`
          : '⬜ לא ידוע';
        visibleLines.push(`👤 <b>${name}</b>  ${statusStr}`);
      }

      let text = `👥 <b>סטטוס אנשי קשר</b>\n\n`;
      text += visibleLines.length > 0
        ? visibleLines.join('\n')
        : 'אין אנשי קשר המשתפים סטטוס.';
      if (hiddenCount > 0) {
        text += `\n\n🔒 ${hiddenCount} אנשי קשר נוספים אינם משתפים סטטוס.`;
      }

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: backKeyboard(),
      });
    } catch (err) {
      log('error', 'SafetyStatus', `contacts view error: ${err}`);
    } finally {
      await ctx.answerCallbackQuery().catch(() => {});
    }
  });

  bot.callbackQuery('safety:back', async (ctx) => {
    const chatId = ctx.from?.id;
    try {
      if (!chatId || !_db) return;

      const status = getSafetyStatus(_db, chatId);
      const text = status
        ? buildOwnStatusText(status)
        : '🛡️ <b>הסטטוס שלך</b>\n\nאין סטטוס פעיל כרגע.';

      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: mainStatusKeyboard() });
    } catch (err) {
      log('error', 'SafetyStatus', `safety:back error: ${err}`);
    } finally {
      await ctx.answerCallbackQuery().catch(() => {});
    }
  });

  bot.callbackQuery(/^safety:(ok|help|dismiss):\d+$/, async (ctx) => {
    const chatId = ctx.from?.id;
    if (!chatId || !_db) {
      await ctx.answerCallbackQuery();
      return;
    }

    if (cooldown.isOnCooldown(chatId)) {
      await ctx.answerCallbackQuery('אנא המתן רגע');
      return;
    }
    cooldown.setCooldown(chatId);

    let answered = false;
    try {
      const parsed = parseCallback(ctx.callbackQuery.data);
      if (!parsed) return;

      const { status, promptId } = parsed;
      const prompt = getSafetyPromptById(_db, promptId);

      if (prompt?.responded === true) {
        await ctx.answerCallbackQuery('כבר עדכנת את הסטטוס שלך');
        answered = true;
        return;
      }

      upsertSafetyStatus(_db, chatId, status);

      if (prompt) {
        markPromptResponded(_db, prompt.chat_id, prompt.fingerprint);
      }

      await ctx.editMessageText(CONFIRMATION[status], { parse_mode: 'HTML' });
      await notifyContactsOfStatusChange(_db, bot, chatId, status);
    } catch (err) {
      log('error', 'SafetyStatus', `כישלון בטיפול בסטטוס בטיחות: ${err}`);
    } finally {
      if (!answered) {
        await ctx.answerCallbackQuery().catch(() => {});
      }
    }
  });
}

export async function notifyContactsOfStatusChange(
  db: Database.Database,
  bot: Bot,
  chatId: number,
  status: string
): Promise<void> {
  const contacts = listContacts(chatId, 'accepted');

  const STATUS_NOTIFY: Record<string, string> = {
    ok:        `✅ <b>עדכון מחבר</b>\nמשתמש #${chatId} מדווח: <b>בסדר</b>`,
    help:      `⚠️ <b>עדכון מחבר</b>\nמשתמש #${chatId} מדווח: <b>זקוק לעזרה</b>`,
    dismissed: `🔇 <b>עדכון מחבר</b>\nמשתמש #${chatId} סגר את ההתראה.`,
  };
  const message = STATUS_NOTIFY[status] ?? `🔔 עדכון מחבר #${chatId}: ${status}`;

  for (const contact of contacts) {
    const perms = getPermissions(contact.id);
    if (!perms?.safety_status) continue;

    const otherChatId = contact.user_id === chatId ? contact.contact_id : contact.user_id;
    try {
      await bot.api.sendMessage(otherChatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      log('error', 'SafetyStatus', `notify failed for ${otherChatId}: ${err}`);
    }
  }
}
