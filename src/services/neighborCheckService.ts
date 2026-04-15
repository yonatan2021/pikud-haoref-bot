import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import type { Alert } from '../types.js';
import { isDrillAlert } from '../alertHelpers.js';
import { getBool, getNumber, getString } from '../config/configResolver.js';
import { insertPrompt, updatePromptMessageId } from '../db/neighborCheckRepository.js';
import { log } from '../logger.js';

const DEFAULT_DELAY_MINUTES = 7;
const DEFAULT_TEXT = 'שלום, האם בדקת שכנים קשישים באזורך לאחר האזעקה?';

export interface NeighborCheckDeps {
  scheduleFn?: (fn: () => void, ms: number) => NodeJS.Timeout;
  cancelScheduleFn?: (handle: NodeJS.Timeout) => void;
  /** Injectable send function — returns message_id. Tests pass a mock. */
  sendFn?: (
    chatId: number,
    text: string,
    keyboard: object
  ) => Promise<{ message_id: number }>;
  /** Injectable function to fetch users in cities — for test isolation. */
  getUsersInCitiesFn?: (cities: string[]) => Array<{ chat_id: number }>;
}

/** Map of fingerprint → timeout handle for cancellation on graceful shutdown. */
const activeHandles = new Map<string, NodeJS.Timeout>();

interface UserRow {
  chat_id: number;
}

/**
 * Returns users whose home_city is in the alert's cities, who have
 * neighbor_check_enabled = 1 and is_dm_active = 1.
 */
export function getUsersInAlertCities(
  db: Database.Database,
  cities: string[]
): UserRow[] {
  if (cities.length === 0) return [];
  const placeholders = cities.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT chat_id FROM users
       WHERE home_city IN (${placeholders})
         AND neighbor_check_enabled = 1
         AND is_dm_active = 1`
    )
    .all(...cities) as UserRow[];
}

export function scheduleNeighborCheck(
  db: Database.Database,
  bot: Bot,
  alert: Alert,
  deps: NeighborCheckDeps = {}
): void {
  if (isDrillAlert(alert.type)) return;

  const globalEnabled = getBool(db, 'neighbor_check_enabled_default', true);
  if (!globalEnabled) return;

  const delayMinutes = getNumber(db, 'neighbor_check_delay_minutes', DEFAULT_DELAY_MINUTES);
  const delayMs = delayMinutes * 60 * 1000;
  const text = getString(db, 'neighbor_check_text', DEFAULT_TEXT);

  const fingerprint = alert.id ?? '';
  if (!fingerprint) {
    log('warn', 'NeighborCheck', 'alert.id ריק — מדלג על בדיקת שכנים');
    return;
  }

  const schedule = deps.scheduleFn ?? setTimeout;

  const handle = schedule(() => {
    activeHandles.delete(fingerprint);

    const users = deps.getUsersInCitiesFn
      ? deps.getUsersInCitiesFn(alert.cities)
      : getUsersInAlertCities(db, alert.cities);

    if (users.length === 0) return;

    const fpShort = fingerprint.slice(0, 8);
    const msgText = '🏠 <b>בדיקת שכנים</b>\n\n' + text;

    const sendFn = deps.sendFn ?? ((chatId: number, msgTxt: string, keyboard: object) =>
      bot.api.sendMessage(chatId, msgTxt, {
        parse_mode: 'HTML' as const,
        reply_markup: keyboard as any,
      })
    );

    for (const user of users) {
      const chatId = user.chat_id;
      const keyboard = {
        inline_keyboard: [[
          { text: '✅ בדקתי', callback_data: `nc:checked:${chatId}:${fpShort}` },
          { text: '😔 לא יכולתי', callback_data: `nc:unable:${chatId}:${fpShort}` },
          { text: '🔇 דלג', callback_data: `nc:dismissed:${chatId}:${fpShort}` },
        ]],
      };

      // Insert prompt row synchronously before fire-and-forget send (INSERT OR IGNORE — idempotent).
      // Row must exist before the message arrives so the callback handler can look it up.
      insertPrompt(db, chatId, fingerprint, undefined);

      sendFn(chatId, msgText, keyboard)
        .then((msg) => updatePromptMessageId(db, chatId, fingerprint, msg.message_id))
        .catch((err) => log('warn', 'NeighborCheck', `שגיאה בשליחה ל-${chatId}: ${err}`));
    }

    log('info', 'NeighborCheck', `בדיקת שכנים לאחר ${delayMinutes} דק׳ — ${users.length} משתמשים (fp=${fpShort})`);
  }, delayMs);

  activeHandles.set(fingerprint, handle);
}

export function cancelAll(): void {
  for (const [fp, handle] of activeHandles.entries()) {
    clearTimeout(handle);
    log('info', 'NeighborCheck', `ביטול טיימר שכנים עבור ${fp}`);
  }
  activeHandles.clear();
}
