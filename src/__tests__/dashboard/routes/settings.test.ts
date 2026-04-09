import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createSettingsRouter, settingsMutateLimiter } from '../../../dashboard/routes/settings.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);

  app = express();
  app.use(express.json());
  app.use('/api/settings', createSettingsRouter(db));
});

beforeEach(() => settingsMutateLimiter.clearStore());

after(() => db.close());

describe('GET /api/settings', () => {
  it('returns 200 with alert_window_seconds key', async () => {
    const res = await request(app).get('/api/settings');
    assert.equal(res.status, 200);
    assert.ok('alert_window_seconds' in res.body, 'Response should have alert_window_seconds');
  });

  it('returns env-default values as strings', async () => {
    const res = await request(app).get('/api/settings');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.alert_window_seconds === 'string');
  });
});

describe('PATCH /api/settings', () => {
  it('returns 200 with ok: true for allowed key', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ mapbox_monthly_limit: '45000' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('persists setting to DB', async () => {
    await request(app).patch('/api/settings').send({ mapbox_monthly_limit: '45000' });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'mapbox_monthly_limit'").get() as { value: string } | undefined;
    assert.ok(row, 'Row should exist in DB after PATCH');
    assert.equal(row.value, '45000');
  });

  it('returns 400 for disallowed key', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ admin_password: 'x' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'Should return error message for disallowed key');
  });

  it('returns 400 for mix of valid and invalid keys', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ mapbox_monthly_limit: '50000', admin_password: 'x' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for empty body with unknown key', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ totally_unknown_key: 'value' });
    assert.equal(res.status, 400);
  });

  it('accepts all allowed keys without error', async () => {
    const allowedUpdates = {
      alert_window_seconds: '60',
      mapbox_monthly_limit: '30000',
      mapbox_skip_drills: 'true',
    };
    const res = await request(app).patch('/api/settings').send(allowedUpdates);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

// I2 — per-key value validation. Before this guard the only enum-validated
// key was `all_clear_mode`. Numeric, boolean, and JSON keys all accepted any
// string and the bad value was silently stored, breaking downstream code at
// runtime. These tests lock down the validators that now run before
// setSetting() is called.
describe('PATCH /api/settings — value validation', () => {
  // Clear settings between tests so the "no partial write" assertion isn't
  // confused by leftover state from earlier suites in this file. The shared
  // db singleton above is reused across describe blocks.
  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
    settingsMutateLimiter.clearStore();
  });

  it('rejects non-numeric mapbox_monthly_limit with 400', async () => {
    const res = await request(app).patch('/api/settings').send({ mapbox_monthly_limit: 'abc' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('mapbox_monthly_limit'));
    // No partial write — the setting must NOT be in the DB.
    const row = db.prepare("SELECT value FROM settings WHERE key = 'mapbox_monthly_limit'").get();
    assert.equal(row, undefined);
  });

  it('rejects negative alert_window_seconds with 400', async () => {
    const res = await request(app).patch('/api/settings').send({ alert_window_seconds: '-5' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('alert_window_seconds'));
  });

  it('rejects malformed JSON in privacy_defaults with 400', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ privacy_defaults: '{not-valid-json' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('privacy_defaults'));
    assert.ok(res.body.error.includes('JSON'));
  });

  it('accepts well-formed JSON in privacy_defaults', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ privacy_defaults: '{"safety_status":1,"home_city":0}' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('rejects non-boolean mapbox_skip_drills with 400', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ mapbox_skip_drills: 'maybe' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('mapbox_skip_drills'));
  });

  it('rejects float values in numeric keys (must be integer)', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ whatsapp_map_debounce_seconds: '15.5' });
    assert.equal(res.status, 400);
  });

  // PR #234 review #1 — caps must be ≥1 (validatePositiveInt rejects 0).
  // Three reviewer agents converged on this: groups_max_per_user=0 would
  // make countGroupsOwnedBy(...) >= 0 always true → every create rejected.
  it('rejects groups_max_per_user=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ groups_max_per_user: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('groups_max_per_user'));
    assert.ok(res.body.error.includes('חיובי') || res.body.error.includes('≥1'));
    // No partial write
    const row = db.prepare("SELECT value FROM settings WHERE key = 'groups_max_per_user'").get();
    assert.equal(row, undefined);
  });

  it('rejects groups_max_members=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ groups_max_members: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('groups_max_members'));
    assert.ok(res.body.error.includes('חיובי') || res.body.error.includes('≥1'));
  });

  it('accepts groups_max_per_user=1 (boundary)', async () => {
    const res = await request(app).patch('/api/settings').send({ groups_max_per_user: '1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('accepts groups_max_per_user=100 (typical hot-config value)', async () => {
    const res = await request(app).patch('/api/settings').send({ groups_max_per_user: '100' });
    assert.equal(res.status, 200);
  });

  it('rejects groups_max_per_user=-5 (also negative)', async () => {
    const res = await request(app).patch('/api/settings').send({ groups_max_per_user: '-5' });
    assert.equal(res.status, 400);
  });

  it('accepts groups_invite_code_ttl_hours=0 (means "never expire" in v0.5.2 semantics)', async () => {
    // Unlike the cap keys, the TTL key uses validateNonNegativeInt because
    // 0 plausibly encodes "no expiry". This is documented in settings.ts.
    const res = await request(app).patch('/api/settings').send({ groups_invite_code_ttl_hours: '0' });
    assert.equal(res.status, 200);
  });

  it('does NOT partially apply when one key in a multi-key PATCH is invalid', async () => {
    // Both keys are allowed, but the second one fails validation. The first
    // key must NOT be persisted (validation runs as a separate pass before
    // any setSetting() call).
    const res = await request(app)
      .patch('/api/settings')
      .send({ alert_window_seconds: '120', mapbox_monthly_limit: 'BAD' });
    assert.equal(res.status, 400);
    const row1 = db.prepare("SELECT value FROM settings WHERE key = 'alert_window_seconds'").get();
    const row2 = db.prepare("SELECT value FROM settings WHERE key = 'mapbox_monthly_limit'").get();
    assert.equal(row1, undefined, 'first key must NOT have been written before validation failed');
    assert.equal(row2, undefined);
  });

  it('still rejects all_clear_mode enum violations (regression)', async () => {
    // The pre-existing all_clear_mode enum check must still fire.
    const res = await request(app)
      .patch('/api/settings')
      .send({ all_clear_mode: 'invalid' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('all_clear_mode'));
  });
});
