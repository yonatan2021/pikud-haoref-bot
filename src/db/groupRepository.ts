import type Database from 'better-sqlite3';
import { log } from '../logger.js';

// ─── Public types ────────────────────────────────────────────────────────────

export interface Group {
  id: number;
  name: string;
  inviteCode: string;
  ownerId: number;
  createdAt: string;
}

export interface GroupMember {
  groupId: number;
  userId: number;
  role: 'owner' | 'member';
  joinedAt: string;
  notifyGroup: boolean;
}

// ─── Internal raw rows (match SQLite column names exactly) ───────────────────

interface RawGroup {
  id: number;
  name: string;
  invite_code: string;
  owner_id: number;
  created_at: string;
}

interface RawMember {
  group_id: number;
  user_id: number;
  role: string;
  joined_at: string;
  notify_group: number; // SQLite INTEGER (0|1) — decoded to boolean at boundary
}

function decodeGroup(raw: RawGroup): Group {
  return {
    id: raw.id,
    name: raw.name,
    inviteCode: raw.invite_code,
    ownerId: raw.owner_id,
    createdAt: raw.created_at,
  };
}

function decodeMember(raw: RawMember): GroupMember {
  // Hardened role decode — refuses to lie about an invalid union value.
  // SQLite has a CHECK constraint, so 'owner'|'member' is the only legal
  // value at write-time, but a corrupted/migrated DB row could still slip
  // through. Default to 'member' (least-privileged) and log a warn rather
  // than producing an unsafe `as` cast.
  let role: 'owner' | 'member';
  if (raw.role === 'owner' || raw.role === 'member') {
    role = raw.role;
  } else {
    log('warn', 'GroupRepo', `unexpected role value for group_id=${raw.group_id} user_id=${raw.user_id}: ${JSON.stringify(raw.role)} — defaulting to 'member'`);
    role = 'member';
  }

  return {
    groupId: raw.group_id,
    userId: raw.user_id,
    role,
    joinedAt: raw.joined_at,
    notifyGroup: raw.notify_group === 1, // strict INTEGER→boolean
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Sentinel error thrown when the invite_code UNIQUE constraint fires.
 * Callers (groupHandler.handleCreate) catch this to retry with a fresh code.
 *
 * The pre-check in `generateInviteCode` is best-effort and is not safe under
 * concurrent inserts — this sentinel makes the race recoverable.
 */
export class InviteCodeCollisionError extends Error {
  constructor(code: string) {
    super(`Invite code collision: ${code}`);
    this.name = 'InviteCodeCollisionError';
  }
}

/**
 * Creates a new group and inserts the owner as a member in a single transaction.
 * Rolls back atomically if either insert fails (e.g. invalid ownerId FK).
 *
 * Throws `InviteCodeCollisionError` if `invite_code` UNIQUE constraint fires
 * (e.g. concurrent insert raced past the pre-check). Other errors propagate.
 */
export function createGroup(
  db: Database.Database,
  input: { name: string; ownerId: number; inviteCode: string }
): Group {
  try {
    return db.transaction(() => {
      const raw = db
        .prepare(
          'INSERT INTO groups (name, invite_code, owner_id) VALUES (?, ?, ?) RETURNING *'
        )
        .get(input.name, input.inviteCode, input.ownerId) as RawGroup;

      db.prepare(
        "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')"
      ).run(raw.id, input.ownerId);

      return decodeGroup(raw);
    })();
  } catch (err: unknown) {
    // better-sqlite3 throws SqliteError with `.code` property — narrow to the
    // UNIQUE-constraint case so handlers can retry. Other errors propagate.
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
      err.message.includes('groups.invite_code')
    ) {
      throw new InviteCodeCollisionError(input.inviteCode);
    }
    throw err;
  }
}

/**
 * Idempotent — uses INSERT OR IGNORE on the (group_id, user_id) composite PK.
 * Logs a warn when the user was already a member, but does not throw.
 */
export function addMember(
  db: Database.Database,
  groupId: number,
  userId: number
): void {
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
    )
    .run(groupId, userId);
  if (result.changes === 0) {
    log('warn', 'GroupRepo', `addMember: user ${userId} already in group ${groupId}`);
  }
}

export function removeMember(
  db: Database.Database,
  groupId: number,
  userId: number
): void {
  db.prepare(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
  ).run(groupId, userId);
}

/**
 * Deletes the group row; `group_members` rows are removed by the CASCADE FK.
 */
export function deleteGroup(db: Database.Database, groupId: number): void {
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function findGroupByInviteCode(
  db: Database.Database,
  code: string
): Group | undefined {
  const raw = db
    .prepare('SELECT * FROM groups WHERE invite_code = ?')
    .get(code) as RawGroup | undefined;
  return raw ? decodeGroup(raw) : undefined;
}

export function findGroupById(
  db: Database.Database,
  id: number
): Group | undefined {
  const raw = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as
    | RawGroup
    | undefined;
  return raw ? decodeGroup(raw) : undefined;
}

export function getGroupsForUser(db: Database.Database, userId: number): Group[] {
  const rows = db
    .prepare(
      `SELECT g.* FROM groups g
       INNER JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?
       ORDER BY g.created_at DESC`
    )
    .all(userId) as RawGroup[];
  return rows.map(decodeGroup);
}

export function getMembersOfGroup(
  db: Database.Database,
  groupId: number
): GroupMember[] {
  const rows = db
    .prepare(
      'SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at ASC'
    )
    .all(groupId) as RawMember[];
  return rows.map(decodeMember);
}

export function countGroupsOwnedBy(
  db: Database.Database,
  ownerId: number
): number {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM groups WHERE owner_id = ?')
    .get(ownerId) as { c: number };
  return row.c;
}

export function countMembersOfGroup(
  db: Database.Database,
  groupId: number
): number {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?')
    .get(groupId) as { c: number };
  return row.c;
}

/**
 * Dashboard listing helper — joins group with its member count in a single query.
 * Used by `src/dashboard/routes/groups.ts` in Task 4.
 */
export function listAllGroupsWithStats(
  db: Database.Database
): Array<Group & { memberCount: number }> {
  const rows = db
    .prepare(
      `SELECT g.*,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM groups g
       ORDER BY g.created_at DESC`
    )
    .all() as Array<RawGroup & { member_count: number }>;
  return rows.map((r) => ({ ...decodeGroup(r), memberCount: r.member_count }));
}

// NOTE: `getMemberStatusesForGroup` (joining members with safetyStatusRepository)
// will be added in Task 2 (#212) to keep this PR tight around #211.
