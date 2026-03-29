import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

const COOKIE_NAME = 'dashboard_token';
const SESSION_TTL_DAYS = 7;

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10;                    // max attempts per window

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : null)
    ?? req.ip
    ?? 'unknown';
  return ip.trim();
}

export function createSessionStore(db: Database.Database, secret: string) {
  // Purge any sessions that expired before this startup
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  const loginAttempts = new Map<string, { count: number; resetAt: number }>();

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
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_MAX) {
        res.status(429).json({ error: 'יותר מדי ניסיונות התחברות — נסה שוב מאוחר יותר' });
        return;
      }
      loginAttempts.set(ip, { ...entry, count: entry.count + 1 });
    } else {
      loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    }

    const { password } = req.body as { password?: string };
    if (typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'סיסמה נדרשת' });
      return;
    }
    if (password !== secret) {
      res.status(401).json({ error: 'סיסמה שגויה' });
      return;
    }
    // Successful login — clear the rate limit counter for this IP
    loginAttempts.delete(ip);
    const token = randomUUID();
    db.prepare(
      `INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', '+${SESSION_TTL_DAYS} days'))`
    ).run(token);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true });
  }

  function logoutHandler(req: Request, res: Response): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  }

  return { authMiddleware, loginHandler, logoutHandler };
}
