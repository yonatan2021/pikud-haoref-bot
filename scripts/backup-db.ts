import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';

const MAX_BACKUPS = 7;
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'subscriptions.db');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

if (!existsSync(DB_PATH)) {
  console.log('[Backup] No database found — skipping (first run)');
  process.exit(0);
}

mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(BACKUP_DIR, `subscriptions-${timestamp}.db`);

const db = new Database(DB_PATH, { readonly: true });

(async () => {
  await db.backup(backupPath);
  db.close();

  console.log(`[Backup] ✅ Backed up → ${backupPath}`);

  // Prune old backups — keep only the last MAX_BACKUPS
  const backups = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('subscriptions-') && f.endsWith('.db'))
    .sort();

  for (const file of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    unlinkSync(path.join(BACKUP_DIR, file));
    console.log(`[Backup] Removed old backup: ${file}`);
  }
})().catch(err => {
  // Backup failure is non-fatal — warn and continue so npm start still runs
  console.warn(`[Backup] ⚠️ Backup failed (continuing anyway): ${(err as Error).message}`);
});
