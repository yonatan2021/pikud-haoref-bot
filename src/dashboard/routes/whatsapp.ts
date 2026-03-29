import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { WhatsAppGroup, WhatsAppStatus } from '../../whatsapp/whatsappService.js';
import { getAllGroups, upsertGroup } from '../../db/whatsappGroupRepository.js';
import { ALL_ALERT_TYPES } from '../../config/alertTypeDefaults.js';

const ALERT_TYPES_SET = new Set(ALL_ALERT_TYPES);

export interface WhatsAppServiceDeps {
  getStatus: () => WhatsAppStatus;
  getQr: () => string | null;
  getPhone: () => string | null;
  getCachedGroups: () => WhatsAppGroup[];
  initialize: () => void;
}

export function createWhatsAppRouter(
  db: Database.Database,
  service: WhatsAppServiceDeps,
): Router {
  const router = Router();

  // GET /status
  router.get('/status', (_req: Request, res: Response) => {
    const currentStatus = service.getStatus();
    const qr = service.getQr();
    const phoneNum = service.getPhone();

    const body: {
      status: string;
      qr?: string;
      phone?: string;
      groupCount: number;
    } = {
      status: currentStatus,
      groupCount: service.getCachedGroups().length,
    };

    if (qr != null) {
      body.qr = qr;
    }
    if (phoneNum != null) {
      body.phone = phoneNum;
    }

    res.json(body);
  });

  // GET /groups — merge DB config rows with live client cache
  router.get('/groups', (_req: Request, res: Response) => {
    const dbGroups = getAllGroups(db);
    const liveGroups = service.getCachedGroups();

    const liveById = new Map(liveGroups.map((g) => [g.id, g]));
    const dbGroupIds = new Set(dbGroups.map((g) => g.groupId));

    // DB rows enriched with inClient flag
    const merged: Array<{
      groupId: string;
      name: string;
      enabled: boolean;
      alertTypes: string[];
      inClient: boolean;
    }> = dbGroups.map((g) => ({
      ...g,
      inClient: liveById.has(g.groupId),
    }));

    // Live groups not in DB — add as unconfigured entries
    for (const liveGroup of liveGroups) {
      if (!dbGroupIds.has(liveGroup.id)) {
        merged.push({
          groupId: liveGroup.id,
          name: liveGroup.name,
          enabled: false,
          alertTypes: [],
          inClient: true,
        });
      }
    }

    res.json(merged);
  });

  // PUT /groups/:id — update group config
  router.put('/groups/:id', (req: Request, res: Response) => {
    const groupId = decodeURIComponent(req.params.id);

    if (!groupId.trim()) {
      res.status(400).json({ error: 'מזהה קבוצה לא תקין' });
      return;
    }

    const { enabled, alertTypes } = req.body as { enabled: unknown; alertTypes: unknown };

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'השדה enabled חייב להיות boolean' });
      return;
    }

    if (
      !Array.isArray(alertTypes) ||
      !alertTypes.every((t) => typeof t === 'string')
    ) {
      res.status(400).json({ error: 'השדה alertTypes חייב להיות מערך מחרוזות' });
      return;
    }

    if (alertTypes.length > ALL_ALERT_TYPES.length) {
      res.status(400).json({ error: 'יותר מדי סוגי התרעה' });
      return;
    }

    const unknownTypes = (alertTypes as string[]).filter((t) => !ALERT_TYPES_SET.has(t));
    if (unknownTypes.length > 0) {
      res.status(400).json({ error: `סוגי התרעה לא חוקיים: ${unknownTypes.join(', ')}` });
      return;
    }

    // Resolve group name: live cache first, then DB, then groupId as fallback
    const liveGroups = service.getCachedGroups();
    const liveMatch = liveGroups.find((g) => g.id === groupId);
    const dbGroups = getAllGroups(db);
    const dbMatch = dbGroups.find((g) => g.groupId === groupId);
    const name = liveMatch?.name ?? dbMatch?.name ?? groupId;

    upsertGroup(db, groupId, name, enabled, alertTypes as string[]);

    res.json({ ok: true });
  });

  // POST /reconnect — triggers re-initialization (non-blocking)
  router.post('/reconnect', (_req: Request, res: Response) => {
    service.initialize();
    res.json({ ok: true });
  });

  return router;
}
