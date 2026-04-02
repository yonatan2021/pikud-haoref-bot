import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import {
  getAllTemplates,
  upsertTemplate,
  deleteTemplate,
} from '../../db/messageTemplateRepository.js';
import {
  insertHistory,
  pruneHistory,
  getHistory,
  getHistoryById,
} from '../../db/messageTemplateHistoryRepository.js';
import {
  loadTemplateCache,
  getAllCached,
} from '../../config/templateCache.js';
import {
  ALL_ALERT_TYPES,
  DEFAULT_ALERT_TYPE_HE,
  DEFAULT_ALERT_TYPE_EMOJI,
  DEFAULT_INSTRUCTIONS_PREFIX,
} from '../../config/alertTypeDefaults.js';
import { getTopicIdCached, isRoutingCacheLoaded } from '../../config/routingCache.js';
import { searchCities, getCityData, getCitiesByZone } from '../../cityLookup.js';
import { SUPER_REGIONS } from '../../config/zones.js';
import { ALERT_TYPE_CATEGORY } from '../../config/alertCategories.js';
import type { AlertCategory } from '../../config/alertCategories.js';
import {
  sendAlert,
  escapeHtml,
  buildZonedCityList,
} from '../../telegramBot.js';
import { getRecentAlerts } from '../../db/alertHistoryRepository.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';
import { log } from '../../logger.js';
import type { Alert } from '../../types.js';

// ─── Local formatter — never mutates global template cache ─────────────────
// NOTE: Parallel frontend implementation in dashboard-ui/src/utils/alertFormatter.ts.
// Changes to the format must be applied to both files.

function formatWithTemplate(
  alertType: string,
  cities: string[],
  instructions: string | undefined,
  template: { emoji: string; titleHe: string; instructionsPrefix: string },
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const cityCountSuffix = cities.length > 0 ? `  ·  ${cities.length} ערים` : '';
  const parts: string[] = [
    `${template.emoji} <b>${escapeHtml(template.titleHe)}</b>\n⏰ ${escapeHtml(timeStr)}${cityCountSuffix}`,
  ];

  if (instructions) {
    const prefix = template.instructionsPrefix;
    const instructionsPart = prefix
      ? `${prefix} <i>${escapeHtml(instructions)}</i>`
      : `<i>${escapeHtml(instructions)}</i>`;
    parts.push(instructionsPart);
  }

  const zonedList = buildZonedCityList(cities);
  if (zonedList) parts.push(zonedList);

  return parts.join('\n\n');
}

// ─── Rate limiters ─────────────────────────────────────────────────────────

export const testFireLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי בקשות בדיקה — נסה שוב בעוד דקה',
});

export const importLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי ייבואים — נסה שוב בעוד דקה',
});

export const systemMessageLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי הודעות מערכת — נסה שוב בעוד דקה',
});

// ─── Router ────────────────────────────────────────────────────────────────

export function createMessagesRouter(db: Database.Database, bot: Bot): Router {
  const router = Router();

  // ── Static routes FIRST (before :type param routes) ──────────────────

  // GET /api/messages — returns one entry per alert type (defaults merged with DB overrides)
  router.get('/', (_req, res) => {
    const customized = new Set(getAllTemplates(db).map((r) => r.alert_type));
    const cached = getAllCached();
    const result = ALL_ALERT_TYPES.map((alertType) => ({
      alertType,
      emoji: cached[alertType].emoji,
      titleHe: cached[alertType].titleHe,
      instructionsPrefix: cached[alertType].instructionsPrefix,
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

  // GET /api/messages/cities?q=... — city search for simulation
  router.get('/cities', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.length < 2) {
      res.status(400).json({ error: 'חיפוש דורש לפחות 2 תווים' });
      return;
    }
    const results = searchCities(q).map((c) => ({
      name: c.name,
      zone: c.zone,
      countdown: c.countdown,
    }));
    res.json(results);
  });

  // GET /api/messages/export — export all custom templates as JSON
  router.get('/export', (_req, res) => {
    const templates = getAllTemplates(db).map((row) => ({
      alertType: row.alert_type,
      emoji: row.emoji,
      titleHe: row.title_he,
      instructionsPrefix: row.instructions_prefix,
    }));
    res.json({ templates });
  });

  // POST /api/messages/import — batch import templates (all-or-nothing)
  router.post('/import', importLimiter, (req, res) => {
    const { templates } = req.body as {
      templates?: Array<{
        alertType?: string;
        emoji?: string;
        titleHe?: string;
        instructionsPrefix?: string;
      }>;
    };

    if (!Array.isArray(templates) || templates.length === 0) {
      res.status(400).json({ error: 'מערך templates ריק או חסר' });
      return;
    }

    // Validate ALL rows first
    const invalid: string[] = [];
    for (const t of templates) {
      if (!t.alertType || !ALL_ALERT_TYPES.includes(t.alertType)) {
        invalid.push(t.alertType ?? '(missing)');
        continue;
      }
      if (!t.emoji || t.emoji.trim() === '') {
        invalid.push(`${t.alertType}: emoji ריק`);
      }
      if (!t.titleHe || t.titleHe.trim() === '') {
        invalid.push(`${t.alertType}: titleHe ריק`);
      }
    }

    if (invalid.length > 0) {
      res.status(400).json({ error: 'שגיאות בתבניות', invalid });
      return;
    }

    // All valid — upsert
    for (const t of templates) {
      upsertTemplate(db, {
        alert_type: t.alertType!,
        emoji: t.emoji!,
        title_he: t.titleHe!,
        instructions_prefix: t.instructionsPrefix ?? '🛡',
      });
    }

    loadTemplateCache();
    log('info', 'Messages', `יובאו ${templates.length} תבניות`);
    res.json({ ok: true, count: templates.length });
  });

  // GET /api/messages/replay-history — last 30 alerts for replay picker
  router.get('/replay-history', (_req, res) => {
    const alerts = getRecentAlerts(168).slice(0, 30); // last 7 days, max 30
    const cached = getAllCached();
    const result = alerts.map((a) => ({
      ...a,
      titleHe: cached[a.type]?.titleHe ?? a.type,
    }));
    res.json(result);
  });

  // POST /api/messages/replay-preview — render historical alert with current/override template
  router.post('/replay-preview', (req, res) => {
    const { alertHistoryId, templateOverride } = req.body as {
      alertHistoryId?: number;
      templateOverride?: { emoji?: string; titleHe?: string; instructionsPrefix?: string };
    };

    if (alertHistoryId === undefined || typeof alertHistoryId !== 'number') {
      res.status(400).json({ error: 'alertHistoryId חסר' });
      return;
    }

    // Direct query for single alert by ID
    const raw = db
      .prepare('SELECT id, type, cities, instructions, fired_at FROM alert_history WHERE id = ?')
      .get(alertHistoryId) as
      | { id: number; type: string; cities: string; instructions: string | null; fired_at: string }
      | undefined;

    if (!raw) {
      res.status(404).json({ error: 'התראה לא נמצאה' });
      return;
    }

    let cities: string[];
    try {
      cities = JSON.parse(raw.cities);
      if (!Array.isArray(cities)) cities = [];
    } catch {
      cities = [];
    }

    const cached = getAllCached()[raw.type] ?? { emoji: '⚠️', titleHe: raw.type, instructionsPrefix: '🛡' };
    const template = {
      emoji: templateOverride?.emoji ?? cached.emoji,
      titleHe: templateOverride?.titleHe ?? cached.titleHe,
      instructionsPrefix: templateOverride?.instructionsPrefix ?? cached.instructionsPrefix,
    };

    const html = formatWithTemplate(raw.type, cities, raw.instructions ?? undefined, template);
    res.json({ html, charCount: html.length });
  });

  // POST /api/messages/test-fire — send a real test alert to Telegram
  router.post('/test-fire', testFireLimiter, async (req, res) => {
    const { alertType, cities, instructions, templateOverride, topicOverride } = req.body as {
      alertType?: string;
      cities?: string[];
      instructions?: string;
      templateOverride?: { emoji?: string; titleHe?: string; instructionsPrefix?: string };
      topicOverride?: number;
    };

    if (!alertType || !ALL_ALERT_TYPES.includes(alertType)) {
      res.status(400).json({ error: `סוג התראה לא מוכר: ${alertType ?? '(חסר)'}` });
      return;
    }
    if (!Array.isArray(cities)) {
      res.status(400).json({ error: 'cities חסר או לא מערך' });
      return;
    }

    const topicId = topicOverride ?? getTopicIdCached(alertType);
    const cached = getAllCached()[alertType];
    const template = {
      emoji: templateOverride?.emoji ?? cached.emoji,
      titleHe: templateOverride?.titleHe ?? cached.titleHe,
      instructionsPrefix: templateOverride?.instructionsPrefix ?? cached.instructionsPrefix,
    };

    // Build the formatted message using local formatter
    const formattedMessage = formatWithTemplate(alertType, cities, instructions, template);

    // Truncate to stay within Telegram's 4096-char text message limit
    const TEST_PREFIX = '🧪 <b>בדיקת תבנית</b>\n\n';
    const maxBody = 4096 - TEST_PREFIX.length;
    const truncatedMessage = formattedMessage.length > maxBody
      ? formattedMessage.slice(0, formattedMessage.lastIndexOf('\n\n', maxBody)) + '\n\n<i>…קוצר</i>'
      : formattedMessage;

    // Send as text-only (no map) via bot.api directly
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
      res.status(500).json({ error: 'TELEGRAM_CHAT_ID לא מוגדר' });
      return;
    }

    try {
      const threadOptions = topicId ? { message_thread_id: topicId } : {};
      const sent = await bot.api.sendMessage(
        chatId,
        `${TEST_PREFIX}${truncatedMessage}`,
        { parse_mode: 'HTML', ...threadOptions },
      );
      log('info', 'Messages', `Test-fire: ${alertType} → message ${sent.message_id}`);
      res.json({ ok: true, messageId: sent.message_id });
    } catch (err) {
      log('error', 'Messages', `Test-fire failed: ${String(err)}`);
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/messages/zones — full super-region → zone → cities hierarchy
  router.get('/zones', (_req, res) => {
    const superRegions = SUPER_REGIONS.map((sr) => ({
      name: sr.name,
      zones: sr.zones.map((zoneName) => {
        const cities = getCitiesByZone(zoneName).map((c) => ({
          name: c.name,
          zone: c.zone,
          countdown: c.countdown,
        }));
        return { name: zoneName, cityCount: cities.length, cities };
      }),
    }));
    res.json({ superRegions });
  });

  // GET /api/messages/topics — available Telegram topics with labels
  const CATEGORY_LABEL_HE: Readonly<Record<AlertCategory, string>> = {
    security: '🔴 ביטחון',
    nature: '🌍 טבע',
    environmental: '☢️ סביבתי',
    drills: '🔵 תרגילים',
    general: '📢 כללי',
    whatsapp: '📲 WhatsApp',
  };

  router.get('/topics', (_req, res) => {
    const topics = (Object.keys(CATEGORY_LABEL_HE) as AlertCategory[]).map((category) => {
      // Find a representative alert type for this category to resolve topic ID
      const representativeType = ALL_ALERT_TYPES.find(
        (t) => ALERT_TYPE_CATEGORY[t] === category,
      );
      return {
        key: category,
        label: CATEGORY_LABEL_HE[category],
        topicId: representativeType ? (getTopicIdCached(representativeType) ?? null) : null,
      };
    });
    res.json({ topics });
  });

  // POST /api/messages/system-message — send plain-text message to a Telegram topic
  router.post('/system-message', systemMessageLimiter, async (req, res) => {
    const { text, topicId } = req.body as { text?: string; topicId?: number };

    if (!text || text.trim() === '') {
      res.status(400).json({ error: 'טקסט ההודעה ריק' });
      return;
    }
    if (text.length > 4096) {
      res.status(400).json({ error: 'ההודעה חורגת ממגבלת 4096 תווים' });
      return;
    }
    if (topicId === undefined || typeof topicId !== 'number') {
      res.status(400).json({ error: 'topicId חסר' });
      return;
    }

    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
      res.status(500).json({ error: 'TELEGRAM_CHAT_ID לא מוגדר' });
      return;
    }

    try {
      const sent = await bot.api.sendMessage(chatId, text, {
        message_thread_id: topicId,
      });
      log('info', 'Messages', `הודעת מערכת נשלחה לנושא ${topicId} → message ${sent.message_id}`);
      res.json({ ok: true, messageId: sent.message_id });
    } catch (err) {
      log('error', 'Messages', `שליחת הודעת מערכת נכשלה: ${String(err)}`);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Parameterized routes (:type) LAST ────────────────────────────────

  // PATCH /api/messages/:alertType — partial update (with history recording)
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
    if (instructionsPrefix !== undefined && instructionsPrefix.trim() === '') {
      res.status(400).json({ error: 'instructionsPrefix ריק' });
      return;
    }

    // Save current state to history BEFORE upserting
    const current = getAllCached()[alertType];
    if (current) {
      insertHistory(db, {
        alert_type: alertType,
        emoji: current.emoji,
        title_he: current.titleHe,
        instructions_prefix: current.instructionsPrefix,
      });
      pruneHistory(db, alertType, 10);
    }

    // Merge with current cached values to avoid zeroing out unprovided fields.
    upsertTemplate(db, {
      alert_type: alertType,
      emoji: emoji ?? current.emoji,
      title_he: titleHe ?? current.titleHe,
      instructions_prefix: instructionsPrefix ?? current.instructionsPrefix,
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

  // GET /api/messages/:alertType/history — template version history
  router.get('/:alertType/history', (req, res) => {
    const { alertType } = req.params;
    if (!ALL_ALERT_TYPES.includes(alertType)) {
      res.status(400).json({ error: `סוג התראה לא מוכר: ${alertType}` });
      return;
    }
    const history = getHistory(db, alertType);
    res.json(history);
  });

  // POST /api/messages/:alertType/rollback — restore a previous template version
  router.post('/:alertType/rollback', (req, res) => {
    const { alertType } = req.params;
    if (!ALL_ALERT_TYPES.includes(alertType)) {
      res.status(400).json({ error: `סוג התראה לא מוכר: ${alertType}` });
      return;
    }

    const { versionId } = req.body as { versionId?: number };
    if (versionId === undefined || typeof versionId !== 'number') {
      res.status(400).json({ error: 'versionId חסר' });
      return;
    }

    const historyRow = getHistoryById(db, versionId);
    if (!historyRow) {
      res.status(404).json({ error: 'גרסה לא נמצאה' });
      return;
    }
    if (historyRow.alert_type !== alertType) {
      res.status(400).json({ error: 'versionId לא שייך לסוג התראה זה' });
      return;
    }

    // Save current state to history first (so rollback is undoable)
    const current = getAllCached()[alertType];
    if (current) {
      insertHistory(db, {
        alert_type: alertType,
        emoji: current.emoji,
        title_he: current.titleHe,
        instructions_prefix: current.instructionsPrefix,
      });
      pruneHistory(db, alertType, 10);
    }

    upsertTemplate(db, {
      alert_type: alertType,
      emoji: historyRow.emoji,
      title_he: historyRow.title_he,
      instructions_prefix: historyRow.instructions_prefix,
    });

    loadTemplateCache();
    log('info', 'Messages', `שוחזרה תבנית ${alertType} לגרסה ${versionId}`);
    res.json({ ok: true });
  });

  return router;
}
