import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import {
  getAllListeners,
  createListener,
  updateListener,
  deleteListener,
} from '../../db/whatsappListenerRepository.js';
import { log } from '../../logger.js';

const VALID_CHANNEL_TYPES = new Set(['group', 'newsletter']);

export function createListenersRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();

  // CRITICAL: static path MUST come before param routes
  // GET /telegram-topics — fetch Telegram forum topics for the configured chat
  router.get('/telegram-topics', async (_req: Request, res: Response) => {
    const chatId = process.env['TELEGRAM_FORWARD_GROUP_ID'] ?? process.env['TELEGRAM_CHAT_ID'];
    if (!chatId) {
      res.json([]);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (bot.api.raw as any).getForumTopics({ chat_id: chatId });
      const topics = (result.topics ?? []).map((t: { message_thread_id: number; name: string }) => ({
        id: t.message_thread_id,
        name: t.name,
      }));
      res.json(topics);
    } catch {
      // group is not a forum group — return empty gracefully
      res.json([]);
    }
  });

  // GET / — return all listeners
  router.get('/', (_req: Request, res: Response) => {
    try {
      const listeners = getAllListeners(db);
      res.json(listeners);
    } catch (err: unknown) {
      log('error', 'WhatsApp', `שגיאה בטעינת listeners: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // POST / — create a new listener
  router.post('/', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    const channelId = typeof body['channelId'] === 'string' ? body['channelId'].trim() : '';
    if (!channelId) {
      res.status(400).json({ error: 'channelId חסר או ריק' });
      return;
    }

    const channelName = typeof body['channelName'] === 'string' ? body['channelName'].trim() : '';
    if (!channelName) {
      res.status(400).json({ error: 'channelName חסר או ריק' });
      return;
    }

    const channelType = typeof body['channelType'] === 'string' ? body['channelType'] : 'group';
    if (!VALID_CHANNEL_TYPES.has(channelType)) {
      res.status(400).json({ error: `channelType לא חוקי: ${channelType}. חייב להיות group או newsletter` });
      return;
    }

    const rawKeywords = body['keywords'];
    if (
      rawKeywords !== undefined &&
      (!Array.isArray(rawKeywords) || !(rawKeywords as unknown[]).every((k) => typeof k === 'string'))
    ) {
      res.status(400).json({ error: 'keywords חייב להיות מערך של מחרוזות' });
      return;
    }
    const keywords: string[] = Array.isArray(rawKeywords) ? (rawKeywords as string[]) : [];

    const rawTelegramTopicId = body['telegramTopicId'];
    const telegramTopicId: number | null =
      typeof rawTelegramTopicId === 'number' ? rawTelegramTopicId : null;

    const rawTelegramTopicName = body['telegramTopicName'];
    const telegramTopicName: string | null =
      typeof rawTelegramTopicName === 'string' ? rawTelegramTopicName : null;

    if (body['isActive'] !== undefined && typeof body['isActive'] !== 'boolean') {
      res.status(400).json({ error: 'isActive חייב להיות boolean' });
      return;
    }
    const rawIsActive = body['isActive'];
    const isActive: boolean = rawIsActive === false ? false : true;

    try {
      const listener = createListener(db, {
        channelId,
        channelName,
        channelType,
        keywords,
        telegramTopicId,
        telegramTopicName,
        isActive,
      });
      log('info', 'WhatsApp', `listener נוצר: ${channelId}`);
      res.status(201).json(listener);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: `channelId כבר קיים: ${channelId}` });
        return;
      }
      log('error', 'WhatsApp', `שגיאה ביצירת listener: ${msg}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // PATCH /:id — update an existing listener (all fields optional)
  router.patch('/:id', (req: Request, res: Response) => {
    const rawId = req.params['id'];
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'מזהה listener לא תקין — חייב להיות מספר שלם' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ('channelName' in body) {
      const channelName = typeof body['channelName'] === 'string' ? body['channelName'].trim() : '';
      if (!channelName) {
        res.status(400).json({ error: 'channelName לא יכול להיות ריק' });
        return;
      }
      updates['channelName'] = channelName;
    }

    if ('keywords' in body) {
      const rawKeywords = body['keywords'];
      if (
        !Array.isArray(rawKeywords) ||
        !(rawKeywords as unknown[]).every((k) => typeof k === 'string')
      ) {
        res.status(400).json({ error: 'keywords חייב להיות מערך של מחרוזות' });
        return;
      }
      updates['keywords'] = rawKeywords as string[];
    }

    if ('isActive' in body) {
      if (typeof body['isActive'] !== 'boolean') {
        res.status(400).json({ error: 'isActive חייב להיות boolean' });
        return;
      }
      updates['isActive'] = body['isActive'];
    }

    if ('telegramTopicId' in body) {
      const rawTopicId = body['telegramTopicId'];
      updates['telegramTopicId'] = typeof rawTopicId === 'number' ? rawTopicId : null;
    }

    if ('telegramTopicName' in body) {
      const rawTopicName = body['telegramTopicName'];
      updates['telegramTopicName'] = typeof rawTopicName === 'string' ? rawTopicName : null;
    }

    try {
      const updated = updateListener(db, id, updates);
      if (updated === null) {
        res.status(404).json({ error: `listener לא נמצא: ${id}` });
        return;
      }
      log('info', 'WhatsApp', `listener עודכן: ${id}`);
      res.json(updated);
    } catch (err: unknown) {
      log('error', 'WhatsApp', `שגיאה בעדכון listener ${id}: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // DELETE /:id — remove a listener
  router.delete('/:id', (req: Request, res: Response) => {
    const rawId = req.params['id'];
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'מזהה listener לא תקין — חייב להיות מספר שלם' });
      return;
    }

    try {
      const deleted = deleteListener(db, id);
      if (!deleted) {
        res.status(404).json({ error: `listener לא נמצא: ${id}` });
        return;
      }
      log('info', 'WhatsApp', `listener נמחק: ${id}`);
      res.json({ ok: true });
    } catch (err: unknown) {
      log('error', 'WhatsApp', `שגיאה במחיקת listener ${id}: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  return router;
}
