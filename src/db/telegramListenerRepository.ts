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
  source_topic_id: number | null;
  created_at: string;
}

interface TelegramKnownChatRow {
  chat_id: string;
  chat_name: string;
  chat_type: string;
  is_forum: number;              // 0 | 1
  updated_at: string;
}

interface TelegramKnownTopicRow {
  topic_id: number;
  chat_id: string;
  topic_name: string;
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
  sourceTopicId: number | null;
  createdAt: string;
}

export interface TelegramKnownChat {
  chatId: string;
  chatName: string;
  chatType: string;
  isForum: boolean;
  updatedAt: string;
}

export interface TelegramKnownTopic {
  topicId: number;
  chatId: string;
  topicName: string;
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
  sourceTopicId: number | null;
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
    sourceTopicId: row.source_topic_id ?? null,
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
        (chat_id, chat_name, chat_type, keywords, telegram_topic_id, telegram_topic_name, forward_to_whatsapp, is_active, source_topic_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.chatId,
      input.chatName,
      input.chatType,
      JSON.stringify(input.keywords),
      input.telegramTopicId,
      input.telegramTopicName,
      input.forwardToWhatsApp ? 1 : 0,
      input.isActive ? 1 : 0,
      input.sourceTopicId ?? null
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
    source_topic_id:     input.sourceTopicId      !== undefined ? (input.sourceTopicId ?? null)      : existing.source_topic_id,
  };

  db.prepare(`
    UPDATE telegram_listeners
    SET chat_name           = ?,
        chat_type           = ?,
        keywords            = ?,
        telegram_topic_id   = ?,
        telegram_topic_name = ?,
        forward_to_whatsapp = ?,
        is_active           = ?,
        source_topic_id     = ?
    WHERE id = ?
  `).run(
    merged.chat_name,
    merged.chat_type,
    merged.keywords,
    merged.telegram_topic_id,
    merged.telegram_topic_name,
    merged.forward_to_whatsapp,
    merged.is_active,
    merged.source_topic_id,
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
    INSERT INTO telegram_known_chats (chat_id, chat_name, chat_type, is_forum, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(chat_id) DO UPDATE SET
      chat_name  = excluded.chat_name,
      chat_type  = excluded.chat_type,
      is_forum   = excluded.is_forum,
      updated_at = excluded.updated_at
  `).run(chat.chatId, chat.chatName, chat.chatType, chat.isForum ? 1 : 0);
}

export function getKnownChatById(
  db: Database.Database,
  chatId: string
): TelegramKnownChat | null {
  const row = db
    .prepare('SELECT * FROM telegram_known_chats WHERE chat_id = ?')
    .get(chatId) as TelegramKnownChatRow | undefined;
  if (!row) return null;
  return {
    chatId: row.chat_id,
    chatName: row.chat_name,
    chatType: row.chat_type,
    isForum: row.is_forum === 1,
    updatedAt: row.updated_at,
  };
}

export function getAllKnownChats(db: Database.Database): TelegramKnownChat[] {
  const rows = db
    .prepare('SELECT * FROM telegram_known_chats ORDER BY chat_name ASC')
    .all() as TelegramKnownChatRow[];
  return rows.map((r) => ({
    chatId: r.chat_id,
    chatName: r.chat_name,
    chatType: r.chat_type,
    isForum: r.is_forum === 1,
    updatedAt: r.updated_at,
  }));
}

export function clearKnownChats(db: Database.Database): void {
  db.prepare('DELETE FROM telegram_known_chats').run();
}

// ── Topics (forum supergroups) ────────────────────────────────────────────────

export function upsertKnownTopic(
  db: Database.Database,
  topic: Omit<TelegramKnownTopic, 'updatedAt'>
): void {
  db.prepare(`
    INSERT INTO telegram_known_topics (topic_id, chat_id, topic_name, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(chat_id, topic_id) DO UPDATE SET
      topic_name = excluded.topic_name,
      updated_at = excluded.updated_at
  `).run(topic.topicId, topic.chatId, topic.topicName);
}

export function getTopicsForChat(
  db: Database.Database,
  chatId: string
): TelegramKnownTopic[] {
  const rows = db
    .prepare('SELECT * FROM telegram_known_topics WHERE chat_id = ? ORDER BY topic_name ASC')
    .all(chatId) as TelegramKnownTopicRow[];
  return rows.map((r) => ({
    topicId: r.topic_id,
    chatId: r.chat_id,
    topicName: r.topic_name,
    updatedAt: r.updated_at,
  }));
}

export function clearKnownTopicsForChat(db: Database.Database, chatId: string): void {
  db.prepare('DELETE FROM telegram_known_topics WHERE chat_id = ?').run(chatId);
}

export function repairStaleChatIds(db: Database.Database): number {
  const orphaned = db
    .prepare(
      `SELECT id, chat_id, chat_name
       FROM telegram_listeners
       WHERE chat_id NOT IN (SELECT chat_id FROM telegram_known_chats)`
    )
    .all() as Array<{ id: number; chat_id: string; chat_name: string }>;

  log('info', 'TG Listener', `בדיקת כללים מיושנים: ${orphaned.length} נמצאו`);

  let repaired = 0;
  for (const rule of orphaned) {
    const matches = db
      .prepare(`SELECT chat_id FROM telegram_known_chats WHERE chat_name = ? LIMIT 2`)
      .all(rule.chat_name) as Array<{ chat_id: string }>;

    if (matches.length !== 1) {
      log(
        'warn',
        'TG Listener',
        `listener ${rule.id} "${rule.chat_name}" (${rule.chat_id}) — ` +
          (matches.length === 0
            ? 'לא נמצאה קבוצה תואמת בשם — אולי הוסרת ממנה'
            : 'שם לא ייחודי — מחק ובצור מחדש בדשבורד')
      );
      continue;
    }

    const newChatId = matches[0]!.chat_id;
    const conflict = db
      .prepare('SELECT 1 FROM telegram_listeners WHERE chat_id = ?')
      .get(newChatId);
    if (conflict) {
      log(
        'warn',
        'TG Listener',
        `listener ${rule.id} "${rule.chat_name}" — chatId מיושן, כבר קיים כלל ל-${newChatId}; מחק ידנית`
      );
      continue;
    }

    db.prepare('UPDATE telegram_listeners SET chat_id = ? WHERE id = ?').run(newChatId, rule.id);
    log(
      'info',
      'TG Listener',
      `תיקון listener ${rule.id} "${rule.chat_name}": ${rule.chat_id} → ${newChatId}`
    );
    repaired++;
  }
  return repaired;
}
