import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getProfile, updateProfile, upsertUser } from '../db/userRepository.js';
import { searchCities, getCityData, getCityById } from '../cityLookup.js';
import { log } from '../logger.js';
import { stripHtml, escapeHtml } from '../textUtils.js';

const MAX_NAME_LENGTH = 50;

/** Ephemeral edit state — acceptable to lose on restart (user just taps edit again) */
const pendingEdits = new Map<number, 'name' | 'city'>();

/** Build the profile summary message */
export function buildProfileSummary(
  displayName: string | null,
  homeCity: string | null,
  locale: string,
  connectionCode?: string | null
): { text: string; keyboard: InlineKeyboard } {
  const nameLine = displayName ?? 'לא הוגדר';
  const cityLine = homeCity ?? 'לא הוגדרה';
  const localeName = locale === 'he' ? 'עברית' : locale;
  const codeLine = connectionCode ? `<code>${connectionCode}</code>` : '—';

  const text = [
    '👤 <b>הפרופיל שלי</b>',
    '',
    `📛 שם: ${nameLine}`,
    `🏠 עיר מגורים: ${cityLine}`,
    `🌐 שפה: ${localeName} ✓`,
    `🔗 קוד חיבור: ${codeLine}`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('✏️ עריכת שם', 'pf:edit_name')
    .text('✏️ עריכת עיר', 'pf:edit_city')
    .row()
    .text('↩️ חזור', 'menu:main');

  return { text, keyboard };
}

/** Render and send/edit the profile message */
async function renderProfile(ctx: Context, chatId: number, edit: boolean): Promise<void> {
  const profile = getProfile(chatId);
  const { text, keyboard } = buildProfileSummary(
    profile?.display_name ?? null,
    profile?.home_city ?? null,
    profile?.locale ?? 'he',
    profile?.connection_code ?? null
  );
  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

export function registerProfileHandler(bot: Bot): void {
  bot.command('profile', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    try {
      upsertUser(chatId);
      pendingEdits.delete(chatId);
      await renderProfile(ctx, chatId, false);
    } catch (err) {
      log('error', 'Profile', `/profile failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery('pf:edit_name', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Profile', `answerCallbackQuery: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    try {
      pendingEdits.set(chatId, 'name');
      await ctx.editMessageText(
        '✏️ <b>עריכת שם</b>\n\nשלח את השם החדש שלך (עד 50 תווים):',
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('↩️ ביטול', 'pf:cancel'),
        }
      );
    } catch (err) {
      log('error', 'Profile', `pf:edit_name failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery('pf:edit_city', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Profile', `answerCallbackQuery: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    try {
      pendingEdits.set(chatId, 'city');
      await ctx.editMessageText(
        '✏️ <b>עריכת עיר מגורים</b>\n\nחפש עיר (לפחות 2 תווים):',
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('↩️ ביטול', 'pf:cancel'),
        }
      );
    } catch (err) {
      log('error', 'Profile', `pf:edit_city failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery('pf:cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Profile', `answerCallbackQuery: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      pendingEdits.delete(chatId);
      await renderProfile(ctx, chatId, true);
    } catch (err) {
      log('error', 'Profile', `pf:cancel failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });

  bot.callbackQuery(/^pf:city:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Profile', `answerCallbackQuery: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const cityId = parseInt(ctx.match![1]);
      const city = getCityById(cityId);
      if (!city) {
        await ctx.reply('❌ עיר לא נמצאה.');
        return;
      }
      updateProfile(chatId, { home_city: city.name });
      pendingEdits.delete(chatId);
      log('info', 'Profile', `User ${chatId} updated home_city to ${city.name}`);
      await renderProfile(ctx, chatId, false);
    } catch (err) {
      log('error', 'Profile', `pf:city callback failed: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });

  // Text handler for profile edits
  bot.on('message:text', async (ctx: Context, next) => {
    if (ctx.chat?.type !== 'private') { await next(); return; }
    const chatId = ctx.chat.id;
    const editType = pendingEdits.get(chatId);
    if (!editType) { await next(); return; }

    const text = ctx.message?.text ?? '';
    if (text.startsWith('/')) {
      pendingEdits.delete(chatId);
      await next();
      return;
    }

    try {
      if (editType === 'name') {
        const cleaned = stripHtml(text).trim();
        if (cleaned.length === 0 || cleaned.length > MAX_NAME_LENGTH) {
          await ctx.reply(
            `❌ השם חייב להיות בין 1 ל-${MAX_NAME_LENGTH} תווים. נסה שוב:`
          );
          return;
        }
        updateProfile(chatId, { display_name: cleaned });
        pendingEdits.delete(chatId);
        log('info', 'Profile', `User ${chatId} updated display_name`);
        await renderProfile(ctx, chatId, false);
        return;
      }

      if (editType === 'city') {
        const query = text.trim();
        if (query.length < 2) {
          await ctx.reply('❌ הקלד לפחות 2 תווים לחיפוש.');
          return;
        }

        // Exact match
        const exact = getCityData(query);
        if (exact) {
          updateProfile(chatId, { home_city: exact.name });
          pendingEdits.delete(chatId);
          log('info', 'Profile', `User ${chatId} updated home_city to ${exact.name}`);
          await renderProfile(ctx, chatId, false);
          return;
        }

        // Search
        const results = searchCities(query);
        if (results.length === 0) {
          await ctx.reply(
            `🔍 לא נמצאו ערים עבור "<b>${escapeHtml(query)}</b>". נסה שוב:`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (results.length === 1) {
          updateProfile(chatId, { home_city: results[0].name });
          pendingEdits.delete(chatId);
          log('info', 'Profile', `User ${chatId} updated home_city to ${results[0].name}`);
          await renderProfile(ctx, chatId, false);
          return;
        }

        const keyboard = new InlineKeyboard();
        for (const city of results.slice(0, 5)) {
          keyboard.text(city.name, `pf:city:${city.id}`).row();
        }
        keyboard.text('↩️ ביטול', 'pf:cancel');
        await ctx.reply('🔍 <b>בחר עיר מהרשימה:</b>', {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        return;
      }

      await next();
    } catch (err) {
      log('error', 'Profile', `Text handler failed for ${chatId}: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Profile', `Failed to send error reply: ${e}`)
      );
    }
  });
}

/** Exposed for testing — clear pending edits for a user */
export function clearPendingEdit(chatId: number): void {
  pendingEdits.delete(chatId);
}

/** Exposed for testing — check pending edit state */
export function getPendingEdit(chatId: number): 'name' | 'city' | undefined {
  return pendingEdits.get(chatId);
}
