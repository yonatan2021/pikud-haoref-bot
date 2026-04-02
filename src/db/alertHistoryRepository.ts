import { getDb } from './schema.js';
import type { Alert } from '../types.js';
import { log } from '../logger.js';

export interface AlertHistoryRow {
  id: number;
  type: string;
  cities: string[];
  instructions: string | undefined;
  fired_at: string;
}

type RawRow = {
  id: number;
  type: string;
  cities: string;
  instructions: string | null;
  fired_at: string;
};

function parseRow(raw: RawRow): AlertHistoryRow | null {
  try {
    const parsed = JSON.parse(raw.cities);
    if (!Array.isArray(parsed)) {
      log('error', 'AlertHistory', `cities is not an array for row id=${raw.id} — skipping`);
      return null;
    }
    return {
      id: raw.id,
      type: raw.type,
      cities: parsed as string[],
      instructions: raw.instructions ?? undefined,
      fired_at: raw.fired_at,
    };
  } catch (err) {
    log('error', 'AlertHistory', `Corrupt cities data for row id=${raw.id} — skipping: ${String(err)}`);
    return null;
  }
}

export function insertAlert(alert: Alert): void {
  getDb()
    .prepare('INSERT INTO alert_history (type, cities, instructions) VALUES (?, ?, ?)')
    .run(alert.type, JSON.stringify(alert.cities), alert.instructions ?? null);
}

export function getRecentAlerts(hours: number): AlertHistoryRow[] {
  const cutoff = new Date(Date.now() - hours * 3_600_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const rows = getDb()
    .prepare(
      `SELECT id, type, cities, instructions, fired_at
       FROM alert_history
       WHERE fired_at >= ?
       ORDER BY fired_at DESC`
    )
    .all(cutoff) as RawRow[];
  return rows.map(parseRow).filter((r): r is AlertHistoryRow => r !== null);
}

export function getAlertsForCity(city: string, limit: number): AlertHistoryRow[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT ah.id, ah.type, ah.cities, ah.instructions, ah.fired_at
       FROM alert_history ah, json_each(ah.cities) je
       WHERE je.value = ?
       ORDER BY ah.fired_at DESC
       LIMIT ?`
    )
    .all(city, limit) as RawRow[];
  return rows.map(parseRow).filter((r): r is AlertHistoryRow => r !== null);
}

export function countAlertsToday(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as cnt FROM alert_history WHERE fired_at >= datetime('now','start of day')`
    )
    .get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function getDailyAverageAlerts(days: number): number {
  if (days <= 0) return 0;
  const row = getDb()
    .prepare(
      `SELECT CAST(COUNT(*) AS REAL) / ? as avg
       FROM alert_history
       WHERE fired_at >= datetime('now', '-' || ? || ' days')`
    )
    .get(days, days) as { avg: number } | undefined;
  return row?.avg ?? 0;
}

export function getAlertsForCities(cities: string[], limit: number): AlertHistoryRow[] {
  if (cities.length === 0) return [];
  const placeholders = cities.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT ah.id, ah.type, ah.cities, ah.instructions, ah.fired_at
       FROM alert_history ah, json_each(ah.cities) je
       WHERE je.value IN (${placeholders})
       ORDER BY ah.fired_at DESC
       LIMIT ?`
    )
    .all(...cities, limit) as RawRow[];
  return rows.map(parseRow).filter((r): r is AlertHistoryRow => r !== null);
}
