import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  getAllTemplates,
  upsertTemplate,
  deleteTemplate,
} from '../db/messageTemplateRepository.js';
import {
  getEmoji,
  getTitleHe,
  getInstructionsPrefix,
  getAllCached,
} from '../config/templateCache.js';
import { ALL_ALERT_TYPES } from '../config/alertTypeDefaults.js';

// ── default cache (module-load state) ──────────────────────────────────────

describe('templateCache defaults (before DB load)', () => {
  it('getEmoji("missiles") returns 🔴', () => {
    assert.equal(getEmoji('missiles'), '🔴');
  });

  it('getEmoji("earthQuake") returns 🟠', () => {
    assert.equal(getEmoji('earthQuake'), '🟠');
  });

  it('getEmoji("tsunami") returns 🌊', () => {
    assert.equal(getEmoji('tsunami'), '🌊');
  });

  it('getTitleHe("missiles") returns the Hebrew title', () => {
    assert.equal(getTitleHe('missiles'), 'התרעת טילים');
  });

  it('getInstructionsPrefix("newsFlash") returns empty string (no label prefix)', () => {
    assert.equal(getInstructionsPrefix('newsFlash'), '');
  });

  it('getInstructionsPrefix("missiles") falls back to 🛡', () => {
    assert.equal(getInstructionsPrefix('missiles'), '🛡');
  });

  it('unknown alert type does not throw and returns fallback emoji', () => {
    const result = getEmoji('nonExistentType');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('unknown alert type does not throw and returns fallback title', () => {
    const result = getTitleHe('nonExistentType');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('unknown alert type does not throw and returns fallback instructions prefix', () => {
    const result = getInstructionsPrefix('nonExistentType');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('getAllCached() returns a frozen object', () => {
    const cache = getAllCached();
    assert.ok(Object.isFrozen(cache));
  });

  it('getAllCached() contains all 18 known alert types', () => {
    const cache = getAllCached();
    assert.equal(ALL_ALERT_TYPES.length, 18);
    for (const alertType of ALL_ALERT_TYPES) {
      assert.ok(alertType in cache, `missing alert type: ${alertType}`);
    }
  });
});

// ── repository tests against in-memory DB ─────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('messageTemplateRepository', () => {
  it('getAllTemplates on empty DB returns []', () => {
    const db = makeDb();
    const rows = getAllTemplates(db);
    assert.deepEqual(rows, []);
    db.close();
  });

  it('upsertTemplate + getAllTemplates round-trip', () => {
    const db = makeDb();
    upsertTemplate(db, {
      alert_type: 'missiles',
      emoji: '🚀',
      title_he: 'בדיקה',
      instructions_prefix: '📌',
    });
    const rows = getAllTemplates(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].alert_type, 'missiles');
    assert.equal(rows[0].emoji, '🚀');
    assert.equal(rows[0].title_he, 'בדיקה');
    assert.equal(rows[0].instructions_prefix, '📌');
    db.close();
  });

  it('upsertTemplate updates existing row', () => {
    const db = makeDb();
    upsertTemplate(db, {
      alert_type: 'missiles',
      emoji: '🚀',
      title_he: 'ראשוני',
      instructions_prefix: '📌',
    });
    upsertTemplate(db, {
      alert_type: 'missiles',
      emoji: '🔴',
      title_he: 'עדכני',
      instructions_prefix: '🛡',
    });
    const rows = getAllTemplates(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].emoji, '🔴');
    assert.equal(rows[0].title_he, 'עדכני');
    db.close();
  });

  it('deleteTemplate removes the row', () => {
    const db = makeDb();
    upsertTemplate(db, {
      alert_type: 'missiles',
      emoji: '🔴',
      title_he: 'בדיקה',
      instructions_prefix: '🛡',
    });
    upsertTemplate(db, {
      alert_type: 'earthQuake',
      emoji: '🟠',
      title_he: 'רעידה',
      instructions_prefix: '🛡',
    });
    deleteTemplate(db, 'missiles');
    const rows = getAllTemplates(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].alert_type, 'earthQuake');
    db.close();
  });

  it('deleteTemplate on non-existent row does not throw', () => {
    const db = makeDb();
    assert.doesNotThrow(() => deleteTemplate(db, 'nonExistentType'));
    db.close();
  });
});
