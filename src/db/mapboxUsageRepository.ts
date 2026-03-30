import { getDb } from './schema.js';
import { log } from '../logger.js';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// In-memory counter — seeded at startup, persisted on every increment for durability
let memMonth = '';
let memCount = 0;

export function initUsageCache(): void {
  memMonth = currentMonth();
  memCount = getMonthlyCount(memMonth);
}

export function getMonthlyCount(month: string): number {
  const row = getDb()
    .prepare('SELECT request_count FROM mapbox_usage WHERE month = ?')
    .get(month) as { request_count: number } | undefined;
  return row?.request_count ?? 0;
}

export function incrementMonthlyCount(month: string): number {
  if (month !== memMonth) {
    // Month rolled over — reset in-memory counter
    memMonth = month;
    memCount = 0;
  }
  memCount++;
  getDb()
    .prepare(
      `INSERT INTO mapbox_usage (month, request_count) VALUES (?, 1)
       ON CONFLICT(month) DO UPDATE SET request_count = request_count + 1`
    )
    .run(month);
  return memCount;
}

export function isMonthlyLimitReached(): boolean {
  const limit = parseInt(process.env.MAPBOX_MONTHLY_LIMIT ?? '0', 10);
  if (!limit) return false;
  if (currentMonth() !== memMonth) return false; // month rolled over since init
  return memCount >= limit;
}
