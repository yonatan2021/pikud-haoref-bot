import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'subscriptions.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function addColumnIfMissing(database: Database.Database, sql: string): void {
  try {
    database.prepare(sql).run();
  } catch (e: unknown) {
    if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
  }
}

/**
 * Initialise all tables on a given Database instance.
 * Useful for testing with an in-memory database and for the singleton `initDb()`.
 */
export function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id    INTEGER PRIMARY KEY,
      format     TEXT NOT NULL DEFAULT 'short',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      chat_id   INTEGER NOT NULL,
      city_name TEXT NOT NULL,
      PRIMARY KEY (chat_id, city_name),
      FOREIGN KEY (chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mapbox_usage (
      month         TEXT PRIMARY KEY,
      request_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alert_window (
      alert_type  TEXT PRIMARY KEY,
      message_id  INTEGER NOT NULL,
      chat_id     TEXT NOT NULL,
      topic_id    INTEGER,
      alert_json  TEXT NOT NULL,
      sent_at     INTEGER NOT NULL,
      has_photo   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapbox_image_cache (
      cache_key  TEXT PRIMARY KEY,
      image_data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      alert_type          TEXT PRIMARY KEY,
      emoji               TEXT NOT NULL,
      title_he            TEXT NOT NULL,
      instructions_prefix TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_template_history (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type          TEXT NOT NULL,
      emoji               TEXT NOT NULL,
      title_he            TEXT NOT NULL,
      instructions_prefix TEXT NOT NULL,
      saved_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tmpl_history_type ON message_template_history(alert_type);

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      ip       TEXT PRIMARY KEY,
      count    INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_groups (
      group_id    TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 0,
      alert_types TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS whatsapp_listeners (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id          TEXT    NOT NULL UNIQUE,
      channel_name        TEXT    NOT NULL,
      channel_type        TEXT    NOT NULL DEFAULT 'group',
      keywords            TEXT    NOT NULL DEFAULT '[]',
      telegram_topic_id   INTEGER,
      telegram_topic_name TEXT,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_listeners (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id             TEXT    NOT NULL UNIQUE,
      chat_name           TEXT    NOT NULL,
      chat_type           TEXT    NOT NULL DEFAULT 'group',
      keywords            TEXT    NOT NULL DEFAULT '[]',
      telegram_topic_id   INTEGER,
      telegram_topic_name TEXT,
      forward_to_whatsapp INTEGER NOT NULL DEFAULT 0,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_known_chats (
      chat_id    TEXT PRIMARY KEY,
      chat_name  TEXT NOT NULL,
      chat_type  TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      contact_id  INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, contact_id),
      FOREIGN KEY (user_id) REFERENCES users(chat_id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES users(chat_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_contact ON contacts(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

    CREATE TABLE IF NOT EXISTS contact_permissions (
      -- contact_id references contacts(id) surrogate PK (the relationship row), not a user
      contact_id    INTEGER PRIMARY KEY,
      safety_status INTEGER NOT NULL DEFAULT 1,
      home_city     INTEGER NOT NULL DEFAULT 0,
      update_time   INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `);

  database.exec(
    [
      'CREATE TABLE IF NOT EXISTS alert_history (',
      '  id           INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  type         TEXT NOT NULL,',
      '  cities       TEXT NOT NULL,',
      '  instructions TEXT,',
      "  fired_at     TEXT NOT NULL DEFAULT (datetime('now'))",
      ');',
      'CREATE INDEX IF NOT EXISTS idx_alert_history_fired_at ON alert_history(fired_at);',
      'CREATE INDEX IF NOT EXISTS idx_alert_history_type     ON alert_history(type);',
    ].join('\n')
  );

  // SQLite has no ADD COLUMN IF NOT EXISTS — ALTER TABLE throws 'duplicate column name'
  // on repeat runs (e.g. after restart). addColumnIfMissing catches that specific error.
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN quiet_hours_enabled INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN muted_until TEXT');

  // v0.4.1 — profile, onboarding, and connection fields
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN display_name TEXT');
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN home_city TEXT');
  addColumnIfMissing(database, "ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'he'");
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN connection_code TEXT');
  addColumnIfMissing(database, 'ALTER TABLE users ADD COLUMN onboarding_step TEXT');

  database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_connection_code ON users(connection_code) WHERE connection_code IS NOT NULL').run();
}

export function initDb(): void {
  const database = getDb();
  initSchema(database);
  // Prune stale data atomically on startup
  database.transaction(() => {
    database.prepare(`DELETE FROM alert_history WHERE fired_at < datetime('now', '-7 days')`).run();
    database.prepare('DELETE FROM login_attempts WHERE reset_at < (unixepoch() * 1000)').run();
    database.prepare(`DELETE FROM contacts WHERE status = 'pending' AND created_at < datetime('now', '-7 days')`).run();
  })();
}
