import type Database from 'better-sqlite3';

export interface StoryRow {
  id: number;
  chatId: number;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  publishedMessageId: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

interface RawStoryRow {
  id: number;
  chat_id: number;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  published_message_id: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

function decodeRow(row: RawStoryRow): StoryRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    body: row.body,
    status: row.status,
    publishedMessageId: row.published_message_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}

export function createStory(
  db: Database.Database,
  chatId: number,
  body: string
): StoryRow {
  const stmt = db.prepare(
    `INSERT INTO shelter_stories (chat_id, body) VALUES (?, ?) RETURNING *`
  );
  const row = stmt.get(chatId, body) as RawStoryRow;
  return decodeRow(row);
}

export function getPendingStories(
  db: Database.Database,
  limit: number,
  offset: number
): StoryRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM shelter_stories WHERE status = 'pending' ORDER BY created_at ASC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as RawStoryRow[];
  return rows.map(decodeRow);
}

export function getStoriesByStatus(
  db: Database.Database,
  status: 'pending' | 'approved' | 'rejected' | 'published',
  limit: number,
  offset: number
): StoryRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM shelter_stories WHERE status = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`
    )
    .all(status, limit, offset) as RawStoryRow[];
  return rows.map(decodeRow);
}

/**
 * Atomically claim a pending story for approval.
 * Returns true if the story was successfully locked (status changed pending→approved).
 * Returns false if the story wasn't in pending state (already processed or doesn't exist).
 */
export function lockForApproval(db: Database.Database, id: number): boolean {
  const result = db
    .prepare(
      `UPDATE shelter_stories SET status = 'approved' WHERE id = ? AND status = 'pending'`
    )
    .run(id);
  return result.changes > 0;
}

export function getStoryById(
  db: Database.Database,
  id: number
): StoryRow | null {
  const row = db
    .prepare(`SELECT * FROM shelter_stories WHERE id = ?`)
    .get(id) as RawStoryRow | undefined;
  return row ? decodeRow(row) : null;
}

export function approveStory(
  db: Database.Database,
  id: number,
  reviewedBy: string,
  publishedMessageId: number
): void {
  db.prepare(
    `UPDATE shelter_stories
     SET status = 'published', published_message_id = ?, reviewed_at = datetime('now'), reviewed_by = ?
     WHERE id = ?`
  ).run(publishedMessageId, reviewedBy, id);
}

/**
 * Reject a pending story.
 * Returns true if the story was successfully rejected, false if it wasn't in pending state.
 */
export function rejectStory(
  db: Database.Database,
  id: number,
  reviewedBy: string
): boolean {
  const result = db
    .prepare(
      `UPDATE shelter_stories
       SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?
       WHERE id = ? AND status = 'pending'`
    )
    .run(reviewedBy, id);
  return result.changes > 0;
}

export function countStoriesByUserSince(
  db: Database.Database,
  chatId: number,
  sinceIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM shelter_stories WHERE chat_id = ? AND created_at >= ?`
    )
    .get(chatId, sinceIso) as { cnt: number };
  return row.cnt;
}

export function getCountsByStatus(
  db: Database.Database
): Record<'pending' | 'approved' | 'rejected' | 'published', number> {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as cnt FROM shelter_stories GROUP BY status`
    )
    .all() as Array<{ status: string; cnt: number }>;

  const result: Record<'pending' | 'approved' | 'rejected' | 'published', number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    published: 0,
  };

  for (const row of rows) {
    const s = row.status as keyof typeof result;
    if (s in result) result[s] = row.cnt;
  }

  return result;
}
