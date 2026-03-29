import { Router } from 'express';
import type Database from 'better-sqlite3';
import {
  getAllTemplates,
  upsertTemplate,
  deleteTemplate,
} from '../../db/messageTemplateRepository.js';
import {
  loadTemplateCache,
  getAllCached,
  getEmoji,
  getTitleHe,
  getInstructionsPrefix,
} from '../../config/templateCache.js';
import {
  ALL_ALERT_TYPES,
  DEFAULT_ALERT_TYPE_HE,
  DEFAULT_ALERT_TYPE_EMOJI,
  DEFAULT_INSTRUCTIONS_PREFIX,
} from '../../config/alertTypeDefaults.js';
import { log } from '../../logger.js';

export function createMessagesRouter(db: Database.Database): Router {
  const router = Router();

  // GET /api/messages — returns one entry per alert type (defaults merged with DB overrides)
  router.get('/', (_req, res) => {
    const customized = new Set(getAllTemplates(db).map((r) => r.alert_type));
    const cached = getAllCached();
    const result = ALL_ALERT_TYPES.map((alertType) => ({
      alertType,
      emoji: cached[alertType]?.emoji ?? getEmoji(alertType),
      titleHe: cached[alertType]?.titleHe ?? getTitleHe(alertType),
      instructionsPrefix: cached[alertType]?.instructionsPrefix ?? getInstructionsPrefix(alertType),
      isCustomized: customized.has(alertType),
      defaults: {
        emoji: DEFAULT_ALERT_TYPE_EMOJI[alertType] ?? '⚠️',
        titleHe: DEFAULT_ALERT_TYPE_HE[alertType] ?? 'התרעה',
        instructionsPrefix:
          DEFAULT_INSTRUCTIONS_PREFIX[alertType] ?? DEFAULT_INSTRUCTIONS_PREFIX['_default'] ?? '🛡',
      },
    }));
    res.json(result);
  });

  // PATCH /api/messages/:alertType — partial update
  router.patch('/:alertType', (req, res) => {
    const { alertType } = req.params;
    if (!ALL_ALERT_TYPES.includes(alertType)) {
      res.status(400).json({ error: `סוג התראה לא מוכר: ${alertType}` });
      return;
    }

    const { emoji, titleHe, instructionsPrefix } = req.body as {
      emoji?: string;
      titleHe?: string;
      instructionsPrefix?: string;
    };

    if (emoji !== undefined && emoji.trim() === '') {
      res.status(400).json({ error: 'emoji ריק' });
      return;
    }
    if (titleHe !== undefined && titleHe.trim() === '') {
      res.status(400).json({ error: 'titleHe ריק' });
      return;
    }

    // Merge with current cached values to avoid zeroing out unprovided fields
    const current = getAllCached()[alertType];
    upsertTemplate(db, {
      alert_type: alertType,
      emoji: emoji ?? current?.emoji ?? getEmoji(alertType),
      title_he: titleHe ?? current?.titleHe ?? getTitleHe(alertType),
      instructions_prefix:
        instructionsPrefix ?? current?.instructionsPrefix ?? getInstructionsPrefix(alertType),
    });

    loadTemplateCache();
    log('info', 'Messages', `תבנית עודכנה: ${alertType}`);
    res.json({ ok: true });
  });

  // DELETE /api/messages/:alertType — reset to defaults
  router.delete('/:alertType', (req, res) => {
    const { alertType } = req.params;
    if (!ALL_ALERT_TYPES.includes(alertType)) {
      res.status(400).json({ error: `סוג התראה לא מוכר: ${alertType}` });
      return;
    }
    deleteTemplate(db, alertType);
    loadTemplateCache();
    log('info', 'Messages', `תבנית אופסה: ${alertType}`);
    res.json({ ok: true, reset: true });
  });

  return router;
}
