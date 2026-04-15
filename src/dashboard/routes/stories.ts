import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import {
  getPendingStories,
  getStoriesByStatus,
  getStoryById,
  lockForApproval,
  approveStory,
  rejectStory,
  getCountsByStatus,
} from '../../db/shelterStoryRepository.js';
import { getNumber } from '../../config/configResolver.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';
import { log } from '../../logger.js';

// Exported for test isolation — call storiesLimiter.clearStore() in beforeEach.
export const storiesLimiter = createRateLimitMiddleware({
  maxRequests: 30,
  windowMs: 60_000,
  message: 'יותר מדי בקשות — נסה שוב בעוד דקה',
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createStoriesRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();

  router.get('/', storiesLimiter, (req, res) => {
    try {
      const status = (req.query['status'] as string | undefined) ?? 'pending';
      const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
      const offset = Number(req.query['offset'] ?? 0);

      if (!['pending', 'approved', 'rejected', 'published'].includes(status)) {
        res.status(400).json({ error: `סטטוס לא חוקי: ${status}` });
        return;
      }

      const stories = status === 'pending'
        ? getPendingStories(db, limit, offset)
        : getStoriesByStatus(
            db,
            status as 'approved' | 'rejected' | 'published',
            limit,
            offset
          );

      const counts = getCountsByStatus(db);
      res.json({ stories, counts });
    } catch (err) {
      log('error', 'Stories', `GET /api/stories failed: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  router.post('/:id/approve', storiesLimiter, async (req, res) => {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'מזהה לא תקין' });
        return;
      }

      const topicId = getNumber(db, 'topic_id_stories', 0);
      if (!topicId || topicId === 1) {
        res.status(400).json({ error: 'topic_id_stories לא מוגדר' });
        return;
      }

      const chatId = Number(process.env['TELEGRAM_CHAT_ID'] ?? '0');
      if (!chatId) {
        res.status(500).json({ error: 'TELEGRAM_CHAT_ID לא מוגדר' });
        return;
      }

      // 404 check — must happen before lock attempt
      const story = getStoryById(db, id);
      if (!story) {
        res.status(404).json({ error: 'הסיפור לא נמצא' });
        return;
      }

      // Atomic lock: status pending→approved. Second concurrent call returns false → 409.
      const locked = lockForApproval(db, id);
      if (!locked) {
        res.status(409).json({ error: `הסיפור כבר בסטטוס: ${story.status}` });
        return;
      }

      const safeBody = escapeHtml(story.body);
      const { message_id } = await bot.api.sendMessage(
        chatId,
        `🏠 <b>חוויה מהמקלט</b>\n\n${safeBody}`,
        { parse_mode: 'HTML', message_thread_id: topicId }
      );

      approveStory(db, id, 'admin', message_id);
      log('info', 'Stories', `Story ${id} approved and published (msg ${message_id})`);
      res.json({ ok: true, messageId: message_id });
    } catch (err) {
      log('error', 'Stories', `POST /api/stories/:id/approve failed: ${String(err)}`);
      if (!res.headersSent) res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  router.post('/:id/reject', storiesLimiter, (req, res) => {
    try {
      const id = Number(req.params['id']);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'מזהה לא תקין' });
        return;
      }

      const story = getStoryById(db, id);
      if (!story) {
        res.status(404).json({ error: 'הסיפור לא נמצא' });
        return;
      }

      const rejected = rejectStory(db, id, 'admin');
      if (!rejected) {
        res.status(409).json({ error: `הסיפור כבר בסטטוס: ${story.status}` });
        return;
      }
      log('info', 'Stories', `Story ${id} rejected`);
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Stories', `POST /api/stories/:id/reject failed: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  return router;
}
