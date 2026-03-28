import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getMetrics } from '../../metrics.js';

const MAX_DAYS = 365;
const MIN_DAYS = 1;
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 100;
const TOP_CITIES_LIMIT = 10;

function parseIntParam(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function countQuery(db: Database.Database, sql: string): number {
  return (db.prepare(sql).get() as { c: number }).c;
}

export function createStatsRouter(db: Database.Database): Router {
  const router = Router();

  // NOTE: /alerts/by-category and /alerts/top-cities MUST be declared BEFORE /alerts
  // to prevent Express treating 'by-category' and 'top-cities' as path param values.

  router.get('/health', (_req, res) => {
    const { lastAlertAt, lastPollAt } = getMetrics();
    let alertsToday = 0;
    try {
      alertsToday = countQuery(db, `SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= date('now')`);
    } catch {
      // non-critical — table may not be seeded yet
    }
    res.json({
      uptime: process.uptime(),
      lastAlertAt: lastAlertAt?.toISOString() ?? null,
      lastPollAt: lastPollAt?.toISOString() ?? null,
      alertsToday,
    });
  });

  router.get('/overview', (_req, res) => {
    const q = (sql: string): number => countQuery(db, sql);
    const mapboxRow = db
      .prepare(`SELECT request_count FROM mapbox_usage WHERE month = strftime('%Y-%m', 'now')`)
      .get() as { request_count: number } | undefined;

    res.json({
      totalSubscribers: q('SELECT COUNT(*) as c FROM users'),
      totalSubscriptions: q('SELECT COUNT(*) as c FROM subscriptions'),
      alertsToday: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= date('now')`),
      alertsLast7Days: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= datetime('now', '-7 days')`),
      mapboxMonth: mapboxRow?.request_count ?? 0,
    });
  });

  router.get('/alerts/by-category', (_req, res) => {
    const rows = db.prepare(`
      SELECT type, COUNT(*) as count, date(fired_at) as day
      FROM alert_history
      WHERE fired_at >= datetime('now', '-7 days')
      GROUP BY type, day
      ORDER BY day
    `).all();
    res.json(rows);
  });

  router.get('/alerts/top-cities', (_req, res) => {
    const rows = db.prepare(`
      SELECT value as city, COUNT(*) as count
      FROM alert_history, json_each(alert_history.cities)
      WHERE fired_at >= datetime('now', '-7 days')
      GROUP BY city
      ORDER BY count DESC
      LIMIT ${TOP_CITIES_LIMIT}
    `).all();
    res.json(rows);
  });

  router.get('/alerts', (req, res) => {
    const query = req.query as Record<string, string>;
    const { type, city } = query;

    const rawDays = parseIntParam(query.days, DEFAULT_DAYS);
    const safeDays = Math.min(Math.max(rawDays, MIN_DAYS), MAX_DAYS);
    const limit = parseIntParam(query.limit, DEFAULT_LIMIT);
    const offset = parseIntParam(query.offset, 0);

    let sql = `
      SELECT id, type, cities, instructions, fired_at
      FROM alert_history
      WHERE fired_at >= datetime('now', '-${safeDays} days')
    `;
    const params: (string | number)[] = [];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    if (city) {
      sql += ` AND EXISTS (SELECT 1 FROM json_each(cities) WHERE value LIKE ?)`;
      params.push(`%${city}%`);
    }

    sql += ` ORDER BY fired_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as Array<{
      id: number;
      type: string;
      cities: string;
      instructions: string | null;
      fired_at: string;
    }>;

    res.json(rows.map(r => ({ ...r, cities: JSON.parse(r.cities) as string[] })));
  });

  return router;
}
