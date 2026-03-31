import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  insertHistory,
  getHistory,
  getHistoryById,
  pruneHistory,
} from '../db/messageTemplateHistoryRepository.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('messageTemplateHistoryRepository', () => {
  describe('insertHistory', () => {
    it('inserts a row that can be read back via getHistory', () => {
      const db = makeDb();
      insertHistory(db, {
        alert_type: 'missiles',
        emoji: '🚀',
        title_he: 'ירי רקטות',
        instructions_prefix: 'היכנסו למרחב מוגן',
      });
      const rows = getHistory(db, 'missiles');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].alert_type, 'missiles');
      assert.equal(rows[0].emoji, '🚀');
      assert.equal(rows[0].title_he, 'ירי רקטות');
      assert.equal(rows[0].instructions_prefix, 'היכנסו למרחב מוגן');
      assert.ok(typeof rows[0].id === 'number');
      assert.ok(typeof rows[0].saved_at === 'string');
    });
  });

  describe('getHistory', () => {
    it('returns empty array for unknown alert type', () => {
      const db = makeDb();
      const rows = getHistory(db, 'nonexistent_type');
      assert.deepEqual(rows, []);
    });

    it('returns at most 10 entries ordered newest first', () => {
      const db = makeDb();
      for (let i = 1; i <= 12; i++) {
        insertHistory(db, {
          alert_type: 'earthquakes',
          emoji: '🌍',
          title_he: `רעידת אדמה ${i}`,
          instructions_prefix: 'הישמרו',
        });
      }
      const rows = getHistory(db, 'earthquakes');
      assert.equal(rows.length, 10);
      // newest first — highest id first
      for (let i = 0; i < rows.length - 1; i++) {
        assert.ok(rows[i].id > rows[i + 1].id, 'rows should be ordered newest first by id');
      }
    });

    it('only returns rows for the requested alert type', () => {
      const db = makeDb();
      insertHistory(db, { alert_type: 'typeA', emoji: 'A', title_he: 'A', instructions_prefix: 'A' });
      insertHistory(db, { alert_type: 'typeB', emoji: 'B', title_he: 'B', instructions_prefix: 'B' });
      const rowsA = getHistory(db, 'typeA');
      assert.equal(rowsA.length, 1);
      assert.equal(rowsA[0].alert_type, 'typeA');
    });
  });

  describe('getHistoryById', () => {
    it('returns null for a missing id', () => {
      const db = makeDb();
      const row = getHistoryById(db, 99999);
      assert.equal(row, null);
    });

    it('returns the correct row for a valid id', () => {
      const db = makeDb();
      insertHistory(db, {
        alert_type: 'hazmat',
        emoji: '☢️',
        title_he: 'אירוע חומרים מסוכנים',
        instructions_prefix: 'הישמרו',
      });
      const rows = getHistory(db, 'hazmat');
      assert.equal(rows.length, 1);
      const fetched = getHistoryById(db, rows[0].id);
      assert.ok(fetched !== null);
      assert.equal(fetched.alert_type, 'hazmat');
      assert.equal(fetched.emoji, '☢️');
      assert.equal(fetched.id, rows[0].id);
    });
  });

  describe('pruneHistory', () => {
    it('keeps only the newest `keep` rows and removes the oldest', () => {
      const db = makeDb();
      for (let i = 1; i <= 12; i++) {
        insertHistory(db, {
          alert_type: 'drill',
          emoji: '🔵',
          title_he: `תרגיל ${i}`,
          instructions_prefix: 'תרגיל בלבד',
        });
      }

      // Before pruning, direct count from DB
      const countBefore = (db.prepare(
        "SELECT COUNT(*) as cnt FROM message_template_history WHERE alert_type = 'drill'",
      ).get() as { cnt: number }).cnt;
      assert.equal(countBefore, 12);

      pruneHistory(db, 'drill', 10);

      const remaining = getHistory(db, 'drill');
      // getHistory also limits to 10, but we verify via direct query
      const countAfter = (db.prepare(
        "SELECT COUNT(*) as cnt FROM message_template_history WHERE alert_type = 'drill'",
      ).get() as { cnt: number }).cnt;
      assert.equal(countAfter, 10);

      // The oldest two rows (ids 1 and 2, i.e. smallest ids) should be gone
      const allRows = db
        .prepare(
          "SELECT * FROM message_template_history WHERE alert_type = 'drill' ORDER BY id ASC",
        )
        .all() as Array<{ id: number; title_he: string }>;
      assert.equal(allRows.length, 10);
      // The oldest 2 should be missing — titles "תרגיל 1" and "תרגיל 2"
      const titles = allRows.map((r) => r.title_he);
      assert.ok(!titles.includes('תרגיל 1'), 'oldest row should have been pruned');
      assert.ok(!titles.includes('תרגיל 2'), 'second oldest row should have been pruned');
      assert.ok(titles.includes('תרגיל 12'), 'newest row should be retained');
    });

    it('prunes nothing when row count is within keep limit', () => {
      const db = makeDb();
      for (let i = 1; i <= 5; i++) {
        insertHistory(db, {
          alert_type: 'tsunami',
          emoji: '🌊',
          title_he: `צונאמי ${i}`,
          instructions_prefix: 'פנו',
        });
      }
      pruneHistory(db, 'tsunami', 10);
      const countAfter = (db.prepare(
        "SELECT COUNT(*) as cnt FROM message_template_history WHERE alert_type = 'tsunami'",
      ).get() as { cnt: number }).cnt;
      assert.equal(countAfter, 5);
    });

    it('uses default keep of 10 when not specified', () => {
      const db = makeDb();
      for (let i = 1; i <= 15; i++) {
        insertHistory(db, {
          alert_type: 'security',
          emoji: '🔴',
          title_he: `ביטחוני ${i}`,
          instructions_prefix: 'היכנסו',
        });
      }
      pruneHistory(db, 'security');
      const countAfter = (db.prepare(
        "SELECT COUNT(*) as cnt FROM message_template_history WHERE alert_type = 'security'",
      ).get() as { cnt: number }).cnt;
      assert.equal(countAfter, 10);
    });
  });
});
