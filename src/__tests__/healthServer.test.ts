import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { initDb, closeDb } from '../db/schema.js';

async function getHealth(port: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

describe('metrics', () => {
  it('returns null lastAlertAt before any update', async () => {
    const { getMetrics } = await import('../metrics.js');
    assert.equal(getMetrics().lastAlertAt, null);
  });

  it('records lastAlertAt after updateLastAlertAt()', async () => {
    const { getMetrics, updateLastAlertAt } = await import('../metrics.js');
    updateLastAlertAt();
    assert.ok(getMetrics().lastAlertAt instanceof Date);
  });
});

describe('healthServer', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });

  it('GET /health returns required fields', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = (server.address() as { port: number }).port;
    const body = await getHealth(port);
    assert.ok(typeof body.uptime === 'number');
    assert.ok('lastAlertAt' in body);
    assert.ok('lastPollAt' in body);
    assert.ok(typeof body.alertsToday === 'number');
    server.close();
  });

  it('GET /unknown returns 404', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = (server.address() as { port: number }).port;
    const status = await new Promise<number>((resolve) => {
      http.get(`http://localhost:${port}/unknown`, (res) => resolve(res.statusCode ?? 0));
    });
    assert.equal(status, 404);
    server.close();
  });

  it('alertsTodayError is absent from response when DB is healthy', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = (server.address() as { port: number }).port;
    const body = await getHealth(port);
    assert.ok(!('alertsTodayError' in body), 'alertsTodayError must not appear on success path');
    server.close();
  });

  // Note: the alertsTodayError:true path (DB failure) cannot be reliably triggered
  // in integration tests without mocking — better-sqlite3 re-opens the file on the
  // next getDb() call. The try/catch in alertsToday() is verified by code inspection.
});
