import { getDb } from './schema.js';
import { upsertUser } from './userRepository.js';
import type { NotificationFormat } from './userRepository.js';

export interface SubscriberInfo {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: boolean;
  matchedCities: string[];
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

// Returns one SubscriberInfo per subscriber with all their matched cities.
// The raw query produces N rows per subscriber (one per matched city);
// aggregation into matchedCities is done in application code to avoid GROUP_CONCAT + JSON parsing.
export function getUsersForCities(cityNames: string[]): SubscriberInfo[] {
  if (cityNames.length === 0) return [];
  const placeholders = cityNames.map(() => '?').join(', ');
  const rawRows = getDb()
    .prepare(
      `SELECT s.chat_id, u.format, u.quiet_hours_enabled, s.city_name AS matched_city
       FROM subscriptions s
       JOIN users u ON u.chat_id = s.chat_id
       WHERE s.city_name IN (${placeholders})`
    )
    .all(...cityNames) as {
      chat_id: number;
      format: NotificationFormat;
      quiet_hours_enabled: number;
      matched_city: string;
    }[];

  const map = new Map<number, SubscriberInfo>();
  for (const row of rawRows) {
    const existing = map.get(row.chat_id);
    if (existing) {
      map.set(row.chat_id, {
        ...existing,
        matchedCities: [...existing.matchedCities, row.matched_city],
      });
    } else {
      map.set(row.chat_id, {
        chat_id: row.chat_id,
        format: row.format,
        quiet_hours_enabled: row.quiet_hours_enabled === 1,
        matchedCities: [row.matched_city],
      });
    }
  }
  return Array.from(map.values());
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
