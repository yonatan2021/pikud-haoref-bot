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

function mockLoginReq(password: unknown, ip = '127.0.0.1'): Request {
  return { body: { password }, ip, headers: {} } as unknown as Request;
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
      loginHandler(mockLoginReq(SECRET), loginRes as Response);
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
      loginHandler(mockLoginReq(SECRET), loginRes as Response);
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
      loginHandler(mockLoginReq('wrong'), res as Response);
      assert.equal(res._status, 401);
    });

    it('sets cookie and returns ok for correct password', () => {
      const { loginHandler } = createSessionStore(SECRET);
      const res = mockRes();
      loginHandler(mockLoginReq(SECRET), res as Response);
      assert.deepEqual(res._body, { ok: true });
      assert.ok(res._cookie);
      // Cookie value should be a UUID, not the secret itself
      assert.notEqual(res._cookie.val, SECRET);
      assert.match(res._cookie.val, /^[0-9a-f-]{36}$/);
    });

    it('returns 429 after 10 failed attempts from same IP', () => {
      const { loginHandler } = createSessionStore(SECRET);
      // Exhaust the rate limit with 10 wrong-password attempts
      for (let i = 0; i < 10; i++) {
        const res = mockRes();
        loginHandler(mockLoginReq('wrong'), res as Response);
        assert.equal(res._status, 401, `attempt ${i + 1} should be 401`);
      }
      // 11th attempt from the same IP should be rate-limited
      const res = mockRes();
      loginHandler(mockLoginReq('wrong'), res as Response);
      assert.equal(res._status, 429);
    });

    it('successful login resets rate limit counter', () => {
      const { loginHandler } = createSessionStore(SECRET);
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        loginHandler(mockLoginReq('wrong'), mockRes() as Response);
      }
      // Correct password clears the counter
      const successRes = mockRes();
      loginHandler(mockLoginReq(SECRET), successRes as Response);
      assert.equal(successRes._status, 200);
      // Next wrong attempt should start fresh (not accumulate toward 429)
      const afterRes = mockRes();
      loginHandler(mockLoginReq('wrong'), afterRes as Response);
      assert.equal(afterRes._status, 401); // 401, not 429
    });

    it('rate limit is per-IP — different IPs are independent', () => {
      const { loginHandler } = createSessionStore(SECRET);
      // Exhaust IP-A
      for (let i = 0; i < 10; i++) {
        loginHandler(mockLoginReq('wrong', '1.2.3.4'), mockRes() as Response);
      }
      // IP-A is blocked
      const blockedRes = mockRes();
      loginHandler(mockLoginReq('wrong', '1.2.3.4'), blockedRes as Response);
      assert.equal(blockedRes._status, 429);
      // IP-B still works
      const otherRes = mockRes();
      loginHandler(mockLoginReq('wrong', '5.6.7.8'), otherRes as Response);
      assert.equal(otherRes._status, 401); // 401, not 429
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
