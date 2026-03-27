import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { SUPER_REGIONS } from '../config/zones.js';
import { getCitiesByZone, getCityById } from '../cityLookup.js';
import {
  addSubscription,
  removeSubscription,
  getUserCities,
  isSubscribed,
} from '../db/subscriptionRepository.js';
import { upsertUser } from '../db/userRepository.js';

const PAGE_SIZE = 8;

interface ZoneState {
  superRegionIdx: number;
  zoneIdx: number;
  page: number;
}

const zoneStates = new Map<number, ZoneState>();

function buildSuperRegionMenu(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  SUPER_REGIONS.forEach((sr, idx) => {
    if (idx % 2 === 0) {
      keyboard.text(sr.name, `sr:${idx}`);
    } else {
      keyboard.text(sr.name, `sr:${idx}`).row();
    }
  });
  if (SUPER_REGIONS.length % 2 !== 0) keyboard.row();
  keyboard.text('↩️ חזור', 'menu:main');
  return keyboard;
}

function buildZoneMenu(superRegionIdx: number): InlineKeyboard {
  const sr = SUPER_REGIONS[superRegionIdx];
  const keyboard = new InlineKeyboard();
  sr.zones.forEach((zone, idx) => {
    if (idx % 2 === 0) {
      keyboard.text(zone, `zone:${superRegionIdx}:${idx}`);
    } else {
      keyboard.text(zone, `zone:${superRegionIdx}:${idx}`).row();
    }
  });
  if (sr.zones.length % 2 !== 0) keyboard.row();
  keyboard.text('↩️ חזור', 'menu:zones');
  return keyboard;
}

function buildCitiesMenu(chatId: number, superRegionIdx: number, zoneIdx: number, page: number): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const sr = SUPER_REGIONS[superRegionIdx];
  const zoneName = sr.zones[zoneIdx];
  const cities = getCitiesByZone(zoneName);
  const totalPages = Math.max(1, Math.ceil(cities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = cities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  slice.forEach((city, idx) => {
    const subscribed = isSubscribed(chatId, city.name);
    const label = subscribed ? `✅ ${city.name}` : city.name;
    if (idx % 2 === 0) {
      keyboard.text(label, `ct:${city.id}`);
    } else {
      keyboard.text(label, `ct:${city.id}`).row();
    }
  });
  if (slice.length % 2 !== 0) keyboard.row();

  keyboard.text('✓ בחר כל האזור', `ca:${superRegionIdx}:${zoneIdx}`).row();

  const navRow: string[] = [];
  if (safePage > 0) navRow.push(`zp:${safePage - 1}`);
  if (totalPages > 1) navRow.push(`zpinfo`);
  if (safePage < totalPages - 1) navRow.push(`zp:${safePage + 1}`);

  if (safePage > 0) keyboard.text('‹ הקודם', `zp:${safePage - 1}`);
  if (totalPages > 1) keyboard.text(`${safePage + 1}/${totalPages}`, 'noop');
  if (safePage < totalPages - 1) keyboard.text('הבא ›', `zp:${safePage + 1}`);
  if (totalPages > 1) keyboard.row();

  keyboard.text('↩️ חזור לאזורים', `sr:${superRegionIdx}`);

  const text = `📍 <b>${zoneName}</b>\n${cities.length} ערים · עמוד ${safePage + 1}/${totalPages}`;
  return { text, keyboard };
}

export function registerZoneHandler(bot: Bot): void {
  bot.command('zones', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const keyboard = buildSuperRegionMenu();
    await ctx.reply('📍 <b>בחר אזור</b>', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('menu:zones', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const keyboard = buildSuperRegionMenu();
    await ctx.editMessageText('📍 <b>בחר אזור</b>', { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^sr:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const idx = parseInt(ctx.match![1]);
    const sr = SUPER_REGIONS[idx];
    if (!sr) return;
    const keyboard = buildZoneMenu(idx);
    await ctx.editMessageText(`📍 <b>${sr.name}</b>\n\nבחר תת-אזור:`, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^zone:(\d+):(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const superRegionIdx = parseInt(ctx.match![1]);
    const zoneIdx = parseInt(ctx.match![2]);
    zoneStates.set(chatId, { superRegionIdx, zoneIdx, page: 0 });
    const { text, keyboard } = buildCitiesMenu(chatId, superRegionIdx, zoneIdx, 0);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^zp:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const page = parseInt(ctx.match![1]);
    const state = zoneStates.get(chatId);
    if (!state) return;
    state.page = page;
    const { text, keyboard } = buildCitiesMenu(chatId, state.superRegionIdx, state.zoneIdx, page);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^ct:(\d+)$/, async (ctx: Context) => {
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
    const state = zoneStates.get(chatId);
    if (!state) return;
    const { text, keyboard } = buildCitiesMenu(chatId, state.superRegionIdx, state.zoneIdx, state.page);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(/^ca:(\d+):(\d+)$/, async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    upsertUser(chatId);
    const superRegionIdx = parseInt(ctx.match![1]);
    const zoneIdx = parseInt(ctx.match![2]);
    const sr = SUPER_REGIONS[superRegionIdx];
    if (!sr) return;
    const zoneName = sr.zones[zoneIdx];
    const cities = getCitiesByZone(zoneName);
    const alreadySubscribed = getUserCities(chatId);
    const toAdd = cities.filter((c) => !alreadySubscribed.includes(c.name));
    toAdd.forEach((c) => addSubscription(chatId, c.name));
    await ctx.answerCallbackQuery(`✅ נוספו ${toAdd.length} ערים מ${zoneName}`);
    const state = zoneStates.get(chatId) ?? { superRegionIdx, zoneIdx, page: 0 };
    const { text, keyboard } = buildCitiesMenu(chatId, state.superRegionIdx, state.zoneIdx, state.page);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('noop', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
  });
}
