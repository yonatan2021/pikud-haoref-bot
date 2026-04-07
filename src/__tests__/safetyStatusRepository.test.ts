import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  upsertSafetyStatus,
  getSafetyStatus,
  clearSafetyStatus,
  pruneExpiredSafetyStatuses,
  getActiveStatusesForContacts,
} from '../db/safetyStatusRepository.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

describe('safetyStatusRepository — upsertSafetyStatus', () => {
  it('creates a new row on first call', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    const row = getSafetyStatus(db, 1);
    assert.ok(row, 'row should exist after upsert');
    assert.equal(row.chat_id, 1);
    assert.equal(row.status, 'ok');
  });

  it('updates status on second call', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    upsertSafetyStatus(db, 1, 'help');
    const row = getSafetyStatus(db, 1)!;
    assert.equal(row.status, 'help');
  });

  it('resets expires_at to +24h on second call (expired row becomes visible again)', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    // Manually expire the row
    db.prepare(`UPDATE safety_status SET expires_at = datetime('now', '-1 second') WHERE chat_id = 1`).run();
    assert.equal(getSafetyStatus(db, 1), null, 'should be expired before re-upsert');
    // Re-upsert should refresh expires_at
    upsertSafetyStatus(db, 1, 'dismissed');
    assert.ok(getSafetyStatus(db, 1), 'should be visible again after re-upsert');
  });
});

describe('safetyStatusRepository — getSafetyStatus', () => {
  it('returns correct row when present and not expired', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'dismissed');
    const row = getSafetyStatus(db, 1);
    assert.ok(row);
    assert.equal(row.status, 'dismissed');
    assert.ok(typeof row.updated_at === 'string');
    assert.ok(typeof row.expires_at === 'string');
  });

  it('returns null when not found', () => {
    const db = makeDb();
    assert.equal(getSafetyStatus(db, 999), null);
  });

  it('returns null when expires_at is in the past', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    db.prepare(`UPDATE safety_status SET expires_at = datetime('now', '-1 second') WHERE chat_id = 1`).run();
    assert.equal(getSafetyStatus(db, 1), null);
  });
});

describe('safetyStatusRepository — clearSafetyStatus', () => {
  it('deletes existing row', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    clearSafetyStatus(db, 1);
    assert.equal(getSafetyStatus(db, 1), null);
  });

  it('is a no-op if row does not exist (no throw)', () => {
    const db = makeDb();
    assert.doesNotThrow(() => clearSafetyStatus(db, 999));
  });
});

describe('safetyStatusRepository — pruneExpiredSafetyStatuses', () => {
  it('deletes rows with past expires_at', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(2);
    upsertSafetyStatus(db, 1, 'ok');
    upsertSafetyStatus(db, 2, 'help');
    db.prepare(`UPDATE safety_status SET expires_at = datetime('now', '-1 second') WHERE chat_id = 1`).run();
    const count = pruneExpiredSafetyStatuses(db);
    assert.equal(count, 1);
    assert.equal(getSafetyStatus(db, 1), null, 'expired row must be gone');
    assert.ok(getSafetyStatus(db, 2), 'non-expired row must survive');
  });

  it('leaves rows with future expires_at untouched', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    upsertSafetyStatus(db, 1, 'ok');
    const count = pruneExpiredSafetyStatuses(db);
    assert.equal(count, 0);
    assert.ok(getSafetyStatus(db, 1), 'non-expired row must survive');
  });

  it('returns correct count when multiple rows are pruned', () => {
    const db = makeDb();
    [1, 2, 3].forEach((id) => db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(id));
    [1, 2, 3].forEach((id) => upsertSafetyStatus(db, id, 'ok'));
    db.prepare(`UPDATE safety_status SET expires_at = datetime('now', '-1 second')`).run();
    assert.equal(pruneExpiredSafetyStatuses(db), 3);
  });
});

describe('safetyStatusRepository — getActiveStatusesForContacts', () => {
  it('returns only non-expired rows for given chatIds', () => {
    const db = makeDb();
    [1, 2, 3].forEach((id) => db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(id));
    upsertSafetyStatus(db, 1, 'ok');
    upsertSafetyStatus(db, 2, 'help');
    upsertSafetyStatus(db, 3, 'ok');
    db.prepare(`UPDATE safety_status SET expires_at = datetime('now', '-1 second') WHERE chat_id = 3`).run();
    const rows = getActiveStatusesForContacts(db, [1, 2, 3]);
    assert.equal(rows.length, 2);
    const ids = rows.map((r) => r.chat_id).sort((a, b) => a - b);
    assert.deepEqual(ids, [1, 2]);
  });

  it('returns empty array when chatIds are not in the table', () => {
    const db = makeDb();
    assert.deepEqual(getActiveStatusesForContacts(db, [999, 1000]), []);
  });

  it('returns empty array for empty chatIds input', () => {
    const db = makeDb();
    assert.deepEqual(getActiveStatusesForContacts(db, []), []);
  });
});

describe('safetyStatusRepository — foreign key enforcement', () => {
  it('throws when chat_id does not exist in users table', () => {
    const db = makeDb();
    assert.throws(
      () => upsertSafetyStatus(db, 99999, 'ok'),
      /FOREIGN KEY|SQLITE_CONSTRAINT/i
    );
  });
});
