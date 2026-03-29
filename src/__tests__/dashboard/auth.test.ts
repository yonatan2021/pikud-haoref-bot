import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../../dashboard/auth.js';
import type { Request, Response, NextFunction } from 'express';

const SECRET = 'test-secret';

function mockRes() {
  const res: any = { _status: 200, _body: null, _cookie: null, _clearedCookie: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: unknown) => { res._body = body; return res; };
  res.cookie = (name: string, val: string) => { res._cookie = { name, val }; return res; };
  res.clearCookie = (name: string) => { res._clearedCookie = name; return res; };
  return res;
}

describe('createSessionStore', () => {
  describe('authMiddleware', () => {
    it('blocks request without token', () => {
      const { authMiddleware } = createSessionStore(SECRET);
      const next = () => { throw new Error('next should not be called'); };
      const res = mockRes();
      authMiddleware({ cookies: {} } as unknown as Request, res as Response, next as NextFunction);
      assert.equal(res._status, 401);
    });

    it('blocks request with unknown token', () => {
      const { authMiddleware } = createSessionStore(SECRET);
      const next = () => { throw new Error('next should not be called'); };
      const res = mockRes();
      authMiddleware({ cookies: { dashboard_token: 'not-a-valid-uuid' } } as unknown as Request, res as Response, next as NextFunction);
      assert.equal(res._status, 401);
    });

    it('passes request after successful login', () => {
      const { authMiddleware, loginHandler } = createSessionStore(SECRET);

      // Login to obtain a session token
      const loginRes = mockRes();
      loginHandler({ body: { password: SECRET } } as unknown as Request, loginRes as Response);
      assert.deepEqual(loginRes._body, { ok: true });
      const sessionToken = loginRes._cookie.val;

      // Use the token in a subsequent request
      let nextCalled = false;
      const authRes = mockRes();
      authMiddleware(
        { cookies: { dashboard_token: sessionToken } } as unknown as Request,
        authRes as Response,
        (() => { nextCalled = true; }) as NextFunction,
      );
      assert.equal(nextCalled, true);
      assert.equal(authRes._status, 200);
    });

    it('blocks request after logout', () => {
      const { authMiddleware, loginHandler, logoutHandler } = createSessionStore(SECRET);

      // Login
      const loginRes = mockRes();
      loginHandler({ body: { password: SECRET } } as unknown as Request, loginRes as Response);
      const sessionToken = loginRes._cookie.val;

      // Logout
      const logoutRes = mockRes();
      logoutHandler({ cookies: { dashboard_token: sessionToken } } as unknown as Request, logoutRes as Response);

      // Token should no longer be valid
      const next = () => { throw new Error('next should not be called'); };
      const authRes = mockRes();
      authMiddleware(
        { cookies: { dashboard_token: sessionToken } } as unknown as Request,
        authRes as Response,
        next as NextFunction,
      );
      assert.equal(authRes._status, 401);
    });
  });

  describe('loginHandler', () => {
    it('returns 401 for wrong password', () => {
      const { loginHandler } = createSessionStore(SECRET);
      const res = mockRes();
      loginHandler({ body: { password: 'wrong' } } as unknown as Request, res as Response);
      assert.equal(res._status, 401);
    });

    it('sets cookie and returns ok for correct password', () => {
      const { loginHandler } = createSessionStore(SECRET);
      const res = mockRes();
      loginHandler({ body: { password: SECRET } } as unknown as Request, res as Response);
      assert.deepEqual(res._body, { ok: true });
      assert.ok(res._cookie);
      // Cookie value should be a UUID, not the secret itself
      assert.notEqual(res._cookie.val, SECRET);
      assert.match(res._cookie.val, /^[0-9a-f-]{36}$/);
    });
  });

  describe('logoutHandler', () => {
    it('clears cookie and returns ok', () => {
      const { logoutHandler } = createSessionStore(SECRET);
      const res = mockRes();
      logoutHandler({ cookies: {} } as unknown as Request, res as Response);
      assert.equal(res._clearedCookie, 'dashboard_token');
      assert.deepEqual(res._body, { ok: true });
    });
  });
});
