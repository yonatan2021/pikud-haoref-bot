import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { createSessionStore } from './auth.js';
import { createApiRouter } from './router.js';
import { log } from '../logger.js';

const UI_DIST = path.join(__dirname, '../../dashboard-ui/dist');

export function startDashboardServer(db: Database.Database, bot: Bot, port: number, secret: string): http.Server {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],   // Tailwind injects inline styles
        imgSrc: ["'self'", 'data:', 'blob:'],       // Mapbox previews use blob URLs
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.set('trust proxy', 1); // trust one hop (nginx reverse proxy per deployment.md)

  const { authMiddleware, loginHandler, logoutHandler } = createSessionStore(db, secret);
  app.post('/auth/login', loginHandler);
  app.post('/auth/logout', logoutHandler);

  // CSRF double-submit cookie: verify that the X-CSRF-Token header matches the csrf-token cookie
  // (sameSite:strict + httpOnly on the session cookie already prevents most CSRF; this adds
  //  defence-in-depth and resolves CodeQL SEC-C1)
  const csrfMiddleware = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    const csrfCookie = req.cookies?.['csrf-token'] as string | undefined;
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      res.status(403).json({ error: 'CSRF token mismatch' });
      return;
    }
    next();
  };

  app.use('/api', authMiddleware, csrfMiddleware, createApiRouter(db, bot));

  app.use(express.static(UI_DIST));
  app.get('*path', (_req, res) => res.sendFile(path.join(UI_DIST, 'index.html')));

  const server = app.listen(port, () => log('info', 'Init', `Dashboard listening on port ${port}`));
  return server;
}
