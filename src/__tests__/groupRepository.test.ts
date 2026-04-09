import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  createGroup,
  findGroupByInviteCode,
  findGroupById,
  getGroupsForUser,
  addMember,
  removeMember,
  deleteGroup,
  getMembersOfGroup,
  countGroupsOwnedBy,
  countMembersOfGroup,
  listAllGroupsWithStats,
} from '../db/groupRepository.js';

const USER_A = 1001;
const USER_B = 1002;
const USER_C = 1003;

let db: Database.Database;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
});

after(() => db.close());

beforeEach(() => {
  // Cascade wipes group_members automatically (FK ON DELETE CASCADE)
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(USER_A, 'אבא');
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(USER_B, 'אמא');
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(USER_C, 'ילד');
});

describe('schema sanity', () => {
  it('groups table exists after initSchema', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'").get();
    assert.ok(row, 'groups table should exist');
  });

  it('group_members table exists after initSchema', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_members'").get();
    assert.ok(row, 'group_members table should exist');
  });
});

describe('createGroup', () => {
  it('inserts row and auto-adds owner as member with role=owner', () => {
    const group = createGroup(db, { name: 'משפחה', ownerId: USER_A, inviteCode: 'ABC123' });
    assert.equal(group.name, 'משפחה');
    assert.equal(group.ownerId, USER_A);
    assert.equal(group.inviteCode, 'ABC123');
    assert.ok(group.id > 0);
    assert.ok(group.createdAt);

    const members = getMembersOfGroup(db, group.id);
    assert.equal(members.length, 1);
    assert.equal(members[0]?.userId, USER_A);
    assert.equal(members[0]?.role, 'owner');
  });

  it('rolls back atomically if owner membership insert fails', () => {
    // Delete the owner's user row AFTER the FK check but... actually we can't
    // easily simulate this. Instead: try inserting with a non-existent ownerId
    // and assert that no `groups` row remains.
    assert.throws(() => createGroup(db, { name: 'x', ownerId: 999999, inviteCode: 'X999' }));
    const rows = db.prepare('SELECT * FROM groups WHERE invite_code = ?').all('X999');
    assert.equal(rows.length, 0, 'groups row should have rolled back');
  });

  it('enforces invite_code uniqueness', () => {
    createGroup(db, { name: 'a', ownerId: USER_A, inviteCode: 'DUP123' });
    assert.throws(() => createGroup(db, { name: 'b', ownerId: USER_B, inviteCode: 'DUP123' }));
  });
});

describe('findGroupByInviteCode', () => {
  it('returns undefined for unknown code', () => {
    assert.equal(findGroupByInviteCode(db, 'NOPE00'), undefined);
  });

  it('returns decoded group for known code', () => {
    const created = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'FIND01' });
    const found = findGroupByInviteCode(db, 'FIND01');
    assert.ok(found);
    assert.equal(found.id, created.id);
    assert.equal(found.name, 'x');
    assert.equal(found.inviteCode, 'FIND01');
  });
});

describe('findGroupById', () => {
  it('returns undefined for unknown id', () => {
    assert.equal(findGroupById(db, 999999), undefined);
  });

  it('returns decoded group for known id', () => {
    const created = createGroup(db, { name: 'y', ownerId: USER_A, inviteCode: 'FI02' });
    const found = findGroupById(db, created.id);
    assert.ok(found);
    assert.equal(found.id, created.id);
  });
});

describe('addMember / removeMember', () => {
  it('adds a non-owner member and counts correctly', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'ADD001' });
    addMember(db, g.id, USER_B);
    assert.equal(countMembersOfGroup(db, g.id), 2);

    const members = getMembersOfGroup(db, g.id);
    const nonOwner = members.find((m) => m.userId === USER_B);
    assert.ok(nonOwner);
    assert.equal(nonOwner.role, 'member');
  });

  it('addMember is idempotent (INSERT OR IGNORE)', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'IDEM01' });
    addMember(db, g.id, USER_B);
    addMember(db, g.id, USER_B); // no-op, not an error
    assert.equal(countMembersOfGroup(db, g.id), 2);
  });

  it('removeMember removes only the target', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'RM0001' });
    addMember(db, g.id, USER_B);
    addMember(db, g.id, USER_C);
    removeMember(db, g.id, USER_B);
    assert.equal(countMembersOfGroup(db, g.id), 2); // owner + USER_C
    const ids = getMembersOfGroup(db, g.id).map((m) => m.userId).sort();
    assert.deepEqual(ids, [USER_A, USER_C]);
  });
});

describe('getGroupsForUser', () => {
  it('returns empty array for user with no groups', () => {
    assert.deepEqual(getGroupsForUser(db, USER_A), []);
  });

  it('returns all groups user is in (owned + joined)', () => {
    const g1 = createGroup(db, { name: 'owned', ownerId: USER_A, inviteCode: 'G4U001' });
    const g2 = createGroup(db, { name: 'joined', ownerId: USER_B, inviteCode: 'G4U002' });
    addMember(db, g2.id, USER_A);

    const groups = getGroupsForUser(db, USER_A);
    assert.equal(groups.length, 2);
    const ids = groups.map((g) => g.id).sort();
    assert.deepEqual(ids, [g1.id, g2.id].sort());
  });
});

describe('deleteGroup', () => {
  it('removes group and cascades to group_members', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'DEL001' });
    addMember(db, g.id, USER_B);
    assert.equal(countMembersOfGroup(db, g.id), 2);

    deleteGroup(db, g.id);

    assert.equal(findGroupById(db, g.id), undefined);
    // Cascade removed all group_members rows for this group
    const remainingMembers = db.prepare('SELECT * FROM group_members WHERE group_id = ?').all(g.id);
    assert.equal(remainingMembers.length, 0);
  });
});

describe('countGroupsOwnedBy', () => {
  it('counts only owner, not member-of', () => {
    createGroup(db, { name: 'a', ownerId: USER_A, inviteCode: 'CNT001' });
    createGroup(db, { name: 'b', ownerId: USER_B, inviteCode: 'CNT002' });
    assert.equal(countGroupsOwnedBy(db, USER_A), 1);
    assert.equal(countGroupsOwnedBy(db, USER_B), 1);
    assert.equal(countGroupsOwnedBy(db, USER_C), 0);
  });
});

// CRITICAL — explicit INTEGER → boolean decode test for notify_group.
// Without this, a mis-decoded raw integer `1` would pass ≠ false assertions
// while `if (!m.notifyGroup)` in Task 3 would evaluate incorrectly on `0`.
describe('notify_group decoding (SQLite INTEGER → TS boolean)', () => {
  it('decodeMember converts raw notify_group integer to strict boolean', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'NTF001' });
    addMember(db, g.id, USER_B);

    // Direct DB flip: one row to 0, one to 1
    db.prepare('UPDATE group_members SET notify_group = 0 WHERE user_id = ?').run(USER_A);
    db.prepare('UPDATE group_members SET notify_group = 1 WHERE user_id = ?').run(USER_B);

    const members = getMembersOfGroup(db, g.id);
    const owner = members.find((m) => m.userId === USER_A);
    const other = members.find((m) => m.userId === USER_B);
    assert.ok(owner && other);

    // Strict: must be boolean primitives, not numbers
    assert.equal(owner.notifyGroup, false);
    assert.equal(other.notifyGroup, true);
    assert.equal(typeof owner.notifyGroup, 'boolean');
    assert.equal(typeof other.notifyGroup, 'boolean');

    // And the truthiness flip that Task 3 will rely on works correctly
    assert.equal(!owner.notifyGroup, true);
    assert.equal(!other.notifyGroup, false);
  });

  it('default notify_group is true for newly added members', () => {
    const g = createGroup(db, { name: 'x', ownerId: USER_A, inviteCode: 'NTF002' });
    addMember(db, g.id, USER_B);
    const members = getMembersOfGroup(db, g.id);
    for (const m of members) {
      assert.equal(m.notifyGroup, true);
    }
  });
});

describe('listAllGroupsWithStats', () => {
  it('returns empty list when no groups', () => {
    assert.deepEqual(listAllGroupsWithStats(db), []);
  });

  it('returns each group with its member count', () => {
    const g1 = createGroup(db, { name: 'solo', ownerId: USER_A, inviteCode: 'LST001' });
    const g2 = createGroup(db, { name: 'duo',  ownerId: USER_B, inviteCode: 'LST002' });
    addMember(db, g2.id, USER_C);

    const stats = listAllGroupsWithStats(db);
    assert.equal(stats.length, 2);
    const byId = new Map(stats.map((s) => [s.id, s.memberCount]));
    assert.equal(byId.get(g1.id), 1); // just owner
    assert.equal(byId.get(g2.id), 2); // owner + USER_C
  });
});
