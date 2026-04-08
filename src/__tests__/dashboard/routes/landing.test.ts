import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createLandingRouter, landingConfigLimiter, deployLimiter } from '../../../dashboard/routes/landing.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);

  app = express();
  app.use(express.json());
  app.use('/api/landing', createLandingRouter(db));
});

after(() => db.close());

beforeEach(() => {
  // Reset settings between tests for isolation
  db.prepare("DELETE FROM settings WHERE key IN ('ga4_measurement_id', 'landing_url', 'last_landing_deploy')").run();
  landingConfigLimiter.clearStore();
  deployLimiter.clearStore();
});

describe('GET /api/landing/config', () => {
  it('returns 200 with expected keys', async () => {
    const res = await request(app).get('/api/landing/config');
    assert.equal(res.status, 200);
    assert.ok('ga4MeasurementId' in res.body, 'Should have ga4MeasurementId');
    assert.ok('siteUrl' in res.body, 'Should have siteUrl');
    assert.ok('lastDeploy' in res.body, 'Should have lastDeploy');
  });

  it('returns null for lastDeploy on fresh DB', async () => {
    const res = await request(app).get('/api/landing/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.lastDeploy, null);
  });
});

describe('PATCH /api/landing/config', () => {
  it('accepts valid GA4 measurement ID', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ ga4MeasurementId: 'G-ABC1234567' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('returns 400 for invalid GA4 format', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ ga4MeasurementId: 'INVALID' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('accepts empty string to clear GA4 ID', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ ga4MeasurementId: '' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('accepts https:// siteUrl', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: 'https://example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('accepts http:// siteUrl', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: 'http://example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('returns 400 for siteUrl without protocol (example.com)', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: 'example.com' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'Should reject URL without http(s):// prefix');
  });

  it('returns 400 for siteUrl with ftp:// protocol', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: 'ftp://example.com' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('accepts empty siteUrl to clear the setting', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: '' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('accepts siteUrl with leading and trailing whitespace', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: '  https://example.com  ' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('accepts uppercase HTTPS protocol', async () => {
    const res = await request(app)
      .patch('/api/landing/config')
      .send({ siteUrl: 'HTTPS://example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('persists siteUrl to DB', async () => {
    await request(app).patch('/api/landing/config').send({ siteUrl: 'https://example.com' });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'landing_url'").get() as { value: string } | undefined;
    assert.ok(row, 'Row should exist in DB');
    assert.equal(row.value, 'https://example.com');
  });
});

describe('POST /api/landing/deploy', () => {
  it('returns 400 when GITHUB_PAT is not set', async () => {
    const original = process.env['GITHUB_PAT'];
    delete process.env['GITHUB_PAT'];

    try {
      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    } finally {
      if (original !== undefined) process.env['GITHUB_PAT'] = original;
    }
  });

  it('returns 400 when GITHUB_REPO is missing', async () => {
    const origPat = process.env['GITHUB_PAT'];
    const origRepo = process.env['GITHUB_REPO'];
    process.env['GITHUB_PAT'] = 'fake-pat';
    delete process.env['GITHUB_REPO'];

    try {
      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    } finally {
      if (origPat !== undefined) process.env['GITHUB_PAT'] = origPat; else delete process.env['GITHUB_PAT'];
      if (origRepo !== undefined) process.env['GITHUB_REPO'] = origRepo;
    }
  });

  // I7 — POST /deploy error paths that the existing tests don't exercise.
  // These need global.fetch mocking because the route fires a real HTTPS
  // request to the GitHub Actions workflow_dispatch endpoint.
  describe('with mocked global.fetch', () => {
    let origFetch: typeof globalThis.fetch;
    let origPat: string | undefined;
    let origRepo: string | undefined;

    beforeEach(() => {
      origFetch = globalThis.fetch;
      origPat = process.env['GITHUB_PAT'];
      origRepo = process.env['GITHUB_REPO'];
      process.env['GITHUB_PAT'] = 'fake-pat-for-test';
      process.env['GITHUB_REPO'] = 'yonatan2021/pikud-haoref-bot';
    });

    after(() => {
      // Restore env after the entire suite runs (per-test restore handled below).
      globalThis.fetch = origFetch;
      if (origPat !== undefined) process.env['GITHUB_PAT'] = origPat; else delete process.env['GITHUB_PAT'];
      if (origRepo !== undefined) process.env['GITHUB_REPO'] = origRepo;
    });

    it('returns 502 when GitHub API responds with 4xx', async () => {
      globalThis.fetch = (async () =>
        new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' })
      ) as typeof globalThis.fetch;

      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 502);
      assert.ok(res.body.error);
      assert.equal(res.body.status, 401, 'must surface the upstream status code');

      // last_landing_deploy must NOT be written on failure.
      const row = db.prepare("SELECT value FROM settings WHERE key = 'last_landing_deploy'").get();
      assert.equal(row, undefined, 'last_landing_deploy must NOT be persisted on failure');
    });

    it('returns 502 when GitHub API responds with 5xx', async () => {
      globalThis.fetch = (async () =>
        new Response('Internal Server Error', { status: 500, statusText: 'ISE' })
      ) as typeof globalThis.fetch;

      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 502);
      assert.equal(res.body.status, 500);
    });

    it('returns 500 when fetch throws (network error)', async () => {
      globalThis.fetch = (async () => {
        throw new TypeError('fetch failed: ECONNREFUSED');
      }) as typeof globalThis.fetch;

      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 500);
      assert.ok(res.body.error);
      // last_landing_deploy must NOT be written on network failure either.
      const row = db.prepare("SELECT value FROM settings WHERE key = 'last_landing_deploy'").get();
      assert.equal(row, undefined);
    });

    it('returns 200 ok and persists last_landing_deploy on success', async () => {
      // GitHub workflow_dispatch returns 204 No Content on success — `response.ok`
      // is true for any 2xx.
      globalThis.fetch = (async () =>
        new Response(null, { status: 204, statusText: 'No Content' })
      ) as typeof globalThis.fetch;

      const res = await request(app).post('/api/landing/deploy');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'last_landing_deploy'")
        .get() as { value: string } | undefined;
      assert.ok(row, 'last_landing_deploy must be persisted on success');
      // Sanity check: the value parses as an ISO date.
      assert.ok(!isNaN(new Date(row!.value).getTime()), 'must be an ISO date string');
    });

    it('returns 400 for malformed GITHUB_REPO format (no slash)', async () => {
      const orig = process.env['GITHUB_REPO'];
      process.env['GITHUB_REPO'] = 'no-slash-here';
      try {
        const res = await request(app).post('/api/landing/deploy');
        assert.equal(res.status, 400);
        assert.ok(res.body.error.includes('GITHUB_REPO'));
      } finally {
        process.env['GITHUB_REPO'] = orig;
      }
    });
  });
});
