import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'subscriptions.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
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

export function initDb(): void {
  const database = getDb();
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
  `);

  database.exec(
    [
      'CREATE TABLE IF NOT EXISTS alert_history (',
      '  id           INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  type         TEXT NOT NULL,',
      '  cities       TEXT NOT NULL,',
      '  instructions TEXT,',
      '  fired_at     TEXT NOT NULL DEFAULT (datetime(\'now\'))',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_alert_history_fired_at ON alert_history(fired_at);',
      'CREATE INDEX IF NOT EXISTS idx_alert_history_type     ON alert_history(type);',
      "DELETE FROM alert_history WHERE fired_at < datetime('now', '-7 days');",
    ].join('\n')
  );

  database.exec(`
    CREATE TABLE IF NOT EXISTS alert_window (
      alert_type  TEXT PRIMARY KEY,
      message_id  INTEGER NOT NULL,
      chat_id     TEXT NOT NULL,
      topic_id    INTEGER,
      alert_json  TEXT NOT NULL,
      sent_at     INTEGER NOT NULL,
      has_photo   INTEGER NOT NULL
    );
  `);

  try {
    database.exec(
      'ALTER TABLE users ADD COLUMN quiet_hours_enabled INTEGER NOT NULL DEFAULT 0'
    );
  } catch (e: unknown) {
    if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
  }
}
