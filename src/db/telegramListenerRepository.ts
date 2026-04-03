import type Database from 'better-sqlite3';
import { log } from '../logger.js';

interface TelegramListenerRow {
  id: number;
  chat_id: string;
  chat_name: string;
  chat_type: string;
  keywords: string;              // JSON string[]
  telegram_topic_id: number | null;
  telegram_topic_name: string | null;
  forward_to_whatsapp: number;   // 0 | 1
  is_active: number;             // 0 | 1
  created_at: string;
}

interface TelegramKnownChatRow {
  chat_id: string;
  chat_name: string;
  chat_type: string;
  updated_at: string;
}

export interface TelegramListener {
  id: number;
  chatId: string;
  chatName: string;
  chatType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  forwardToWhatsApp: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface TelegramKnownChat {
  chatId: string;
  chatName: string;
  chatType: string;
  updatedAt: string;
}

export interface CreateTelegramListenerInput {
  chatId: string;
  chatName: string;
  chatType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  forwardToWhatsApp: boolean;
  isActive: boolean;
}

export type UpdateTelegramListenerInput = Partial<Omit<CreateTelegramListenerInput, 'chatId'>>;

function parseKeywords(raw: string, id: number): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
      return parsed as string[];
    }
    log('warn', 'TG Listener', `keywords לא תקין ב-listener ${id} — מחזיר ריק`);
    return [];
  } catch {
    log('warn', 'TG Listener', `JSON פגום ב-keywords של listener ${id} — מחזיר ריק`);
    return [];
  }
}

function decodeRow(row: TelegramListenerRow): TelegramListener {
  return {
    id: row.id,
    chatId: row.chat_id,
    chatName: row.chat_name,
    chatType: row.chat_type,
    keywords: parseKeywords(row.keywords, row.id),
    telegramTopicId: row.telegram_topic_id,
    telegramTopicName: row.telegram_topic_name,
    forwardToWhatsApp: row.forward_to_whatsapp === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export function getAllListeners(db: Database.Database): TelegramListener[] {
  const rows = db
    .prepare('SELECT * FROM telegram_listeners ORDER BY created_at DESC')
    .all() as TelegramListenerRow[];
  return rows.map(decodeRow);
}

export function getActiveListenersForChat(
  db: Database.Database,
  chatId: string
): TelegramListener[] {
  const rows = db
    .prepare('SELECT * FROM telegram_listeners WHERE chat_id = ? AND is_active = 1')
    .all(chatId) as TelegramListenerRow[];
  return rows.map(decodeRow);
}

export function createListener(
  db: Database.Database,
  input: CreateTelegramListenerInput
): TelegramListener {
  const result = db
    .prepare(`
      INSERT INTO telegram_listeners
        (chat_id, chat_name, chat_type, keywords, telegram_topic_id, telegram_topic_name, forward_to_whatsapp, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.chatId,
      input.chatName,
      input.chatType,
      JSON.stringify(input.keywords),
      input.telegramTopicId,
      input.telegramTopicName,
      input.forwardToWhatsApp ? 1 : 0,
      input.isActive ? 1 : 0
    );

  const row = db
    .prepare('SELECT * FROM telegram_listeners WHERE id = ?')
    .get(result.lastInsertRowid) as TelegramListenerRow;

  return decodeRow(row);
}

export function updateListener(
  db: Database.Database,
  id: number,
  input: UpdateTelegramListenerInput
): TelegramListener | null {
  const existing = db
    .prepare('SELECT * FROM telegram_listeners WHERE id = ?')
    .get(id) as TelegramListenerRow | undefined;

  if (!existing) return null;

  const merged: TelegramListenerRow = {
    ...existing,
    chat_name:           input.chatName           !== undefined ? input.chatName           : existing.chat_name,
    chat_type:           input.chatType           !== undefined ? input.chatType           : existing.chat_type,
    keywords:            input.keywords           !== undefined ? JSON.stringify(input.keywords) : existing.keywords,
    telegram_topic_id:   input.telegramTopicId    !== undefined ? input.telegramTopicId    : existing.telegram_topic_id,
    telegram_topic_name: input.telegramTopicName  !== undefined ? input.telegramTopicName  : existing.telegram_topic_name,
    forward_to_whatsapp: input.forwardToWhatsApp  !== undefined ? (input.forwardToWhatsApp ? 1 : 0) : existing.forward_to_whatsapp,
    is_active:           input.isActive           !== undefined ? (input.isActive ? 1 : 0)          : existing.is_active,
  };

  db.prepare(`
    UPDATE telegram_listeners
    SET chat_name           = ?,
        chat_type           = ?,
        keywords            = ?,
        telegram_topic_id   = ?,
        telegram_topic_name = ?,
        forward_to_whatsapp = ?,
        is_active           = ?
    WHERE id = ?
  `).run(
    merged.chat_name,
    merged.chat_type,
    merged.keywords,
    merged.telegram_topic_id,
    merged.telegram_topic_name,
    merged.forward_to_whatsapp,
    merged.is_active,
    id
  );

  return decodeRow(merged);
}

export function deleteListener(db: Database.Database, id: number): boolean {
  const result = db.prepare('DELETE FROM telegram_listeners WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertKnownChat(
  db: Database.Database,
  chat: Omit<TelegramKnownChat, 'updatedAt'>
): void {
  db.prepare(`
    INSERT INTO telegram_known_chats (chat_id, chat_name, chat_type, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(chat_id) DO UPDATE SET
      chat_name  = excluded.chat_name,
      chat_type  = excluded.chat_type,
      updated_at = excluded.updated_at
  `).run(chat.chatId, chat.chatName, chat.chatType);
}

export function getAllKnownChats(db: Database.Database): TelegramKnownChat[] {
  const rows = db
    .prepare('SELECT * FROM telegram_known_chats ORDER BY chat_name ASC')
    .all() as TelegramKnownChatRow[];
  return rows.map((r) => ({
    chatId: r.chat_id,
    chatName: r.chat_name,
    chatType: r.chat_type,
    updatedAt: r.updated_at,
  }));
}

export function clearKnownChats(db: Database.Database): void {
  db.prepare('DELETE FROM telegram_known_chats').run();
}
