import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import {
  getAllListeners,
  getAllKnownChats,
  createListener,
  updateListener,
  deleteListener,
} from '../../db/telegramListenerRepository.js';
import {
  getStatus as _getStatus,
  getPhone as _getPhone,
  startPhoneAuth as _startPhoneAuth,
  submitCode as _submitCode,
  submitPassword as _submitPassword,
  disconnect as _disconnect,
  type TelegramListenerStatus,
} from '../../telegram-listener/telegramListenerClient.js';
import { getSetting } from '../settingsRepository.js';
import { log } from '../../logger.js';

export interface TelegramClientDeps {
  getStatus: () => TelegramListenerStatus;
  getPhone: (db: Database.Database) => string | null;
  startPhoneAuth: (db: Database.Database, phone: string) => Promise<{ phoneCodeHash: string }>;
  submitCode: (db: Database.Database, code: string, phoneCodeHash: string) => Promise<void>;
  submitPassword: (db: Database.Database, password: string) => Promise<void>;
  disconnect: (db: Database.Database) => Promise<void>;
}

const defaultClientDeps: TelegramClientDeps = {
  getStatus: _getStatus,
  getPhone: _getPhone,
  startPhoneAuth: _startPhoneAuth,
  submitCode: _submitCode,
  submitPassword: _submitPassword,
  disconnect: _disconnect,
};

const VALID_CHAT_TYPES = new Set(['group', 'channel', 'supergroup']);

const TOPIC_SOURCES: ReadonlyArray<{ settingKey: string; envVar: string; name: string }> = [
  { settingKey: 'topic_id_security',      envVar: 'TELEGRAM_TOPIC_ID_SECURITY',      name: 'ביטחוני 🔴' },
  { settingKey: 'topic_id_nature',        envVar: 'TELEGRAM_TOPIC_ID_NATURE',        name: 'אסונות טבע 🌍' },
  { settingKey: 'topic_id_environmental', envVar: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL', name: 'סביבתי ☢️' },
  { settingKey: 'topic_id_drills',        envVar: 'TELEGRAM_TOPIC_ID_DRILLS',        name: 'תרגילים 🔵' },
  { settingKey: 'topic_id_general',       envVar: 'TELEGRAM_TOPIC_ID_GENERAL',       name: 'הודעות כלליות 📢' },
  { settingKey: 'topic_id_whatsapp',      envVar: 'TELEGRAM_TOPIC_ID_WHATSAPP',      name: 'עדכונים וחדשות 📡' },
];

export function createTelegramListenerRouter(
  db: Database.Database,
  bot: Bot,
  clientDeps: TelegramClientDeps = defaultClientDeps
): Router {
  const router = Router();

  // ── Connection management ────────────────────────────────────────────────

  // GET /status → { status, phone }
  router.get('/status', (_req: Request, res: Response) => {
    const currentStatus: TelegramListenerStatus = clientDeps.getStatus();
    const phone = clientDeps.getPhone(db);
    res.json({ status: currentStatus, phone: phone ?? null });
  });

  // POST /connect → { phone } → starts OTP auth, returns { phoneCodeHash }
  router.post('/connect', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const phone = typeof body['phone'] === 'string' ? body['phone'].trim() : '';
    if (!phone) {
      res.status(400).json({ error: 'phone חסר או ריק' });
      return;
    }

    try {
      const { phoneCodeHash } = await clientDeps.startPhoneAuth(db, phone);
      log('info', 'TG Listener', `OTP נשלח ל-${phone}`);
      res.json({ phoneCodeHash });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', 'TG Listener', `startPhoneAuth נכשל: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // POST /verify → { code, phoneCodeHash } → completes OTP login
  //   on 2FA: returns 400 { error: 'SESSION_PASSWORD_NEEDED' }
  router.post('/verify', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const code = typeof body['code'] === 'string' ? body['code'].trim() : '';
    const phoneCodeHash = typeof body['phoneCodeHash'] === 'string' ? body['phoneCodeHash'].trim() : '';

    if (!code || !phoneCodeHash) {
      res.status(400).json({ error: 'code ו-phoneCodeHash נדרשים' });
      return;
    }

    try {
      await clientDeps.submitCode(db, code, phoneCodeHash);
      log('info', 'TG Listener', 'OTP אומת בהצלחה');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SESSION_PASSWORD_NEEDED')) {
        res.status(400).json({ error: 'SESSION_PASSWORD_NEEDED' });
        return;
      }
      log('error', 'TG Listener', `submitCode נכשל: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // POST /verify-password → { password } → completes 2FA login
  router.post('/verify-password', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    if (!password) {
      res.status(400).json({ error: 'password חסר או ריק' });
      return;
    }

    try {
      await clientDeps.submitPassword(db, password);
      log('info', 'TG Listener', '2FA אומת בהצלחה');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', 'TG Listener', `submitPassword נכשל: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // POST /disconnect → disconnects + clears session
  router.post('/disconnect', async (_req: Request, res: Response) => {
    try {
      await clientDeps.disconnect(db);
      log('info', 'TG Listener', 'התנתק מהלקוח');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', 'TG Listener', `disconnect נכשל: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  // ── Discovery ────────────────────────────────────────────────────────────

  // GET /chats → known Telegram chats (for SourceSelector)
  router.get('/chats', (_req: Request, res: Response) => {
    try {
      const chats = getAllKnownChats(db);
      res.json(chats);
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בטעינת chats: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // ── CRUD — CRITICAL: static path before param routes ────────────────────

  // GET /listeners/telegram-topics
  router.get('/listeners/telegram-topics', async (_req: Request, res: Response) => {
    let liveTopics: Array<{ id: number; name: string }> = [];
    const chatId = process.env['TELEGRAM_FORWARD_GROUP_ID'] ?? process.env['TELEGRAM_CHAT_ID'];
    if (chatId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (bot.api.raw as any).getForumTopics({ chat_id: chatId });
        liveTopics = (result.topics ?? []).map((t: { message_thread_id: number; name: string }) => ({
          id: t.message_thread_id,
          name: t.name,
        }));
      } catch {
        // group is not a forum group or API unreachable — continue to fallback
      }
    }

    const liveIds = new Set(liveTopics.map((t) => t.id));
    for (const source of TOPIC_SOURCES) {
      const raw = getSetting(db, source.settingKey) ?? process.env[source.envVar];
      if (!raw) continue;
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed === 1) continue;
      if (liveIds.has(parsed)) continue;
      liveTopics.push({ id: parsed, name: source.name });
      liveIds.add(parsed);
    }

    res.json(liveTopics);
  });

  // GET /listeners
  router.get('/listeners', (_req: Request, res: Response) => {
    try {
      res.json(getAllListeners(db));
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בטעינת listeners: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // POST /listeners — create new listener
  router.post('/listeners', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    const chatId = typeof body['chatId'] === 'string' ? body['chatId'].trim() : '';
    if (!chatId) {
      res.status(400).json({ error: 'chatId חסר או ריק' });
      return;
    }

    const chatName = typeof body['chatName'] === 'string' ? body['chatName'].trim() : '';
    if (!chatName) {
      res.status(400).json({ error: 'chatName חסר או ריק' });
      return;
    }

    const chatType = typeof body['chatType'] === 'string' ? body['chatType'] : 'group';
    if (!VALID_CHAT_TYPES.has(chatType)) {
      res.status(400).json({ error: `chatType לא חוקי: ${chatType}. חייב להיות group, channel, או supergroup` });
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

    const rawTopicId = body['telegramTopicId'];
    const telegramTopicId: number | null = typeof rawTopicId === 'number' ? rawTopicId : null;

    const rawTopicName = body['telegramTopicName'];
    const telegramTopicName: string | null = typeof rawTopicName === 'string' ? rawTopicName : null;

    if (body['isActive'] !== undefined && typeof body['isActive'] !== 'boolean') {
      res.status(400).json({ error: 'isActive חייב להיות boolean' });
      return;
    }
    const isActive: boolean = body['isActive'] === false ? false : true;

    if (body['forwardToWhatsApp'] !== undefined && typeof body['forwardToWhatsApp'] !== 'boolean') {
      res.status(400).json({ error: 'forwardToWhatsApp חייב להיות boolean' });
      return;
    }
    const forwardToWhatsApp: boolean = body['forwardToWhatsApp'] === true;

    try {
      const listener = createListener(db, {
        chatId,
        chatName,
        chatType,
        keywords,
        telegramTopicId,
        telegramTopicName,
        forwardToWhatsApp,
        isActive,
      });
      log('info', 'TG Listener', `listener נוצר: ${chatId}`);
      res.status(201).json(listener);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: `chatId כבר קיים: ${chatId}` });
        return;
      }
      log('error', 'TG Listener', `שגיאה ביצירת listener: ${msg}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // PATCH /listeners/:id — partial update
  router.patch('/listeners/:id', (req: Request, res: Response) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'מזהה listener לא תקין — חייב להיות מספר שלם' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ('chatName' in body) {
      const chatName = typeof body['chatName'] === 'string' ? body['chatName'].trim() : '';
      if (!chatName) {
        res.status(400).json({ error: 'chatName לא יכול להיות ריק' });
        return;
      }
      updates['chatName'] = chatName;
    }

    if ('chatType' in body) {
      const chatType = body['chatType'];
      if (typeof chatType !== 'string' || !VALID_CHAT_TYPES.has(chatType)) {
        res.status(400).json({ error: 'chatType לא תקין' });
        return;
      }
      updates['chatType'] = chatType;
    }

    if ('keywords' in body) {
      const rawKeywords = body['keywords'];
      if (!Array.isArray(rawKeywords) || !(rawKeywords as unknown[]).every((k) => typeof k === 'string')) {
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

    if ('forwardToWhatsApp' in body) {
      if (typeof body['forwardToWhatsApp'] !== 'boolean') {
        res.status(400).json({ error: 'forwardToWhatsApp חייב להיות boolean' });
        return;
      }
      updates['forwardToWhatsApp'] = body['forwardToWhatsApp'];
    }

    if ('telegramTopicId' in body) {
      updates['telegramTopicId'] = typeof body['telegramTopicId'] === 'number' ? body['telegramTopicId'] : null;
    }

    if ('telegramTopicName' in body) {
      updates['telegramTopicName'] = typeof body['telegramTopicName'] === 'string' ? body['telegramTopicName'] : null;
    }

    try {
      const updated = updateListener(db, id, updates);
      if (updated === null) {
        res.status(404).json({ error: `listener לא נמצא: ${id}` });
        return;
      }
      log('info', 'TG Listener', `listener עודכן: ${id}`);
      res.json(updated);
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בעדכון listener ${id}: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  // DELETE /listeners/:id
  router.delete('/listeners/:id', (req: Request, res: Response) => {
    const id = Number(req.params['id']);
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
      log('info', 'TG Listener', `listener נמחק: ${id}`);
      res.json({ ok: true });
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה במחיקת listener ${id}: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'שגיאת שרת פנימית' });
    }
  });

  return router;
}
