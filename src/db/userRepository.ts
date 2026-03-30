import { getDb } from './schema.js';

export type NotificationFormat = 'short' | 'detailed';

export interface User {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: boolean;
  muted_until: string | null;
  created_at: string;
}

export function upsertUser(chatId: number): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)')
    .run(chatId);
}

export function getUser(chatId: number): User | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM users WHERE chat_id = ?')
    .get(chatId) as {
      chat_id: number;
      format: NotificationFormat;
      quiet_hours_enabled: number;
      muted_until: string | null;
      created_at: string;
    } | undefined;
  if (!raw) return undefined;
  return {
    ...raw,
    quiet_hours_enabled: raw.quiet_hours_enabled === 1,
    muted_until: raw.muted_until ?? null,
  };
}

export function setFormat(chatId: number, format: NotificationFormat): void {
  upsertUser(chatId);
  getDb().prepare('UPDATE users SET format = ? WHERE chat_id = ?').run(format, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { format });
}

export function setQuietHours(chatId: number, enabled: boolean): void {
  upsertUser(chatId);
  getDb().prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?').run(enabled ? 1 : 0, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { quiet_hours_enabled: enabled });
}

export function setMutedUntil(chatId: number, until: Date | null): void {
  upsertUser(chatId);
  const iso = until ? until.toISOString() : null;
  getDb().prepare('UPDATE users SET muted_until = ? WHERE chat_id = ?').run(iso, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { muted_until: iso });
}

export function isMuted(chatId: number): boolean {
  const user = getUser(chatId);
  if (!user?.muted_until) return false;
  return new Date(user.muted_until) > new Date();
}

export function deleteUser(chatId: number): void {
  getDb()
    .prepare('DELETE FROM users WHERE chat_id = ?')
    .run(chatId);
}
