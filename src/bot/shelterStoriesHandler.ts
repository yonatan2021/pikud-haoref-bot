import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getDb } from '../db/schema.js';
import {
  createStory,
  countStoriesByUserSince,
} from '../db/shelterStoryRepository.js';
import { getBool, getNumber } from '../config/configResolver.js';
import { log } from '../logger.js';

/** Ephemeral per-user pending share state — acceptable to lose on restart. */
interface PendingShareEntry {
  startedAt: number;
}

const pendingShares = new Map<number, PendingShareEntry>();

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneStalePendingShares(): void {
  const now = Date.now();
  for (const [chatId, entry] of pendingShares) {
    if (now - entry.startedAt > PENDING_TTL_MS) {
      pendingShares.delete(chatId);
    }
  }
}

export function registerShelterStoriesHandler(bot: Bot): void {
  bot.command('share', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;

    try {
      const db = getDb();
      const enabled = getBool(db, 'stories_enabled', true);
      if (!enabled) {
        await ctx.reply('הפיצ\'ר כבוי כרגע.');
        return;
      }

      const rateLimitMinutes = getNumber(db, 'stories_rate_limit_minutes', 30);
      const sinceIso = new Date(Date.now() - rateLimitMinutes * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);

      const recentCount = countStoriesByUserSince(db, chatId, sinceIso);
      if (recentCount > 0) {
        await ctx.reply(
          `יותר מדי הודעות — ניתן לשלוח הודעה אחת כל ${rateLimitMinutes} דקות. נסה שוב מאוחר יותר.`
        );
        return;
      }

      pendingShares.set(chatId, { startedAt: Date.now() });
      log('info', 'ShelterStories', `User ${chatId} started /share`);

      const maxLength = getNumber(db, 'stories_max_length', 200);
      const keyboard = new InlineKeyboard().text('❌ ביטול', 'story:cancel');
      await ctx.reply(
        `📝 <b>שתף חוויה מהמקלט</b>\n\nשלח הודעה קצרה (עד ${maxLength} תווים) ונשלח אותה לסקירה.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'ShelterStories', `/share failed for ${chatId}: ${String(err)}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'ShelterStories', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery('story:cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) =>
      log('warn', 'ShelterStories', `answerCallbackQuery: ${e}`)
    );
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    pendingShares.delete(chatId);
    try {
      await ctx.editMessageText('בוטל.');
    } catch (err) {
      log('warn', 'ShelterStories', `story:cancel edit failed: ${String(err)}`);
    }
  });

  // Text handler for story submissions
  bot.on('message:text', async (ctx: Context, next) => {
    if (ctx.chat?.type !== 'private') { await next(); return; }
    const chatId = ctx.chat.id;

    pruneStalePendingShares();

    if (!pendingShares.has(chatId)) { await next(); return; }

    const text = ctx.message?.text ?? '';

    // Let commands pass through and cancel the pending state
    if (text.startsWith('/')) {
      pendingShares.delete(chatId);
      await next();
      return;
    }

    try {
      const db = getDb();
      const maxLength = getNumber(db, 'stories_max_length', 200);

      if (text.length > maxLength) {
        await ctx.reply(
          `❌ ההודעה ארוכה מדי (${text.length} תווים). הגבלה: ${maxLength} תווים. נסה שוב:`
        );
        // Stay in pending state so user can retry, but let downstream handlers see the message too
        await next();
        return;
      }

      createStory(db, chatId, text);
      pendingShares.delete(chatId);
      log('info', 'ShelterStories', `User ${chatId} submitted a story`);
      await ctx.reply('תודה! הודעתך נשלחה לבדיקה ✅');
    } catch (err) {
      pendingShares.delete(chatId);
      log('error', 'ShelterStories', `Story submission failed for ${chatId}: ${String(err)}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'ShelterStories', `Failed to send error reply: ${e}`)
      );
    }
  });
}

/** Exposed for testing — clear a user's pending share state. */
export function clearPendingShare(chatId: number): void {
  pendingShares.delete(chatId);
}

/** Exposed for testing — check pending share state. */
export function hasPendingShare(chatId: number): boolean {
  return pendingShares.has(chatId);
}
