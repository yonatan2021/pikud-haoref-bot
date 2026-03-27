import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { searchCities, getCityById } from '../cityLookup.js';
import { addSubscription, removeSubscription, isSubscribed } from '../db/subscriptionRepository.js';
import { upsertUser } from '../db/userRepository.js';

const searchingUsers = new Set<number>();

function buildSearchResults(chatId: number, query: string): { text: string; keyboard: InlineKeyboard } {
  const results = searchCities(query);
  if (results.length === 0) {
    return {
      text: `🔍 לא נמצאו ערים עבור "<b>${query}</b>"`,
      keyboard: new InlineKeyboard().text('🔍 חפש שוב', 'search:start').text('↩️ חזור', 'menu:alerts'),
    };
  }

  const keyboard = new InlineKeyboard();
  results.slice(0, 10).forEach((city, idx) => {
    const subscribed = isSubscribed(chatId, city.name);
    const label = subscribed ? `✅ ${city.name}` : city.name;
    if (idx % 2 === 0) {
      keyboard.text(label, `st:${city.id}`);
    } else {
      keyboard.text(label, `st:${city.id}`).row();
    }
  });
  if (results.length % 2 !== 0) keyboard.row();
  keyboard.text('🔍 חפש שוב', 'search:start').text('↩️ חזור', 'menu:alerts');

  return {
    text: `🔍 תוצאות עבור "<b>${query}</b>":`,
    keyboard,
  };
}

export function registerSearchHandler(bot: Bot): void {
  bot.command('add', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    searchingUsers.add(ctx.chat.id);
    await ctx.reply('🔍 <b>חיפוש עיר</b>\n\nהקלד שם עיר (לפחות 2 תווים):', {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('↩️ ביטול', 'search:cancel'),
    });
  });

  bot.callbackQuery('search:start', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    searchingUsers.add(chatId);
    await ctx.editMessageText(
      '🔍 <b>חיפוש עיר</b>\n\nהקלד שם עיר (לפחות 2 תווים):',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('↩️ ביטול', 'search:cancel') }
    );
  });

  bot.callbackQuery('search:cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    searchingUsers.delete(chatId);
    const keyboard = new InlineKeyboard()
      .text('🔍 חפש עיר', 'search:start')
      .text('📋 הערים שלי', 'mycities:0')
      .row()
      .text('🔕 בטל הכל', 'settings:clearall')
      .text('↩️ חזור', 'menu:main');
    await ctx.editMessageText('🔔 <b>ניהול התראות</b>', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^st:(\d+)$/, async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    upsertUser(chatId);
    const cityId = parseInt(ctx.match![1]);
    const city = getCityById(cityId);
    if (!city) {
      await ctx.answerCallbackQuery('עיר לא נמצאה');
      return;
    }
    const subscribed = isSubscribed(chatId, city.name);
    if (subscribed) {
      removeSubscription(chatId, city.name);
      await ctx.answerCallbackQuery(`❌ הוסר: ${city.name}`);
    } else {
      addSubscription(chatId, city.name);
      await ctx.answerCallbackQuery(`✅ נוסף: ${city.name}`);
    }
    // Re-render same message with updated checkmarks
    const msgText = ctx.callbackQuery?.message?.text ?? '';
    const queryMatch = msgText.match(/"([^"]+)"/);
    if (queryMatch) {
      const { text, keyboard } = buildSearchResults(chatId, queryMatch[1]);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  });

  bot.on('message:text', async (ctx: Context, next) => {
    if (ctx.chat?.type !== 'private') { await next(); return; }
    const chatId = ctx.chat.id;
    if (!searchingUsers.has(chatId)) { await next(); return; }
    const text = ctx.message?.text ?? '';
    if (text.startsWith('/')) {
      searchingUsers.delete(chatId);
      await next();
      return;
    }
    searchingUsers.delete(chatId);
    const { text: resultText, keyboard } = buildSearchResults(chatId, text);
    await ctx.reply(resultText, { parse_mode: 'HTML', reply_markup: keyboard });
  });
}
