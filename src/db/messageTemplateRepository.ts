import type Database from 'better-sqlite3';

export interface MessageTemplateRow {
  alert_type: string;
  emoji: string;
  title_he: string;
  instructions_prefix: string;
  body_template: string | null;
}

export function getAllTemplates(db: Database.Database): MessageTemplateRow[] {
  return db
    .prepare('SELECT alert_type, emoji, title_he, instructions_prefix, body_template FROM message_templates')
    .all() as MessageTemplateRow[];
}

export function upsertTemplate(db: Database.Database, row: MessageTemplateRow): void {
  db.prepare(`
    INSERT INTO message_templates (alert_type, emoji, title_he, instructions_prefix, body_template)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(alert_type) DO UPDATE SET
      emoji               = excluded.emoji,
      title_he            = excluded.title_he,
      instructions_prefix = excluded.instructions_prefix,
      body_template       = excluded.body_template
  `).run(row.alert_type, row.emoji, row.title_he, row.instructions_prefix, row.body_template ?? null);
}

export function deleteTemplate(db: Database.Database, alertType: string): void {
  db.prepare('DELETE FROM message_templates WHERE alert_type = ?').run(alertType);
}
