/**
 * Tests for /group transfer subcommand logic.
 *
 * Strategy: exercise transferOwnership and insertAudit directly with an :memory: DB.
 * Validates the TOCTOU guard, membership check, and audit payload.
 *
 * Run with: npx tsx --test src/__tests__/groupHandler.transfer.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  createGroup,
  addMember,
  getMembersOfGroup,
  findGroupById,
  transferOwnership,
} from '../db/groupRepository.js';
import { insertAudit } from '../db/groupAuditRepository.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function insertUser(db: Database.Database, chatId: number): void {
  db.prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(chatId);
}

describe('groupHandler.transfer — repository layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('transferOwnership: owner successfully transfers to a member', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'FamilyGroup', ownerId: 100, inviteCode: 'FAMIL1' });
    addMember(db, group.id, 200);

    const result = transferOwnership(db, group.id, 100, 200);
    assert.equal(result, true, 'transferOwnership should return true on success');

    const updated = findGroupById(db, group.id);
    assert.ok(updated, 'group should still exist after transfer');
    assert.equal(updated.ownerId, 200, 'ownerId should be updated to new owner');
  });

  it('transferOwnership: returns false when fromOwnerId does not match current owner (TOCTOU guard)', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'TOCTOUGroup', ownerId: 100, inviteCode: 'TOCTOU' });
    addMember(db, group.id, 200);

    // Simulate TOCTOU: pass wrong fromOwnerId
    const result = transferOwnership(db, group.id, 999, 200);
    assert.equal(result, false, 'should return false when fromOwnerId does not match');

    // Ownership should be unchanged
    const group2 = findGroupById(db, group.id);
    assert.equal(group2?.ownerId, 100, 'owner should not have changed');
  });

  it('transferOwnership: returns false when target is not a member', () => {
    insertUser(db, 100);
    insertUser(db, 300);
    const group = createGroup(db, { name: 'MemberlessGroup', ownerId: 100, inviteCode: 'NONMBR' });
    // 300 is NOT a member

    const result = transferOwnership(db, group.id, 100, 300);
    assert.equal(result, false, 'should return false when target is not a member');

    const group2 = findGroupById(db, group.id);
    assert.equal(group2?.ownerId, 100, 'owner should not have changed');
  });

  it('insertAudit: transferred action stores actorId and payload correctly', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'AuditTransfer', ownerId: 100, inviteCode: 'AUDT12' });
    addMember(db, group.id, 200);

    transferOwnership(db, group.id, 100, 200);
    insertAudit(db, {
      groupId: group.id,
      action: 'transferred',
      actorId: 100,
      payload: JSON.stringify({ to: 200 }),
    });

    const row = db.prepare('SELECT * FROM group_audit WHERE group_id = ?').get(group.id) as {
      group_id: number;
      action: string;
      actor_id: number;
      payload: string;
    } | undefined;

    assert.ok(row, 'audit row should exist');
    assert.equal(row.action, 'transferred');
    assert.equal(row.actor_id, 100);

    const payload = JSON.parse(row.payload) as { to: number };
    assert.equal(payload.to, 200, 'payload.to should be the new owner chatId');
  });

  it('membership check: target not in members list means transfer is rejected at handler level', () => {
    insertUser(db, 100);
    insertUser(db, 400);
    const group = createGroup(db, { name: 'NonMemberGroup', ownerId: 100, inviteCode: 'NMEMB1' });
    // 400 is NOT added as a member

    const members = getMembersOfGroup(db, group.id);
    const targetIseMember = members.some((m) => m.userId === 400);
    assert.equal(targetIseMember, false, 'target should not be a member');

    // Handler would reject here — verify by calling transferOwnership which also verifies
    const result = transferOwnership(db, group.id, 100, 400);
    assert.equal(result, false, 'transferOwnership should reject non-member target');
  });

  it('transferOwnership: group not found returns false', () => {
    insertUser(db, 100);
    // No group created with id 9999
    const result = transferOwnership(db, 9999, 100, 200);
    assert.equal(result, false, 'should return false for non-existent group');
  });

  it('after transfer, old owner is still a member (not removed)', () => {
    insertUser(db, 100);
    insertUser(db, 200);
    const group = createGroup(db, { name: 'StayGroup', ownerId: 100, inviteCode: 'STAY12' });
    addMember(db, group.id, 200);

    transferOwnership(db, group.id, 100, 200);

    const members = getMembersOfGroup(db, group.id);
    const oldOwnerStillMember = members.some((m) => m.userId === 100);
    assert.equal(oldOwnerStillMember, true, 'old owner should still be a member after transfer');
  });
});
