import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';

describe('alert_history schema', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => { getDb().prepare('DELETE FROM alert_history').run(); });

  it('alert_history table exists', () => {
    const row = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='alert_history'`)
      .get();
    assert.ok(row, 'alert_history table should exist');
  });

  it('users table has quiet_hours_enabled column with default 0', () => {
    const info = getDb()
      .prepare('PRAGMA table_info(users)')
      .all() as { name: string; dflt_value: string | null }[];
    const col = info.find((c) => c.name === 'quiet_hours_enabled');
    assert.ok(col, 'quiet_hours_enabled column should exist');
    assert.equal(col!.dflt_value, '0');
  });
});
