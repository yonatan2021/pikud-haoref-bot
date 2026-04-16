import type { Bot } from 'grammy';
import { getDb } from '../db/schema.js';
import {
  insertResponse,
  getAggregate,
  getPulseByFingerprint as _getPulseByFingerprint,
} from '../db/communityPulseRepository.js';
import type { PulseAnswer } from '../db/communityPulseRepository.js';
import { getNumber } from '../config/configResolver.js';
import { log } from '../logger.js';

const ANSWER_LABELS: Record<PulseAnswer, string> = {
  ok:      '✅ בסדר',
  scared:  '😰 מפחד/ת',
  helping: '🤝 עוזר/ת לאחרים',
};

function buildAggregateText(
  total: number, ok: number, scared: number, helping: number
): string {
  return (
    `📊 <b>תוצאות הסקר</b>\n\n` +
    `✅ בסדר: <b>${ok}</b>\n` +
    `😰 מפחד/ת: <b>${scared}</b>\n` +
    `🤝 עוזר/ת: <b>${helping}</b>\n\n` +
    `<i>סה"כ ${total} משיבים</i>`
  );
}

function parseCallback(
  data: string
): { answer: PulseAnswer; pulseId: number } | null {
  const m = data.match(/^pulse:(ok|scared|helping):(\d+)$/);
  if (!m) return null;
  return { answer: m[1] as PulseAnswer, pulseId: Number(m[2]) };
}

function parseAggCallback(data: string): number | null {
  const m = data.match(/^pulse:agg:(\d+)$/);
  if (!m) return null;
  return Number(m[1]);
}

export function registerCommunityPulseHandler(bot: Bot): void {
  // Response handler: pulse:ok|scared|helping:<pulseId>
  bot.callbackQuery(/^pulse:(ok|scared|helping):\d+$/, async (ctx) => {
    const chatId = ctx.from?.id;
    if (!chatId) {
      await ctx.answerCallbackQuery().catch((e) => log('warn', 'CommunityPulse', `answerCallbackQuery: ${e}`));
      return;
    }

    let answered = false;
    try {
      const parsed = parseCallback(ctx.callbackQuery.data);
      if (!parsed) {
        await ctx.answerCallbackQuery();
        answered = true;
        return;
      }

      const { answer, pulseId } = parsed;
      const db = getDb();

      const inserted = insertResponse(db, pulseId, chatId, answer);

      const threshold = getNumber(db, 'pulse_aggregate_threshold', 5);
      const agg = getAggregate(db, pulseId);

      const label = ANSWER_LABELS[answer];
      let text = inserted
        ? `תודה על המענה ${label} ✅`
        : `כבר ענית על הסקר הזה — התשובה המקורית שלך נשמרה.`;

      if (agg.total >= threshold) {
        text += `\n\n${buildAggregateText(agg.total, agg.ok, agg.scared, agg.helping)}`;
      }

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '📊 ראה תוצאות', callback_data: `pulse:agg:${pulseId}` },
          ]],
        },
      });
    } catch (err) {
      log('error', 'CommunityPulse', `callback error: ${String(err)}`);
    } finally {
      if (!answered) {
        await ctx.answerCallbackQuery().catch((e) => log('warn', 'CommunityPulse', `answerCallbackQuery: ${e}`));
      }
    }
  });

  // Aggregate view handler: pulse:agg:<pulseId>
  bot.callbackQuery(/^pulse:agg:\d+$/, async (ctx) => {
    let answered = false;
    try {
      const pulseId = parseAggCallback(ctx.callbackQuery.data);
      if (pulseId === null) {
        await ctx.answerCallbackQuery();
        answered = true;
        return;
      }

      const db = getDb();
      const threshold = getNumber(db, 'pulse_aggregate_threshold', 5);
      const agg = getAggregate(db, pulseId);

      let text: string;
      if (agg.total < threshold) {
        text = `עדיין מוקדם — אין מספיק תגובות להצגה.`;
      } else {
        text = buildAggregateText(agg.total, agg.ok, agg.scared, agg.helping);
      }

      await ctx.editMessageText(text, { parse_mode: 'HTML' });
    } catch (err) {
      log('error', 'CommunityPulse', `agg callback error: ${String(err)}`);
    } finally {
      if (!answered) {
        await ctx.answerCallbackQuery().catch((e) => log('warn', 'CommunityPulse', `answerCallbackQuery: ${e}`));
      }
    }
  });
}
