import { getDb } from './schema.js';

export type NotificationFormat = 'short' | 'detailed';

export interface User {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: number;
  created_at: string;
}

export function upsertUser(chatId: number): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)')
    .run(chatId);
}

export function getUser(chatId: number): User | undefined {
  return getDb()
    .prepare('SELECT * FROM users WHERE chat_id = ?')
    .get(chatId) as User | undefined;
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

export function deleteUser(chatId: number): void {
  getDb()
    .prepare('DELETE FROM users WHERE chat_id = ?')
    .run(chatId);
}
