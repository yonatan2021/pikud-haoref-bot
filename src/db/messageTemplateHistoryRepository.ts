import type Database from 'better-sqlite3';

export interface MessageTemplateHistoryRow {
  id: number;
  alert_type: string;
  emoji: string;
  title_he: string;
  instructions_prefix: string;
  saved_at: string;
}

export interface InsertHistoryRow {
  alert_type: string;
  emoji: string;
  title_he: string;
  instructions_prefix: string;
}

export function insertHistory(db: Database.Database, row: InsertHistoryRow): void {
  db.prepare(
    'INSERT INTO message_template_history (alert_type, emoji, title_he, instructions_prefix) VALUES (?, ?, ?, ?)',
  ).run(row.alert_type, row.emoji, row.title_he, row.instructions_prefix);
}

export function getHistory(db: Database.Database, alertType: string): MessageTemplateHistoryRow[] {
  return db
    .prepare(
      'SELECT * FROM message_template_history WHERE alert_type = ? ORDER BY saved_at DESC, id DESC LIMIT 10',
    )
    .all(alertType) as MessageTemplateHistoryRow[];
}

export function getHistoryById(
  db: Database.Database,
  id: number,
): MessageTemplateHistoryRow | null {
  const row = db
    .prepare('SELECT * FROM message_template_history WHERE id = ?')
    .get(id) as MessageTemplateHistoryRow | undefined;
  return row ?? null;
}

export function pruneHistory(db: Database.Database, alertType: string, keep = 10): void {
  db.prepare(
    `DELETE FROM message_template_history
     WHERE alert_type = ? AND id NOT IN (
       SELECT id FROM message_template_history WHERE alert_type = ? ORDER BY saved_at DESC, id DESC LIMIT ?
     )`,
  ).run(alertType, alertType, keep);
}
