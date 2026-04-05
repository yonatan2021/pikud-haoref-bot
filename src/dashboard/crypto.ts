/**
 * Envelope Encryption module (DEK/KEK pattern).
 *
 * KEK derived from DASHBOARD_SECRET via PBKDF2.
 * DEK is a random 256-bit key wrapped by KEK and stored in the settings table.
 * All secret values are encrypted with the DEK using AES-256-GCM.
 */

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';
import type Database from 'better-sqlite3';

// ── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;        // 256 bits
const IV_LENGTH = 12;         // 96 bits (GCM recommended)
const TAG_LENGTH = 16;        // 128 bits
const SALT_LENGTH = 32;       // 256 bits
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';

const SETTINGS_KEY_SALT = '_encryption_salt';
const SETTINGS_KEY_WRAPPED_DEK = '_wrapped_dek';

// ── Module State ─────────────────────────────────────────────────────────────

let cachedDek: Buffer | null = null;

// ── Internal Helpers ─────────────────────────────────────────────────────────

interface EncryptedPayload {
  readonly iv: string;       // base64
  readonly tag: string;      // base64
  readonly ciphertext: string; // base64
}

function deriveKek(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

function aesEncrypt(key: Buffer, plaintext: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function aesDecrypt(key: Buffer, payload: EncryptedPayload): Buffer {
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function getSettingRaw(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSettingRaw(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the crypto subsystem. Must be called after initDb() and before
 * any encrypt/decrypt operations.
 *
 * On first run: generates a random salt and DEK, stores both in the settings
 * table (salt as hex, DEK wrapped by KEK as JSON).
 *
 * On subsequent runs: reads salt + wrapped DEK from DB, derives KEK, unwraps DEK.
 */
export function initCrypto(db: Database.Database, dashboardSecret: string): void {
  if (!dashboardSecret) {
    throw new Error('DASHBOARD_SECRET is required — cannot initialise encryption without it');
  }

  // 1. Resolve or create salt
  let saltHex = getSettingRaw(db, SETTINGS_KEY_SALT);
  if (!saltHex) {
    const salt = randomBytes(SALT_LENGTH);
    saltHex = salt.toString('hex');
    setSettingRaw(db, SETTINGS_KEY_SALT, saltHex);
  }
  const salt = Buffer.from(saltHex, 'hex');

  // 2. Derive KEK from DASHBOARD_SECRET + salt
  const kek = deriveKek(dashboardSecret, salt);

  // 3. Resolve or create DEK
  const wrappedDekJson = getSettingRaw(db, SETTINGS_KEY_WRAPPED_DEK);
  if (!wrappedDekJson) {
    // First run — generate a random DEK and wrap it
    const dek = randomBytes(KEY_LENGTH);
    const wrapped = aesEncrypt(kek, dek);
    setSettingRaw(db, SETTINGS_KEY_WRAPPED_DEK, JSON.stringify(wrapped));
    cachedDek = dek;
  } else {
    // Subsequent run — unwrap existing DEK
    const wrapped: EncryptedPayload = JSON.parse(wrappedDekJson);
    cachedDek = aesDecrypt(kek, wrapped);
  }
}

/** Returns true when initCrypto() has completed successfully. */
export function isCryptoReady(): boolean {
  return cachedDek !== null;
}

/**
 * Encrypt a plaintext string with the DEK (AES-256-GCM).
 * Returns a JSON string containing {iv, tag, ciphertext} — all base64.
 */
export function encryptValue(plaintext: string): string {
  if (!cachedDek) {
    throw new Error('Crypto not initialised — call initCrypto() first');
  }
  const payload = aesEncrypt(cachedDek, Buffer.from(plaintext, 'utf8'));
  return JSON.stringify(payload);
}

/**
 * Decrypt a value previously encrypted by encryptValue().
 * Input: JSON string containing {iv, tag, ciphertext}.
 */
export function decryptValue(encrypted: string): string {
  if (!cachedDek) {
    throw new Error('Crypto not initialised — call initCrypto() first');
  }
  const payload: EncryptedPayload = JSON.parse(encrypted);
  return aesDecrypt(cachedDek, payload).toString('utf8');
}

/**
 * Re-wrap the DEK with a new DASHBOARD_SECRET (KEK rotation).
 *
 * Requires the old secret to unwrap the existing DEK, then wraps it
 * with the new secret. All encrypted values remain valid — only the
 * DEK wrapper changes.
 */
export function rewrapDek(
  db: Database.Database,
  oldSecret: string,
  newSecret: string
): void {
  // 1. Read salt
  const saltHex = getSettingRaw(db, SETTINGS_KEY_SALT);
  if (!saltHex) {
    throw new Error('No encryption salt found — has initCrypto() ever been called?');
  }
  const salt = Buffer.from(saltHex, 'hex');

  // 2. Derive old KEK and unwrap DEK
  const oldKek = deriveKek(oldSecret, salt);
  const wrappedDekJson = getSettingRaw(db, SETTINGS_KEY_WRAPPED_DEK);
  if (!wrappedDekJson) {
    throw new Error('No wrapped DEK found — has initCrypto() ever been called?');
  }
  const dek = aesDecrypt(oldKek, JSON.parse(wrappedDekJson));

  // 3. Generate new salt for the new KEK (so old KEK derivation params are fully invalidated)
  const newSalt = randomBytes(SALT_LENGTH);
  const newKek = deriveKek(newSecret, newSalt);

  // 4. Wrap DEK with new KEK and persist
  const newWrapped = aesEncrypt(newKek, dek);
  db.transaction(() => {
    setSettingRaw(db, SETTINGS_KEY_SALT, newSalt.toString('hex'));
    setSettingRaw(db, SETTINGS_KEY_WRAPPED_DEK, JSON.stringify(newWrapped));
  })();

  // 5. Update cached DEK (same bytes, just re-wrapped)
  cachedDek = dek;
}

/**
 * Reset module state. Intended for test isolation only — production code
 * should never need to call this.
 */
export function _resetCryptoForTesting(): void {
  cachedDek = null;
}
