import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import type { Alert } from '../types.js';
import type { User } from '../db/userRepository.js';
import { getUsersWithHomeCity } from '../db/userRepository.js';
import { computeAlertFingerprint, isDrillAlert } from '../alertHelpers.js';
import { shouldSkipForQuietHours } from './dmDispatcher.js';
import {
  insertSafetyPrompt,
  updateSafetyPromptMessageId,
  getUnrespondedPromptsForAllClear,
} from '../db/safetyPromptRepository.js';
import { log } from '../logger.js';

/**
 * Returns true only when ALL conditions are met:
 * - Not a drill
 * - User has a home_city and it is in the alert's cities (exact match)
 * - Not quiet hours (injectable `now` for deterministic tests)
 * - Not snoozed (muted_until is past or null)
 * - DM is active for the user
 *
 * Note: shouldSkipForQuietHours only suppresses 'drills'/'general' categories.
 * Security alerts (missiles, aircraft, etc.) always pass quiet-hours check.
 */
export function shouldSendSafetyPrompt(
  user: User,
  alert: Alert,
  now: Date = new Date()
): boolean {
  if (isDrillAlert(alert.type)) return false;
  if (!user.home_city) return false;
  if (!alert.cities.includes(user.home_city)) return false;
  if (shouldSkipForQuietHours(alert.type, user.quiet_hours_enabled, now)) return false;
  if (user.muted_until !== null && new Date(user.muted_until) > now) return false;
  if (!user.is_dm_active) return false;
  return true;
}

export async function dispatchSafetyPrompts(
  db: Database.Database,
  alert: Alert,
  bot: Bot
): Promise<void> {
  const fingerprint = computeAlertFingerprint(alert.type, alert.cities);
  const users = getUsersWithHomeCity(db);

  await Promise.allSettled(
    users.map(async (user) => {
      if (!shouldSendSafetyPrompt(user, alert)) return;

      // Insert first (messageId=null) to get the row ID for the inline keyboard.
      // INSERT OR IGNORE returns null if the row already exists (dedup).
      const promptId = insertSafetyPrompt(db, user.chat_id, fingerprint, undefined, alert.type);
      if (promptId === null) return; // already sent — dedup

      const text = `🚨 <b>התראה ב${user.home_city}</b>\n\nהאם אתה בסדר?`;
      const reply_markup = {
        inline_keyboard: [[
          { text: '✅ בסדר',        callback_data: `safety:ok:${promptId}` },
          { text: '⚠️ זקוק לעזרה', callback_data: `safety:help:${promptId}` },
          { text: '🔇 התעלם',       callback_data: `safety:dismiss:${promptId}` },
        ]],
      };

      try {
        const response = await bot.api.sendMessage(user.chat_id, text, {
          parse_mode: 'HTML',
          reply_markup,
        });
        updateSafetyPromptMessageId(db, promptId, response.message_id);
      } catch (err) {
        log('error', 'SafetyPrompt', `כישלון בשליחה ל-${user.chat_id}: ${err}`);
      }
    })
  );
}

/**
 * For each unresponded safety prompt sent within the Telegram edit window (48h),
 * edits the message in-place to inform the user the alert has ended.
 * Called on all-clear BEFORE deleting prompt rows from DB.
 * Individual edit failures are silently logged — they do not propagate.
 */
export async function clearStalePromptMessages(
  db: Database.Database,
  bot: Bot,
  alertType: string
): Promise<void> {
  const prompts = getUnrespondedPromptsForAllClear(db, alertType);
  await Promise.allSettled(
    prompts.map(async (prompt) => {
      if (!prompt.message_id) return;
      try {
        await bot.api.editMessageText(
          prompt.chat_id,
          prompt.message_id,
          '🟢 <b>האזעקה הסתיימה</b>\nאין צורך לעדכן סטטוס.',
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        log('error', 'SAFETY', `כישלון בעדכון הודעת בטיחות ${prompt.message_id}: ${err}`);
      }
    })
  );
}
