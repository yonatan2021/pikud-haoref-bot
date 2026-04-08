// Regression tests for GET /api/stats/overview mapboxRow undefined branch.
//
// Context: src/dashboard/routes/stats.ts:66-68 queries mapbox_usage for the
// current month via `strftime('%Y-%m', 'now')`. If no row exists for the
// current month (first request of a new month), `mapboxRow` is `undefined`
// and the `?? 0` guard on line 84 is what prevents a TypeError on
// `.request_count`. The existing stats.test.ts happy-path tests do not
// seed this table so they hit the guard by accident without any assertion
// on the behavior. These tests lock it down explicitly.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createStatsRouter } from '../../../dashboard/routes/stats.js';
import { clearStatsCache } from '../../../dashboard/statsCache.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/stats', createStatsRouter(db));
});

after(() => db.close());

beforeEach(() => {
  // Each test owns its own mapbox_usage state + a clean cache so the
  // 60s TTL on /overview doesn't leak stale data between tests.
  db.prepare('DELETE FROM mapbox_usage').run();
  clearStatsCache();
});

// Matches SQLite's `strftime('%Y-%m', 'now')` which uses UTC. Tests assume
// wall-clock doesn't cross a month boundary mid-run (safe for unit tests).
function currentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function previousMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

describe('GET /api/stats/overview — mapboxRow undefined branch', () => {
  it('returns mapboxMonth: 0 when no mapbox_usage row exists at all', async () => {
    // Empty table — the strftime query must return no row.
    const rowCount = db.prepare('SELECT COUNT(*) as c FROM mapbox_usage').get() as { c: number };
    assert.equal(rowCount.c, 0, 'precondition: mapbox_usage must be empty');

    const res = await request(app).get('/api/stats/overview');
    assert.equal(res.status, 200);
    assert.equal(
      res.body.mapboxMonth,
      0,
      'mapboxMonth must default to 0 when the table is empty (no TypeError on undefined.request_count)'
    );
  });

  it('returns mapboxMonth: 0 when only a previous-month row exists', async () => {
    // Rollover case: last month has data but current month does not yet.
    db.prepare('INSERT INTO mapbox_usage (month, request_count) VALUES (?, ?)')
      .run(previousMonth(), 1234);

    const res = await request(app).get('/api/stats/overview');
    assert.equal(res.status, 200);
    assert.equal(
      res.body.mapboxMonth,
      0,
      'previous-month row must NOT leak into current-month count'
    );
  });

  it('returns the actual count when a current-month row exists', async () => {
    db.prepare('INSERT INTO mapbox_usage (month, request_count) VALUES (?, ?)')
      .run(currentMonth(), 42);

    const res = await request(app).get('/api/stats/overview');
    assert.equal(res.status, 200);
    assert.equal(res.body.mapboxMonth, 42, 'must read request_count from the current-month row');
  });

  it('does not crash when the whole DB is empty (no users, no alerts, no mapbox_usage)', async () => {
    // Cross-branch safety net: every COUNT query returns 0 AND the mapbox
    // guard fires. This is the "day 1" empty-install scenario.
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM subscriptions').run();
    db.prepare('DELETE FROM alert_history').run();
    db.prepare('DELETE FROM mapbox_usage').run();

    const res = await request(app).get('/api/stats/overview');
    assert.equal(res.status, 200, 'must not 500 on an empty DB');
    assert.equal(res.body.totalSubscribers, 0);
    assert.equal(res.body.totalSubscriptions, 0);
    assert.equal(res.body.alertsToday, 0);
    assert.equal(res.body.mapboxMonth, 0);
  });
});
