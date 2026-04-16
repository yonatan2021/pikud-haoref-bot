import type Database from 'better-sqlite3';

const SKILL_KEY_REGEX = /^[a-z0-9_]{1,32}$/;

export interface SkillCatalogRow {
  key: string;
  labelHe: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

type RawRow = {
  key: string;
  label_he: string;
  description: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  usage_count?: number;
};

function decodeRow(raw: RawRow): SkillCatalogRow {
  return {
    key: raw.key,
    labelHe: raw.label_he,
    description: raw.description ?? null,
    isActive: Boolean(raw.is_active),
    sortOrder: raw.sort_order,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    ...(raw.usage_count !== undefined ? { usageCount: raw.usage_count } : {}),
  };
}

/**
 * Returns all active skills ordered by sort_order ascending.
 */
export function listActiveSkills(db: Database.Database): SkillCatalogRow[] {
  const rows = db
    .prepare(
      `SELECT key, label_he, description, is_active, sort_order, created_at, updated_at
       FROM skill_catalog
       WHERE is_active = 1
       ORDER BY sort_order ASC`
    )
    .all() as RawRow[];
  return rows.map(decodeRow);
}

/**
 * Returns all skills with usage_count from user_skills (0 when user_skills does not yet exist).
 */
export function listAllSkills(db: Database.Database): SkillCatalogRow[] {
  try {
    const rows = db
      .prepare(
        `SELECT s.key, s.label_he, s.description, s.is_active, s.sort_order, s.created_at, s.updated_at,
                COUNT(us.skill_key) AS usage_count
         FROM skill_catalog s
         LEFT JOIN user_skills us ON us.skill_key = s.key
         GROUP BY s.key
         ORDER BY s.sort_order ASC`
      )
      .all() as RawRow[];
    return rows.map(decodeRow);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) {
      // Safety net: user_skills table missing (unlikely — both created in initSchema)
      const rows = db
        .prepare(
          `SELECT key, label_he, description, is_active, sort_order, created_at, updated_at
           FROM skill_catalog
           ORDER BY sort_order ASC`
        )
        .all() as RawRow[];
      return rows.map((r) => decodeRow({ ...r, usage_count: 0 }));
    }
    throw err;
  }
}

/**
 * Returns a single skill by primary key, or null if not found.
 */
export function getSkillByKey(db: Database.Database, key: string): SkillCatalogRow | null {
  const raw = db
    .prepare(
      `SELECT key, label_he, description, is_active, sort_order, created_at, updated_at
       FROM skill_catalog
       WHERE key = ?`
    )
    .get(key) as RawRow | undefined;
  return raw ? decodeRow(raw) : null;
}

/**
 * Inserts or updates a skill row.
 * Uses ON CONFLICT DO UPDATE to preserve created_at on updates.
 * Throws Error('Invalid skill key format') if key does not match /^[a-z0-9_]{1,32}$/.
 */
export function upsertSkill(
  db: Database.Database,
  row: Pick<SkillCatalogRow, 'key' | 'labelHe' | 'description' | 'isActive' | 'sortOrder'>
): void {
  if (!SKILL_KEY_REGEX.test(row.key)) {
    throw new Error('Invalid skill key format');
  }
  db.prepare(`
    INSERT INTO skill_catalog (key, label_he, description, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      label_he    = excluded.label_he,
      description = excluded.description,
      is_active   = excluded.is_active,
      sort_order  = excluded.sort_order,
      updated_at  = datetime('now')
  `).run(
    row.key,
    row.labelHe,
    row.description ?? null,
    row.isActive ? 1 : 0,
    row.sortOrder
  );
}

/**
 * Soft-deletes a skill by setting is_active = 0.
 */
export function deactivateSkill(db: Database.Database, key: string): void {
  db.prepare(`UPDATE skill_catalog SET is_active = 0, updated_at = datetime('now') WHERE key = ?`).run(key);
}

/**
 * Restores a deactivated skill by setting is_active = 1.
 */
export function activateSkill(db: Database.Database, key: string): void {
  db.prepare(`UPDATE skill_catalog SET is_active = 1, updated_at = datetime('now') WHERE key = ?`).run(key);
}

/**
 * Returns the number of users who have claimed a given skill.
 * Returns 0 if user_skills table does not yet exist.
 */
export function getUsageCount(db: Database.Database, key: string): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM user_skills WHERE skill_key = ?`)
      .get(key) as { n: number };
    return row.n;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) return 0;
    throw err;
  }
}
