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
  `);
}
