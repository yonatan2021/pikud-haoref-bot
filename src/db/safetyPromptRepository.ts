import type Database from 'better-sqlite3';

export interface SafetyPromptRow {
  id: number;
  chat_id: number;
  fingerprint: string;
  sent_at: string;
  message_id: number | null;
  responded: boolean;
  alert_type: string;
}

type RawRow = {
  id: number;
  chat_id: number;
  fingerprint: string;
  sent_at: string;
  message_id: number | null;
  responded: number;
  alert_type: string;
};

function decodeRow(raw: RawRow): SafetyPromptRow {
  return {
    id: raw.id,
    chat_id: raw.chat_id,
    fingerprint: raw.fingerprint,
    sent_at: raw.sent_at,
    message_id: raw.message_id,
    responded: raw.responded === 1,
    alert_type: raw.alert_type,
  };
}

export function insertSafetyPrompt(
  db: Database.Database,
  chatId: number,
  fingerprint: string,
  messageId?: number,
  alertType?: string
): number | null {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO safety_prompts (chat_id, fingerprint, message_id, alert_type)
       VALUES (?, ?, ?, ?)`
    )
    .run(chatId, fingerprint, messageId ?? null, alertType ?? '');
  return result.changes === 1 ? Number(result.lastInsertRowid) : null;
}

export function getSafetyPrompt(
  db: Database.Database,
  chatId: number,
  fingerprint: string
): SafetyPromptRow | null {
  const raw = db
    .prepare('SELECT * FROM safety_prompts WHERE chat_id = ? AND fingerprint = ?')
    .get(chatId, fingerprint) as RawRow | undefined;
  return raw ? decodeRow(raw) : null;
}

export function markPromptResponded(
  db: Database.Database,
  chatId: number,
  fingerprint: string
): void {
  db.prepare(
    'UPDATE safety_prompts SET responded = 1 WHERE chat_id = ? AND fingerprint = ?'
  ).run(chatId, fingerprint);
}

/**
 * Looks up a safety prompt by its primary key.
 * Used by safetyStatusHandler — the prompt ID is embedded in callback_data
 * (e.g. "safety:ok:42") to avoid ambiguity when a user has multiple prompts.
 */
export function getSafetyPromptById(
  db: Database.Database,
  id: number
): SafetyPromptRow | null {
  const raw = db
    .prepare('SELECT * FROM safety_prompts WHERE id = ?')
    .get(id) as RawRow | undefined;
  return raw ? decodeRow(raw) : null;
}

/**
 * Updates the message_id of a prompt row after the Telegram message is sent.
 * Called by dispatchSafetyPrompts: insert first (to get ID for keyboard), send, then update.
 */
export function updateSafetyPromptMessageId(
  db: Database.Database,
  promptId: number,
  messageId: number
): void {
  db.prepare('UPDATE safety_prompts SET message_id = ? WHERE id = ?').run(messageId, promptId);
}

export function hasPromptBeenSent(
  db: Database.Database,
  chatId: number,
  fingerprint: string
): boolean {
  return getSafetyPrompt(db, chatId, fingerprint) !== null;
}

/**
 * Returns unanswered safety prompts for a user within the configured time window.
 * Used by /start banner to remind users of pending safety check responses.
 */
export function getUnansweredPromptsForUser(
  db: Database.Database,
  chatId: number,
  maxAgeMinutes: number = 1440
): SafetyPromptRow[] {
  const m = Math.max(1, Math.floor(maxAgeMinutes));
  return (
    db.prepare(`
      SELECT * FROM safety_prompts
      WHERE chat_id = ? AND responded = 0
        AND sent_at > datetime('now', '-' || ? || ' minutes')
      ORDER BY sent_at DESC
    `).all(chatId, String(m)) as RawRow[]
  ).map(decodeRow);
}

export function deleteSafetyPromptsForUser(
  db: Database.Database,
  chatId: number
): void {
  db.prepare('DELETE FROM safety_prompts WHERE chat_id = ?').run(chatId);
}

export function deleteUnrespondedPromptsByAlertType(
  db: Database.Database,
  alertType: string
): number {
  const result = db
    .prepare('DELETE FROM safety_prompts WHERE responded = 0 AND alert_type = ?')
    .run(alertType);
  return result.changes;
}

export function pruneOldPrompts(
  db: Database.Database,
  olderThanHours: number = 24
): number {
  const modifier = `-${olderThanHours} hours`;
  const result = db
    .prepare(`DELETE FROM safety_prompts WHERE sent_at < datetime('now', ?)`)
    .run(modifier);
  return result.changes;
}

/**
 * Returns unresponded prompts with a message_id (within the Telegram edit window)
 * for the given alert type. Used by clearStalePromptMessages to edit messages
 * before hard-deleting the rows on all-clear.
 */
export function getUnrespondedPromptsForAllClear(
  db: Database.Database,
  alertType: string,
  maxAgeHours = 48
): SafetyPromptRow[] {
  const modifier = `-${maxAgeHours} hours`;
  return (
    db
      .prepare(
        `SELECT * FROM safety_prompts
         WHERE responded = 0
           AND message_id IS NOT NULL
           AND alert_type = ?
           AND sent_at >= datetime('now', ?)`
      )
      .all(alertType, modifier) as RawRow[]
  ).map(decodeRow);
}
