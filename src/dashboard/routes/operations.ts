import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { getQueueStats } from '../../services/dmQueue.js';
import { getTopicId } from '../../topicRouter.js';
import { log } from '../../logger.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';

// Exported for test isolation — tests that send multiple broadcast requests
// must call `broadcastLimiter.clearStore()` in `beforeEach` (2/min cap).
export const broadcastLimiter = createRateLimitMiddleware({
  maxRequests: 2,
  windowMs: 60_000,
  message: 'יותר מדי שידורים — נסה שוב בעוד דקה',
});

const testAlertLimiter = createRateLimitMiddleware({
  maxRequests: 10,
  windowMs: 60_000,
  message: 'יותר מדי הודעות בדיקה — נסה שוב בעוד דקה',
});

const deleteWindowLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי מחיקות — נסה שוב בעוד דקה',
});

export function createOperationsRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();

  router.get('/queue', (_req, res) => res.json(getQueueStats()));

  router.get('/alert-window', (_req, res) =>
    res.json(db.prepare('SELECT * FROM alert_window').all())
  );

  router.delete('/alert-window', deleteWindowLimiter, (_req, res) => {
    db.prepare('DELETE FROM alert_window').run();
    res.json({ ok: true });
  });

  router.delete('/alert-window/:type', deleteWindowLimiter, (req, res) => {
    db.prepare('DELETE FROM alert_window WHERE alert_type = ?').run(req.params.type);
    res.json({ ok: true });
  });

  router.post('/broadcast', broadcastLimiter, async (req, res) => {
    const { text, chatIds } = req.body as { text?: string; chatIds?: number[] };
    if (!text?.trim()) { res.status(400).json({ error: 'טקסט ריק' }); return; }

    if (chatIds !== undefined) {
      if (!Array.isArray(chatIds) || chatIds.some(id => typeof id !== 'number' || !Number.isInteger(id))) {
        res.status(400).json({ error: 'chatIds חייב להיות מערך של מספרים שלמים' });
        return;
      }
    }

    const targets: number[] = chatIds?.length
      ? chatIds
      : (db.prepare('SELECT chat_id FROM users').all() as { chat_id: number }[]).map(r => r.chat_id);

    // Respond immediately — send in background to avoid proxy timeout
    res.json({ queued: targets.length });

    // Background send (intentionally not awaited)
    void (async () => {
      let sent = 0;
      let failed = 0;
      for (const chatId of targets) {
        try { await bot.api.sendMessage(chatId, text); sent++; }
        catch (err) {
          log('warn', 'Dashboard', `Broadcast failed for chatId ${chatId}: ${String(err)}`);
          failed++;
        }
      }
      log('info', 'Dashboard', `Broadcast complete: ${sent} sent, ${failed} failed of ${targets.length}`);
    })();
  });

  router.post('/test-alert', testAlertLimiter, async (req, res) => {
    const { chatId, text } = req.body as { chatId?: number; text?: string };
    if (!chatId || !text) { res.status(400).json({ error: 'חסר chatId או טקסט' }); return; }
    try {
      await bot.api.sendMessage(chatId, `🧪 <b>בדיקה</b>\n\n${text}`, { parse_mode: 'HTML' });
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Test-alert failed: ${String(err)}`);
      res.status(500).json({ error: 'שליחת ההודעה נכשלה' });
    }
  });

  router.post('/test-alert-all', testAlertLimiter, async (req, res) => {
    const { chatId } = req.body as { chatId?: number };
    if (!chatId || !Number.isInteger(chatId)) {
      res.status(400).json({ error: 'chatId חסר או לא תקין' });
      return;
    }

    const TEST_TYPES: Array<{ type: string; emoji: string; label: string }> = [
      { type: 'missiles',           emoji: '🚀', label: 'טילים' },
      { type: 'earthQuake',         emoji: '🌍', label: 'רעידת אדמה' },
      { type: 'hazardousMaterials', emoji: '☢️', label: 'חומרים מסוכנים' },
      { type: 'missilesDrill',      emoji: '🔵', label: 'תרגיל טילים' },
      { type: 'newsFlash',          emoji: '📢', label: 'הודעה כללית' },
    ];

    res.json({ ok: true, total: TEST_TYPES.length });

    // Send in background with delay between messages to avoid Telegram rate limits
    void (async () => {
      for (const { emoji, label, type } of TEST_TYPES) {
        try {
          const topicId = getTopicId(type);
          const threadOpts = topicId ? { message_thread_id: topicId } : {};
          await bot.api.sendMessage(
            chatId,
            `🧪 <b>בדיקת קטגוריה: ${emoji} ${label}</b>\n<code>${type}</code>`,
            { parse_mode: 'HTML', ...threadOpts }
          );
        } catch (err) {
          log('warn', 'Dashboard', `test-alert-all failed for type ${type}: ${String(err)}`);
        }
        await new Promise<void>(resolve => setTimeout(resolve, 300));
      }
    })();
  });

  return router;
}
