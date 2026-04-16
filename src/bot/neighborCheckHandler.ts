import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { getPromptByPrefix, markResponded, recordEvent, type NeighborCheckResponse } from '../db/neighborCheckRepository.js';
import { log } from '../logger.js';

const CONFIRMATION_TEXT: Record<NeighborCheckResponse, string> = {
  checked:   '✅ תודה על הדיווח',
  unable:    '✅ תודה על הדיווח',
  dismissed: '🔇 הובן',
};

let _db: Database.Database | null = null;

export function setNeighborCheckHandlerDb(db: Database.Database): void {
  _db = db;
}

export function registerNeighborCheckHandler(bot: Bot): void {
  // nc:checked:<chatId>:<fpShort>
  // nc:unable:<chatId>:<fpShort>
  // nc:dismissed:<chatId>:<fpShort>
  bot.callbackQuery(/^nc:(checked|unable|dismissed):(\d+):([a-f0-9]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    if (!_db) {
      log('error', 'NeighborCheck', 'DB לא מאותחל — לא ניתן לטפל ב-nc callback');
      return;
    }

    const match = ctx.match;
    if (!match) return;

    const responseStr = match[1] as NeighborCheckResponse;
    const chatId = parseInt(match[2], 10);
    const fpShort = match[3];

    if (isNaN(chatId)) {
      log('warn', 'NeighborCheck', `chatId לא תקין: ${match[2]}`);
      return;
    }

    try {
      const row = getPromptByPrefix(_db, chatId, fpShort);

      if (!row) {
        log('info', 'NeighborCheck', `לא נמצא prompt עבור chatId=${chatId} fp=${fpShort}`);
        await ctx.editMessageText('⏱ הפרומפט פג תוקף.').catch((e) =>
          log('warn', 'NeighborCheck', `editMessageText expired: ${e}`)
        );
        return;
      }

      if (!row.responded) {
        markResponded(_db, chatId, row.fingerprint);
        recordEvent(_db, row.fingerprint, responseStr, null);
      }

      const confirmation = CONFIRMATION_TEXT[responseStr];
      await ctx.editMessageText(confirmation, { parse_mode: 'HTML' }).catch((e) =>
        log('warn', 'NeighborCheck', `editMessageText confirmation: ${e}`)
      );
    } catch (err) {
      log('error', 'NeighborCheck', `שגיאה בטיפול ב-nc callback: ${err}`);
    }
  });
}
