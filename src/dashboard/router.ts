import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';

export function createApiRouter(_db: Database.Database, _bot: Bot): Router {
  const router = Router();
  // Routes mounted in Tasks 3–5
  return router;
}
