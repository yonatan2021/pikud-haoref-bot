import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import { getAllSettings, setSetting } from '../settingsRepository.js';

const ALLOWED_KEYS = new Set([
  'alert_window_seconds', 'mapbox_monthly_limit', 'mapbox_skip_drills',
  'quiet_hours_global', 'ga4_measurement_id', 'github_repo', 'landing_url',
]);

export function createSettingsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const dbSettings = getAllSettings(db);
    const envDefaults: Record<string, string> = {
      alert_window_seconds: process.env.ALERT_UPDATE_WINDOW_SECONDS ?? '120',
      mapbox_monthly_limit: process.env.MAPBOX_MONTHLY_LIMIT ?? '',
      mapbox_skip_drills: process.env.MAPBOX_SKIP_DRILLS ?? 'false',
      health_port: process.env.HEALTH_PORT ?? '3000',
      dashboard_port: process.env.DASHBOARD_PORT ?? '4000',
    };
    res.json({ ...envDefaults, ...dbSettings });
  });

  router.patch('/', (req, res) => {
    const updates = req.body as Record<string, string>;
    const invalid = Object.keys(updates).filter(k => !ALLOWED_KEYS.has(k));
    if (invalid.length) {
      res.status(400).json({ error: `מפתחות לא חוקיים: ${invalid.join(', ')}` });
      return;
    }
    for (const [key, value] of Object.entries(updates)) {
      setSetting(db, key, String(value));
    }
    res.json({ ok: true, note: 'חלק מההגדרות ייכנסו לתוקף לאחר הפעלה מחדש' });
  });

  router.get('/backup', (_req, res) => {
    const dbPath = path.resolve(process.env.DB_PATH ?? 'data/subscriptions.db');
    res.download(dbPath, 'backup.db');
  });

  return router;
}
