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
}

export function initDb(): void {
  const database = getDb();
  initSchema(database);
  // Prune alert history older than 7 days on startup
  database.exec(`DELETE FROM alert_history WHERE fired_at < datetime('now', '-7 days')`);
}
