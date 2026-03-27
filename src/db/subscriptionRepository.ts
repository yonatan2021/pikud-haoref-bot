import { getDb } from './schema.js';
import { upsertUser } from './userRepository.js';
import type { NotificationFormat } from './userRepository.js';

export interface SubscriberInfo {
  chat_id: number;
  format: NotificationFormat;
}

export function addSubscription(chatId: number, cityName: string): void {
  upsertUser(chatId);
  getDb()
    .prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)')
    .run(chatId, cityName);
}

export function removeSubscription(chatId: number, cityName: string): void {
  getDb()
    .prepare('DELETE FROM subscriptions WHERE chat_id = ? AND city_name = ?')
    .run(chatId, cityName);
}

export function removeAllSubscriptions(chatId: number): void {
  getDb()
    .prepare('DELETE FROM subscriptions WHERE chat_id = ?')
    .run(chatId);
}

export function getUserCities(chatId: number): string[] {
  const rows = getDb()
    .prepare('SELECT city_name FROM subscriptions WHERE chat_id = ? ORDER BY city_name')
    .all(chatId) as { city_name: string }[];
  return rows.map((r) => r.city_name);
}

export function getUsersForCities(cityNames: string[]): SubscriberInfo[] {
  if (cityNames.length === 0) return [];
  const placeholders = cityNames.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT s.chat_id, u.format
       FROM subscriptions s
       JOIN users u ON u.chat_id = s.chat_id
       WHERE s.city_name IN (${placeholders})`
    )
    .all(...cityNames) as SubscriberInfo[];
  return rows;
}

export function isSubscribed(chatId: number, cityName: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM subscriptions WHERE chat_id = ? AND city_name = ?')
    .get(chatId, cityName);
  return row !== undefined;
}

export function getSubscriptionCount(chatId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as cnt FROM subscriptions WHERE chat_id = ?')
    .get(chatId) as { cnt: number };
  return row.cnt;
}
