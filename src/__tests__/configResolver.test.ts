import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { initCrypto, encryptValue, _resetCryptoForTesting } from '../dashboard/crypto.js';
import {
  resolveConfig,
  resolveRequiredConfigs,
  ConfigMissingError,
  SECRET_KEYS,
  CONFIG_KEYS,
  RESTART_REQUIRED_KEYS,
  ENV_KEY_MAP,
  envKeyFor,
} from '../config/configResolver.js';

const TEST_SECRET = 'test-secret-for-config-resolver-tests-32chars!';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('configResolver', () => {
  let db: Database.Database;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetCryptoForTesting();
    db = createDb();
    initCrypto(db, TEST_SECRET);
  });

  afterEach(() => {
    _resetCryptoForTesting();
    // Restore any env vars we modified
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    Object.keys(savedEnv).forEach(k => delete savedEnv[k]);
  });

  function setEnv(key: string, value: string): void {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  function clearEnv(key: string): void {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  // ── Key Registries ────────────────────────────────────────────────────

  describe('key registries', () => {
    it('SECRET_KEYS contains expected keys', () => {
      assert.ok(SECRET_KEYS.has('telegram_bot_token'));
      assert.ok(SECRET_KEYS.has('mapbox_access_token'));
      assert.ok(SECRET_KEYS.has('github_pat'));
      assert.ok(SECRET_KEYS.has('telegram_api_id'));
      assert.ok(SECRET_KEYS.has('telegram_api_hash'));
      assert.equal(SECRET_KEYS.size, 5);
    });

    it('RESTART_REQUIRED_KEYS is a subset of SECRET_KEYS + CONFIG_KEYS', () => {
      for (const key of RESTART_REQUIRED_KEYS) {
        assert.ok(
          SECRET_KEYS.has(key) || CONFIG_KEYS.has(key),
          `${key} should be in SECRET_KEYS or CONFIG_KEYS`
        );
      }
    });

    it('every SECRET_KEY has an ENV_KEY_MAP entry', () => {
      for (const key of SECRET_KEYS) {
        assert.ok(ENV_KEY_MAP[key], `${key} should have an ENV_KEY_MAP entry`);
      }
    });
  });

  // ── envKeyFor ─────────────────────────────────────────────────────────

  describe('envKeyFor', () => {
    it('returns mapped env var for known keys', () => {
      assert.equal(envKeyFor('telegram_bot_token'), 'TELEGRAM_BOT_TOKEN');
      assert.equal(envKeyFor('alert_window_seconds'), 'ALERT_UPDATE_WINDOW_SECONDS');
      assert.equal(envKeyFor('mapbox_monthly_limit'), 'MAPBOX_MONTHLY_LIMIT');
    });

    it('defaults to UPPER_CASE for unknown keys', () => {
      assert.equal(envKeyFor('some_new_key'), 'SOME_NEW_KEY');
    });
  });

  // ── resolveConfig ─────────────────────────────────────────────────────

  describe('resolveConfig', () => {
    it('returns DB value when present (non-encrypted)', () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_chat_id', '-1001234')").run();
      assert.equal(resolveConfig(db, 'telegram_chat_id'), '-1001234');
    });

    it('returns decrypted DB value when encrypted', () => {
      const encrypted = encryptValue('bot-token-123');
      db.prepare("INSERT INTO settings (key, value, encrypted) VALUES ('telegram_bot_token', ?, 1)").run(encrypted);
      assert.equal(resolveConfig(db, 'telegram_bot_token'), 'bot-token-123');
    });

    it('falls back to env var when DB has no row', () => {
      setEnv('TELEGRAM_BOT_TOKEN', 'env-token-456');
      assert.equal(resolveConfig(db, 'telegram_bot_token'), 'env-token-456');
    });

    it('DB value takes priority over env var', () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_chat_id', 'from-db')").run();
      setEnv('TELEGRAM_CHAT_ID', 'from-env');
      assert.equal(resolveConfig(db, 'telegram_chat_id'), 'from-db');
    });

    it('returns null when neither DB nor env has the key', () => {
      clearEnv('SOME_NONEXISTENT_VAR');
      assert.equal(resolveConfig(db, 'some_nonexistent_var'), null);
    });

    it('uses ENV_KEY_MAP override for env fallback', () => {
      setEnv('ALERT_UPDATE_WINDOW_SECONDS', '90');
      assert.equal(resolveConfig(db, 'alert_window_seconds'), '90');
    });
  });

  // ── resolveRequiredConfigs ────────────────────────────────────────────

  describe('resolveRequiredConfigs', () => {
    it('returns all values when all keys resolve', () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_chat_id', '-100999')").run();
      setEnv('TELEGRAM_BOT_TOKEN', 'tok-abc');

      const result = resolveRequiredConfigs(db, ['telegram_chat_id', 'telegram_bot_token']);
      assert.deepEqual(result, {
        telegram_chat_id: '-100999',
        telegram_bot_token: 'tok-abc',
      });
    });

    it('throws ConfigMissingError listing all missing keys', () => {
      clearEnv('TELEGRAM_BOT_TOKEN');
      clearEnv('MAPBOX_ACCESS_TOKEN');
      clearEnv('TELEGRAM_CHAT_ID');

      try {
        resolveRequiredConfigs(db, ['telegram_bot_token', 'mapbox_access_token', 'telegram_chat_id']);
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof ConfigMissingError);
        assert.deepEqual([...err.missingKeys].sort(), [
          'mapbox_access_token',
          'telegram_bot_token',
          'telegram_chat_id',
        ]);
      }
    });

    it('error message includes env var names', () => {
      clearEnv('TELEGRAM_BOT_TOKEN');
      try {
        resolveRequiredConfigs(db, ['telegram_bot_token']);
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof ConfigMissingError);
        assert.ok(err.message.includes('TELEGRAM_BOT_TOKEN'));
      }
    });

    it('returns empty record for empty keys list', () => {
      const result = resolveRequiredConfigs(db, []);
      assert.deepEqual(result, {});
    });
  });
});
