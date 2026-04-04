import http from 'http';
import express from 'express';
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
  app.use(express.json());
  app.use(cookieParser());
  app.set('trust proxy', 1); // trust one hop (nginx reverse proxy per deployment.md)

  const { authMiddleware, loginHandler, logoutHandler } = createSessionStore(db, secret);
  app.post('/auth/login', loginHandler);
  app.post('/auth/logout', logoutHandler);
  app.use('/api', authMiddleware, createApiRouter(db, bot));

  app.use(express.static(UI_DIST));
  app.get('*path', (_req, res) => res.sendFile(path.join(UI_DIST, 'index.html')));

  const server = app.listen(port, () => log('info', 'Init', `Dashboard listening on port ${port}`));
  return server;
}
