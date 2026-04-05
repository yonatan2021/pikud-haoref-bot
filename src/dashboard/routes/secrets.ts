import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from '../settingsRepository.js';
import { SECRET_KEYS, RESTART_REQUIRED_KEYS, envKeyFor } from '../../config/configResolver.js';
import { isCryptoReady } from '../crypto.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';

// ── Restart tracking ─────────────────────────────────────────────────────────

/** Keys changed since this process booted. Cleared on restart (module load). */
const changedSinceBootKeys = new Set<string>();

// ── Deletion tracking ────────────────────────────────────────────────────────

const DELETED_SECRETS_KEY = '_deleted_secrets';

function getDeletedSecrets(db: Database.Database): string[] {
  const raw = getSetting(db, DELETED_SECRETS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function addDeletedSecret(db: Database.Database, key: string): void {
  const current = getDeletedSecrets(db);
  if (!current.includes(key)) {
    setSetting(db, DELETED_SECRETS_KEY, JSON.stringify([...current, key]));
  }
}

// ── Masking ──────────────────────────────────────────────────────────────────

function maskValue(value: string | null): string {
  if (!value) return '(לא הוגדר)';
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 6) + '•••••';
}

// ── Rate limiter ─────────────────────────────────────────────────────────────

export const secretsMutateLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי בקשות — נסה שוב בעוד דקה',
});

// ── Router ───────────────────────────────────────────────────────────────────

export function createSecretsRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/secrets
   * List all secret keys with metadata. Never returns plaintext values.
   */
  router.get('/', (_req, res) => {
    const secrets = [...SECRET_KEYS].map(key => {
      // Try DB first (getSetting auto-decrypts)
      const dbValue = getSetting(db, key);
      // Try env fallback
      const envValue = process.env[envKeyFor(key)];

      let source: 'db' | 'env' | 'none';
      let masked: string;

      if (dbValue !== null) {
        source = 'db';
        masked = maskValue(dbValue);
      } else if (envValue !== undefined) {
        source = 'env';
        masked = maskValue(envValue);
      } else {
        source = 'none';
        masked = maskValue(null);
      }

      // Get updated_at from DB row directly (raw query, no decrypt needed)
      const row = db.prepare('SELECT updated_at FROM settings WHERE key = ?').get(key) as
        { updated_at: string | null } | undefined;

      return {
        key,
        masked,
        source,
        updatedAt: row?.updated_at ?? null,
        requiresRestart: RESTART_REQUIRED_KEYS.has(key),
      };
    });

    res.json({ secrets });
  });

  /**
   * PUT /api/secrets/:key
   * Set/update an encrypted secret value.
   */
  router.put('/:key', secretsMutateLimiter, (req, res) => {
    const key = req.params['key'] as string;
    const { value } = req.body as { value?: string };

    if (!SECRET_KEYS.has(key)) {
      res.status(400).json({ error: `מפתח לא מוכר: ${key}` });
      return;
    }

    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      res.status(400).json({ error: 'ערך חסר או ריק' });
      return;
    }

    if (!isCryptoReady()) {
      res.status(503).json({ error: 'מערכת ההצפנה לא מאותחלת — בדוק DASHBOARD_SECRET' });
      return;
    }

    // setSetting auto-encrypts SECRET_KEYS
    setSetting(db, key, value.trim());

    if (RESTART_REQUIRED_KEYS.has(key)) {
      changedSinceBootKeys.add(key);
    }

    res.json({ ok: true });
  });

  /**
   * DELETE /api/secrets/:key
   * Remove a secret from DB. Falls back to env if present.
   * Tracks deletion to prevent auto-migration re-import.
   */
  router.delete('/:key', secretsMutateLimiter, (req, res) => {
    const key = req.params['key'] as string;

    if (!SECRET_KEYS.has(key)) {
      res.status(400).json({ error: `מפתח לא מוכר: ${key}` });
      return;
    }

    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    addDeletedSecret(db, key);

    if (RESTART_REQUIRED_KEYS.has(key)) {
      changedSinceBootKeys.add(key);
    }

    res.json({ ok: true });
  });

  /**
   * GET /api/secrets/restart-needed
   * Returns which restart-required keys were changed since last boot.
   */
  router.get('/restart-needed', (_req, res) => {
    res.json({
      needed: changedSinceBootKeys.size > 0,
      changedKeys: [...changedSinceBootKeys],
    });
  });

  return router;
}
