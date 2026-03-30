import type Database from 'better-sqlite3';
import { log } from '../logger.js';

interface WhatsAppListenerRow {
  id: number;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  keywords: string;             // JSON string[]
  telegram_topic_id: number | null;
  telegram_topic_name: string | null;
  is_active: number;            // 0 | 1
  created_at: string;
}

export interface WhatsAppListener {
  id: number;
  channelId: string;
  channelName: string;
  channelType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateListenerInput {
  channelId: string;
  channelName: string;
  channelType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  isActive: boolean;
}

export type UpdateListenerInput = Partial<Omit<CreateListenerInput, 'channelId'>>;

function parseKeywords(raw: string, id: number): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
      return parsed as string[];
    }
    log('warn', 'WhatsApp', `keywords לא תקין ב-listener ${id} — מחזיר ריק`);
    return [];
  } catch {
    log('warn', 'WhatsApp', `JSON פגום ב-keywords של listener ${id} — מחזיר ריק`);
    return [];
  }
}

function decodeRow(row: WhatsAppListenerRow): WhatsAppListener {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    keywords: parseKeywords(row.keywords, row.id),
    telegramTopicId: row.telegram_topic_id,
    telegramTopicName: row.telegram_topic_name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export function getAllListeners(db: Database.Database): WhatsAppListener[] {
  const rows = db
    .prepare('SELECT * FROM whatsapp_listeners ORDER BY created_at DESC')
    .all() as WhatsAppListenerRow[];
  return rows.map(decodeRow);
}

export function getActiveListenersForChannel(
  db: Database.Database,
  channelId: string
): WhatsAppListener[] {
  const rows = db
    .prepare('SELECT * FROM whatsapp_listeners WHERE channel_id = ? AND is_active = 1')
    .all(channelId) as WhatsAppListenerRow[];
  return rows.map(decodeRow);
}

export function createListener(
  db: Database.Database,
  input: CreateListenerInput
): WhatsAppListener {
  const result = db
    .prepare(`
      INSERT INTO whatsapp_listeners
        (channel_id, channel_name, channel_type, keywords, telegram_topic_id, telegram_topic_name, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.channelId,
      input.channelName,
      input.channelType,
      JSON.stringify(input.keywords),
      input.telegramTopicId,
      input.telegramTopicName,
      input.isActive ? 1 : 0
    );

  const row = db
    .prepare('SELECT * FROM whatsapp_listeners WHERE id = ?')
    .get(result.lastInsertRowid) as WhatsAppListenerRow;

  return decodeRow(row);
}

export function updateListener(
  db: Database.Database,
  id: number,
  input: UpdateListenerInput
): WhatsAppListener | null {
  const existing = db
    .prepare('SELECT * FROM whatsapp_listeners WHERE id = ?')
    .get(id) as WhatsAppListenerRow | undefined;

  if (!existing) {
    return null;
  }

  const merged: WhatsAppListenerRow = {
    ...existing,
    channel_name:        input.channelName        !== undefined ? input.channelName        : existing.channel_name,
    channel_type:        input.channelType        !== undefined ? input.channelType        : existing.channel_type,
    keywords:            input.keywords           !== undefined ? JSON.stringify(input.keywords) : existing.keywords,
    telegram_topic_id:   input.telegramTopicId    !== undefined ? input.telegramTopicId    : existing.telegram_topic_id,
    telegram_topic_name: input.telegramTopicName  !== undefined ? input.telegramTopicName  : existing.telegram_topic_name,
    is_active:           input.isActive           !== undefined ? (input.isActive ? 1 : 0) : existing.is_active,
  };

  db.prepare(`
    UPDATE whatsapp_listeners
    SET channel_name        = ?,
        channel_type        = ?,
        keywords            = ?,
        telegram_topic_id   = ?,
        telegram_topic_name = ?,
        is_active           = ?
    WHERE id = ?
  `).run(
    merged.channel_name,
    merged.channel_type,
    merged.keywords,
    merged.telegram_topic_id,
    merged.telegram_topic_name,
    merged.is_active,
    id
  );

  return decodeRow(merged);
}

export function deleteListener(db: Database.Database, id: number): boolean {
  const result = db
    .prepare('DELETE FROM whatsapp_listeners WHERE id = ?')
    .run(id);
  return result.changes > 0;
}
