import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import {
  getProfile,
  updateProfile,
  setOnboardingStep,
  completeOnboarding,
  upsertUser,
} from '../db/userRepository.js';
import type { OnboardingStep } from '../db/userRepository.js';
import { searchCities, getCityData, getCityById } from '../cityLookup.js';
import { addSubscription } from '../db/subscriptionRepository.js';
import { log } from '../logger.js';
import { stripHtml, escapeHtml } from '../textUtils.js';

const MAX_NAME_LENGTH = 50;

/** Build welcome message for the name step */
export function buildNamePrompt(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      '👋 <b>ברוך הבא לבוט פיקוד העורף!</b>',
      '',
      'בוא נגדיר את הפרופיל שלך.',
      '',
      '📛 מה השם שלך?',
      '<i>שלח הודעת טקסט (עד 50 תווים)</i>',
    ].join('\n'),
    keyboard: new InlineKeyboard()
      .text('⏭️ דלג', 'ob:skip_name')
      .row(),
  };
}

/** Build city prompt message */
export function buildCityPrompt(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      '🏠 <b>עיר מגורים</b>',
      '',
      'הקלד את שם העיר שלך כדי שנוכל לרשום אותך להתראות.',
      '<i>חפש לפחות 2 תווים</i>',
    ].join('\n'),
    keyboard: new InlineKeyboard()
      .text('⏭️ דלג', 'ob:skip_city')
      .row(),
  };
}

/** Build city search results keyboard for onboarding */
export function buildCityResults(
  results: { id: number; name: string }[]
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  for (const city of results.slice(0, 5)) {
    keyboard.text(city.name, `ob:city:${city.id}`).row();
  }
  keyboard.text('⏭️ דלג', 'ob:skip_city');
  return {
    text: '🔍 <b>בחר עיר מהרשימה:</b>',
    keyboard,
  };
}

/** Build confirmation summary */
export function buildConfirmPrompt(
  displayName: string | null,
  homeCity: string | null
): { text: string; keyboard: InlineKeyboard } {
  const nameLine = displayName ?? '<i>לא הוגדר</i>';
  const cityLine = homeCity ?? '<i>לא הוגדרה</i>';
  return {
    text: [
      '✅ <b>סיכום הפרופיל שלך</b>',
      '',
      `📛 שם: ${nameLine}`,
      `🏠 עיר: ${cityLine}`,
      '',
      'הכל נכון?',
    ].join('\n'),
    keyboard: new InlineKeyboard()
      .text('✅ אישור', 'ob:confirm')
      .text('🔄 התחל מחדש', 'ob:restart')
      .row(),
  };
}

/** Send the appropriate step message based on current onboarding state */
export async function sendStepMessage(
  ctx: Context,
  step: OnboardingStep | null,
  chatId: number
): Promise<void> {
  if (step === 'name') {
    const { text, keyboard } = buildNamePrompt();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else if (step === 'city') {
    const { text, keyboard } = buildCityPrompt();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else if (step === 'confirm') {
    const profile = getProfile(chatId);
    const { text, keyboard } = buildConfirmPrompt(
      profile?.display_name ?? null,
      profile?.home_city ?? null
    );
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

/** Check if a user is currently in the onboarding flow */
export function isInOnboarding(chatId: number): boolean {
  const profile = getProfile(chatId);
  if (!profile) return false;
  return profile.onboarding_step !== null && !profile.onboarding_completed;
}

export function registerOnboardingHandler(bot: Bot): void {
  // Handle all onboarding callback queries
  bot.callbackQuery(/^ob:/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;

    try {
      const data = ctx.callbackQuery?.data ?? '';

      if (data === 'ob:skip_name') {
        setOnboardingStep(chatId, 'city');
        await sendStepMessage(ctx, 'city', chatId);
        return;
      }

      if (data === 'ob:skip_city') {
        setOnboardingStep(chatId, 'confirm');
        await sendStepMessage(ctx, 'confirm', chatId);
        return;
      }

      if (data === 'ob:restart') {
        setOnboardingStep(chatId, 'name');
        await sendStepMessage(ctx, 'name', chatId);
        return;
      }

      if (data === 'ob:confirm') {
        const profile = getProfile(chatId);
        completeOnboarding(chatId);
        // Auto-subscribe to home city if set
        if (profile?.home_city) {
          const cityData = getCityData(profile.home_city);
          if (cityData) {
            try {
              addSubscription(chatId, cityData.name);
              log('info', 'Onboarding', `Auto-subscribed ${chatId} to ${cityData.name}`);
            } catch (subErr) {
              log('error', 'Onboarding', `Auto-subscription failed for ${chatId} to ${cityData.name}: ${subErr}`);
              await ctx.reply(
                '⚠️ ההרשמה הושלמה, אך לא הצלחנו לרשום אותך להתראות. נסה להוסיף ערים דרך התפריט.'
              ).catch((e) => log('error', 'Onboarding', `Failed to send subscription warning: ${e}`));
            }
          }
        }
        log('info', 'Onboarding', `User ${chatId} completed onboarding`);
        await ctx.reply(
          '🎉 <b>ההרשמה הושלמה!</b>\n\nלחץ /start לפתיחת התפריט הראשי.',
          { parse_mode: 'HTML' }
        );
        return;
      }

      // ob:city:{id} — city selection
      const cityMatch = data.match(/^ob:city:(\d+)$/);
      if (cityMatch) {
        const city = getCityById(parseInt(cityMatch[1]));
        if (!city) {
          await ctx.reply('❌ עיר לא נמצאה, נסה שוב.');
          return;
        }
        updateProfile(chatId, { home_city: city.name });
        setOnboardingStep(chatId, 'confirm');
        await sendStepMessage(ctx, 'confirm', chatId);
        return;
      }
    } catch (err) {
      log('error', 'Onboarding', `Callback failed for ${chatId}: ${err}`);
    }
  });

  // Text handler — intercepts messages during onboarding
  bot.on('message:text', async (ctx: Context, next) => {
    if (ctx.chat?.type !== 'private') { await next(); return; }

    const chatId = ctx.chat.id;
    if (!isInOnboarding(chatId)) { await next(); return; }

    const text = ctx.message?.text ?? '';
    // Let commands through
    if (text.startsWith('/')) { await next(); return; }

    try {
      const profile = getProfile(chatId);
      const step = profile?.onboarding_step;

      if (step === 'name') {
        const cleaned = stripHtml(text).trim();
        if (cleaned.length === 0 || cleaned.length > MAX_NAME_LENGTH) {
          await ctx.reply(
            `❌ השם חייב להיות בין 1 ל-${MAX_NAME_LENGTH} תווים. נסה שוב:`,
            { parse_mode: 'HTML' }
          );
          return;
        }
        updateProfile(chatId, { display_name: cleaned });
        setOnboardingStep(chatId, 'city');
        await sendStepMessage(ctx, 'city', chatId);
        return;
      }

      if (step === 'city') {
        const query = text.trim();
        if (query.length < 2) {
          await ctx.reply('❌ הקלד לפחות 2 תווים לחיפוש.');
          return;
        }

        // Check for exact match first
        const exact = getCityData(query);
        if (exact) {
          updateProfile(chatId, { home_city: exact.name });
          setOnboardingStep(chatId, 'confirm');
          await sendStepMessage(ctx, 'confirm', chatId);
          return;
        }

        // Search for partial matches
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
          setOnboardingStep(chatId, 'confirm');
          await sendStepMessage(ctx, 'confirm', chatId);
          return;
        }

        const { text: resultText, keyboard } = buildCityResults(results);
        await ctx.reply(resultText, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      // If in confirm step but got text, just remind them
      if (step === 'confirm') {
        await sendStepMessage(ctx, 'confirm', chatId);
        return;
      }

      await next();
    } catch (err) {
      log('error', 'Onboarding', `Text handler failed for ${chatId}: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Onboarding', `Failed to send error reply: ${e}`)
      );
    }
  });
}
