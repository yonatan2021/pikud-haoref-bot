import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createSessionStore } from '../../dashboard/auth.js';
import { initSchema } from '../../db/schema.js';
import type { Request, Response, NextFunction } from 'express';

const SECRET = 'test-secret-1234';

// Each test gets a fresh in-memory DB to isolate session state
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

function mockRes() {
  const res: any = { _status: 200, _body: null, _cookie: null, _clearedCookie: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: unknown) => { res._body = body; return res; };
  res.cookie = (name: string, val: string, opts?: Record<string, unknown>) => { res._cookie = { name, val, opts }; return res; };
  res.set = (key: string, val: string) => { (res._headers ??= {} as Record<string, string>)[key] = val; return res; };
  res.clearCookie = (name: string) => { res._clearedCookie = name; return res; };
  return res;
}

function mockLoginReq(password: unknown, ip = '127.0.0.1'): Request {
  return { body: { password }, ip, headers: {} } as unknown as Request;
}

describe('createSessionStore', () => {
  describe('authMiddleware', () => {
    it('blocks request without token', () => {
      const { authMiddleware } = createSessionStore(makeDb(), SECRET);
      const next = () => { throw new Error('next should not be called'); };
      const res = mockRes();
      authMiddleware({ cookies: {} } as unknown as Request, res as Response, next as NextFunction);
      assert.equal(res._status, 401);
    });

    it('blocks request with unknown token', () => {
      const { authMiddleware } = createSessionStore(makeDb(), SECRET);
      const next = () => { throw new Error('next should not be called'); };
      const res = mockRes();
      authMiddleware({ cookies: { dashboard_token: 'not-a-valid-uuid' } } as unknown as Request, res as Response, next as NextFunction);
      assert.equal(res._status, 401);
    });

    it('passes request after successful login', () => {
      const { authMiddleware, loginHandler } = createSessionStore(makeDb(), SECRET);

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
      const { authMiddleware, loginHandler, logoutHandler } = createSessionStore(makeDb(), SECRET);

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

    it('two concurrent sessions work independently, logout invalidates only own token', async () => {
      const { loginHandler, authMiddleware, logoutHandler } = createSessionStore(makeDb(), SECRET);

      // Login session A
      const loginReqA = { body: { password: SECRET }, ip: '127.0.0.1', headers: {}, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
      const loginResA = mockRes();
      loginHandler(loginReqA, loginResA);
      const tokenA = loginResA._cookie?.val as string;

      // Login session B
      const loginReqB = { body: { password: SECRET }, ip: '127.0.0.2', headers: {}, socket: { remoteAddress: '127.0.0.2' } } as unknown as Request;
      const loginResB = mockRes();
      loginHandler(loginReqB, loginResB);
      const tokenB = loginResB._cookie?.val as string;

      assert.notEqual(tokenA, tokenB, 'tokens must be distinct');

      // Both tokens work
      let nextCalledA = false;
      const reqA = { cookies: { dashboard_token: tokenA } } as unknown as Request;
      authMiddleware(reqA, mockRes(), () => { nextCalledA = true; });
      assert.equal(nextCalledA, true);

      let nextCalledB = false;
      const reqB = { cookies: { dashboard_token: tokenB } } as unknown as Request;
      authMiddleware(reqB, mockRes(), () => { nextCalledB = true; });
      assert.equal(nextCalledB, true);

      // Logout A — token B should still work
      const logoutReqA = { cookies: { dashboard_token: tokenA } } as unknown as Request;
      logoutHandler(logoutReqA, mockRes());

      let nextAfterLogoutA = false;
      authMiddleware(reqA, mockRes(), () => { nextAfterLogoutA = true; });
      assert.equal(nextAfterLogoutA, false, 'token A should be invalid after logout');

      let nextBStillWorks = false;
      authMiddleware(reqB, mockRes(), () => { nextBStillWorks = true; });
      assert.equal(nextBStillWorks, true, 'token B should still be valid');
    });
  });

  describe('loginHandler', () => {
    it('returns 401 for wrong password', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      loginHandler(mockLoginReq('wrong'), res as Response);
      assert.equal(res._status, 401);
    });

    it('sets cookie and returns ok for correct password', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      loginHandler(mockLoginReq(SECRET), res as Response);
      assert.deepEqual(res._body, { ok: true });
      assert.ok(res._cookie);
      // Cookie value should be a UUID, not the secret itself
      assert.notEqual(res._cookie.val, SECRET);
      assert.match(res._cookie.val, /^[0-9a-f-]{36}$/);
    });

    it('returns 429 after 10 failed attempts from same IP', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
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
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
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

    it('cookie has httpOnly and sameSite strict options', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      loginHandler(mockLoginReq(SECRET), res as Response);
      assert.equal(res._status, 200);
      assert.equal(res._cookie?.opts?.httpOnly, true, 'httpOnly must be true');
      assert.equal(res._cookie?.opts?.sameSite, 'strict', 'sameSite must be strict');
    });

    it('returns 400 for empty string password', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      loginHandler(mockLoginReq(''), res as Response);
      assert.equal(res._status, 400);
    });

    it('returns 400 for missing password field', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      loginHandler({ body: {}, ip: '127.0.0.1', headers: {} } as unknown as Request, res as Response);
      assert.equal(res._status, 400);
    });

    it('responds with Retry-After header after 10 failed attempts', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
      for (let i = 0; i < 10; i++) {
        loginHandler(mockLoginReq('wrong'), mockRes() as Response);
      }
      const res = mockRes();
      loginHandler(mockLoginReq('wrong'), res as Response);
      assert.equal(res._status, 429);
      assert.ok(res._headers?.['Retry-After'], 'Retry-After header must be set');
      assert.ok(Number(res._headers['Retry-After']) > 0, 'Retry-After must be a positive number of seconds');
    });

    it('rate limit is per-IP — different IPs are independent', () => {
      const { loginHandler } = createSessionStore(makeDb(), SECRET);
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
      const { logoutHandler } = createSessionStore(makeDb(), SECRET);
      const res = mockRes();
      logoutHandler({ cookies: {} } as unknown as Request, res as Response);
      assert.equal(res._clearedCookie, 'dashboard_token');
      assert.deepEqual(res._body, { ok: true });
    });
  });

  describe('loginHandler — SQLite-persistent rate limiting', () => {
    it('rate limit counter persists across createSessionStore instances on the same DB', () => {
      const db = makeDb();
      // First "session" — exhaust most of the allowance
      const { loginHandler: handler1 } = createSessionStore(db, SECRET);
      for (let i = 0; i < 10; i++) {
        handler1(mockLoginReq('wrong', '1.2.3.4'), mockRes() as Response);
      }
      // Simulate a restart by creating a new session store on the same DB
      const { loginHandler: handler2 } = createSessionStore(db, SECRET);
      const res = mockRes();
      handler2(mockLoginReq('wrong', '1.2.3.4'), res as Response);
      assert.equal(res._status, 429, 'rate limit should survive session store recreation');
    });

    it('clears the login_attempts record on successful login', () => {
      const db = makeDb();
      const { loginHandler } = createSessionStore(db, SECRET);
      // Build up some failed attempts
      for (let i = 0; i < 3; i++) {
        loginHandler(mockLoginReq('wrong', '1.2.3.4'), mockRes() as Response);
      }
      // Successful login should clear the counter
      loginHandler(mockLoginReq(SECRET, '1.2.3.4'), mockRes() as Response);
      const row = db.prepare('SELECT count FROM login_attempts WHERE ip = ?').get('1.2.3.4');
      assert.equal(row, undefined, 'login_attempts row should be deleted after successful login');
    });
  });

  describe('SEC-M7 — DASHBOARD_SECRET length validation', () => {
    it('throws when secret is shorter than 16 characters', () => {
      assert.throws(
        () => createSessionStore(makeDb(), 'short'),
        /DASHBOARD_SECRET must be at least 16 characters/,
      );
    });
  });
});
