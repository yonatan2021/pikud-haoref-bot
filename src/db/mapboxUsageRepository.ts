import { getDb } from './schema.js';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthlyCount(month: string): number {
  const row = getDb()
    .prepare('SELECT request_count FROM mapbox_usage WHERE month = ?')
    .get(month) as { request_count: number } | undefined;
  return row?.request_count ?? 0;
}

export function incrementMonthlyCount(month: string): number {
  getDb()
    .prepare(
      `INSERT INTO mapbox_usage (month, request_count) VALUES (?, 1)
       ON CONFLICT(month) DO UPDATE SET request_count = request_count + 1`
    )
    .run(month);
  return getMonthlyCount(month);
}

export function isMonthlyLimitReached(): boolean {
  const raw = process.env.MAPBOX_MONTHLY_LIMIT;
  if (!raw) return false;
  const limit = parseInt(raw, 10);
  if (isNaN(limit)) return false;
  return getMonthlyCount(currentMonth()) >= limit;
}
