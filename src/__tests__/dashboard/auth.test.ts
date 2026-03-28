import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthMiddleware, createLoginHandler, createLogoutHandler } from '../../dashboard/auth.js';
import type { Request, Response, NextFunction } from 'express';

const SECRET = 'test-secret';
const auth = createAuthMiddleware(SECRET);

function mockRes() {
  const res: any = { _status: 200, _body: null, _cookie: null, _clearedCookie: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: unknown) => { res._body = body; return res; };
  res.cookie = (name: string, val: string) => { res._cookie = { name, val }; return res; };
  res.clearCookie = (name: string) => { res._clearedCookie = name; return res; };
  return res;
}

describe('createAuthMiddleware', () => {
  it('blocks request without token', () => {
    const next = () => { throw new Error('next should not be called'); };
    const res = mockRes();
    auth({ cookies: {} } as unknown as Request, res as Response, next as NextFunction);
    assert.equal(res._status, 401);
  });

  it('blocks request with wrong token', () => {
    const next = () => { throw new Error('next should not be called'); };
    const res = mockRes();
    auth({ cookies: { dashboard_token: 'wrong' } } as unknown as Request, res as Response, next as NextFunction);
    assert.equal(res._status, 401);
  });

  it('passes request with correct token', () => {
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const res = mockRes();
    auth({ cookies: { dashboard_token: SECRET } } as unknown as Request, res as Response, next as NextFunction);
    assert.equal(nextCalled, true);
    assert.equal(res._status, 200); // unchanged
  });
});

describe('createLoginHandler', () => {
  it('returns 401 for wrong password', () => {
    const handler = createLoginHandler(SECRET);
    const res = mockRes();
    handler({ body: { password: 'wrong' } } as unknown as Request, res as Response);
    assert.equal(res._status, 401);
  });

  it('sets cookie and returns ok for correct password', () => {
    const handler = createLoginHandler(SECRET);
    const res = mockRes();
    handler({ body: { password: SECRET } } as unknown as Request, res as Response);
    assert.deepEqual(res._body, { ok: true });
    assert.ok(res._cookie);
  });
});

describe('createLogoutHandler', () => {
  it('clears cookie and returns ok', () => {
    const handler = createLogoutHandler();
    const res = mockRes();
    handler({} as unknown as Request, res as Response);
    assert.equal(res._clearedCookie, 'dashboard_token');
    assert.deepEqual(res._body, { ok: true });
  });
});
