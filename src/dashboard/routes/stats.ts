import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getMetrics } from '../../metrics.js';
import { ALERT_TYPE_CATEGORY } from '../../topicRouter.js';
import { log } from '../../logger.js';
import { getCached, setCached } from '../statsCache.js';
import { israelMidnight, israelYesterdayMidnight, israelMidnightDaysAgo } from '../israelDate.js';

// Reverse map: category → list of alert types (derived once at module load)
const groups: Record<string, string[]> = {};
for (const [type, cat] of Object.entries(ALERT_TYPE_CATEGORY)) {
  groups[cat] = [...(groups[cat] ?? []), type];
}
const CATEGORY_TYPES = Object.freeze(groups);

const MAX_DAYS = 365;
const MIN_DAYS = 1;
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const TOP_CITIES_LIMIT = 10;

function parseIntParam(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function countQuery(db: Database.Database, sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

export function createStatsRouter(db: Database.Database): Router {
  const router = Router();

  // NOTE: /alerts/by-category and /alerts/top-cities MUST be declared BEFORE /alerts
  // to prevent Express treating 'by-category' and 'top-cities' as path param values.

  router.get('/health', (_req, res) => {
    const cached = getCached<object>('stats:health');
    if (cached) return res.json(cached);

    const { lastAlertAt, lastPollAt } = getMetrics();
    let alertsToday = 0;
    try {
      alertsToday = countQuery(db, `SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= ?`, israelMidnight());
    } catch (err) {
      log('warn', 'Dashboard', `alertsToday query failed: ${String(err)}`);
    }
    const result = {
      uptime: process.uptime(),
      lastAlertAt: lastAlertAt?.toISOString() ?? null,
      lastPollAt: lastPollAt?.toISOString() ?? null,
      alertsToday,
    };
    setCached('stats:health', result, 3_000);
    return res.json(result);
  });

  router.get('/overview', (_req, res) => {
    const cached = getCached<object>('stats:overview');
    if (cached) return res.json(cached);

    try {
      const q = (sql: string, ...params: unknown[]): number => countQuery(db, sql, ...params);
      const mapboxRow = db
        .prepare(`SELECT request_count FROM mapbox_usage WHERE month = strftime('%Y-%m', 'now')`)
        .get() as { request_count: number } | undefined;

      const todayBoundary = israelMidnight();
      const yesterdayBoundary = israelYesterdayMidnight();
      // Use calendar-day subtraction (DST-safe) so the 7-day window aligns with
      // the Israel calendar boundary rather than drifting ±1h on DST changeover nights.
      const sevenDaysAgo = israelMidnightDaysAgo(7);
      const fourteenDaysAgo = israelMidnightDaysAgo(14);

      const result = {
        totalSubscribers: q('SELECT COUNT(*) as c FROM users'),
        totalSubscriptions: q('SELECT COUNT(*) as c FROM subscriptions'),
        alertsToday: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= ?`, todayBoundary),
        alertsYesterday: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= ? AND fired_at < ?`, yesterdayBoundary, todayBoundary),
        alertsLast7Days: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= ?`, sevenDaysAgo),
        alertsPrev7Days: q(`SELECT COUNT(*) as c FROM alert_history WHERE fired_at >= ? AND fired_at < ?`, fourteenDaysAgo, sevenDaysAgo),
        mapboxMonth: mapboxRow?.request_count ?? 0,
      };
      setCached('stats:overview', result, 60_000);
      return res.json(result);
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      return res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.get('/alerts/by-category', (_req, res) => {
    const cached = getCached<unknown[]>('stats:by-category');
    if (cached) return res.json(cached);

    try {
      const rows = db.prepare(`
        SELECT type, COUNT(*) as count, date(fired_at) as day
        FROM alert_history
        WHERE fired_at >= datetime('now', '-7 days')
        GROUP BY type, day
        ORDER BY day
      `).all();
      setCached('stats:by-category', rows, 300_000);
      return res.json(rows);
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      return res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.get('/alerts/top-cities', (_req, res) => {
    const cached = getCached<unknown[]>('stats:top-cities');
    if (cached) return res.json(cached);

    try {
      const rows = db.prepare(`
        SELECT value as city, COUNT(*) as count
        FROM alert_history, json_each(alert_history.cities)
        WHERE fired_at >= datetime('now', '-7 days')
          AND json_valid(alert_history.cities)
        GROUP BY city
        ORDER BY count DESC
        LIMIT ${TOP_CITIES_LIMIT}
      `).all();
      setCached('stats:top-cities', rows, 300_000);
      return res.json(rows);
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      return res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // ─── Safety Check stats (#214) ─────────────────────────────────────
  router.get('/safety-check', (_req, res) => {
    const cached = getCached<object>('stats:safety-check');
    if (cached) return res.json(cached);

    try {
      const todayBoundary = israelMidnight();
      const sevenDaysAgo = israelMidnightDaysAgo(7);
      const thirtyDaysAgo = israelMidnightDaysAgo(30);

      // KPIs
      const totalToday = countQuery(db, 'SELECT COUNT(*) as c FROM safety_prompts WHERE sent_at >= ?', todayBoundary);
      const totalWeek = countQuery(db, 'SELECT COUNT(*) as c FROM safety_prompts WHERE sent_at >= ?', sevenDaysAgo);
      const totalMonth = countQuery(db, 'SELECT COUNT(*) as c FROM safety_prompts WHERE sent_at >= ?', thirtyDaysAgo);

      const respondedWeek = countQuery(db, 'SELECT COUNT(*) as c FROM safety_prompts WHERE sent_at >= ? AND responded = 1', sevenDaysAgo);
      const responseRate = totalWeek > 0 ? Math.round((respondedWeek / totalWeek) * 100) : 0;

      // Answer breakdown from safety_status (week scope)
      const answers = {
        ok: countQuery(db, "SELECT COUNT(*) as c FROM safety_status WHERE status = 'ok' AND updated_at >= ?", sevenDaysAgo),
        help: countQuery(db, "SELECT COUNT(*) as c FROM safety_status WHERE status = 'help' AND updated_at >= ?", sevenDaysAgo),
        dismissed: countQuery(db, "SELECT COUNT(*) as c FROM safety_status WHERE status = 'dismissed' AND updated_at >= ?", sevenDaysAgo),
      };

      // Average response time (prompts responded to this week)
      const avgRow = db.prepare(`
        SELECT AVG(
          (julianday(ss.updated_at) - julianday(sp.sent_at)) * 86400000
        ) as avg_ms
        FROM safety_prompts sp
        JOIN safety_status ss ON ss.chat_id = sp.chat_id
        WHERE sp.responded = 1 AND sp.sent_at >= ?
      `).get(sevenDaysAgo) as { avg_ms: number | null };
      const avgResponseTimeMs = Math.round(avgRow?.avg_ms ?? 0);

      // 7-day trend
      const trend = db.prepare(`
        SELECT date(sent_at) as day,
          ROUND(CAST(SUM(responded) AS REAL) / COUNT(*) * 100) as responseRate
        FROM safety_prompts
        WHERE sent_at >= ?
        GROUP BY date(sent_at)
        ORDER BY day
      `).all(sevenDaysAgo) as Array<{ day: string; responseRate: number }>;

      // Recent prompts (last 20)
      const rawPrompts = db.prepare(`
        SELECT
          sp.chat_id,
          u.display_name,
          sp.alert_type,
          sp.sent_at,
          sp.responded,
          ss.status as answer,
          CASE WHEN sp.responded = 1 AND ss.updated_at IS NOT NULL
            THEN ROUND((julianday(ss.updated_at) - julianday(sp.sent_at)) * 86400)
            ELSE NULL
          END as responseTimeSec
        FROM safety_prompts sp
        LEFT JOIN users u ON u.chat_id = sp.chat_id
        LEFT JOIN safety_status ss ON ss.chat_id = sp.chat_id
        WHERE sp.sent_at >= ?
        ORDER BY sp.sent_at DESC
        LIMIT 20
      `).all(sevenDaysAgo) as Array<{
        chat_id: number; display_name: string | null; alert_type: string;
        sent_at: string; responded: number; answer: string | null; responseTimeSec: number | null;
      }>;

      const recentPrompts = rawPrompts.map(r => ({
        maskedUser: r.display_name ?? `****${String(r.chat_id).slice(-4)}`,
        alertType: r.alert_type,
        sentAt: r.sent_at,
        answer: r.responded === 1 ? (r.answer ?? 'unknown') : 'pending',
        responseTimeSec: r.responseTimeSec,
      }));

      const result = {
        kpis: { totalToday, totalWeek, totalMonth, responseRate, answers, avgResponseTimeMs },
        trend,
        recentPrompts,
      };
      setCached('stats:safety-check', result, 60_000);
      return res.json(result);
    } catch (err) {
      log('error', 'Dashboard', `Safety check stats error: ${String(err)}`);
      return res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.get('/alerts', (req, res) => {
    try {
      const query = req.query as Record<string, string>;
      const { type, city, category } = query;

      const rawDays = parseIntParam(query.days, DEFAULT_DAYS);
      const safeDays = Math.min(Math.max(rawDays, MIN_DAYS), MAX_DAYS);
      const safeLimit = Math.min(Math.max(parseIntParam(query.limit, DEFAULT_LIMIT), 1), MAX_LIMIT);
      const safeOffset = Math.max(parseIntParam(query.offset, 0), 0);

      let sql = `
        SELECT id, type, cities, instructions, fired_at
        FROM alert_history
        WHERE fired_at >= datetime('now', '-${safeDays} days')
      `;
      const params: (string | number)[] = [];

      if (category) {
        const types = CATEGORY_TYPES[category];
        if (types?.length) {
          const placeholders = types.map(() => '?').join(', ');
          sql += ` AND type IN (${placeholders})`;
          params.push(...types);
        }
      } else if (type) {
        // Backward-compatible exact-match filter
        sql += ` AND type = ?`;
        params.push(type);
      }

      if (city) {
        sql += ` AND EXISTS (SELECT 1 FROM json_each(cities) WHERE value LIKE ?)`;
        params.push(`%${city}%`);
      }

      sql += ` ORDER BY fired_at DESC LIMIT ? OFFSET ?`;
      params.push(safeLimit, safeOffset);

      const rows = db.prepare(sql).all(...params) as Array<{
        id: number;
        type: string;
        cities: string;
        instructions: string | null;
        fired_at: string;
      }>;

      res.json(rows.map(r => ({ ...r, cities: JSON.parse(r.cities) as string[] })));
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  return router;
}
