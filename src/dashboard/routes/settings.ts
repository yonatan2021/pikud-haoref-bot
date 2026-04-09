import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import { statSync, readFileSync } from 'fs';
import { getAllSettings, getAllSettingsWithMeta, setSetting } from '../settingsRepository.js';
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
  'privacy_defaults',
  'all_clear_mode',
  'all_clear_topic_id',
  'dm_all_clear_text',
  'dm_relevance_in_area',
  'dm_relevance_nearby',
  'dm_relevance_not_area',
  // v0.5.1 — group feature hot-config (refs #225)
  'groups_max_per_user',
  'groups_max_members',
  'groups_invite_code_ttl_hours',
]);

// ─── Per-key value validators ─────────────────────────────────────────────
//
// Each validator returns null on success, or a Hebrew error string on
// failure. Keys not present in this map accept any string (free-text fields
// like ga4_measurement_id, landing_url, dm_relevance_*, etc).
//
// Before this guard the only validation was on `all_clear_mode`. A user
// could PATCH `mapbox_monthly_limit: "abc"`, `alert_window_seconds: "-5"`,
// or `privacy_defaults: "{not-json"` and the value would be silently stored,
// breaking downstream code at runtime.

function validateNonNegativeInt(value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return `הערך חייב להיות מספר שלם אי-שלילי, התקבל: ${value}`;
  }
  return null;
}

function validateBoolish(value: string): string | null {
  return value === 'true' || value === 'false'
    ? null
    : `הערך חייב להיות 'true' או 'false', התקבל: ${value}`;
}

function validateJson(value: string): string | null {
  try { JSON.parse(value); return null; }
  catch { return `הערך חייב להיות JSON תקין`; }
}

const VALIDATORS: Record<string, (value: string) => string | null> = {
  alert_window_seconds:          validateNonNegativeInt,
  mapbox_monthly_limit:          validateNonNegativeInt,
  mapbox_image_cache_size:       validateNonNegativeInt,
  whatsapp_map_debounce_seconds: validateNonNegativeInt,
  topic_id_security:             validateNonNegativeInt,
  topic_id_nature:               validateNonNegativeInt,
  topic_id_environmental:        validateNonNegativeInt,
  topic_id_drills:               validateNonNegativeInt,
  topic_id_general:              validateNonNegativeInt,
  topic_id_whatsapp:             validateNonNegativeInt,
  all_clear_topic_id:            validateNonNegativeInt,
  mapbox_skip_drills:            validateBoolish,
  quiet_hours_global:            validateBoolish,
  whatsapp_enabled:              validateBoolish,
  privacy_defaults:              validateJson,
  // v0.5.1 — group feature hot-config (refs #225)
  groups_max_per_user:           validateNonNegativeInt,
  groups_max_members:            validateNonNegativeInt,
  groups_invite_code_ttl_hours:  validateNonNegativeInt,
};

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
    const _settingsMeta = getAllSettingsWithMeta(db, [...ALLOWED_KEYS]);
    res.json({ ...envDefaults, ...dbSettings, bot_version: pkgVersion, db_size_bytes: String(dbSizeBytes), _settingsMeta });
  });

  router.patch('/', settingsMutateLimiter, (req, res) => {
    const updates = req.body as Record<string, string>;
    const invalid = Object.keys(updates).filter(k => !ALLOWED_KEYS.has(k));
    if (invalid.length) {
      res.status(400).json({ error: `מפתחות לא חוקיים: ${invalid.join(', ')}` });
      return;
    }

    // ── Per-key value validation (runs BEFORE any DB write so a partial
    // update can't leak through when one key in a multi-key PATCH is bad).
    const allClearModeUpdate = updates['all_clear_mode'];
    if (allClearModeUpdate !== undefined) {
      const valid = ['dm', 'channel', 'both'];
      if (!valid.includes(allClearModeUpdate)) {
        res.status(400).json({ error: `ערך לא חוקי ל-all_clear_mode: ${allClearModeUpdate}` });
        return;
      }
    }
    for (const [key, value] of Object.entries(updates)) {
      const validator = VALIDATORS[key];
      if (!validator) continue;
      const err = validator(String(value));
      if (err) {
        res.status(400).json({ error: `${key}: ${err}` });
        return;
      }
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
