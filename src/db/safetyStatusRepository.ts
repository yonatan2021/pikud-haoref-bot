import type Database from 'better-sqlite3';

export interface SafetyStatusRow {
  chat_id: number;
  status: 'ok' | 'help' | 'dismissed';
  updated_at: string;
  expires_at: string;
}

type RawRow = {
  chat_id: number;
  status: string;
  updated_at: string;
  expires_at: string;
};

function decodeRow(raw: RawRow): SafetyStatusRow {
  return {
    chat_id: raw.chat_id,
    status: raw.status as SafetyStatusRow['status'],
    updated_at: raw.updated_at,
    expires_at: raw.expires_at,
  };
}

export function upsertSafetyStatus(
  db: Database.Database,
  chatId: number,
  status: 'ok' | 'help' | 'dismissed'
): void {
  db.prepare(`
    INSERT OR REPLACE INTO safety_status (chat_id, status, updated_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now', '+24 hours'))
  `).run(chatId, status);
}

export function getSafetyStatus(
  db: Database.Database,
  chatId: number
): SafetyStatusRow | null {
  const raw = db.prepare(`
    SELECT * FROM safety_status
    WHERE chat_id = ? AND expires_at >= datetime('now')
  `).get(chatId) as RawRow | undefined;
  return raw ? decodeRow(raw) : null;
}

export function clearSafetyStatus(db: Database.Database, chatId: number): void {
  db.prepare('DELETE FROM safety_status WHERE chat_id = ?').run(chatId);
}

export function pruneExpiredSafetyStatuses(db: Database.Database): number {
  const result = db
    .prepare(`DELETE FROM safety_status WHERE expires_at < datetime('now')`)
    .run();
  return result.changes;
}

export function getActiveStatusesForContacts(
  db: Database.Database,
  chatIds: number[]
): SafetyStatusRow[] {
  if (chatIds.length === 0) return [];
  const placeholders = chatIds.map(() => '?').join(', ');
  // Spread chatIds to match the N positional ? placeholders in IN (${placeholders})
  // better-sqlite3 requires one argument per ?, not a single array argument
  const rows = db
    .prepare(`
      SELECT * FROM safety_status
      WHERE chat_id IN (${placeholders}) AND expires_at >= datetime('now')
    `)
    .all(...chatIds) as RawRow[];
  return rows.map(decodeRow);
}
