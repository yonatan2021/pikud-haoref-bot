import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  createStory,
  getPendingStories,
  getStoriesByStatus,
  getStoryById,
  lockForApproval,
  publishStory,
  rejectStory,
  countStoriesByUserSince,
  getCountsByStatus,
} from '../db/shelterStoryRepository.js';

let db: Database.Database;

before(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  // Insert a test user to satisfy the FK constraint
  db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1001);
  db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1002);
});

describe('shelterStoryRepository', () => {
  it('createStory inserts with status=pending', () => {
    const story = createStory(db, 1001, 'היה פה קצת עצבני אבל בסדר');
    assert.equal(story.status, 'pending');
    assert.equal(story.chatId, 1001);
    assert.equal(story.body, 'היה פה קצת עצבני אבל בסדר');
    assert.equal(story.publishedMessageId, null);
    assert.ok(story.id > 0);
  });

  it('createStory accepts body of any length (app layer enforces limit)', () => {
    const longBody = 'א'.repeat(300);
    const story = createStory(db, 1001, longBody);
    assert.equal(story.body, longBody);
  });

  it('lockForApproval returns true and sets status=approved for pending story', () => {
    const story = createStory(db, 1001, 'חוויה מהמקלט');
    const locked = lockForApproval(db, story.id);
    assert.equal(locked, true);
    const updated = getStoryById(db, story.id);
    assert.ok(updated !== null);
    assert.equal(updated!.status, 'approved');
  });

  it('lockForApproval returns false for already-processed story', () => {
    const story = createStory(db, 1001, 'סיפור כפול');
    lockForApproval(db, story.id); // first lock
    const secondLock = lockForApproval(db, story.id); // second — already approved
    assert.equal(secondLock, false);
  });

  it('lockForApproval returns false for non-existent story', () => {
    const result = lockForApproval(db, 99999);
    assert.equal(result, false);
  });

  it('publishStory transitions approved→published and returns true', () => {
    const story = createStory(db, 1001, 'חוויה מהמקלט לאישור');
    lockForApproval(db, story.id); // lock first (as the route does)
    const result = publishStory(db, story.id, 'admin', 9999);
    assert.equal(result, true);
    const updated = getStoryById(db, story.id);
    assert.ok(updated !== null);
    assert.equal(updated!.status, 'published');
    assert.equal(updated!.publishedMessageId, 9999);
    assert.equal(updated!.reviewedBy, 'admin');
    assert.ok(updated!.reviewedAt !== null);
  });

  it('publishStory returns false for non-approved story', () => {
    const story = createStory(db, 1001, 'סיפור בהמתנה');
    // skip lockForApproval — story is still 'pending'
    const result = publishStory(db, story.id, 'admin', 1234);
    assert.equal(result, false);
    const updated = getStoryById(db, story.id);
    assert.equal(updated!.status, 'pending');
  });

  it('rejectStory returns true and sets status=rejected for pending story', () => {
    const story = createStory(db, 1002, 'סיפור שייך לדחייה');
    const result = rejectStory(db, story.id, 'admin');
    assert.equal(result, true);
    const updated = getStoryById(db, story.id);
    assert.ok(updated !== null);
    assert.equal(updated!.status, 'rejected');
    assert.equal(updated!.reviewedBy, 'admin');
    assert.ok(updated!.reviewedAt !== null);
  });

  it('rejectStory returns false for already-processed story', () => {
    const story = createStory(db, 1002, 'סיפור שנדחה כבר');
    rejectStory(db, story.id, 'admin'); // first rejection
    const secondReject = rejectStory(db, story.id, 'admin'); // already rejected
    assert.equal(secondReject, false);
  });

  it('getStoryById returns null for non-existent id', () => {
    const result = getStoryById(db, 99999);
    assert.equal(result, null);
  });

  it('getStoriesByStatus returns camelCase rows for non-pending statuses', () => {
    const testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initSchema(testDb);
    testDb.prepare('INSERT INTO users (chat_id) VALUES (?)').run(3001);

    const s = createStory(testDb, 3001, 'סיפור לדחייה');
    rejectStory(testDb, s.id, 'admin');

    const rows = getStoriesByStatus(testDb, 'rejected', 10, 0);
    assert.equal(rows.length, 1);
    // verify camelCase fields (not snake_case)
    assert.ok('chatId' in rows[0], 'should have chatId (camelCase)');
    assert.ok('reviewedAt' in rows[0], 'should have reviewedAt (camelCase)');
    assert.ok(!('chat_id' in rows[0]), 'should NOT have chat_id (snake_case)');
    assert.equal(rows[0].status, 'rejected');

    testDb.close();
  });

  it('countStoriesByUserSince returns correct count', () => {
    // create 2 stories for user 1002
    createStory(db, 1002, 'סיפור ראשון');
    createStory(db, 1002, 'סיפור שני');

    // since a minute ago — should count the two just created plus any others
    const sinceIso = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19);
    const count = countStoriesByUserSince(db, 1002, sinceIso);
    assert.ok(count >= 2, `expected at least 2, got ${count}`);

    // future cutoff — should return 0
    const futureIso = new Date(Date.now() + 60_000).toISOString().replace('T', ' ').slice(0, 19);
    const zeroCount = countStoriesByUserSince(db, 1002, futureIso);
    assert.equal(zeroCount, 0);
  });

  it('getPendingStories pagination returns correct slice', () => {
    // Clear existing stories first to have known state
    db.prepare("DELETE FROM shelter_stories WHERE status = 'pending'").run();

    // Insert 5 pending stories
    for (let i = 0; i < 5; i++) {
      createStory(db, 1001, `סיפור ${i}`);
    }

    const page1 = getPendingStories(db, 3, 0);
    assert.equal(page1.length, 3);

    const page2 = getPendingStories(db, 3, 3);
    assert.equal(page2.length, 2);

    const allIds = [...page1, ...page2].map((s) => s.id);
    const unique = new Set(allIds);
    assert.equal(unique.size, 5, 'all 5 stories should be distinct');
  });

  it('getCountsByStatus returns correct counts per status', () => {
    // Use a fresh db to get deterministic counts
    const testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initSchema(testDb);
    testDb.prepare('INSERT INTO users (chat_id) VALUES (?)').run(2001);

    createStory(testDb, 2001, 'pending 1');
    createStory(testDb, 2001, 'pending 2');
    const s3 = createStory(testDb, 2001, 'to reject');
    rejectStory(testDb, s3.id, 'admin');
    const s4 = createStory(testDb, 2001, 'to approve');
    lockForApproval(testDb, s4.id);
    publishStory(testDb, s4.id, 'admin', 111);

    const counts = getCountsByStatus(testDb);
    assert.equal(counts.pending, 2);
    assert.equal(counts.rejected, 1);
    assert.equal(counts.published, 1);
    assert.equal(counts.approved, 0);

    testDb.close();
  });
});
