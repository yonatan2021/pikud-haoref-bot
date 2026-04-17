import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import { statSync, readFileSync } from 'fs';
import { getAllSettings, getAllSettingsWithMeta, setSetting } from '../settingsRepository.js';
import { createRateLimitMiddleware, readLimiter } from '../rateLimiter.js';
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
  'all_clear_quiet_window_seconds',
  'dm_queue_concurrency',
  'map_city_display_limit',
  'dashboard_session_ttl_hours',
  'dm_all_clear_text',
  'dm_relevance_in_area',
  'dm_relevance_nearby',
  'dm_relevance_not_area',
  // v0.5.1 — group feature hot-config (refs #225)
  'groups_max_per_user',
  'groups_max_members',
  'groups_invite_code_ttl_hours',
  // v0.5.2 — social feature texts & defaults (refs #226)
  'social_banner_reminder_text',
  'social_quick_ok_button_label',
  'social_quick_ok_confirm_text',
  'social_quick_ok_broadcast_text',
  'social_contact_count_line_template',
  'social_default_prompt_enabled',
  'social_default_banner_enabled',
  'social_default_contact_count_enabled',
  'social_default_group_alerts_enabled',
  'social_default_quick_ok_enabled',
  'social_banner_stale_prompt_minutes',
  // v0.5.3 — community pulse survey (refs #219)
  'pulse_enabled',
  'pulse_cooldown_hours',
  'pulse_aggregate_threshold',
  'pulse_prompt_text',
  // v0.5.3 — shelter stories opt-in submissions (refs #220)
  'topic_id_stories',
  'stories_enabled',
  'stories_rate_limit_minutes',
  'stories_max_length',
  // v0.5.3 — skills sharing (refs #221)
  'skills_public_enabled',
  'skills_need_radius_zones',
  // v0.5.3 — neighbor check (refs #222)
  'neighbor_check_enabled_default',
  'neighbor_check_delay_minutes',
  'neighbor_check_text',
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

/**
 * Strict positive integer validator (n ≥ 1). Use for caps where 0 would
 * silently disable the feature instead of expressing "no limit". For example:
 * `groups_max_per_user = 0` would make `countGroupsOwnedBy(...) >= 0` always
 * true, blocking every group creation with no error visible to the admin
 * who set the value via the dashboard. Three reviewer agents independently
 * flagged this on PR #234.
 */
function validatePositiveInt(value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return `הערך חייב להיות מספר שלם חיובי (≥1), התקבל: ${value}`;
  }
  return null;
}

/**
 * Factory for bounded integer validators. Use when a setting must stay within
 * operational limits (e.g. all-clear window 60–3600s — too short fires false
 * all-clears, too long feels unresponsive).
 */
function validateIntInRange(min: number, max: number): (value: string) => string | null {
  return (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return `הערך חייב להיות מספר שלם, התקבל: ${value}`;
    }
    if (n < min || n > max) {
      return `הערך חייב להיות בטווח ${min}–${max}, התקבל: ${value}`;
    }
    return null;
  };
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
  all_clear_quiet_window_seconds: validateIntInRange(60, 3600),
  dm_queue_concurrency:           validateIntInRange(1, 50),
  map_city_display_limit:         validateIntInRange(5, 100),
  dashboard_session_ttl_hours:    validateIntInRange(1, 720),
  mapbox_skip_drills:            validateBoolish,
  quiet_hours_global:            validateBoolish,
  whatsapp_enabled:              validateBoolish,
  privacy_defaults:              validateJson,
  // v0.5.1 — group feature hot-config (refs #225)
  // PR #234 review: caps must be ≥1 because 0 would brick the feature
  // (countGroupsOwnedBy(...) >= 0 is always true → every create rejected).
  // groups_invite_code_ttl_hours stays non-negative because 0 plausibly
  // means "never expire" (semantics to be defined when v0.5.2 enforces TTL).
  groups_max_per_user:           validatePositiveInt,
  groups_max_members:            validatePositiveInt,
  groups_invite_code_ttl_hours:  validateNonNegativeInt,
  // v0.5.2 — social feature defaults & threshold (refs #226)
  // Text keys (social_banner_reminder_text, etc.) accept any string — no validator needed.
  social_default_prompt_enabled:        validateBoolish,
  social_default_banner_enabled:        validateBoolish,
  social_default_contact_count_enabled: validateBoolish,
  social_default_group_alerts_enabled:  validateBoolish,
  social_default_quick_ok_enabled:      validateBoolish,
  social_banner_stale_prompt_minutes:   validateNonNegativeInt,
  // v0.5.3 — community pulse survey (refs #219)
  pulse_enabled:             validateBoolish,
  pulse_cooldown_hours:      validatePositiveInt,
  pulse_aggregate_threshold: validatePositiveInt,
  // pulse_prompt_text accepts any string — no validator needed
  // v0.5.3 — shelter stories opt-in submissions (refs #220)
  // topic_id_stories rejects 1 — reserved Telegram thread ID (same guard as approve route)
  topic_id_stories:          (v) => {
    const base = validateNonNegativeInt(v);
    if (base) return base;
    if (Number(v) === 1) return 'מזהה נושא 1 שמור על ידי טלגרם ואינו תקין';
    return null;
  },
  stories_enabled:           validateBoolish,
  stories_rate_limit_minutes: validatePositiveInt,
  stories_max_length:        validatePositiveInt,
  // v0.5.3 — skills sharing (refs #221)
  skills_public_enabled:     validateBoolish,
  skills_need_radius_zones:  validatePositiveInt,
  // v0.5.3 — neighbor check (refs #222)
  // neighbor_check_text accepts any string — no validator needed
  neighbor_check_enabled_default: validateBoolish,
  neighbor_check_delay_minutes:   validatePositiveInt,
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

  router.get('/backup', readLimiter, backupLimiter, (_req, res) => {
    const rawPath = process.env.DB_PATH ?? 'data/subscriptions.db';
    // In-memory DB cannot be downloaded — return a clear error instead of
    // attempting to stream a non-existent file (SEC-L4).
    if (rawPath === ':memory:') {
      res.status(400).json({ error: 'גיבוי לא זמין במצב :memory:' });
      return;
    }
    // Path-traversal guard: only allow files under the project `data/` directory
    // (or the default location). Prevents `DB_PATH=../../etc/passwd` from being
    // served as a "backup" (CodeQL SEC-L4).
    const dbPath = path.resolve(rawPath);
    const allowedDir = path.resolve('data');
    const defaultPath = path.resolve('data/subscriptions.db');
    if (!dbPath.startsWith(allowedDir + path.sep) && dbPath !== defaultPath) {
      res.status(400).json({ error: 'Invalid DB path' });
      return;
    }
    res.download(dbPath, 'backup.db');
  });

  return router;
}
