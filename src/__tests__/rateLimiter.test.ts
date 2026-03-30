import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createRateLimitMiddleware } from '../dashboard/rateLimiter.js';

function mockReq(ip = '1.2.3.4'): Request {
  return { ip } as unknown as Request;
}

function mockRes() {
  const res: Record<string, unknown> & {
    _status: number; _body: unknown; _headers: Record<string, string>;
    status: (c: number) => typeof res;
    json: (b: unknown) => typeof res;
    set: (k: string, v: string) => typeof res;
  } = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    set(key, value) { this._headers[key] = value; return this; },
  };
  return res;
}

describe('createRateLimitMiddleware', () => {
  it('allows requests up to the limit', () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 3, windowMs: 60_000, message: 'too many' });
    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      let called = false;
      limiter(mockReq(), res as unknown as Response, () => { called = true; });
      assert.ok(called, `request ${i + 1} should be allowed`);
      assert.equal(res._status, 200, `request ${i + 1} should not set 429`);
    }
  });

  it('blocks the request that exceeds the limit with 429', () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000, message: 'כלך לך' });
    const req = mockReq();
    // Use up the allowance
    limiter(req, mockRes() as unknown as Response, () => {});
    limiter(req, mockRes() as unknown as Response, () => {});
    // This third request should be blocked
    const res = mockRes();
    let called = false;
    limiter(req, res as unknown as Response, () => { called = true; });
    assert.equal(called, false, 'next() should not be called when rate-limited');
    assert.equal(res._status, 429, 'should return 429');
    assert.deepEqual((res._body as Record<string, unknown>).error, 'כלך לך');
  });

  it('sets Retry-After header on 429', () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 1, windowMs: 30_000, message: 'x' });
    const req = mockReq('5.6.7.8');
    limiter(req, mockRes() as unknown as Response, () => {});
    const res = mockRes();
    limiter(req, res as unknown as Response, () => {});
    const retryAfter = parseInt(res._headers['Retry-After'] ?? '0', 10);
    assert.ok(retryAfter > 0 && retryAfter <= 30, `Retry-After should be 1–30, got ${retryAfter}`);
  });

  it('resets counter after windowMs', async () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 1, windowMs: 50, message: 'x' });
    const req = mockReq('9.9.9.9');
    limiter(req, mockRes() as unknown as Response, () => {});
    // Exceed limit
    const blocked = mockRes();
    limiter(req, blocked as unknown as Response, () => {});
    assert.equal(blocked._status, 429, 'should be blocked before window expires');
    // Wait for window to expire
    await new Promise(r => setTimeout(r, 80));
    const afterReset = mockRes();
    let called = false;
    limiter(req, afterReset as unknown as Response, () => { called = true; });
    assert.ok(called, 'should be allowed after window resets');
  });

  it('tracks different IPs independently', () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 1, windowMs: 60_000, message: 'x' });
    limiter(mockReq('10.0.0.1'), mockRes() as unknown as Response, () => {});
    // IP1 is now at limit — IP2 should still pass
    const res = mockRes();
    let called = false;
    limiter(mockReq('10.0.0.2'), res as unknown as Response, () => { called = true; });
    assert.ok(called, 'different IP should not be rate-limited');
  });

  it('clearStore resets all counters', () => {
    const limiter = createRateLimitMiddleware({ maxRequests: 1, windowMs: 60_000, message: 'x' });
    const req = mockReq('7.7.7.7');
    limiter(req, mockRes() as unknown as Response, () => {});
    // Verify blocked
    const blocked = mockRes();
    limiter(req, blocked as unknown as Response, () => {});
    assert.equal(blocked._status, 429);
    // Clear and retry
    limiter.clearStore();
    const afterClear = mockRes();
    let called = false;
    limiter(req, afterClear as unknown as Response, () => { called = true; });
    assert.ok(called, 'should be allowed after clearStore');
  });
});
