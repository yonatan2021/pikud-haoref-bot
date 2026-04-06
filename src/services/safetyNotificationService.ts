import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { listContacts, getPermissions } from '../db/contactRepository.js';
import { getUser } from '../db/userRepository.js';
import { dmQueue } from './dmQueue.js';
import { escapeHtml } from '../textUtils.js';

/**
 * Notifies accepted contacts that have `safety_status` permission enabled
 * when a user updates their safety status via a prompt response.
 *
 * `_db` and `_bot` are accepted for API compatibility with the call site
 * in safetyStatusHandler.ts. DMs are enqueued via the shared dmQueue which
 * already holds a reference to the bot instance.
 */
export async function notifyContactsOfStatusChange(
  _db: Database.Database,
  _bot: Bot,
  fromChatId: number,
  status: 'ok' | 'help' | 'dismissed'
): Promise<void> {
  if (status === 'dismissed') return;

  const contacts = listContacts(fromChatId, 'accepted');
  if (contacts.length === 0) return;

  const user = getUser(fromChatId);
  const displayName = escapeHtml(user?.display_name ?? `משתמש #${fromChatId}`);

  const text =
    status === 'ok'
      ? `✅ <b>${displayName}</b> עדכן/ה: בסדר`
      : `⚠️ <b>${displayName}</b> מדווח/ת: זקוק/ה לעזרה\n\nשקול/י ליצור קשר ישירות.`;

  for (const contact of contacts) {
    const perms = getPermissions(contact.id);
    if (!perms?.safety_status) continue;

    const otherChatId =
      contact.user_id === fromChatId ? contact.contact_id : contact.user_id;

    dmQueue.enqueueAll([{ chatId: String(otherChatId), text }]);
  }
}
