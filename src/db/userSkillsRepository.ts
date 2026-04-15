import type Database from 'better-sqlite3';

export interface UserSkillRow {
  chatId: number;
  skillKey: string;
  visibility: 'public' | 'contacts' | 'private';
  note: string | null;
  createdAt: string;
}

interface RawUserSkill {
  chat_id: number;
  skill_key: string;
  visibility: string;
  note: string | null;
  created_at: string;
}

function decodeRow(raw: RawUserSkill): UserSkillRow {
  return {
    chatId: raw.chat_id,
    skillKey: raw.skill_key,
    visibility: raw.visibility as UserSkillRow['visibility'],
    note: raw.note ?? null,
    createdAt: raw.created_at,
  };
}

/** Returns all skills claimed by a user, ordered by created_at. */
export function listSkillsForUser(
  db: Database.Database,
  chatId: number
): UserSkillRow[] {
  const rows = db
    .prepare(
      `SELECT chat_id, skill_key, visibility, note, created_at
       FROM user_skills
       WHERE chat_id = ?
       ORDER BY created_at ASC`
    )
    .all(chatId) as RawUserSkill[];
  return rows.map(decodeRow);
}

/**
 * Inserts or replaces a user skill.
 * INSERT OR REPLACE is intentional here — created_at loss on update is acceptable
 * for user skill edits (PRIMARY KEY is (chat_id, skill_key)).
 */
export function upsertSkill(
  db: Database.Database,
  chatId: number,
  skillKey: string,
  visibility: UserSkillRow['visibility'],
  note: string | null
): UserSkillRow {
  db.prepare(
    `INSERT OR REPLACE INTO user_skills (chat_id, skill_key, visibility, note, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(chatId, skillKey, visibility, note ?? null);

  const raw = db
    .prepare(
      `SELECT chat_id, skill_key, visibility, note, created_at
       FROM user_skills
       WHERE chat_id = ? AND skill_key = ?`
    )
    .get(chatId, skillKey) as RawUserSkill;
  return decodeRow(raw);
}

/** Removes a skill from a user. Returns true if the row was deleted. */
export function removeSkill(
  db: Database.Database,
  chatId: number,
  skillKey: string
): boolean {
  const result = db
    .prepare(`DELETE FROM user_skills WHERE chat_id = ? AND skill_key = ?`)
    .run(chatId, skillKey);
  return result.changes > 0;
}

export interface SkillMatchRow {
  displayName: string;
  homeCity: string | null;
}

/**
 * Returns users who have the given skill, respecting visibility rules:
 * - 'public': always shown
 * - 'contacts': only shown if chat_id is in contactIds
 * - 'private': never shown
 *
 * Joins skill_catalog to filter orphaned skills (is_active = 1).
 * Never exposes chat_id in results.
 */
export function findUsersWithSkill(
  db: Database.Database,
  skillKey: string,
  viewerChatId: number,
  contactIds: number[],
  limit: number,
  offset: number
): SkillMatchRow[] {
  const contactPlaceholders =
    contactIds.length > 0 ? contactIds.map(() => '?').join(', ') : 'NULL';

  const sql = `
    SELECT u.display_name AS display_name, u.home_city AS home_city
    FROM user_skills us
    JOIN users u ON u.chat_id = us.chat_id
    JOIN skill_catalog sc ON sc.key = us.skill_key AND sc.is_active = 1
    WHERE us.skill_key = ?
      AND us.chat_id != ?
      AND (
        us.visibility = 'public'
        OR (us.visibility = 'contacts' AND us.chat_id IN (${contactPlaceholders}))
      )
    ORDER BY us.created_at ASC
    LIMIT ? OFFSET ?
  `;

  const params: unknown[] = [skillKey, viewerChatId, ...contactIds, limit, offset];
  const rows = db.prepare(sql).all(...params) as Array<{
    display_name: string | null;
    home_city: string | null;
  }>;

  return rows.map((r) => ({
    displayName: r.display_name ?? 'משתמש',
    homeCity: r.home_city ?? null,
  }));
}
