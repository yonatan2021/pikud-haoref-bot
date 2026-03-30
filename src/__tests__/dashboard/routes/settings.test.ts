import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createSettingsRouter } from '../../../dashboard/routes/settings.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);

  app = express();
  app.use(express.json());
  app.use('/api/settings', createSettingsRouter(db));
});

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
