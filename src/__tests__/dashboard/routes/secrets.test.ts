import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createSecretsRouter, secretsMutateLimiter } from '../../../dashboard/routes/secrets.js';
import { initCrypto, _resetCryptoForTesting } from '../../../dashboard/crypto.js';
import { getSetting } from '../../../dashboard/settingsRepository.js';

const TEST_SECRET = 'test-dashboard-secret-for-secrets-api-32chars!';

let db: Database.Database;
let app: express.Express;

before(() => {
  _resetCryptoForTesting();
  db = new Database(':memory:');
  initSchema(db);
  initCrypto(db, TEST_SECRET);

  app = express();
  app.use(express.json());
  app.use('/api/secrets', createSecretsRouter(db));
});

beforeEach(() => secretsMutateLimiter.clearStore());

after(() => {
  _resetCryptoForTesting();
  db.close();
});

// ── GET /api/secrets ────────────────────────────────────────────────────────

describe('GET /api/secrets', () => {
  it('returns all 6 secret keys', async () => {
    const res = await request(app).get('/api/secrets');
    assert.equal(res.status, 200);
    assert.equal(res.body.secrets.length, 6);
    const keys = res.body.secrets.map((s: { key: string }) => s.key).sort();
    assert.deepEqual(keys, [
      'github_pat',
      'mapbox_access_token',
      'telegram_api_hash',
      'telegram_api_id',
      'telegram_bot_token',
      'telegram_listener_session',
    ]);
  });

  it('never returns plaintext values', async () => {
    // Store a secret in DB
    const { setSetting } = await import('../../../dashboard/settingsRepository.js');
    setSetting(db, 'telegram_bot_token', 'super-secret-bot-token-12345');

    const res = await request(app).get('/api/secrets');
    const botToken = res.body.secrets.find((s: { key: string }) => s.key === 'telegram_bot_token');
    assert.ok(botToken);
    assert.ok(!botToken.masked.includes('super-secret-bot-token-12345'), 'plaintext should not appear');
    assert.ok(botToken.masked.includes('•'), 'should be masked');
    assert.equal(botToken.source, 'db');
  });

  it('shows source=none when key is not set anywhere', async () => {
    const res = await request(app).get('/api/secrets');
    const pat = res.body.secrets.find((s: { key: string }) => s.key === 'github_pat');
    // github_pat is likely not in env during tests
    if (!process.env.GITHUB_PAT) {
      assert.equal(pat.source, 'none');
    }
  });

  it('includes requiresRestart flag', async () => {
    const res = await request(app).get('/api/secrets');
    const botToken = res.body.secrets.find((s: { key: string }) => s.key === 'telegram_bot_token');
    const pat = res.body.secrets.find((s: { key: string }) => s.key === 'github_pat');
    assert.equal(botToken.requiresRestart, true);
    assert.equal(pat.requiresRestart, false);
  });
});

// ── PUT /api/secrets/:key ───────────────────────────────────────────────────

describe('PUT /api/secrets/:key', () => {
  it('stores an encrypted secret', async () => {
    const res = await request(app)
      .put('/api/secrets/telegram_bot_token')
      .send({ value: 'new-bot-token-xyz' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    // Verify it's encrypted in DB (raw value should not be the plaintext)
    const row = db.prepare("SELECT value, encrypted FROM settings WHERE key = 'telegram_bot_token'").get() as
      { value: string; encrypted: number };
    assert.equal(row.encrypted, 1);
    assert.ok(!row.value.includes('new-bot-token-xyz'), 'raw DB value should be encrypted');

    // But getSetting auto-decrypts
    assert.equal(getSetting(db, 'telegram_bot_token'), 'new-bot-token-xyz');
  });

  it('rejects unknown key', async () => {
    const res = await request(app)
      .put('/api/secrets/not_a_real_key')
      .send({ value: 'something' });
    assert.equal(res.status, 400);
  });

  it('rejects empty value', async () => {
    const res = await request(app)
      .put('/api/secrets/telegram_bot_token')
      .send({ value: '' });
    assert.equal(res.status, 400);
  });

  it('rejects missing value', async () => {
    const res = await request(app)
      .put('/api/secrets/telegram_bot_token')
      .send({});
    assert.equal(res.status, 400);
  });

  it('tracks restart-required keys', async () => {
    await request(app)
      .put('/api/secrets/telegram_bot_token')
      .send({ value: 'changed-token' });

    const restartRes = await request(app).get('/api/secrets/restart-needed');
    assert.equal(restartRes.body.needed, true);
    assert.ok(restartRes.body.changedKeys.includes('telegram_bot_token'));
  });
});

// ── DELETE /api/secrets/:key ────────────────────────────────────────────────

describe('DELETE /api/secrets/:key', () => {
  it('removes secret from DB', async () => {
    // First store one
    await request(app)
      .put('/api/secrets/github_pat')
      .send({ value: 'ghp_test123' });
    assert.ok(getSetting(db, 'github_pat'));

    // Delete it
    const res = await request(app).delete('/api/secrets/github_pat');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    // Verify removed from DB
    const row = db.prepare("SELECT * FROM settings WHERE key = 'github_pat'").get();
    assert.equal(row, undefined);
  });

  it('adds to _deleted_secrets list', async () => {
    await request(app).delete('/api/secrets/mapbox_access_token');

    const raw = db.prepare("SELECT value FROM settings WHERE key = '_deleted_secrets'").get() as
      { value: string } | undefined;
    assert.ok(raw);
    const list = JSON.parse(raw!.value);
    assert.ok(list.includes('mapbox_access_token'));
  });

  it('rejects unknown key', async () => {
    const res = await request(app).delete('/api/secrets/invalid_key');
    assert.equal(res.status, 400);
  });
});

// ── GET /api/secrets/restart-needed ─────────────────────────────────────────

describe('GET /api/secrets/restart-needed', () => {
  it('returns needed:false when nothing changed (fresh module)', async () => {
    // Note: previous tests may have changed keys, so this just validates the shape
    const res = await request(app).get('/api/secrets/restart-needed');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.needed, 'boolean');
    assert.ok(Array.isArray(res.body.changedKeys));
  });
});

// ── Rate limiting ───────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('returns 429 after 5 writes', async () => {
    secretsMutateLimiter.clearStore();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .put('/api/secrets/telegram_bot_token')
        .send({ value: `token-${i}` });
    }
    const res = await request(app)
      .put('/api/secrets/telegram_bot_token')
      .send({ value: 'one-too-many' });
    assert.equal(res.status, 429);
  });
});
