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
  getDb()
    .prepare('UPDATE users SET format = ? WHERE chat_id = ?')
    .run(format, chatId);
}

export function setQuietHours(chatId: number, enabled: boolean): void {
  upsertUser(chatId);
  getDb()
    .prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?')
    .run(enabled ? 1 : 0, chatId);
}

export function setMutedUntil(chatId: number, until: Date | null): void {
  upsertUser(chatId);
  getDb()
    .prepare('UPDATE users SET muted_until = ? WHERE chat_id = ?')
    .run(until ? until.toISOString() : null, chatId);
}

export function isMuted(chatId: number, now: Date = new Date()): boolean {
  const user = getUser(chatId);
  if (!user?.muted_until) return false;
  return new Date(user.muted_until) > now;
}

export function deleteUser(chatId: number): void {
  getDb()
    .prepare('DELETE FROM users WHERE chat_id = ?')
    .run(chatId);
}
