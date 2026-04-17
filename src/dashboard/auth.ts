import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { log } from '../logger.js';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const COOKIE_NAME = 'dashboard_token';
const SESSION_TTL_DAYS = 7;

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10;                    // max attempts per window

function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createSessionStore(db: Database.Database, secret: string) {
  if (!secret || secret.length < 16) {
    throw new Error('DASHBOARD_SECRET must be at least 16 characters');
  }

  // Purge any sessions that expired before this startup
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  function getLoginAttempts(ip: string): { count: number; resetAt: number } | undefined {
    return db.prepare(
      'SELECT count, reset_at AS resetAt FROM login_attempts WHERE ip = ?'
    ).get(ip) as { count: number; resetAt: number } | undefined;
  }

  function setLoginAttempts(ip: string, count: number, resetAt: number): void {
    db.prepare(
      'INSERT INTO login_attempts (ip, count, reset_at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at'
    ).run(ip, count, resetAt);
  }

  function clearLoginAttempts(ip: string): void {
    db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
  }

  function isValidToken(token: string): boolean {
    if (!token) return false;
    const row = db.prepare(
      "SELECT 1 FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).get(token);
    return row != null;
  }

  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    if (!isValidToken(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  function loginHandler(req: Request, res: Response): void {
    try {
      const ip = getClientIp(req);
      const now = Date.now();
      const entry = getLoginAttempts(ip);

      if (entry !== undefined && now < entry.resetAt) {
        if (entry.count >= RATE_MAX) {
          res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
          res.status(429).json({ error: 'יותר מדי ניסיונות התחברות — נסה שוב מאוחר יותר' });
          return;
        }
        setLoginAttempts(ip, entry.count + 1, entry.resetAt);
      } else {
        setLoginAttempts(ip, 1, now + RATE_WINDOW_MS);
      }

      const { password } = req.body as { password?: string };
      if (typeof password !== 'string' || password.length === 0) {
        res.status(400).json({ error: 'סיסמה נדרשת' });
        return;
      }
      if (!safeEqual(password, secret)) {
        res.status(401).json({ error: 'סיסמה שגויה' });
        return;
      }
      // Successful login — clear the rate limit counter for this IP
      clearLoginAttempts(ip);
      const token = randomUUID();
      db.prepare(
        "INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', '+' || cast(? as text) || ' days'))"
      ).run(token, SESSION_TTL_DAYS);
      const secureCookie = process.env['DASHBOARD_SECURE_COOKIE'] === 'true' || process.env.NODE_ENV === 'production';
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        secure: secureCookie,
      });
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Auth', `Login handler error: ${String(err)}`);
      if (!res.headersSent) res.status(500).json({ error: 'שגיאת שרת — נסה שוב' });
    }
  }

  function logoutHandler(req: Request, res: Response): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  }

  return { authMiddleware, loginHandler, logoutHandler };
}
