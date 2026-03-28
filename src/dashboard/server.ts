import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { createAuthMiddleware, createLoginHandler, createLogoutHandler } from './auth.js';
import { createApiRouter } from './router.js';

const UI_DIST = path.join(__dirname, '../../dashboard-ui/dist');

export function startDashboardServer(db: Database.Database, bot: Bot, port: number, secret: string): void {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.post('/auth/login', createLoginHandler(secret));
  app.post('/auth/logout', createLogoutHandler());

  const auth = createAuthMiddleware(secret);
  app.use('/api', auth, createApiRouter(db, bot));

  app.use(express.static(UI_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(UI_DIST, 'index.html')));

  app.listen(port, () => console.warn(`[dashboard] listening on :${port}`));
}
