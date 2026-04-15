import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { createStatsRouter } from './routes/stats.js';
import { createSubscribersRouter } from './routes/subscribers.js';
import { createOperationsRouter } from './routes/operations.js';
import { createSettingsRouter } from './routes/settings.js';
import { createLandingRouter } from './routes/landing.js';
import { createMessagesRouter } from './routes/messages.js';
import { createWhatsAppRouter } from './routes/whatsapp.js';
import { createListenersRouter } from './routes/whatsappListeners.js';
import { createTelegramListenerRouter } from './routes/telegramListeners.js';
import { createSecretsRouter } from './routes/secrets.js';
import { createGroupsRouter } from './routes/groups.js';
import { createStoriesRouter } from './routes/stories.js';
import * as whatsappService from '../whatsapp/whatsappService.js';
import { getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository.js';

export function createApiRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();
  router.use('/stats', createStatsRouter(db));
  router.use('/subscribers', createSubscribersRouter(db));
  router.use('/operations', createOperationsRouter(db, bot));
  router.use('/settings', createSettingsRouter(db));
  router.use('/landing', createLandingRouter(db));
  router.use('/messages', createMessagesRouter(db, bot, {
    getStatus: whatsappService.getStatus,
    getClient: whatsappService.getClient as () => { getChatById: (id: string) => Promise<{ sendMessage: (text: string) => Promise<unknown> }> } | null,
    getEnabledGroups: getEnabledGroupsForAlertType,
  }));
  router.use('/whatsapp/listeners', createListenersRouter(db, bot));
  router.use('/whatsapp', createWhatsAppRouter(db, whatsappService));
  router.use('/telegram', createTelegramListenerRouter(db, bot));
  router.use('/secrets', createSecretsRouter(db));
  router.use('/groups', createGroupsRouter(db));
  router.use('/stories', createStoriesRouter(db, bot));
  return router;
}
