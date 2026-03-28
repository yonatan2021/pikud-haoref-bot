import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { getQueueStats } from '../../services/dmQueue.js';

export function createOperationsRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();

  router.get('/queue', (_req, res) => res.json(getQueueStats()));

  router.get('/alert-window', (_req, res) =>
    res.json(db.prepare('SELECT * FROM alert_window').all())
  );

  router.delete('/alert-window', (_req, res) => {
    db.prepare('DELETE FROM alert_window').run();
    res.json({ ok: true });
  });

  router.delete('/alert-window/:type', (req, res) => {
    db.prepare('DELETE FROM alert_window WHERE alert_type = ?').run(req.params.type);
    res.json({ ok: true });
  });

  router.post('/broadcast', async (req, res) => {
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
        try { await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }); sent++; }
        catch { failed++; }
      }
      console.warn(`[dashboard] broadcast complete: ${sent} sent, ${failed} failed of ${targets.length}`);
    })();
  });

  router.post('/test-alert', async (req, res) => {
    const { chatId, text } = req.body as { chatId?: number; text?: string };
    if (!chatId || !text) { res.status(400).json({ error: 'חסר chatId או טקסט' }); return; }
    try {
      await bot.api.sendMessage(chatId, `🧪 <b>בדיקה</b>\n\n${text}`, { parse_mode: 'HTML' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[dashboard] test-alert failed:', err);
      res.status(500).json({ error: 'שליחת ההודעה נכשלה' });
    }
  });

  return router;
}
