// Tests for src/db/schema.ts — addColumnIfMissing helper and initSchema
// idempotency.
//
// Context: schema.ts is currently untested. `addColumnIfMissing` catches
// only errors whose message includes 'duplicate column name' and rethrows
// everything else — a typo in a future ALTER statement would only surface
// at runtime. `initSchema` is also the migration runner: running it twice
// on the same DB (e.g. on startup after a schema change) must be a no-op.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema, addColumnIfMissing } from '../../db/schema.js';

// Every test uses its own fresh in-memory DB. Having a shared top-level db
// would make the "fresh-schema" assertions meaningless across tests.
let db: Database.Database;

before(() => {
  db = new Database(':memory:');
});

after(() => db.close());

beforeEach(() => {
  // Drop everything touched by tests and re-open a clean DB. better-sqlite3
  // `:memory:` databases are per-connection, so closing and reopening is the
  // simplest way to guarantee a pristine state.
  try { db.close(); } catch { /* already closed */ }
  db = new Database(':memory:');
});

describe('addColumnIfMissing', () => {
  it('adds a new column to an existing table', () => {
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`);
    addColumnIfMissing(db, 'ALTER TABLE t ADD COLUMN name TEXT');

    const cols = db.prepare("PRAGMA table_info('t')").all() as { name: string }[];
    const colNames = cols.map(c => c.name).sort();
    assert.deepEqual(colNames, ['id', 'name']);
  });

  it('is idempotent — a second call with the same ALTER does not throw', () => {
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`);
    addColumnIfMissing(db, 'ALTER TABLE t ADD COLUMN name TEXT');
    // Second call — SQLite raises "duplicate column name: name" which the
    // helper must swallow.
    assert.doesNotThrow(() => addColumnIfMissing(db, 'ALTER TABLE t ADD COLUMN name TEXT'));

    // Column count must be unchanged.
    const cols = db.prepare("PRAGMA table_info('t')").all() as { name: string }[];
    assert.equal(cols.length, 2, 'must not add a duplicate column');
  });

  it('rethrows errors that are NOT duplicate-column-name', () => {
    // Table does not exist — the prepare step throws "no such table".
    // That error message does NOT include "duplicate column name" so the
    // helper must propagate it.
    assert.throws(
      () => addColumnIfMissing(db, 'ALTER TABLE does_not_exist ADD COLUMN x TEXT'),
      /no such table/,
      'must rethrow "no such table" errors instead of silently swallowing'
    );
  });

  it('rethrows syntax errors in the ALTER statement (any non-duplicate error)', () => {
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`);
    // Malformed SQL — not a duplicate-column-name error, must throw.
    // We deliberately do NOT match the error message: better-sqlite3 wraps
    // the error with a SQLITE_ERROR code and the wording varies by version.
    // The important invariant is that *some* error escapes the helper.
    let caught: unknown = undefined;
    try {
      addColumnIfMissing(db, 'ALTER TABLE t ADD COLUMN x NOT_A_VALID_TYPE_EXPRESSION DEFAULT');
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'must rethrow SQL errors that are NOT duplicate-column-name');
    assert.ok(
      !(caught instanceof Error && caught.message.includes('duplicate column name')),
      'the caught error must not be a duplicate-column-name error (that would mean the helper wrongly swallowed something else)'
    );
  });
});

describe('initSchema', () => {
  it('creates all expected tables on a fresh database', () => {
    initSchema(db);

    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const tableNames = rows.map(r => r.name);

    // Spot-check the tables that matter most for production correctness.
    const expected = [
      'users',
      'subscriptions',
      'alert_history',
      'alert_window',
      'mapbox_usage',
      'settings',
      'mapbox_image_cache',
      'message_templates',
      'message_template_history',
      'sessions',
      'login_attempts',
      'whatsapp_groups',
      'whatsapp_listeners',
      'telegram_listeners',
      'telegram_known_chats',
      'telegram_known_topics',
      'contacts',
      'contact_permissions',
      'safety_status',
      'safety_prompts',
    ];
    for (const name of expected) {
      assert.ok(tableNames.includes(name), `table "${name}" must be created by initSchema`);
    }
  });

  it('is idempotent — running twice on the same DB does not throw', () => {
    initSchema(db);
    // All the ALTER TABLE statements inside initSchema will fire again — each
    // one should hit the "duplicate column name" branch and be swallowed.
    assert.doesNotThrow(() => initSchema(db), 'second initSchema call must be a no-op');
  });

  it('users table has all the profile/onboarding columns after init', () => {
    initSchema(db);
    const cols = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));

    // Columns added via addColumnIfMissing must all be present after init.
    for (const name of [
      'quiet_hours_enabled',
      'muted_until',
      'display_name',
      'home_city',
      'locale',
      'onboarding_completed',
      'connection_code',
      'onboarding_step',
      'is_dm_active',
    ]) {
      assert.ok(colNames.has(name), `users.${name} column must exist after initSchema`);
    }
  });

  it('v0.4.1 backfill marks existing subscribed users as onboarded', () => {
    // Simulate a pre-v0.4.1 DB: users table and subscriptions exist, but
    // the user row was created before the onboarding_completed column did.
    initSchema(db);

    // Insert a user + one subscription, then force onboarding_completed=0
    // as if they were upgraded from an older version.
    db.prepare('INSERT INTO users (chat_id, format) VALUES (?, ?)').run(9000, 'short');
    db.prepare('INSERT INTO subscriptions (chat_id, city_name) VALUES (?, ?)').run(9000, 'אבו גוש');
    db.prepare('UPDATE users SET onboarding_completed = 0 WHERE chat_id = ?').run(9000);

    // Re-running initSchema executes the backfill UPDATE at the bottom of
    // initSchema — the user should now be marked as onboarded.
    initSchema(db);
    const row = db
      .prepare('SELECT onboarding_completed FROM users WHERE chat_id = ?')
      .get(9000) as { onboarding_completed: number };
    assert.equal(row.onboarding_completed, 1, 'existing subscriber must be backfilled to onboarded');
  });

  it('all_clear template is seeded on first init but not overwritten on re-init', () => {
    initSchema(db);
    // Customise the seed value
    db.prepare(`UPDATE message_templates SET emoji = '💚' WHERE alert_type = 'all_clear'`).run();

    // Re-initialising must NOT revert the customisation (INSERT OR IGNORE).
    initSchema(db);
    const row = db
      .prepare('SELECT emoji FROM message_templates WHERE alert_type = ?')
      .get('all_clear') as { emoji: string };
    assert.equal(row.emoji, '💚', 'admin customisation must survive re-init');
  });
});
