import { Router } from 'express';
import type Database from 'better-sqlite3';
import { log } from '../../logger.js';
import { updateSubscriberData, evictSubscriberFromCache } from '../../db/subscriptionRepository.js';
import type { NotificationFormat } from '../../db/userRepository.js';
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
               u.display_name, u.home_city, u.locale, u.onboarding_completed,
               u.connection_code,
               GROUP_CONCAT(s.city_name, '; ') as cities,
               (SELECT COUNT(*) FROM contacts c
                WHERE (c.user_id = u.chat_id OR c.contact_id = u.chat_id)
                AND c.status = 'accepted') as contact_count
        FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id
        GROUP BY u.chat_id
      `).all() as Array<{
        chat_id: number;
        format: string;
        quiet_hours_enabled: number;
        created_at: string;
        display_name: string | null;
        home_city: string | null;
        locale: string;
        onboarding_completed: number;
        connection_code: string | null;
        cities: string | null;
        contact_count: number;
      }>;

      // Escape every CSV string field. Two responsibilities:
      //   1. Double any embedded `"` (RFC 4180 quoting)
      //   2. Prepend a single quote to neutralise CSV formula injection when
      //      the value starts with =, +, -, or @ — Excel/Sheets/Numbers will
      //      otherwise interpret it as a formula. The project's gotchas doc
      //      already documents this as a known risk; the original escCsv()
      //      only did (1) and silently left this hole open.
      const escCsv = (s: string) => {
        const quoted = s.replace(/"/g, '""');
        return /^[=+\-@]/.test(quoted) ? `'${quoted}` : quoted;
      };
      const header = 'chat_id,display_name,home_city,connection_code,contact_count,format,quiet_hours,onboarding,locale,created_at,cities\n';
      const body = rows.map(r =>
        `${r.chat_id},"${escCsv(r.display_name ?? '')}","${escCsv(r.home_city ?? '')}","${escCsv(r.connection_code ?? '')}",${r.contact_count},"${escCsv(r.format)}",${r.quiet_hours_enabled},${r.onboarding_completed},"${escCsv(r.locale)}","${escCsv(r.created_at)}","${escCsv(r.cities ?? '')}"`
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
               u.display_name, u.home_city, u.locale, u.onboarding_completed,
               u.connection_code,
               COUNT(s.city_name) as city_count,
               (SELECT COUNT(*) FROM contacts c
                WHERE (c.user_id = u.chat_id OR c.contact_id = u.chat_id)
                AND c.status = 'accepted') as contact_count
        FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id
      `;
      const params: (string | number)[] = [];

      if (search) {
        sql += ` WHERE CAST(u.chat_id AS TEXT) LIKE ? OR s.city_name LIKE ? OR u.display_name LIKE ? OR u.home_city LIKE ?`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ` GROUP BY u.chat_id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parsedLimit, parsedOffset);

      let countSql = 'SELECT COUNT(DISTINCT u.chat_id) as c FROM users u LEFT JOIN subscriptions s ON u.chat_id = s.chat_id';
      const countParams: string[] = [];
      if (search) {
        countSql += ' WHERE CAST(u.chat_id AS TEXT) LIKE ? OR s.city_name LIKE ? OR u.display_name LIKE ? OR u.home_city LIKE ?';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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

      const contacts = db.prepare(`
        SELECT c.id, c.status, c.created_at,
               CASE WHEN c.user_id = ? THEN c.contact_id ELSE c.user_id END as other_id,
               CASE WHEN c.user_id = ? THEN u2.display_name ELSE u1.display_name END as other_name
        FROM contacts c
        LEFT JOIN users u1 ON u1.chat_id = c.user_id
        LEFT JOIN users u2 ON u2.chat_id = c.contact_id
        WHERE c.user_id = ? OR c.contact_id = ?
        ORDER BY c.created_at DESC
      `).all(chatId, chatId, chatId, chatId) as Array<{
        id: number; status: string; created_at: string;
        other_id: number; other_name: string | null;
      }>;

      res.json({ ...user, cities, contacts });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.patch('/:id', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id as string, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      const { format, quiet_hours_enabled, display_name, home_city } = req.body as {
        format?: string;
        quiet_hours_enabled?: boolean;
        display_name?: string | null;
        home_city?: string | null;
      };

      if (format !== undefined) {
        if (!(ALLOWED_FORMATS as readonly string[]).includes(format)) {
          res.status(400).json({ error: 'פורמט לא חוקי. ערכים חוקיים: short, detailed' });
          return;
        }
        db.prepare('UPDATE users SET format = ? WHERE chat_id = ?').run(format, chatId);
        updateSubscriberData(chatId, { format: format as NotificationFormat });
      }

      if (quiet_hours_enabled !== undefined) {
        db.prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?').run(
          quiet_hours_enabled ? 1 : 0,
          chatId,
        );
        updateSubscriberData(chatId, { quiet_hours_enabled });
      }

      if (display_name !== undefined) {
        db.prepare('UPDATE users SET display_name = ? WHERE chat_id = ?').run(display_name, chatId);
      }

      if (home_city !== undefined) {
        db.prepare('UPDATE users SET home_city = ? WHERE chat_id = ?').run(home_city, chatId);
      }

      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.delete('/:id', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id as string, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      db.prepare('DELETE FROM subscriptions WHERE chat_id = ?').run(chatId);
      db.prepare('DELETE FROM users WHERE chat_id = ?').run(chatId);
      evictSubscriberFromCache(chatId);
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.delete('/:id/cities/:city', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id as string, 10);
      if (isNaN(chatId)) { res.status(400).json({ error: 'מזהה לא חוקי' }); return; }

      const cityName = decodeURIComponent(req.params.city as string);
      db.prepare('DELETE FROM subscriptions WHERE chat_id = ? AND city_name = ?').run(chatId, cityName);
      evictSubscriberFromCache(chatId, cityName);
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  router.delete('/:id/contacts/:contactId', subscriberMutateLimiter, (req, res) => {
    try {
      const chatId = parseInt(req.params.id as string, 10);
      const contactRowId = parseInt(req.params.contactId as string, 10);
      if (isNaN(chatId) || isNaN(contactRowId)) {
        res.status(400).json({ error: 'מזהה לא חוקי' });
        return;
      }

      // Verify the contact belongs to this user (either direction) before deleting
      const contact = db.prepare(`
        SELECT id FROM contacts WHERE id = ? AND (user_id = ? OR contact_id = ?)
      `).get(contactRowId, chatId, chatId) as { id: number } | undefined;

      if (!contact) {
        res.status(404).json({ error: 'קשר לא נמצא' });
        return;
      }

      // Delete the contact by its id
      db.prepare('DELETE FROM contacts WHERE id = ?').run(contactRowId);
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Query error: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  return router;
}
