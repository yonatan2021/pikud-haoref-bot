import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { getGroupsForUser, getMembersOfGroup } from '../db/groupRepository.js';
import { getUser } from '../db/userRepository.js';
import type { User } from '../db/userRepository.js';
import { dmQueue } from './dmQueue.js';
import { escapeHtml } from '../textUtils.js';
import { log } from '../logger.js';

/**
 * Dependencies for `notifyGroupMembersOfStatusChange`. The `getUser` seam is
 * MANDATORY for tests using `:memory:` databases — the production `getUser()`
 * reads from the `getDb()` singleton, which is a different instance from a
 * test-owned `new Database(':memory:')`. Without injection, tests would
 * silently get `undefined` display names. Pattern documented in memory:
 * `pattern_getuser_singleton_vs_di.md`.
 */
export interface GroupNotificationDeps {
  enqueueAll?: (tasks: Array<{ chatId: string; text: string }>) => void;
  getUser?: (chatId: number) => Pick<User, 'display_name'> | undefined;
}

/**
 * Notify all members of every group the sender belongs to — except the sender
 * themselves — that their safety status just changed. Mirrors
 * `safetyNotificationService.notifyContactsOfStatusChange` in shape and
 * intent, but operates over groups instead of contacts.
 *
 * Behaviour:
 * - Skips entirely when `status === 'dismissed'` (the user explicitly chose
 *   not to broadcast)
 * - Skips when sender belongs to no groups
 * - Iterates every group the sender is a member of (via `getGroupsForUser`)
 *   and collects every other member who has not opted out via
 *   `notify_group = 0`
 * - **Dedupes** recipients across overlapping groups — a user who shares
 *   two groups with the sender gets one DM, not two
 * - Each task carries the group name where the recipient first appeared
 *   (iteration order is `getGroupsForUser` ORDER BY created_at DESC)
 * - HTML-escapes both display name and group name to prevent injection
 *   when tasks reach Telegram's HTML parse mode
 *
 * Reuses the **bot-wide** `dmQueue` singleton — never instantiate a second
 * queue. The queue handles 429 backoff bot-globally and creating a parallel
 * queue would break that pause semantics.
 *
 * `_bot` is accepted for API symmetry with `notifyContactsOfStatusChange`
 * — `dmQueue` already holds a reference to the bot internally.
 *
 * Hooked into `safetyStatusHandler.ts` immediately after the existing
 * `notifyContactsOfStatusChange` call (~line 197). Fire-and-forget pattern
 * mirrors `dispatchSafetyPrompts` in `alertHandler.ts`.
 */
export async function notifyGroupMembersOfStatusChange(
  db: Database.Database,
  _bot: Bot,
  fromChatId: number,
  status: 'ok' | 'help' | 'dismissed',
  deps: GroupNotificationDeps = {},
): Promise<void> {
  if (status === 'dismissed') return;

  const groups = getGroupsForUser(db, fromChatId);
  if (groups.length === 0) return;

  const lookupUser = deps.getUser ?? getUser;
  const sender = lookupUser(fromChatId);
  const displayName = escapeHtml(sender?.display_name ?? `משתמש #${fromChatId}`);

  // Dedupe recipients across overlapping groups. Map key is recipient chatId,
  // value is the group name where they were first seen — that's what gets
  // shown in the DM ("👥 [groupName] ..."). The first-seen iteration order
  // matches `getGroupsForUser` (ORDER BY created_at DESC), giving newest
  // groups priority.
  const recipients = new Map<number, string>();
  for (const group of groups) {
    const members = getMembersOfGroup(db, group.id);
    for (const m of members) {
      if (m.userId === fromChatId) continue;
      if (!m.notifyGroup) continue;
      if (!recipients.has(m.userId)) {
        recipients.set(m.userId, group.name);
      }
    }
  }
  if (recipients.size === 0) return;

  const tasks: Array<{ chatId: string; text: string }> = [];
  for (const [userId, groupName] of recipients) {
    const escapedGroup = escapeHtml(groupName);
    const text =
      status === 'ok'
        ? `👥 <b>[${escapedGroup}]</b> ${displayName} דיווח/ה: ✅ בסדר`
        : `👥 <b>[${escapedGroup}]</b> ⚠️ ${displayName} מדווח/ת: זקוק/ה לעזרה\n\nשקול/י ליצור קשר ישירות.`;
    tasks.push({ chatId: String(userId), text });
  }

  log('info', 'GroupNotify', `${fromChatId} → ${tasks.length} recipients (${status})`);
  const enqueueAll = deps.enqueueAll ?? ((t) => dmQueue.enqueueAll(t));
  enqueueAll(tasks);
}
