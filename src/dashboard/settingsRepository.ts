import type Database from 'better-sqlite3';
import { isCryptoReady, encryptValue, decryptValue } from './crypto.js';
import { SECRET_KEYS, envKeyFor as resolverEnvKeyFor } from '../config/configResolver.js';

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get(key) as
    { value: string; encrypted: number } | undefined;
  if (!row) return null;
  if (row.encrypted === 1 && isCryptoReady()) {
    return decryptValue(row.value);
  }
  return row.value;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  const isSecret = SECRET_KEYS.has(key);
  const storedValue = isSecret && isCryptoReady() ? encryptValue(value) : value;
  const encrypted = isSecret && isCryptoReady() ? 1 : 0;

  db.prepare(`
    INSERT INTO settings (key, value, encrypted, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      encrypted = excluded.encrypted,
      updated_at = excluded.updated_at
  `).run(key, storedValue, encrypted);
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value, encrypted FROM settings').all() as
    { key: string; value: string; encrypted: number }[];
  return Object.fromEntries(rows.map(r => {
    const val = r.encrypted === 1 && isCryptoReady() ? decryptValue(r.value) : r.value;
    return [r.key, val];
  }));
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
  const dbRows = db.prepare('SELECT key, value, encrypted, updated_at FROM settings').all() as {
    key: string;
    value: string;
    encrypted: number;
    updated_at: string | null;
  }[];
  const dbMap = new Map(dbRows.map(r => [r.key, r]));

  const result: Record<string, SettingMeta> = {};

  for (const key of allKeys) {
    const dbRow = dbMap.get(key);
    if (dbRow) {
      const val = dbRow.encrypted === 1 && isCryptoReady()
        ? decryptValue(dbRow.value)
        : dbRow.value;
      result[key] = {
        value: val,
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
  // Delegate to the consolidated map in configResolver; fall back to local overrides
  // for keys that only exist in the settings pipeline (not in configResolver).
  return resolverEnvKeyFor(key);
}
