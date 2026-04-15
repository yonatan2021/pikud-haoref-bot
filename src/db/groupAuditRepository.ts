import type Database from 'better-sqlite3';

export interface AuditRow {
  groupId: number;
  action: 'deleted' | 'transferred';
  actorId: number;
  payload: string | null;  // JSON
}

export function insertAudit(db: Database.Database, row: AuditRow): void {
  db.prepare(
    `INSERT INTO group_audit (group_id, action, actor_id, payload, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(row.groupId, row.action, row.actorId, row.payload ?? null);
}
