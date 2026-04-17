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

async function getHealthWithStatus(port: number): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

/** Wait for the server to finish binding and return the assigned port. */
function awaitListening(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve((server.address() as { port: number }).port));
    server.once('error', reject);
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
    const port = await awaitListening(server);
    const body = await getHealth(port);
    assert.ok(typeof body.uptime === 'number');
    assert.ok('lastAlertAt' in body);
    assert.ok('lastPollAt' in body);
    assert.ok(typeof body.alertsToday === 'number');
    assert.ok('pollStuck' in body, 'pollStuck must be present');
    assert.ok(typeof body.memoryMb === 'number', 'memoryMb must be a number');
    assert.ok(typeof body.dmQueueDepth === 'number', 'dmQueueDepth must be a number');
    server.closeAllConnections();
    server.close();
  });

  it('GET /health returns 200 when poll is not stuck', async () => {
    const { updateLastPollAt } = await import('../metrics.js');
    updateLastPollAt(); // mark poll as recent
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = await awaitListening(server);
    const { status, body } = await getHealthWithStatus(port);
    assert.equal(status, 200);
    assert.equal(body.pollStuck, false);
    server.closeAllConnections();
    server.close();
  });

  it('GET /health returns 503 when lastPollAt is older than 30s', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const { getMetrics } = await import('../metrics.js');
    const server = startHealthServer(0);
    const port = await awaitListening(server);
    // Verify the stuck path by fast-forwarding Date.now past the 30s threshold.
    // lastPollAt was set in the previous test — advance time by 35 seconds.
    const metrics = getMetrics();
    const origNow = Date.now;
    Date.now = () => (metrics.lastPollAt ? metrics.lastPollAt.getTime() + 35_000 : origNow());
    try {
      const { status, body } = await getHealthWithStatus(port);
      assert.equal(status, 503);
      assert.equal(body.pollStuck, true);
    } finally {
      Date.now = origNow;
    }
    server.closeAllConnections();
    server.close();
  });

  it('GET /unknown returns 404', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = await awaitListening(server);
    const status = await new Promise<number>((resolve) => {
      http.get(`http://localhost:${port}/unknown`, (res) => resolve(res.statusCode ?? 0));
    });
    assert.equal(status, 404);
    server.closeAllConnections();
    server.close();
  });

  it('alertsTodayError is absent from response when DB is healthy', async () => {
    const { startHealthServer } = await import('../healthServer.js');
    const server = startHealthServer(0);
    const port = await awaitListening(server);
    const body = await getHealth(port);
    assert.ok(!('alertsTodayError' in body), 'alertsTodayError must not appear on success path');
    server.closeAllConnections();
    server.close();
  });

  // Note: the alertsTodayError:true path (DB failure) cannot be reliably triggered
  // in integration tests without mocking — better-sqlite3 re-opens the file on the
  // next getDb() call. The try/catch in alertsToday() is verified by code inspection.
});
