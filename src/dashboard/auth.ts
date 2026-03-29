import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'dashboard_token';

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10;                    // max attempts per window

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : null)
    ?? req.ip
    ?? 'unknown';
  return ip.trim();
}

export function createSessionStore(secret: string) {
  const sessions = new Set<string>();
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();

  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    if (!sessions.has(token)) {
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
    sessions.add(token);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true });
  }

  function logoutHandler(req: Request, res: Response): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    sessions.delete(token);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  }

  return { authMiddleware, loginHandler, logoutHandler };
}
