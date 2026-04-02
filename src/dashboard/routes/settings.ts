import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import { statSync, readFileSync } from 'fs';
import { getAllSettings, setSetting } from '../settingsRepository.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';
import { loadRoutingCache } from '../../config/routingCache.js';

const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
const pkgVersion: string = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;

const backupLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 3_600_000,
  message: 'יותר מדי הורדות גיבוי — נסה שוב בעוד שעה',
});

export const settingsMutateLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי שינויים בהגדרות — נסה שוב בעוד דקה',
});

const ALLOWED_KEYS = new Set([
  'alert_window_seconds', 'mapbox_monthly_limit', 'mapbox_skip_drills',
  'quiet_hours_global', 'ga4_measurement_id', 'github_repo', 'landing_url',
  'topic_id_security', 'topic_id_nature', 'topic_id_environmental',
  'topic_id_drills', 'topic_id_general', 'topic_id_whatsapp',
  'telegram_invite_link', 'mapbox_image_cache_size', 'whatsapp_enabled',
  'whatsapp_map_debounce_seconds',
]);

export function createSettingsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const dbSettings = getAllSettings(db);
    const dbPath = path.resolve(process.env.DB_PATH ?? 'data/subscriptions.db');
    let dbSizeBytes = 0;
    try { dbSizeBytes = statSync(dbPath).size; } catch { /* db may not exist yet */ }

    const envDefaults: Record<string, string> = {
      alert_window_seconds:   process.env.ALERT_UPDATE_WINDOW_SECONDS ?? '120',
      mapbox_monthly_limit:   process.env.MAPBOX_MONTHLY_LIMIT ?? '',
      mapbox_skip_drills:     process.env.MAPBOX_SKIP_DRILLS ?? 'false',
      health_port:            process.env.HEALTH_PORT ?? '3000',
      dashboard_port:         process.env.DASHBOARD_PORT ?? '4000',
      telegram_invite_link:   process.env.TELEGRAM_INVITE_LINK ?? '',
      mapbox_image_cache_size: process.env.MAPBOX_IMAGE_CACHE_SIZE ?? '20',
      whatsapp_enabled:       process.env.WHATSAPP_ENABLED ?? 'false',
      whatsapp_map_debounce_seconds: process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS ?? '15',
    };
    res.json({ ...envDefaults, ...dbSettings, bot_version: pkgVersion, db_size_bytes: String(dbSizeBytes) });
  });

  router.patch('/', settingsMutateLimiter, (req, res) => {
    const updates = req.body as Record<string, string>;
    const invalid = Object.keys(updates).filter(k => !ALLOWED_KEYS.has(k));
    if (invalid.length) {
      res.status(400).json({ error: `מפתחות לא חוקיים: ${invalid.join(', ')}` });
      return;
    }
    for (const [key, value] of Object.entries(updates)) {
      setSetting(db, key, String(value));
    }
    loadRoutingCache(db);
    res.json({ ok: true, note: 'חלק מההגדרות ייכנסו לתוקף לאחר הפעלה מחדש' });
  });

  router.get('/backup', backupLimiter, (_req, res) => {
    const dbPath = path.resolve(process.env.DB_PATH ?? 'data/subscriptions.db');
    res.download(dbPath, 'backup.db');
  });

  return router;
}
