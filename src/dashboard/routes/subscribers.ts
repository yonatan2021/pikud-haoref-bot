import { Router } from 'express';
import type Database from 'better-sqlite3';

export function createSubscribersRouter(db: Database.Database): Router {
  const router = Router();

  // CSV export MUST come before /:id to avoid param conflict
  router.get('/export/csv', (_req, res) => {
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
  });

  router.get('/', (req, res) => {
    const { search, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const parsedLimit = parseInt(limit, 10) || 50;
    const parsedOffset = parseInt(offset, 10) || 0;

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

    const total = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const data = db.prepare(sql).all(...params);

    res.json({ data, total });
  });

  router.get('/:id', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const user = db.prepare('SELECT * FROM users WHERE chat_id = ?').get(chatId);

    if (!user) {
      res.status(404).json({ error: 'לא נמצא' });
      return;
    }

    const cities = (
      db.prepare('SELECT city_name FROM subscriptions WHERE chat_id = ?').all(chatId) as { city_name: string }[]
    ).map(r => r.city_name);

    res.json({ ...user, cities });
  });

  router.patch('/:id', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const { format, quiet_hours_enabled } = req.body as {
      format?: string;
      quiet_hours_enabled?: boolean;
    };

    if (format !== undefined) {
      db.prepare('UPDATE users SET format = ? WHERE chat_id = ?').run(format, chatId);
    }

    if (quiet_hours_enabled !== undefined) {
      db.prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?').run(
        quiet_hours_enabled ? 1 : 0,
        chatId,
      );
    }

    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM users WHERE chat_id = ?').run(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  router.delete('/:id/cities/:city', (req, res) => {
    db.prepare('DELETE FROM subscriptions WHERE chat_id = ? AND city_name = ?').run(
      parseInt(req.params.id, 10),
      decodeURIComponent(req.params.city),
    );
    res.json({ ok: true });
  });

  return router;
}
