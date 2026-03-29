import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'dashboard_token';

export function createSessionStore(secret: string) {
  const sessions = new Set<string>();

  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.[COOKIE_NAME] ?? '';
    if (!sessions.has(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  function loginHandler(req: Request, res: Response): void {
    const { password } = req.body as { password?: string };
    if (typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'סיסמה נדרשת' });
      return;
    }
    if (password !== secret) {
      res.status(401).json({ error: 'סיסמה שגויה' });
      return;
    }
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
