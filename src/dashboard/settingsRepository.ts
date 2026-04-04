import type Database from 'better-sqlite3';

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export interface SettingMeta {
  value: string;
  source: 'env' | 'db';
  updatedAt?: string;
}

export function getAllSettingsWithMeta(
  db: Database.Database,
  allKeys: readonly string[]
): Record<string, SettingMeta> {
  const dbRows = db.prepare('SELECT key, value, updated_at FROM settings').all() as {
    key: string;
    value: string;
    updated_at: string | null;
  }[];
  const dbMap = new Map(dbRows.map(r => [r.key, r]));

  const result: Record<string, SettingMeta> = {};

  for (const key of allKeys) {
    const dbRow = dbMap.get(key);
    if (dbRow) {
      result[key] = {
        value: dbRow.value,
        source: 'db',
        ...(dbRow.updated_at ? { updatedAt: dbRow.updated_at } : {}),
      };
    } else {
      const envValue = process.env[envKeyFor(key)];
      if (envValue !== undefined) {
        result[key] = { value: envValue, source: 'env' };
      }
    }
  }

  return result;
}

/** Maps a settings-table key to its corresponding environment-variable name. */
function envKeyFor(key: string): string {
  const overrides: Record<string, string> = {
    alert_window_seconds:          'ALERT_UPDATE_WINDOW_SECONDS',
    mapbox_monthly_limit:          'MAPBOX_MONTHLY_LIMIT',
    mapbox_skip_drills:            'MAPBOX_SKIP_DRILLS',
    mapbox_image_cache_size:       'MAPBOX_IMAGE_CACHE_SIZE',
    telegram_invite_link:          'TELEGRAM_INVITE_LINK',
    whatsapp_enabled:              'WHATSAPP_ENABLED',
    whatsapp_map_debounce_seconds: 'WHATSAPP_MAP_DEBOUNCE_SECONDS',
    health_port:                   'HEALTH_PORT',
    dashboard_port:                'DASHBOARD_PORT',
    ga4_measurement_id:            'GA4_MEASUREMENT_ID',
    github_repo:                   'GITHUB_REPO',
  };
  return overrides[key] ?? key.toUpperCase();
}
