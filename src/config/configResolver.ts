/**
 * Central configuration resolution: DB (with decryption) → env var fallback → null.
 *
 * Consolidates all process.env reads into a single module with a clear
 * key registry, making it easy to audit what config exists and where it comes from.
 */

import type Database from 'better-sqlite3';
import { isCryptoReady, decryptValue } from '../dashboard/crypto.js';

// ── Key Registries ───────────────────────────────────────────────────────────

/** Secret keys that are encrypted in the DB via the DEK. */
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'telegram_bot_token',
  'mapbox_access_token',
  'github_pat',
  'telegram_api_id',
  'telegram_api_hash',
]);

/** Non-secret config keys that can be stored in the DB (many already are). */
export const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'telegram_chat_id',
  'telegram_forward_group_id',
  'whatsapp_invite_link',
  'whatsapp_enabled',
  'whatsapp_map_debounce_seconds',
  'health_port',
  'dashboard_port',
  'telegram_listener_enabled',
  'alert_window_seconds',
  'mapbox_monthly_limit',
  'mapbox_skip_drills',
  'mapbox_image_cache_size',
  'ga4_measurement_id',
  'github_repo',
  'telegram_invite_link',
  'topic_id_security',
  'topic_id_nature',
  'topic_id_environmental',
  'topic_id_drills',
  'topic_id_general',
  'topic_id_whatsapp',
  'quiet_hours_global',
  'all_clear_mode',
  'all_clear_topic_id',
  'landing_url',
  'privacy_defaults',
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

/** Keys whose change requires a process restart to take effect. */
export const RESTART_REQUIRED_KEYS: ReadonlySet<string> = new Set([
  'telegram_bot_token',
  'telegram_api_id',
  'telegram_api_hash',
  'health_port',
  'dashboard_port',
  'telegram_listener_enabled',
]);

/**
 * Maps a DB settings key to its corresponding environment variable name.
 * Keys not listed here default to UPPER_CASE of the key itself.
 */
export const ENV_KEY_MAP: Readonly<Record<string, string>> = {
  // Secrets
  telegram_bot_token:            'TELEGRAM_BOT_TOKEN',
  mapbox_access_token:           'MAPBOX_ACCESS_TOKEN',
  github_pat:                    'GITHUB_PAT',
  telegram_api_id:               'TELEGRAM_API_ID',
  telegram_api_hash:             'TELEGRAM_API_HASH',
  // Config with non-obvious env var names
  alert_window_seconds:          'ALERT_UPDATE_WINDOW_SECONDS',
  mapbox_monthly_limit:          'MAPBOX_MONTHLY_LIMIT',
  mapbox_skip_drills:            'MAPBOX_SKIP_DRILLS',
  mapbox_image_cache_size:       'MAPBOX_IMAGE_CACHE_SIZE',
  telegram_invite_link:          'TELEGRAM_INVITE_LINK',
  whatsapp_enabled:              'WHATSAPP_ENABLED',
  whatsapp_map_debounce_seconds: 'WHATSAPP_MAP_DEBOUNCE_SECONDS',
  whatsapp_invite_link:          'WHATSAPP_INVITE_LINK',
  health_port:                   'HEALTH_PORT',
  dashboard_port:                'DASHBOARD_PORT',
  ga4_measurement_id:            'GA4_MEASUREMENT_ID',
  github_repo:                   'GITHUB_REPO',
  telegram_chat_id:              'TELEGRAM_CHAT_ID',
  telegram_forward_group_id:     'TELEGRAM_FORWARD_GROUP_ID',
  telegram_listener_enabled:     'TELEGRAM_LISTENER_ENABLED',
  topic_id_stories:              'TELEGRAM_TOPIC_ID_STORIES',
};

// ── Resolution ───────────────────────────────────────────────────────────────

/** Convert a DB key to its env var name. */
export function envKeyFor(key: string): string {
  return ENV_KEY_MAP[key] ?? key.toUpperCase();
}

/**
 * Resolve a single config/secret value.
 *
 * Priority: DB value (decrypted if encrypted) → env var fallback → null.
 */
export function resolveConfig(db: Database.Database, key: string): string | null {
  // 1. Try DB
  const row = db.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get(key) as
    { value: string; encrypted: number } | undefined;

  if (row) {
    if (row.encrypted === 1 && isCryptoReady()) {
      return decryptValue(row.value);
    }
    // Non-encrypted DB value, or crypto not ready (shouldn't happen for encrypted rows)
    if (row.encrypted === 0) {
      return row.value;
    }
  }

  // 2. Env var fallback
  const envVar = envKeyFor(key);
  const envValue = process.env[envVar];
  return envValue ?? null;
}

/** Error thrown when required config keys are missing from both DB and env. */
export class ConfigMissingError extends Error {
  readonly missingKeys: readonly string[];

  constructor(missingKeys: readonly string[]) {
    const keyList = missingKeys.map(k => `  - ${k} (env: ${envKeyFor(k)})`).join('\n');
    super(`Missing required configuration:\n${keyList}`);
    this.name = 'ConfigMissingError';
    this.missingKeys = missingKeys;
  }
}

/**
 * Resolve multiple required config keys. Returns a Record of key → value.
 * Throws ConfigMissingError if any key resolves to null.
 */
export function resolveRequiredConfigs(
  db: Database.Database,
  keys: readonly string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const key of keys) {
    const value = resolveConfig(db, key);
    if (value === null) {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new ConfigMissingError(missing);
  }

  return result;
}

// ── Typed convenience helpers ────────────────────────────────────────────────

/** Resolve a string config with a default value. */
export function getString(db: Database.Database, key: string, defaultValue: string): string {
  return resolveConfig(db, key) ?? defaultValue;
}

/** Resolve a numeric config with a default value. Returns default for non-numeric strings. */
export function getNumber(db: Database.Database, key: string, defaultValue: number): number {
  const raw = resolveConfig(db, key);
  if (raw === null) return defaultValue;
  const n = Number(raw);
  return isNaN(n) ? defaultValue : n;
}

/** Resolve a boolean config with a default value. Recognizes 'true'/'1' as true. */
export function getBool(db: Database.Database, key: string, defaultValue: boolean): boolean {
  const raw = resolveConfig(db, key);
  if (raw === null) return defaultValue;
  return raw === 'true' || raw === '1';
}
