import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  insertPrompt,
  updatePromptMessageId,
  markResponded,
  getPromptByPrefix,
  recordEvent,
  getAggregate,
} from '../db/neighborCheckRepository.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  // Seed a user row so FK constraints pass
  db.prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(999);
  return db;
}

describe('neighborCheckRepository', () => {
  describe('insertPrompt', () => {
    it('inserts a new prompt row', () => {
      const db = makeDb();
      insertPrompt(db, 999, 'abcdef1234567890abcdef1234567890abcdef12', undefined);
      const row = db
        .prepare('SELECT * FROM neighbor_check_prompts WHERE chat_id = 999')
        .get() as { chat_id: number; fingerprint: string; responded: number; message_id: number | null } | undefined;
      assert.ok(row, 'row should exist');
      assert.equal(row!.chat_id, 999);
      assert.equal(row!.responded, 0);
      assert.equal(row!.message_id, null);
    });

    it('INSERT OR IGNORE — duplicate does not throw', () => {
      const db = makeDb();
      const fp = 'abcdef1234567890abcdef1234567890abcdef12';
      insertPrompt(db, 999, fp, undefined);
      assert.doesNotThrow(() => insertPrompt(db, 999, fp, undefined));
    });

    it('stores messageId when provided', () => {
      const db = makeDb();
      insertPrompt(db, 999, 'fp_with_msgid_xxxxxxxxxxxxxxxxxxxxxxxxxxx', 42);
      const row = db
        .prepare('SELECT message_id FROM neighbor_check_prompts WHERE chat_id = 999 AND fingerprint = ?')
        .get('fp_with_msgid_xxxxxxxxxxxxxxxxxxxxxxxxxxx') as { message_id: number | null } | undefined;
      assert.equal(row?.message_id, 42);
    });
  });

  describe('updatePromptMessageId', () => {
    it('sets message_id on an existing row', () => {
      const db = makeDb();
      const fp = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      insertPrompt(db, 999, fp, undefined);
      updatePromptMessageId(db, 999, fp, 77);
      const row = db
        .prepare('SELECT message_id FROM neighbor_check_prompts WHERE chat_id = 999 AND fingerprint = ?')
        .get(fp) as { message_id: number | null } | undefined;
      assert.equal(row?.message_id, 77);
    });
  });

  describe('markResponded', () => {
    it('sets responded = 1', () => {
      const db = makeDb();
      const fp = 'cccccccccccccccccccccccccccccccccccccccc';
      insertPrompt(db, 999, fp);
      markResponded(db, 999, fp);
      const row = db
        .prepare('SELECT responded FROM neighbor_check_prompts WHERE chat_id = 999 AND fingerprint = ?')
        .get(fp) as { responded: number } | undefined;
      assert.equal(row?.responded, 1);
    });
  });

  describe('getPromptByPrefix', () => {
    it('finds row by 8-char prefix', () => {
      const db = makeDb();
      const fp = 'deadbeef11111111111111111111111111111111';
      insertPrompt(db, 999, fp);
      const row = getPromptByPrefix(db, 999, 'deadbeef');
      assert.ok(row, 'should find row');
      assert.equal(row!.fingerprint, fp);
      assert.equal(row!.responded, false);
    });

    it('returns null when no match', () => {
      const db = makeDb();
      const result = getPromptByPrefix(db, 999, 'xxxxxxxx');
      assert.equal(result, null);
    });
  });

  describe('recordEvent', () => {
    it('inserts event without chat_id', () => {
      const db = makeDb();
      recordEvent(db, 'fp123', 'checked', null);
      const row = db
        .prepare('SELECT * FROM neighbor_check_events WHERE alert_fp = ?')
        .get('fp123') as { alert_fp: string; response: string; city: string | null } | undefined;
      assert.ok(row, 'row should exist');
      assert.equal(row!.response, 'checked');
      assert.equal(row!.city, null);

      // Verify no chat_id column exists in the row
      assert.ok(!('chat_id' in (row as object)), 'event row must not have chat_id');
    });

    it('accepts city value', () => {
      const db = makeDb();
      recordEvent(db, 'fp456', 'unable', 'תל אביב');
      const row = db
        .prepare('SELECT city FROM neighbor_check_events WHERE alert_fp = ?')
        .get('fp456') as { city: string | null } | undefined;
      assert.equal(row?.city, 'תל אביב');
    });
  });

  describe('getAggregate', () => {
    it('returns correct counts by response type', () => {
      const db = makeDb();
      recordEvent(db, 'fp_a', 'checked', null);
      recordEvent(db, 'fp_b', 'checked', null);
      recordEvent(db, 'fp_c', 'unable', null);
      recordEvent(db, 'fp_d', 'dismissed', null);
      recordEvent(db, 'fp_e', 'dismissed', null);
      recordEvent(db, 'fp_f', 'dismissed', null);

      const agg = getAggregate(db, '2000-01-01');
      assert.equal(agg.checked, 2);
      assert.equal(agg.unable, 1);
      assert.equal(agg.dismissed, 3);
      assert.equal(agg.total, 6);
    });

    it('returns zeros when no events in range', () => {
      const db = makeDb();
      recordEvent(db, 'fp_old', 'checked', null);
      // Use a far-future cutoff to exclude all events
      const agg = getAggregate(db, '2999-12-31');
      assert.equal(agg.total, 0);
    });
  });
});
