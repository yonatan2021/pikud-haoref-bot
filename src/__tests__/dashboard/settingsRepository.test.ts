import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../../db/schema.js';
import { getSetting, setSetting, getAllSettings } from '../../dashboard/settingsRepository.js';

let db: Database.Database;
beforeEach(() => { db = new Database(':memory:'); initSchema(db); });
afterEach(() => db.close());

describe('settingsRepository', () => {
  it('setSetting stores a value', () => {
    setSetting(db, 'key', 'val');
    assert.equal(getSetting(db, 'key'), 'val');
  });

  it('getSetting returns null for missing key', () => {
    assert.equal(getSetting(db, 'nonexistent'), null);
  });

  it('setSetting overwrites existing value', () => {
    setSetting(db, 'key', 'old');
    setSetting(db, 'key', 'new');
    assert.equal(getSetting(db, 'key'), 'new');
  });

  it('getAllSettings returns all key-value pairs', () => {
    setSetting(db, 'a', '1');
    setSetting(db, 'b', '2');
    assert.deepEqual(getAllSettings(db), { a: '1', b: '2' });
  });
});
