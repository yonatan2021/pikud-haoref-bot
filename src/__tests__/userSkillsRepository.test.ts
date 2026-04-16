import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  listSkillsForUser,
  upsertSkill,
  removeSkill,
  findUsersWithSkill,
} from '../db/userSkillsRepository.js';

function createMemDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function seedUser(db: Database.Database, chatId: number, displayName?: string, homeCity?: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO users (chat_id, display_name, home_city, onboarding_completed)
     VALUES (?, ?, ?, 1)`
  ).run(chatId, displayName ?? undefined, homeCity ?? undefined);
}

describe('userSkillsRepository', () => {
  let db: Database.Database;

  before(() => {
    db = createMemDb();
    // Seed users for tests
    seedUser(db, 1001, 'Alice', 'תל אביב');
    seedUser(db, 1002, 'Bob', 'ירושלים');
    seedUser(db, 1003, 'Carol', undefined);
  });

  it('listSkillsForUser returns empty array initially', () => {
    const skills = listSkillsForUser(db, 1001);
    assert.deepEqual(skills, []);
  });

  it('upsertSkill inserts and returns row', () => {
    const row = upsertSkill(db, 1001, 'first_aid', 'contacts', null);
    assert.equal(row.chatId, 1001);
    assert.equal(row.skillKey, 'first_aid');
    assert.equal(row.visibility, 'contacts');
    assert.equal(row.note, null);
    assert.ok(typeof row.createdAt === 'string');
  });

  it('listSkillsForUser returns inserted skill', () => {
    const skills = listSkillsForUser(db, 1001);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].skillKey, 'first_aid');
  });

  it('upsertSkill updates existing row (visibility change)', () => {
    const row = upsertSkill(db, 1001, 'first_aid', 'public', 'experienced medic');
    assert.equal(row.visibility, 'public');
    assert.equal(row.note, 'experienced medic');

    const skills = listSkillsForUser(db, 1001);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].visibility, 'public');
    assert.equal(skills[0].note, 'experienced medic');
  });

  it('removeSkill returns true and removes row', () => {
    upsertSkill(db, 1002, 'shelter_host', 'contacts', null);
    const removed = removeSkill(db, 1002, 'shelter_host');
    assert.equal(removed, true);
    const skills = listSkillsForUser(db, 1002);
    assert.equal(skills.length, 0);
  });

  it('removeSkill returns false for non-existent skill', () => {
    const removed = removeSkill(db, 1002, 'nonexistent_skill');
    assert.equal(removed, false);
  });

  it('findUsersWithSkill shows public skills to anyone', () => {
    // 1001 already has first_aid = public (from previous test)
    // viewer 1002, no contacts with 1001
    const results = findUsersWithSkill(db, 'first_aid', 1002, [], 10, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].displayName, 'Alice');
    assert.equal(results[0].homeCity, 'תל אביב');
  });

  it('findUsersWithSkill hides private skills', () => {
    upsertSkill(db, 1003, 'first_aid', 'private', null);
    const results = findUsersWithSkill(db, 'first_aid', 1002, [1003], 10, 0);
    // Carol has private visibility — should NOT appear
    const carols = results.filter((r) => r.displayName === 'Carol');
    assert.equal(carols.length, 0);
  });

  it('findUsersWithSkill shows contacts-visibility only if in contactIds', () => {
    upsertSkill(db, 1003, 'psych_support', 'contacts', null);
    // 1002 is NOT in contactIds → should not see Carol
    const resultsNoContact = findUsersWithSkill(db, 'psych_support', 1002, [], 10, 0);
    assert.equal(resultsNoContact.length, 0);

    // 1002 IS in contactIds → should see Carol
    const resultsWithContact = findUsersWithSkill(db, 'psych_support', 1002, [1003], 10, 0);
    assert.equal(resultsWithContact.length, 1);
    assert.equal(resultsWithContact[0].displayName, 'Carol');
  });

  it('findUsersWithSkill filters orphan skills (inactive catalog entry)', () => {
    // Deactivate first_aid in the catalog
    db.prepare(`UPDATE skill_catalog SET is_active = 0 WHERE key = 'first_aid'`).run();
    const results = findUsersWithSkill(db, 'first_aid', 1002, [1001], 10, 0);
    // Should return 0 because catalog entry is inactive
    assert.equal(results.length, 0);
    // Restore for other tests
    db.prepare(`UPDATE skill_catalog SET is_active = 1 WHERE key = 'first_aid'`).run();
  });

  it('findUsersWithSkill applies LIMIT/OFFSET pagination', () => {
    // Seed extra users and give them psych_support (public) to test pagination
    for (let i = 2000; i < 2010; i++) {
      seedUser(db, i, `User_${i}`, undefined);
      upsertSkill(db, i, 'psych_support', 'public', null);
    }

    const page0 = findUsersWithSkill(db, 'psych_support', 9999, [], 5, 0);
    const page1 = findUsersWithSkill(db, 'psych_support', 9999, [], 5, 5);

    assert.equal(page0.length, 5);
    assert.equal(page1.length, 5);
    // Pages must not overlap
    const names0 = new Set(page0.map((r) => r.displayName));
    const names1 = new Set(page1.map((r) => r.displayName));
    for (const name of names1) {
      assert.ok(!names0.has(name), `Name ${name} appeared in both pages`);
    }
  });
});
