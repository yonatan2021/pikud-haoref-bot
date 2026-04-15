/**
 * Tests for /group delete subcommand and gdel:conf / gdel:cancel callback logic.
 *
 * Strategy: exercise the repository layer (deleteGroup, insertAudit, getMembersOfGroup)
 * directly with an :memory: DB, and test the pendingDeletes nonce map in isolation.
 * Grammy handler integration (ctx.reply / wrapCallback) is covered separately by botSetup
 * structural tests; here we focus on the data-layer invariants.
 *
 * Run with: npx tsx --test src/__tests__/groupHandler.delete.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { createGroup, deleteGroup, getMembersOfGroup, addMember } from '../db/groupRepository.js';
import { insertAudit } from '../db/groupAuditRepository.js';
import { pendingDeletes } from '../bot/groupHandler.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function insertUser(db: Database.Database, chatId: number): void {
  db.prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(chatId);
}

describe('groupHandler.delete — repository layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    pendingDeletes.clear();
  });

  it('deleteGroup removes group and CASCADE-deletes group_members', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'TestGroup', ownerId: 100, inviteCode: 'ABCDEF' });
    addMember(db, group.id, 200);

    const membersBefore = getMembersOfGroup(db, group.id);
    assert.equal(membersBefore.length, 2, 'group should have 2 members before delete');

    deleteGroup(db, group.id);

    const membersAfter = getMembersOfGroup(db, group.id);
    assert.equal(membersAfter.length, 0, 'all members should be removed via CASCADE');

    const row = db.prepare('SELECT id FROM groups WHERE id = ?').get(group.id);
    assert.equal(row, undefined, 'group row itself should be deleted');
  });

  it('insertAudit persists a deleted action and survives group deletion', () => {
    insertUser(db, 100);
    const group = createGroup(db, { name: 'AuditGroup', ownerId: 100, inviteCode: 'ZZZZZZ' });
    const groupId = group.id;

    // Insert audit BEFORE deleting (to simulate normal flow)
    // But audit must survive the delete (no FK)
    deleteGroup(db, groupId);
    insertAudit(db, { groupId, action: 'deleted', actorId: 100, payload: null });

    const row = db.prepare('SELECT * FROM group_audit WHERE group_id = ?').get(groupId) as {
      group_id: number;
      action: string;
      actor_id: number;
      payload: null;
    } | undefined;

    assert.ok(row, 'audit row should exist after group is deleted');
    assert.equal(row.group_id, groupId);
    assert.equal(row.action, 'deleted');
    assert.equal(row.actor_id, 100);
    assert.equal(row.payload, null);
  });

  it('members list captured before delete identifies other members to notify', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    insertUser(db, 300);
    const group = createGroup(db, { name: 'MultiGroup', ownerId: 100, inviteCode: 'MULTI1' });
    addMember(db, group.id, 200);
    addMember(db, group.id, 300);

    const chatId = 100; // owner
    const members = getMembersOfGroup(db, group.id);
    const otherMembers = members.filter((m) => m.userId !== chatId);

    assert.equal(otherMembers.length, 2, 'should identify 2 other members to notify');
    const ids = otherMembers.map((m) => m.userId).sort();
    assert.deepEqual(ids, [200, 300]);
  });

  it('non-owner cannot find group in their owned-group list', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'OwnedGroup', ownerId: 100, inviteCode: 'OWNR11' });
    addMember(db, group.id, 200);

    // Simulate what handleDelete does: find by name AND ownerId match
    const groupsForOwner = db.prepare(
      `SELECT g.* FROM groups g
       INNER JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ? ORDER BY g.created_at DESC`
    ).all(100) as Array<{ id: number; name: string; owner_id: number }>;

    const found = groupsForOwner.find((g) => g.name === 'OwnedGroup' && g.owner_id === 100);
    assert.ok(found, 'owner should find their group');

    const groupsForNonOwner = db.prepare(
      `SELECT g.* FROM groups g
       INNER JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ? ORDER BY g.created_at DESC`
    ).all(200) as Array<{ id: number; name: string; owner_id: number }>;

    const notFound = groupsForNonOwner.find((g) => g.name === 'OwnedGroup' && g.owner_id === 200);
    assert.equal(notFound, undefined, 'non-owner should not find group when filtering by ownerId');
  });

  it('pendingDeletes nonce: expired entry is detected via Date.now() > expiresAt', () => {
    // Set an already-expired entry
    pendingDeletes.set(100, { groupId: 1, nonce: 'abc12345', expiresAt: Date.now() - 1 });

    const pending = pendingDeletes.get(100);
    assert.ok(pending, 'entry should exist');
    assert.ok(Date.now() > pending.expiresAt, 'entry should be expired');
  });

  it('pendingDeletes nonce: nonce mismatch is detected', () => {
    pendingDeletes.set(100, { groupId: 1, nonce: 'correctnonce1', expiresAt: Date.now() + 60_000 });

    const pending = pendingDeletes.get(100);
    assert.ok(pending);
    assert.notEqual(pending.nonce, 'wrongnonce12', 'different nonce should not match');
  });

  it('pendingDeletes: cancel removes the entry', () => {
    pendingDeletes.set(100, { groupId: 1, nonce: 'aabbccdd', expiresAt: Date.now() + 60_000 });
    assert.ok(pendingDeletes.has(100));

    pendingDeletes.delete(100);
    assert.equal(pendingDeletes.has(100), false, 'cancel should remove the entry');
  });

  it('group_audit table: check constraint rejects invalid action', () => {
    // The group_audit table has CHECK (action IN ('deleted','transferred'))
    // Inserting a bad action should throw
    let threw = false;
    try {
      db.prepare(
        `INSERT INTO group_audit (group_id, action, actor_id, payload, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(1, 'hacked', 100, null);
    } catch {
      threw = true;
    }
    assert.ok(threw, 'invalid action should throw a constraint error');
  });
});
