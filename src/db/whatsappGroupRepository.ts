import type Database from 'better-sqlite3';
import { log } from '../logger.js';

interface WhatsAppGroupRow {
  group_id: string;
  name: string;
  enabled: number;      // 0 | 1 in SQLite, decoded to boolean at boundary
  alert_types: string;  // JSON array string e.g. '["missiles","earthQuake"]'
}

export interface WhatsAppGroupConfig {
  groupId: string;
  name: string;
  enabled: boolean;
  alertTypes: string[];
}

function parseAlertTypes(raw: string, groupId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) {
      return parsed as string[];
    }
    log('warn', 'WhatsApp', `alert_types לא תקין בקבוצה ${groupId} — מחזיר ריק`);
    return [];
  } catch {
    log('warn', 'WhatsApp', `JSON פגום ב-alert_types של קבוצה ${groupId} — מחזיר ריק`);
    return [];
  }
}

function decodeRow(raw: WhatsAppGroupRow): WhatsAppGroupConfig {
  return {
    groupId: raw.group_id,
    name: raw.name,
    enabled: raw.enabled === 1,
    alertTypes: parseAlertTypes(raw.alert_types, raw.group_id),
  };
}

export function getAllGroups(db: Database.Database): WhatsAppGroupConfig[] {
  const rows = db
    .prepare('SELECT group_id, name, enabled, alert_types FROM whatsapp_groups')
    .all() as WhatsAppGroupRow[];
  return rows.map(decodeRow);
}

export function upsertGroup(
  db: Database.Database,
  groupId: string,
  name: string,
  enabled: boolean,
  alertTypes: string[]
): void {
  db.prepare(`
    INSERT INTO whatsapp_groups (group_id, name, enabled, alert_types)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      name        = excluded.name,
      enabled     = excluded.enabled,
      alert_types = excluded.alert_types
  `).run(groupId, name, enabled ? 1 : 0, JSON.stringify(alertTypes));
}

export function getEnabledGroupsForAlertType(
  db: Database.Database,
  alertType: string
): string[] {
  const rows = db
    .prepare(`SELECT group_id, alert_types FROM whatsapp_groups WHERE enabled = 1`)
    .all() as Pick<WhatsAppGroupRow, 'group_id' | 'alert_types'>[];

  return rows
    .filter((row) => {
      const types = parseAlertTypes(row.alert_types, row.group_id);
      return types.includes(alertType);
    })
    .map((row) => row.group_id);
}

export function deleteGroup(db: Database.Database, groupId: string): void {
  db.prepare('DELETE FROM whatsapp_groups WHERE group_id = ?').run(groupId);
}
