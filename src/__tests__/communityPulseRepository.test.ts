import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  createPulse,
  getPulseByFingerprint,
  insertResponse,
  getAggregate,
  getLastResponseTime,
} from '../db/communityPulseRepository.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

describe('communityPulseRepository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test('createPulse inserts row and returns it', () => {
    const fp = 'abc123';
    const row = createPulse(db, fp, 'missiles', ['תל אביב']);
    assert.equal(row.fingerprint, fp);
    assert.equal(row.alertType, 'missiles');
    assert.deepEqual(row.zones, ['תל אביב']);
    assert.ok(typeof row.id === 'number' && row.id > 0);
    assert.ok(typeof row.createdAt === 'string');
  });

  test('createPulse on duplicate fingerprint returns existing row (INSERT OR IGNORE)', () => {
    const fp = 'dup_fp';
    const first = createPulse(db, fp, 'missiles', ['תל אביב']);
    const second = createPulse(db, fp, 'missiles', ['תל אביב']);
    assert.equal(first.id, second.id, 'should return same row id on duplicate');
    const count = (db.prepare('SELECT COUNT(*) as c FROM community_pulses WHERE fingerprint = ?').get(fp) as { c: number }).c;
    assert.equal(count, 1, 'only one row should exist');
  });

  test('getPulseByFingerprint returns null for unknown fingerprint', () => {
    const result = getPulseByFingerprint(db, 'nonexistent');
    assert.equal(result, null);
  });

  test('getPulseByFingerprint returns row after creation', () => {
    createPulse(db, 'fp_known', 'missiles', ['ירושלים']);
    const result = getPulseByFingerprint(db, 'fp_known');
    assert.ok(result !== null);
    assert.equal(result.alertType, 'missiles');
    assert.deepEqual(result.zones, ['ירושלים']);
  });

  test('insertResponse INSERT OR IGNORE — second call same (pulseId, chatId) is silent no-op', () => {
    const pulse = createPulse(db, 'fp_resp', 'missiles', []);

    // First insert a user row (community_pulse_responses has no FK to users, so raw insert works)
    insertResponse(db, pulse.id, 1001, 'ok');
    insertResponse(db, pulse.id, 1001, 'scared'); // same (pulseId, chatId) — must be ignored

    const count = (db.prepare(
      'SELECT COUNT(*) as c FROM community_pulse_responses WHERE pulse_id = ? AND chat_id = ?'
    ).get(pulse.id, 1001) as { c: number }).c;
    assert.equal(count, 1, 'duplicate response should be ignored');

    // The stored answer should still be the first one
    const row = db.prepare(
      'SELECT answer FROM community_pulse_responses WHERE pulse_id = ? AND chat_id = ?'
    ).get(pulse.id, 1001) as { answer: string };
    assert.equal(row.answer, 'ok', 'first answer should be preserved');
  });

  test('getAggregate returns correct counts', () => {
    const pulse = createPulse(db, 'fp_agg', 'missiles', []);
    insertResponse(db, pulse.id, 1, 'ok');
    insertResponse(db, pulse.id, 2, 'ok');
    insertResponse(db, pulse.id, 3, 'scared');
    insertResponse(db, pulse.id, 4, 'helping');
    insertResponse(db, pulse.id, 5, 'helping');

    const agg = getAggregate(db, pulse.id);
    assert.equal(agg.total, 5);
    assert.equal(agg.ok, 2);
    assert.equal(agg.scared, 1);
    assert.equal(agg.helping, 2);
  });

  test('getAggregate returns zeros when no responses', () => {
    const pulse = createPulse(db, 'fp_empty', 'missiles', []);
    const agg = getAggregate(db, pulse.id);
    assert.equal(agg.total, 0);
    assert.equal(agg.ok, 0);
    assert.equal(agg.scared, 0);
    assert.equal(agg.helping, 0);
  });

  test('getLastResponseTime returns null when no responses for chatId', () => {
    const result = getLastResponseTime(db, 9999);
    assert.equal(result, null);
  });

  test('getLastResponseTime returns ISO string when has one response', () => {
    const pulse = createPulse(db, 'fp_lrt', 'missiles', []);
    insertResponse(db, pulse.id, 2001, 'ok');

    const result = getLastResponseTime(db, 2001);
    assert.ok(result !== null, 'should return a string');
    // ISO datetime format from SQLite: YYYY-MM-DD HH:MM:SS
    assert.ok(result.length > 0);
  });

  test('getLastResponseTime returns most recent when multiple responses across pulses', () => {
    const p1 = createPulse(db, 'fp_t1', 'missiles', []);
    const p2 = createPulse(db, 'fp_t2', 'aircraft', []);
    insertResponse(db, p1.id, 3001, 'ok');
    insertResponse(db, p2.id, 3001, 'scared');

    const result = getLastResponseTime(db, 3001);
    assert.ok(result !== null);
  });
});
