import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { upsertSafetyStatus } from '../db/safetyStatusRepository.js';
import { markPromptResponded, getSafetyPromptById } from '../db/safetyPromptRepository.js';
import { createUserCooldown } from './userCooldown.js';
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

/** Stub — Epic C will implement contact notifications. */
export async function notifyContactsOfStatusChange(
  _db: Database.Database,
  _bot: Bot,
  _chatId: number,
  _status: string
): Promise<void> {
  // TODO: implement in Epic C
}
