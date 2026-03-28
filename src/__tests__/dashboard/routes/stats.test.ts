import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createStatsRouter } from '../../../dashboard/routes/stats.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use('/api/stats', createStatsRouter(db));
});

after(() => db.close());

describe('GET /api/stats/health', () => {
  it('returns uptime and alertsToday', async () => {
    const res = await request(app).get('/api/stats/health');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.uptime, 'number');
    assert.equal(typeof res.body.alertsToday, 'number');
    assert.ok('lastAlertAt' in res.body);
    assert.ok('lastPollAt' in res.body);
  });
});

describe('GET /api/stats/overview', () => {
  it('returns subscriber and alert counts', async () => {
    const res = await request(app).get('/api/stats/overview');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.totalSubscribers, 'number');
    assert.equal(typeof res.body.totalSubscriptions, 'number');
    assert.equal(typeof res.body.alertsToday, 'number');
    assert.equal(typeof res.body.alertsLast7Days, 'number');
    assert.equal(typeof res.body.mapboxMonth, 'number');
  });
});

describe('GET /api/stats/alerts', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/stats/alerts');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('filters by type', async () => {
    db.prepare(`INSERT INTO alert_history (type, cities, fired_at) VALUES ('missiles', '["תל אביב"]', datetime('now'))`).run();
    db.prepare(`INSERT INTO alert_history (type, cities, fired_at) VALUES ('earthquake', '["חיפה"]', datetime('now'))`).run();
    const res = await request(app).get('/api/stats/alerts?type=missiles');
    assert.equal(res.status, 200);
    assert.ok(res.body.every((r: any) => r.type === 'missiles'));
  });
});

describe('GET /api/stats/alerts/by-category', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/stats/alerts/by-category');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('GET /api/stats/alerts/top-cities', () => {
  it('returns an array with city and count', async () => {
    const res = await request(app).get('/api/stats/alerts/top-cities');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});
