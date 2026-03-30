import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  getAllGroups,
  upsertGroup,
  getEnabledGroupsForAlertType,
  deleteGroup,
} from '../db/whatsappGroupRepository.js';

describe('whatsappGroupRepository', () => {
  function makeDb() {
    const db = new Database(':memory:');
    initSchema(db);
    return db;
  }

  test('getAllGroups returns empty array when no rows', () => {
    const db = makeDb();
    const groups = getAllGroups(db);
    assert.deepEqual(groups, []);
  });

  test('upsertGroup inserts a new group with correct decoded values', () => {
    const db = makeDb();
    upsertGroup(db, 'group-1', 'Test Group', true, ['missiles', 'earthQuake']);
    const groups = getAllGroups(db);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].groupId, 'group-1');
    assert.equal(groups[0].name, 'Test Group');
    assert.equal(groups[0].enabled, true);
    assert.deepEqual(groups[0].alertTypes, ['missiles', 'earthQuake']);
  });

  test('upsertGroup with same groupId updates existing row (upsert semantics)', () => {
    const db = makeDb();
    upsertGroup(db, 'group-1', 'Original Name', true, ['missiles']);
    upsertGroup(db, 'group-1', 'Updated Name', false, ['earthQuake']);
    const groups = getAllGroups(db);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'Updated Name');
    assert.equal(groups[0].enabled, false);
    assert.deepEqual(groups[0].alertTypes, ['earthQuake']);
  });

  test('getEnabledGroupsForAlertType returns only enabled groups containing the type', () => {
    const db = makeDb();
    upsertGroup(db, 'group-enabled-match', 'Enabled Match', true, ['missiles', 'earthQuake']);
    upsertGroup(db, 'group-enabled-no-match', 'Enabled No Match', true, ['earthQuake']);
    upsertGroup(db, 'group-disabled-match', 'Disabled Match', false, ['missiles']);
    const result = getEnabledGroupsForAlertType(db, 'missiles');
    assert.deepEqual(result, ['group-enabled-match']);
  });

  test('getEnabledGroupsForAlertType returns empty array when no match', () => {
    const db = makeDb();
    upsertGroup(db, 'group-1', 'Some Group', true, ['earthQuake']);
    const result = getEnabledGroupsForAlertType(db, 'missiles');
    assert.deepEqual(result, []);
  });

  test('deleteGroup removes the row', () => {
    const db = makeDb();
    upsertGroup(db, 'group-1', 'To Delete', true, ['missiles']);
    deleteGroup(db, 'group-1');
    const groups = getAllGroups(db);
    assert.deepEqual(groups, []);
  });

  test('upsertGroup decodes enabled=false correctly', () => {
    const db = makeDb();
    upsertGroup(db, 'group-1', 'Test', false, []);
    const groups = getAllGroups(db);
    assert.equal(groups[0].enabled, false);
    assert.equal(typeof groups[0].enabled, 'boolean');
  });
});
