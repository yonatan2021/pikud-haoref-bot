import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  initCrypto,
  isCryptoReady,
  encryptValue,
  decryptValue,
  rewrapDek,
  _resetCryptoForTesting,
} from '../dashboard/crypto.js';

const TEST_SECRET = 'test-dashboard-secret-at-least-32-chars-long!!';
const ALT_SECRET = 'another-secret-for-rotation-testing-32-chars!!';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('crypto module', () => {
  let db: Database.Database;

  beforeEach(() => {
    _resetCryptoForTesting();
    db = createDb();
  });

  after(() => {
    _resetCryptoForTesting();
  });

  // ── Initialization ──────────────────────────────────────────────────────

  describe('initCrypto', () => {
    it('throws when DASHBOARD_SECRET is empty', () => {
      assert.throws(
        () => initCrypto(db, ''),
        /DASHBOARD_SECRET is required/
      );
    });

    it('sets isCryptoReady() to true after init', () => {
      assert.equal(isCryptoReady(), false);
      initCrypto(db, TEST_SECRET);
      assert.equal(isCryptoReady(), true);
    });

    it('creates _encryption_salt in settings on first run', () => {
      initCrypto(db, TEST_SECRET);
      const row = db.prepare("SELECT value FROM settings WHERE key = '_encryption_salt'").get() as { value: string } | undefined;
      assert.ok(row, '_encryption_salt should be stored');
      assert.equal(Buffer.from(row!.value, 'hex').length, 32, 'salt should be 32 bytes');
    });

    it('creates _wrapped_dek in settings on first run', () => {
      initCrypto(db, TEST_SECRET);
      const row = db.prepare("SELECT value FROM settings WHERE key = '_wrapped_dek'").get() as { value: string } | undefined;
      assert.ok(row, '_wrapped_dek should be stored');
      const parsed = JSON.parse(row!.value);
      assert.ok(parsed.iv, 'wrapped DEK should have iv');
      assert.ok(parsed.tag, 'wrapped DEK should have tag');
      assert.ok(parsed.ciphertext, 'wrapped DEK should have ciphertext');
    });

    it('reuses existing salt and DEK on subsequent init', () => {
      initCrypto(db, TEST_SECRET);
      const plaintext = 'hello-world';
      const encrypted = encryptValue(plaintext);

      // Re-init with same secret — should unwrap the same DEK
      _resetCryptoForTesting();
      initCrypto(db, TEST_SECRET);
      const decrypted = decryptValue(encrypted);
      assert.equal(decrypted, plaintext);
    });

    it('fails to unwrap DEK with wrong secret', () => {
      initCrypto(db, TEST_SECRET);
      _resetCryptoForTesting();

      assert.throws(
        () => initCrypto(db, 'wrong-secret-that-is-definitely-not-correct'),
        /Unsupported state or unable to authenticate data/
      );
    });
  });

  // ── Encrypt / Decrypt ───────────────────────────────────────────────────

  describe('encryptValue / decryptValue', () => {
    // Override parent beforeEach — we need crypto initialised for every test
    beforeEach(() => {
      _resetCryptoForTesting();
      db = createDb();
      initCrypto(db, TEST_SECRET);
    });

    it('throws when crypto is not initialised', () => {
      _resetCryptoForTesting();
      assert.throws(() => encryptValue('test'), /Crypto not initialised/);
      assert.throws(() => decryptValue('{}'), /Crypto not initialised/);
    });

    it('roundtrips a simple string', () => {
      const original = 'my-secret-telegram-bot-token-12345';
      const encrypted = encryptValue(original);
      const decrypted = decryptValue(encrypted);
      assert.equal(decrypted, original);
    });

    it('roundtrips an empty string', () => {
      const encrypted = encryptValue('');
      assert.equal(decryptValue(encrypted), '');
    });

    it('roundtrips Hebrew text', () => {
      const hebrew = 'סיסמה סודית מאוד';
      const encrypted = encryptValue(hebrew);
      assert.equal(decryptValue(encrypted), hebrew);
    });

    it('roundtrips a long value (API key length)', () => {
      const long = 'sk-proj-' + 'a'.repeat(200);
      const encrypted = encryptValue(long);
      assert.equal(decryptValue(encrypted), long);
    });

    it('produces different ciphertext for the same plaintext (unique IV)', () => {
      const plaintext = 'same-input-twice';
      const enc1 = encryptValue(plaintext);
      const enc2 = encryptValue(plaintext);
      assert.notEqual(enc1, enc2, 'different IVs should produce different ciphertext');
      // But both decrypt to the same value
      assert.equal(decryptValue(enc1), plaintext);
      assert.equal(decryptValue(enc2), plaintext);
    });

    it('detects tampered ciphertext (GCM auth tag)', () => {
      const encrypted = encryptValue('secret');
      const payload = JSON.parse(encrypted);
      // Flip a byte in the ciphertext
      const buf = Buffer.from(payload.ciphertext, 'base64');
      buf[0] = buf[0]! ^ 0xff;
      payload.ciphertext = buf.toString('base64');

      assert.throws(
        () => decryptValue(JSON.stringify(payload)),
        /Unsupported state or unable to authenticate data/
      );
    });

    it('detects tampered auth tag', () => {
      const encrypted = encryptValue('secret');
      const payload = JSON.parse(encrypted);
      const tagBuf = Buffer.from(payload.tag, 'base64');
      tagBuf[0] = tagBuf[0]! ^ 0xff;
      payload.tag = tagBuf.toString('base64');

      assert.throws(
        () => decryptValue(JSON.stringify(payload)),
        /Unsupported state or unable to authenticate data/
      );
    });

    it('detects tampered IV', () => {
      const encrypted = encryptValue('secret');
      const payload = JSON.parse(encrypted);
      const ivBuf = Buffer.from(payload.iv, 'base64');
      ivBuf[0] = ivBuf[0]! ^ 0xff;
      payload.iv = ivBuf.toString('base64');

      assert.throws(
        () => decryptValue(JSON.stringify(payload)),
        /Unsupported state or unable to authenticate data/
      );
    });
  });

  // ── Schema Migration ────────────────────────────────────────────────────

  describe('schema — encrypted column', () => {
    it('settings table has encrypted column with default 0', () => {
      const info = db.prepare('PRAGMA table_info(settings)').all() as {
        name: string;
        dflt_value: string | null;
      }[];
      const col = info.find(c => c.name === 'encrypted');
      assert.ok(col, 'encrypted column should exist on settings table');
      assert.equal(col!.dflt_value, '0');
    });

    it('encrypted column defaults to 0 for normal settings', () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('test_key', 'test_value')").run();
      const row = db.prepare("SELECT encrypted FROM settings WHERE key = 'test_key'").get() as { encrypted: number };
      assert.equal(row.encrypted, 0);
    });

    it('encrypted column can be set to 1', () => {
      db.prepare("INSERT INTO settings (key, value, encrypted) VALUES ('secret_key', 'encrypted_json', 1)").run();
      const row = db.prepare("SELECT encrypted FROM settings WHERE key = 'secret_key'").get() as { encrypted: number };
      assert.equal(row.encrypted, 1);
    });
  });

  // ── DEK Rotation (rewrapDek) ────────────────────────────────────────────

  describe('rewrapDek', () => {
    it('re-wraps DEK so new secret can decrypt existing values', () => {
      initCrypto(db, TEST_SECRET);
      const plaintext = 'sensitive-token-value';
      const encrypted = encryptValue(plaintext);

      // Rotate
      rewrapDek(db, TEST_SECRET, ALT_SECRET);

      // Re-init with new secret — should succeed
      _resetCryptoForTesting();
      initCrypto(db, ALT_SECRET);

      // Existing encrypted values still decrypt
      assert.equal(decryptValue(encrypted), plaintext);
    });

    it('old secret no longer works after rotation', () => {
      initCrypto(db, TEST_SECRET);
      rewrapDek(db, TEST_SECRET, ALT_SECRET);

      _resetCryptoForTesting();
      assert.throws(
        () => initCrypto(db, TEST_SECRET),
        /Unsupported state or unable to authenticate data/
      );
    });

    it('throws when salt is missing', () => {
      assert.throws(
        () => rewrapDek(db, TEST_SECRET, ALT_SECRET),
        /No encryption salt found/
      );
    });

    it('throws when wrapped DEK is missing', () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('_encryption_salt', 'abcd1234')").run();
      assert.throws(
        () => rewrapDek(db, TEST_SECRET, ALT_SECRET),
        /No wrapped DEK found/
      );
    });

    it('generates a new salt on rotation (old salt invalidated)', () => {
      initCrypto(db, TEST_SECRET);
      const saltBefore = db.prepare("SELECT value FROM settings WHERE key = '_encryption_salt'").get() as { value: string };

      rewrapDek(db, TEST_SECRET, ALT_SECRET);

      const saltAfter = db.prepare("SELECT value FROM settings WHERE key = '_encryption_salt'").get() as { value: string };
      assert.notEqual(saltBefore.value, saltAfter.value, 'salt should change on rotation');
    });

    it('preserves ability to encrypt new values after rotation', () => {
      initCrypto(db, TEST_SECRET);
      rewrapDek(db, TEST_SECRET, ALT_SECRET);

      const newEncrypted = encryptValue('post-rotation-value');
      assert.equal(decryptValue(newEncrypted), 'post-rotation-value');
    });
  });

  // ── Persistence ─────────────────────────────────────────────────────────

  describe('persistence across sessions', () => {
    it('encrypts in one session, decrypts in another (same DB, same secret)', () => {
      initCrypto(db, TEST_SECRET);
      const encrypted = encryptValue('cross-session-secret');

      // Simulate restart: reset module state, re-init with same DB
      _resetCryptoForTesting();
      assert.equal(isCryptoReady(), false);

      initCrypto(db, TEST_SECRET);
      assert.equal(isCryptoReady(), true);
      assert.equal(decryptValue(encrypted), 'cross-session-secret');
    });
  });
});
