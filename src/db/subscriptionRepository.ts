import { getDb } from './schema.js';
import { upsertUser } from './userRepository.js';
import type { NotificationFormat } from './userRepository.js';
import { log } from '../logger.js';

export interface SubscriberInfo {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: boolean;
  muted_until: string | null;
  matchedCities: string[];
}

// In-memory subscription cache — loaded at startup, kept in sync on writes
// cacheInitialized guards against partial state: write functions only update
// the Maps after initSubscriptionCache() has been called explicitly. Without
// this guard, addSubscription() in tests would populate the Maps and cause
// getUsersForCities() to serve stale cache data in subsequent test suites.
let cacheInitialized = false;
const cityToSubscribers = new Map<string, Set<number>>(); // cityName → Set<chatId>

export interface CachedSubscriberData {
  format: NotificationFormat;
  quiet_hours_enabled: boolean;
  muted_until: string | null;
}
const subscriberData = new Map<number, CachedSubscriberData>(); // chatId → user data

export function initSubscriptionCache(): void {
  cityToSubscribers.clear();
  subscriberData.clear();

  const rows = getDb()
    .prepare(
      `SELECT s.chat_id, s.city_name, u.format, u.quiet_hours_enabled, u.muted_until
       FROM subscriptions s
       JOIN users u ON u.chat_id = s.chat_id`
    )
    .all() as {
      chat_id: number;
      city_name: string;
      format: NotificationFormat;
      quiet_hours_enabled: number;
      muted_until: string | null;
    }[];

  for (const row of rows) {
    if (!cityToSubscribers.has(row.city_name)) {
      cityToSubscribers.set(row.city_name, new Set());
    }
    cityToSubscribers.get(row.city_name)!.add(row.chat_id);

    if (!subscriberData.has(row.chat_id)) {
      subscriberData.set(row.chat_id, {
        format: row.format,
        quiet_hours_enabled: row.quiet_hours_enabled === 1,
        muted_until: row.muted_until ?? null,
      });
    }
  }
  cacheInitialized = true;
}

export function addSubscription(chatId: number, cityName: string): void {
  upsertUser(chatId);
  getDb()
    .prepare('INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)')
    .run(chatId, cityName);

  if (cacheInitialized) {
    if (!cityToSubscribers.has(cityName)) {
      cityToSubscribers.set(cityName, new Set());
    }
    cityToSubscribers.get(cityName)!.add(chatId);
    if (!subscriberData.has(chatId)) {
      const user = getDb()
        .prepare('SELECT format, quiet_hours_enabled, muted_until FROM users WHERE chat_id = ?')
        .get(chatId) as { format: NotificationFormat; quiet_hours_enabled: number; muted_until: string | null } | undefined;
      if (user) {
        subscriberData.set(chatId, {
          format: user.format,
          quiet_hours_enabled: user.quiet_hours_enabled === 1,
          muted_until: user.muted_until ?? null,
        });
      }
    }
  }
}

export function removeSubscription(chatId: number, cityName: string): void {
  getDb()
    .prepare('DELETE FROM subscriptions WHERE chat_id = ? AND city_name = ?')
    .run(chatId, cityName);

  if (cacheInitialized) {
    cityToSubscribers.get(cityName)?.delete(chatId);
    const hasAny = [...cityToSubscribers.values()].some(s => s.has(chatId));
    if (!hasAny) subscriberData.delete(chatId);
  }
}

export function removeAllSubscriptions(chatId: number): void {
  getDb()
    .prepare('DELETE FROM subscriptions WHERE chat_id = ?')
    .run(chatId);

  if (cacheInitialized) {
    for (const set of cityToSubscribers.values()) {
      set.delete(chatId);
    }
    subscriberData.delete(chatId);
  }
}

export function getUserCities(chatId: number): string[] {
  const rows = getDb()
    .prepare('SELECT city_name FROM subscriptions WHERE chat_id = ? ORDER BY city_name')
    .all(chatId) as { city_name: string }[];
  return rows.map((r) => r.city_name);
}

// Private DB fallback — used when cache is not initialized
function getUsersForCitiesDb(cityNames: string[]): SubscriberInfo[] {
  if (cityNames.length === 0) return [];
  const placeholders = cityNames.map(() => '?').join(', ');
  const rawRows = getDb()
    .prepare(
      `SELECT s.chat_id, u.format, u.quiet_hours_enabled, u.muted_until, s.city_name AS matched_city
       FROM subscriptions s
       JOIN users u ON u.chat_id = s.chat_id
       WHERE s.city_name IN (${placeholders})`
    )
    .all(...cityNames) as {
      chat_id: number;
      format: NotificationFormat;
      quiet_hours_enabled: number;
      muted_until: string | null;
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
        muted_until: row.muted_until ?? null,
        matchedCities: [row.matched_city],
      });
    }
  }
  return Array.from(map.values());
}

export function getUsersForCities(cityNames: string[]): SubscriberInfo[] {
  if (cityNames.length === 0) return [];
  // Fall back to DB if initSubscriptionCache() was never called
  if (!cacheInitialized) return getUsersForCitiesDb(cityNames);

  const chatIds = new Set<number>();
  for (const city of cityNames) {
    cityToSubscribers.get(city)?.forEach((id) => chatIds.add(id));
  }

  return Array.from(chatIds).map((id) => {
    const data = subscriberData.get(id);
    if (!data) {
      log('error', 'SubscriptionCache', `Cache desync: missing subscriberData for chatId=${id}, skipping`);
      return null;
    }
    return {
      chat_id: id,
      format: data.format,
      quiet_hours_enabled: data.quiet_hours_enabled,
      muted_until: data.muted_until,
      matchedCities: cityNames.filter((c) => cityToSubscribers.get(c)?.has(id)),
    };
  }).filter((x): x is SubscriberInfo => x !== null);
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

export function updateSubscriberData(chatId: number, patch: Partial<CachedSubscriberData>): void {
  if (!cacheInitialized) return;
  const current = subscriberData.get(chatId);
  if (current) subscriberData.set(chatId, { ...current, ...patch });
}
