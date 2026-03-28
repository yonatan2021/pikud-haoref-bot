import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'dashboard_token';

export function createAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.cookies?.[COOKIE_NAME] !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

export function createLoginHandler(secret: string) {
  return (req: Request, res: Response): void => {
    const { password } = req.body as { password?: string };
    if (password !== secret) {
      res.status(401).json({ error: 'סיסמה שגויה' });
      return;
    }
    res.cookie(COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
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
