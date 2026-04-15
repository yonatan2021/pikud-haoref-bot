import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  listActiveSkills,
  listAllSkills,
  getSkillByKey,
  upsertSkill,
  deactivateSkill,
  activateSkill,
  getUsageCount,
} from '../db/skillCatalogRepository.js';

describe('skillCatalogRepository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  // 1. listActiveSkills returns only is_active=1 rows, ordered by sort_order
  test('listActiveSkills returns only active rows ordered by sort_order', () => {
    // Seed rows with non-sequential sort_order to verify ordering
    upsertSkill(db, { key: 'z_skill', labelHe: 'אחרון', description: null, isActive: true, sortOrder: 99 });
    upsertSkill(db, { key: 'a_skill', labelHe: 'ראשון', description: null, isActive: true, sortOrder: 0 });
    upsertSkill(db, { key: 'inactive_skill', labelHe: 'לא פעיל', description: null, isActive: false, sortOrder: 1 });

    const rows = listActiveSkills(db);
    // inactive_skill must be excluded
    assert.ok(!rows.some((r) => r.key === 'inactive_skill'), 'inactive skill must be excluded');
    // Verify ordering: a_skill (0) < z_skill (99)
    const keys = rows.map((r) => r.key);
    const idxA = keys.indexOf('a_skill');
    const idxZ = keys.indexOf('z_skill');
    assert.ok(idxA < idxZ, 'sort_order=0 must come before sort_order=99');
  });

  // 2. upsertSkill creates a new row
  test('upsertSkill creates a new row', () => {
    upsertSkill(db, { key: 'test_skill', labelHe: 'בדיקה', description: 'תיאור', isActive: true, sortOrder: 10 });
    const row = getSkillByKey(db, 'test_skill');
    assert.ok(row !== null, 'row should be found after insert');
    assert.equal(row!.key, 'test_skill');
    assert.equal(row!.labelHe, 'בדיקה');
    assert.equal(row!.description, 'תיאור');
    assert.equal(row!.isActive, true);
    assert.equal(row!.sortOrder, 10);
  });

  // 3. upsertSkill updates existing row — created_at unchanged, updated_at changes
  test('upsertSkill updates existing row without touching created_at', (_, done) => {
    upsertSkill(db, { key: 'update_me', labelHe: 'לפני', description: null, isActive: true, sortOrder: 1 });
    const before = getSkillByKey(db, 'update_me')!;
    assert.ok(before, 'row must exist after first upsert');

    // SQLite datetime() has 1-second resolution — wait 1100ms before second upsert
    // so updated_at is guaranteed to differ
    setTimeout(() => {
      upsertSkill(db, { key: 'update_me', labelHe: 'אחרי', description: 'חדש', isActive: false, sortOrder: 2 });
      const after = getSkillByKey(db, 'update_me')!;

      assert.equal(after.labelHe, 'אחרי', 'labelHe must be updated');
      assert.equal(after.description, 'חדש', 'description must be updated');
      assert.equal(after.isActive, false, 'isActive must be updated');
      assert.equal(after.sortOrder, 2, 'sortOrder must be updated');
      assert.equal(after.createdAt, before.createdAt, 'createdAt must not change on update');
      assert.notEqual(after.updatedAt, before.updatedAt, 'updatedAt must change on update');

      done!();
    }, 1100);
  });

  // 4. upsertSkill rejects invalid keys
  test('upsertSkill throws on invalid key format', () => {
    assert.throws(
      () => upsertSkill(db, { key: 'UPPER_CASE', labelHe: 'bad', description: null, isActive: true, sortOrder: 0 }),
      /Invalid skill key format/
    );
    assert.throws(
      () => upsertSkill(db, { key: 'has space', labelHe: 'bad', description: null, isActive: true, sortOrder: 0 }),
      /Invalid skill key format/
    );
    assert.throws(
      () => upsertSkill(db, { key: '', labelHe: 'bad', description: null, isActive: true, sortOrder: 0 }),
      /Invalid skill key format/
    );
    assert.throws(
      () => upsertSkill(db, { key: 'a'.repeat(33), labelHe: 'bad', description: null, isActive: true, sortOrder: 0 }),
      /Invalid skill key format/
    );
  });

  // 5. deactivateSkill sets is_active=0; listActiveSkills excludes it
  test('deactivateSkill excludes skill from listActiveSkills', () => {
    upsertSkill(db, { key: 'to_deactivate', labelHe: 'כן', description: null, isActive: true, sortOrder: 1 });
    deactivateSkill(db, 'to_deactivate');

    const row = getSkillByKey(db, 'to_deactivate')!;
    assert.equal(row.isActive, false, 'isActive must be false after deactivation');

    const active = listActiveSkills(db);
    assert.ok(!active.some((r) => r.key === 'to_deactivate'), 'deactivated skill must not appear in listActiveSkills');
  });

  // 6. activateSkill restores is_active=1
  test('activateSkill restores is_active to true', () => {
    upsertSkill(db, { key: 'restore_me', labelHe: 'לשחזר', description: null, isActive: false, sortOrder: 1 });
    activateSkill(db, 'restore_me');

    const row = getSkillByKey(db, 'restore_me')!;
    assert.equal(row.isActive, true, 'isActive must be true after activation');

    const active = listActiveSkills(db);
    assert.ok(active.some((r) => r.key === 'restore_me'), 'activated skill must appear in listActiveSkills');
  });

  // 7. getSkillByKey returns null for unknown key
  test('getSkillByKey returns null for missing key', () => {
    const result = getSkillByKey(db, 'does_not_exist');
    assert.equal(result, null);
  });

  // 8. getUsageCount returns 0 when user_skills table doesn't exist
  test('getUsageCount returns 0 when user_skills table is absent', () => {
    upsertSkill(db, { key: 'no_users', labelHe: 'לא בשימוש', description: null, isActive: true, sortOrder: 1 });
    const count = getUsageCount(db, 'no_users');
    assert.equal(count, 0);
  });

  // 9. listAllSkills includes usage_count=0 for skills with no user_skills rows
  test('listAllSkills includes usage_count=0 for skills with no user_skills rows', () => {
    upsertSkill(db, { key: 'unused_skill', labelHe: 'לא נמצא', description: null, isActive: true, sortOrder: 1 });
    const rows = listAllSkills(db);
    const found = rows.find((r) => r.key === 'unused_skill');
    assert.ok(found, 'skill must appear in listAllSkills');
    assert.equal(found!.usageCount, 0, 'usageCount must be 0 when user_skills is absent');
  });

  // 10. listAllSkills usage_count JOIN path — skill used by one user
  test('listAllSkills returns usage_count=1 when user_skills has a matching row', () => {
    // Create user_skills table (mirrors the real schema)
    const createUserSkills = `
      CREATE TABLE IF NOT EXISTS user_skills (
        chat_id   INTEGER NOT NULL,
        skill_key TEXT NOT NULL,
        PRIMARY KEY (chat_id, skill_key)
      );
    `;
    db.prepare(createUserSkills).run();

    // Insert one usage row for first_aid (seeded by initSchema)
    db.prepare('INSERT OR IGNORE INTO user_skills (chat_id, skill_key) VALUES (?, ?)').run(1001, 'first_aid');

    const rows = listAllSkills(db);

    const firstAid = rows.find((r) => r.key === 'first_aid');
    assert.ok(firstAid, 'first_aid must appear in listAllSkills');
    assert.equal(firstAid!.usageCount, 1, 'first_aid usageCount must be 1');

    const shelterHost = rows.find((r) => r.key === 'shelter_host');
    assert.ok(shelterHost, 'shelter_host must appear in listAllSkills');
    assert.equal(shelterHost!.usageCount, 0, 'shelter_host usageCount must be 0 (no rows in user_skills)');
  });

  // Bonus: boolean columns are decoded as boolean, not number
  test('boolean columns are decoded as TypeScript boolean, not number', () => {
    upsertSkill(db, { key: 'bool_test', labelHe: 'בוליאני', description: null, isActive: true, sortOrder: 1 });
    const row = getSkillByKey(db, 'bool_test')!;
    assert.equal(typeof row.isActive, 'boolean', 'isActive must be boolean type');
    assert.equal(row.isActive, true);
  });

  // Idempotency: running initSchema twice must not throw
  test('migration is idempotent — re-running initSchema does not throw', () => {
    initSchema(db);
    initSchema(db);
    assert.ok(true, 'no error thrown');
  });

  // Seed data is loaded by initSchema
  test('initSchema seeds the default skills', () => {
    const rows = listActiveSkills(db);
    const keys = rows.map((r) => r.key);
    assert.ok(keys.includes('first_aid'), 'first_aid must be seeded');
    assert.ok(keys.includes('shelter_host'), 'shelter_host must be seeded');
    assert.ok(keys.includes('psych_support'), 'psych_support must be seeded');
    assert.ok(keys.includes('ride_share'), 'ride_share must be seeded');
    assert.ok(keys.includes('water_food'), 'water_food must be seeded');
  });

  // Seeded skills have correct labels
  test('seeded first_aid skill has correct Hebrew label', () => {
    const row = getSkillByKey(db, 'first_aid');
    assert.ok(row !== null);
    assert.equal(row!.labelHe, 'עזרה ראשונה');
    assert.equal(row!.isActive, true);
  });
});
