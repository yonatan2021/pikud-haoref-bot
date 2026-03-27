import { getDb } from './schema.js';

export type NotificationFormat = 'short' | 'detailed';

export interface User {
  chat_id: number;
  format: NotificationFormat;
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

export function deleteUser(chatId: number): void {
  getDb()
    .prepare('DELETE FROM users WHERE chat_id = ?')
    .run(chatId);
}
