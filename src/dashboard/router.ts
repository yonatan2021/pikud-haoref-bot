import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { createStatsRouter } from './routes/stats.js';
import { createSubscribersRouter } from './routes/subscribers.js';
import { createOperationsRouter } from './routes/operations.js';
import { createSettingsRouter } from './routes/settings.js';
import { createLandingRouter } from './routes/landing.js';

export function createApiRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();
  router.use('/stats', createStatsRouter(db));
  router.use('/subscribers', createSubscribersRouter(db));
  router.use('/operations', createOperationsRouter(db, bot));
  router.use('/settings', createSettingsRouter(db));
  router.use('/landing', createLandingRouter(db));
  return router;
}
