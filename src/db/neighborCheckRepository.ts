import type Database from 'better-sqlite3';

interface RawPromptRow {
  chat_id: number;
  fingerprint: string;
  sent_at: string;
  responded: number;
  message_id: number | null;
}

interface RawEventRow {
  response: string;
  cnt: number;
}

export interface NeighborCheckPromptRow {
  chat_id: number;
  fingerprint: string;
  sent_at: string;
  responded: boolean;
  message_id: number | null;
}

export interface NeighborCheckAggregate {
  checked: number;
  unable: number;
  dismissed: number;
  total: number;
}

function decodePromptRow(raw: RawPromptRow): NeighborCheckPromptRow {
  return {
    chat_id: raw.chat_id,
    fingerprint: raw.fingerprint,
    sent_at: raw.sent_at,
    responded: raw.responded === 1,
    message_id: raw.message_id,
  };
}

/**
 * Insert OR IGNORE — duplicate (chat_id, fingerprint) pairs are silently skipped.
 */
export function insertPrompt(
  db: Database.Database,
  chatId: number,
  fingerprint: string,
  messageId?: number
): void {
  db.prepare(
    `INSERT OR IGNORE INTO neighbor_check_prompts (chat_id, fingerprint, message_id)
     VALUES (?, ?, ?)`
  ).run(chatId, fingerprint, messageId ?? null);
}

export function updatePromptMessageId(
  db: Database.Database,
  chatId: number,
  fingerprint: string,
  messageId: number
): void {
  db.prepare(
    'UPDATE neighbor_check_prompts SET message_id = ? WHERE chat_id = ? AND fingerprint = ?'
  ).run(messageId, chatId, fingerprint);
}

export function markResponded(
  db: Database.Database,
  chatId: number,
  fingerprint: string
): void {
  db.prepare(
    'UPDATE neighbor_check_prompts SET responded = 1 WHERE chat_id = ? AND fingerprint = ?'
  ).run(chatId, fingerprint);
}

/**
 * Find a prompt row by chatId and a fingerprint prefix (fp_short = first 8 chars).
 * Returns the first matching row or null.
 */
export function getPromptByPrefix(
  db: Database.Database,
  chatId: number,
  fpShort: string
): NeighborCheckPromptRow | null {
  const raw = db
    .prepare(
      `SELECT * FROM neighbor_check_prompts
       WHERE chat_id = ? AND fingerprint LIKE ? || '%'
       LIMIT 1`
    )
    .get(chatId, fpShort) as RawPromptRow | undefined;
  return raw ? decodePromptRow(raw) : null;
}

/**
 * Insert an anonymous event (no chat_id — privacy guarantee).
 */
export function recordEvent(
  db: Database.Database,
  alertFp: string,
  response: 'checked' | 'unable' | 'dismissed',
  city: string | null
): void {
  db.prepare(
    `INSERT INTO neighbor_check_events (alert_fp, response, city)
     VALUES (?, ?, ?)`
  ).run(alertFp, response, city);
}

/**
 * Aggregate counts grouped by response for events since `since` (ISO datetime string).
 */
export function getAggregate(
  db: Database.Database,
  since: string
): NeighborCheckAggregate {
  const rows = db
    .prepare(
      `SELECT response, COUNT(*) as cnt
       FROM neighbor_check_events
       WHERE created_at >= ?
       GROUP BY response`
    )
    .all(since) as RawEventRow[];

  const result: NeighborCheckAggregate = { checked: 0, unable: 0, dismissed: 0, total: 0 };
  for (const row of rows) {
    if (row.response === 'checked') result.checked = row.cnt;
    else if (row.response === 'unable') result.unable = row.cnt;
    else if (row.response === 'dismissed') result.dismissed = row.cnt;
  }
  result.total = result.checked + result.unable + result.dismissed;
  return result;
}
