import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

// Mirrors the helmet config in src/dashboard/server.ts exactly.
// Update both locations if the CSP directives change.
function buildTestApp(): express.Express {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('HTTP security headers (helmet)', () => {
  it('sets X-Frame-Options to SAMEORIGIN', async () => {
    const res = await request(buildTestApp()).get('/probe');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await request(buildTestApp()).get('/probe');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('sets Strict-Transport-Security header', async () => {
    const res = await request(buildTestApp()).get('/probe');
    assert.ok(
      res.headers['strict-transport-security'],
      'HSTS header must be present',
    );
    assert.match(res.headers['strict-transport-security'], /max-age=/);
  });

  it('sets Content-Security-Policy with required directives', async () => {
    const res = await request(buildTestApp()).get('/probe');
    const csp = res.headers['content-security-policy'] as string;
    assert.ok(csp, 'CSP header must be present');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /upgrade-insecure-requests/);
  });

  it('sets Referrer-Policy header', async () => {
    const res = await request(buildTestApp()).get('/probe');
    assert.ok(
      res.headers['referrer-policy'],
      'Referrer-Policy header must be present',
    );
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(buildTestApp()).get('/probe');
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});
