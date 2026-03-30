import { Router } from 'express';
import type Database from 'better-sqlite3';
import { log } from '../../logger.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';

const csvExportLimiter = createRateLimitMiddleware({
  maxRequests: 10,
  windowMs: 3_600_000,
  message: 'יותר מדי ייצואים — נסה שוב בעוד שעה',
});

const subscriberMutateLimiter = createRateLimitMiddleware({
  maxRequests: 10,
  windowMs: 60_000,
  message: 'יותר מדי עדכונים — נסה שוב בעוד דקה',
});

const ALLOWED_FORMATS = ['short', 'detailed'] as const;
const MAX_LIMIT = 200;

export function createSubscribersRouter(db: Database.Database): Router {
  const router = Router();

  // CSV export MUST come before /:id to avoid param conflict
  router.get('/export/csv', csvExportLimiter, (_req, res) => {
    try {
      const rows = db.prepare(`
        SELECT u.chat_id, u.format, u.quiet_hours_enabled, u.created_at,
               GROUP_CONCAT(s.city_name, '; ') as cities
        FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id
        GROUP BY u.chat_id
      `).all() as Array<{
        chat_id: number;
        format: string;
        quiet_hours_enabled: number;
        created_at: string;
        cities: string | null;
      }>;

      const header = 'chat_id,format,quiet_hours,created_at,cities\n';
      const body = rows.map(r =>
        `${r.chat_id},${r.format},${r.quiet_hours_enabled},${r.created_at},"${r.cities ?? ''}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
      res.send(header + body);
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.get('/', (req, res) => {
    try {
      const { search, limit = '50', offset = '0' } = req.query as Record<string, string>;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_LIMIT);
      const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

      let sql = `
        SELECT u.chat_id, u.format, u.quiet_hours_enabled, u.created_at,
               COUNT(s.city_name) as city_count
        FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id
      `;
      const params: (string | number)[] = [];

      if (search) {
        sql += ` WHERE CAST(u.chat_id AS TEXT) LIKE ? OR s.city_name LIKE ?`;
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ` GROUP BY u.chat_id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parsedLimit, parsedOffset);

      let countSql = 'SELECT COUNT(DISTINCT u.chat_id) as c FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id';
      const countParams: string[] = [];
      if (search) {
        countSql += ' WHERE CAST(u.chat_id AS TEXT) LIKE ? OR s.city_name LIKE ?';
        countParams.push(`%${search}%`, `%${search}%`);
      }
      const total = (db.prepare(countSql).get(...countParams) as { c: number }).c;
      const data = db.prepare(sql).all(...params);

      res.json({ data, total });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const chatId = parseInt(req.params.id, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      const user = db.prepare('SELECT * FROM users WHERE chat_id = ?').get(chatId);

      if (!user) {
        res.status(404).json({ error: 'לא נמצא' });
        return;
      }

      const cities = (
        db.prepare('SELECT city_name FROM subscriptions WHERE chat_id = ?').all(chatId) as { city_name: string }[]
      ).map(r => r.city_name);

      res.json({ ...user, cities });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.patch('/:id', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      const { format, quiet_hours_enabled } = req.body as {
        format?: string;
        quiet_hours_enabled?: boolean;
      };

      if (format !== undefined) {
        if (!(ALLOWED_FORMATS as readonly string[]).includes(format)) {
          res.status(400).json({ error: 'פורמט לא חוקי. ערכים חוקיים: short, detailed' });
          return;
        }
        db.prepare('UPDATE users SET format = ? WHERE chat_id = ?').run(format, chatId);
      }

      if (quiet_hours_enabled !== undefined) {
        db.prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?').run(
          quiet_hours_enabled ? 1 : 0,
          chatId,
        );
      }

      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.delete('/:id', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      db.prepare('DELETE FROM users WHERE chat_id = ?').run(chatId);
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.delete('/:id/cities/:city', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      db.prepare('DELETE FROM subscriptions WHERE chat_id = ? AND city_name = ?').run(
        chatId,
        decodeURIComponent(req.params.city),
      );
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  return router;
}
