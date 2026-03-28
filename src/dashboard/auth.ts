import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'dashboard_token';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    if (!safeEqual(token, secret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

export function createLoginHandler(secret: string) {
  return (req: Request, res: Response): void => {
    const { password } = req.body as { password?: string };
    if (typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'סיסמה נדרשת' });
      return;
    }
    if (password !== secret) {
      res.status(401).json({ error: 'סיסמה שגויה' });
      return;
    }
    res.cookie(COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true });
  };
}

export function createLogoutHandler() {
  return (_req: Request, res: Response): void => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  };
}
