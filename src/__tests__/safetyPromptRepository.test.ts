import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  insertSafetyPrompt,
  getSafetyPrompt,
  getSafetyPromptById,
  markPromptResponded,
  hasPromptBeenSent,
  updateSafetyPromptMessageId,
  deleteSafetyPromptsForUser,
  deleteUnrespondedPromptsByAlertType,
  pruneOldPrompts,
} from '../db/safetyPromptRepository.js';
import { computeAlertFingerprint } from '../alertHelpers.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

describe('safetyPromptRepository — insertSafetyPrompt', () => {
  it('returns a numeric id on first insert', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    const id = insertSafetyPrompt(db, 1, 'fp1');
    assert.ok(typeof id === 'number', 'id should be a number');
    assert.ok(id > 0, 'id should be positive');
  });

  it('returns null on duplicate (chat_id, fingerprint) — must NOT throw', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    assert.doesNotThrow(() => {
      const id = insertSafetyPrompt(db, 1, 'fp1');
      assert.equal(id, null, 'duplicate insert should return null');
    });
  });

  it('stores messageId when provided', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1', 42);
    const row = getSafetyPrompt(db, 1, 'fp1')!;
    assert.equal(row.message_id, 42);
  });

  it('stores null for messageId when not provided', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    const row = getSafetyPrompt(db, 1, 'fp1')!;
    assert.equal(row.message_id, null);
  });
});

describe('safetyPromptRepository — hasPromptBeenSent', () => {
  it('returns false before insert', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), false);
  });

  it('returns true after insert', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), true);
  });
});

describe('safetyPromptRepository — markPromptResponded', () => {
  it('sets responded to true', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    markPromptResponded(db, 1, 'fp1');
    const row = getSafetyPrompt(db, 1, 'fp1')!;
    assert.equal(row.responded, true);
  });

  it('calling twice is idempotent (no throw, still true)', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    assert.doesNotThrow(() => {
      markPromptResponded(db, 1, 'fp1');
      markPromptResponded(db, 1, 'fp1');
    });
    assert.equal(getSafetyPrompt(db, 1, 'fp1')!.responded, true);
  });
});

describe('safetyPromptRepository — getSafetyPrompt', () => {
  it('returns full row with correct fields', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1', 99);
    const row = getSafetyPrompt(db, 1, 'fp1')!;
    assert.ok(row, 'row should exist');
    assert.equal(row.chat_id, 1);
    assert.equal(row.fingerprint, 'fp1');
    assert.equal(row.message_id, 99);
    assert.equal(row.responded, false);
    assert.ok(typeof row.id === 'number' && row.id > 0);
    assert.ok(typeof row.sent_at === 'string' && row.sent_at.length > 0);
  });

  it('returns null when not found', () => {
    const db = makeDb();
    assert.equal(getSafetyPrompt(db, 999, 'nonexistent'), null);
  });
});

describe('safetyPromptRepository — deleteSafetyPromptsForUser', () => {
  it('removes all rows for that user', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    insertSafetyPrompt(db, 1, 'fp2');
    deleteSafetyPromptsForUser(db, 1);
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), false);
    assert.equal(hasPromptBeenSent(db, 1, 'fp2'), false);
  });

  it('leaves rows for other users intact', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(2);
    insertSafetyPrompt(db, 1, 'fp1');
    insertSafetyPrompt(db, 2, 'fp1');
    deleteSafetyPromptsForUser(db, 1);
    assert.equal(hasPromptBeenSent(db, 2, 'fp1'), true, 'user 2 row must survive');
  });
});

describe('safetyPromptRepository — deleteUnrespondedPromptsByAlertType', () => {
  it('deletes only unresponded rows for the given alertType', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(2);
    insertSafetyPrompt(db, 1, 'fp-missiles-1', undefined, 'missiles');
    insertSafetyPrompt(db, 2, 'fp-missiles-2', undefined, 'missiles');
    insertSafetyPrompt(db, 1, 'fp-rockets-1', undefined, 'rockets');
    // Mark one missiles prompt as responded — it should survive
    markPromptResponded(db, 2, 'fp-missiles-2');
    const count = deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(count, 1, 'only the 1 unresponded missiles prompt should be deleted');
    assert.equal(hasPromptBeenSent(db, 1, 'fp-missiles-1'), false, 'unresponded missiles row gone');
    assert.equal(hasPromptBeenSent(db, 2, 'fp-missiles-2'), true, 'responded missiles row survives');
    assert.equal(hasPromptBeenSent(db, 1, 'fp-rockets-1'), true, 'rockets row untouched');
  });

  it('returns 0 when no unresponded prompts exist for that alertType', () => {
    const db = makeDb();
    const count = deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(count, 0);
  });
});

describe('safetyPromptRepository — pruneOldPrompts', () => {
  it('removes rows with sent_at older than the cutoff', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    db.prepare(`UPDATE safety_prompts SET sent_at = datetime('now', '-25 hours') WHERE fingerprint = 'fp1'`).run();
    const count = pruneOldPrompts(db);
    assert.equal(count, 1);
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), false);
  });

  it('leaves recent rows untouched', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    const count = pruneOldPrompts(db);
    assert.equal(count, 0);
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), true);
  });

  it('returns correct count when multiple rows pruned', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    insertSafetyPrompt(db, 1, 'fp2');
    db.prepare(`UPDATE safety_prompts SET sent_at = datetime('now', '-25 hours')`).run();
    assert.equal(pruneOldPrompts(db), 2);
  });

  it('default cutoff is 24h — does NOT prune a 23h-old row', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    db.prepare(`UPDATE safety_prompts SET sent_at = datetime('now', '-23 hours') WHERE fingerprint = 'fp1'`).run();
    assert.equal(pruneOldPrompts(db), 0, '23h-old row should NOT be pruned with default 24h cutoff');
    assert.equal(hasPromptBeenSent(db, 1, 'fp1'), true);
  });

  it('respects custom olderThanHours parameter', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(1);
    insertSafetyPrompt(db, 1, 'fp1');
    db.prepare(`UPDATE safety_prompts SET sent_at = datetime('now', '-2 hours') WHERE fingerprint = 'fp1'`).run();
    assert.equal(pruneOldPrompts(db, 1), 1, '2h-old row should be pruned with 1h cutoff');
  });
});

describe('safetyPromptRepository — getSafetyPromptById', () => {
  it('returns null for unknown ID', () => {
    const db = makeDb();
    assert.equal(getSafetyPromptById(db, 9999), null);
  });

  it('returns the prompt by primary key ID', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    const id = insertSafetyPrompt(db, 1001, 'missiles:city1', undefined, 'missiles');
    assert.ok(id !== null);

    const result = getSafetyPromptById(db, id!);
    assert.ok(result !== null);
    assert.equal(result!.fingerprint, 'missiles:city1');
    assert.equal(result!.chat_id, 1001);
  });

  it('decodes responded as boolean', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    const id = insertSafetyPrompt(db, 1001, 'missiles:city1', undefined, 'missiles')!;
    markPromptResponded(db, 1001, 'missiles:city1');

    const result = getSafetyPromptById(db, id);
    assert.equal(result!.responded, true);
  });
});

describe('safetyPromptRepository — updateSafetyPromptMessageId', () => {
  it('updates message_id on the row', () => {
    const db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    const id = insertSafetyPrompt(db, 1001, 'missiles:city1', undefined, 'missiles')!;
    updateSafetyPromptMessageId(db, id, 555);

    const result = getSafetyPromptById(db, id);
    assert.equal(result!.message_id, 555);
  });
});

describe('computeAlertFingerprint stability', () => {
  const CITY_A = '\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1'; // תל אביב
  const CITY_B = '\u05D7\u05D9\u05E4\u05D4';              // חיפה

  it('is order-independent (same result regardless of city order)', () => {
    const fp1 = computeAlertFingerprint('missiles', [CITY_A, CITY_B]);
    const fp2 = computeAlertFingerprint('missiles', [CITY_B, CITY_A]);
    assert.equal(fp1, fp2, 'fingerprint must be the same regardless of city order');
  });

  it('different alert type → different fingerprint', () => {
    const fp1 = computeAlertFingerprint('missiles', [CITY_A]);
    const fp2 = computeAlertFingerprint('rockets', [CITY_A]);
    assert.notEqual(fp1, fp2);
  });

  it('different city set → different fingerprint', () => {
    const fp1 = computeAlertFingerprint('missiles', [CITY_A]);
    const fp2 = computeAlertFingerprint('missiles', [CITY_B]);
    assert.notEqual(fp1, fp2);
  });

  it('returns a 40-character hex string (SHA1)', () => {
    const fp = computeAlertFingerprint('missiles', [CITY_A]);
    assert.match(fp, /^[0-9a-f]{40}$/);
  });
});
