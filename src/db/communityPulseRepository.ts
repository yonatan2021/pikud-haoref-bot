import type Database from 'better-sqlite3';

export interface PulseRow {
  id: number;
  fingerprint: string;
  alertType: string;
  zones: string[];
  createdAt: string;
}

export interface PulseAggregate {
  total: number;
  ok: number;
  scared: number;
  helping: number;
}

export type PulseAnswer = 'ok' | 'scared' | 'helping';

interface PulseDbRow {
  id: number;
  fingerprint: string;
  alert_type: string;
  zones: string;
  created_at: string;
}

function decodeRow(row: PulseDbRow): PulseRow {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    alertType: row.alert_type,
    zones: (() => {
      try {
        const parsed = JSON.parse(row.zones);
        return Array.isArray(parsed) ? parsed as string[] : [];
      } catch {
        return [];
      }
    })(),
    createdAt: row.created_at,
  };
}

/**
 * INSERT OR IGNORE — returns the existing row if fingerprint already exists.
 */
export function createPulse(
  db: Database.Database,
  fingerprint: string,
  alertType: string,
  zones: string[]
): PulseRow {
  db.prepare(
    `INSERT OR IGNORE INTO community_pulses (fingerprint, alert_type, zones)
     VALUES (?, ?, ?)`
  ).run(fingerprint, alertType, JSON.stringify(zones));

  const row = db
    .prepare('SELECT * FROM community_pulses WHERE fingerprint = ?')
    .get(fingerprint) as PulseDbRow;

  return decodeRow(row);
}

export function getPulseByFingerprint(
  db: Database.Database,
  fingerprint: string
): PulseRow | null {
  const row = db
    .prepare('SELECT * FROM community_pulses WHERE fingerprint = ?')
    .get(fingerprint) as PulseDbRow | undefined;

  return row ? decodeRow(row) : null;
}

/**
 * INSERT OR IGNORE — dedup at (pulse_id, chat_id) PRIMARY KEY.
 * Returns true if the row was inserted, false if the user already responded.
 */
export function insertResponse(
  db: Database.Database,
  pulseId: number,
  chatId: number,
  answer: PulseAnswer
): boolean {
  const result = db.prepare(
    `INSERT OR IGNORE INTO community_pulse_responses (pulse_id, chat_id, answer)
     VALUES (?, ?, ?)`
  ).run(pulseId, chatId, answer);
  return result.changes > 0;
}

export function getAggregate(
  db: Database.Database,
  pulseId: number
): PulseAggregate {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN answer = 'ok'      THEN 1 ELSE 0 END) AS ok,
         SUM(CASE WHEN answer = 'scared'  THEN 1 ELSE 0 END) AS scared,
         SUM(CASE WHEN answer = 'helping' THEN 1 ELSE 0 END) AS helping
       FROM community_pulse_responses
       WHERE pulse_id = ?`
    )
    .get(pulseId) as { total: number; ok: number; scared: number; helping: number };

  return {
    total: row.total ?? 0,
    ok: row.ok ?? 0,
    scared: row.scared ?? 0,
    helping: row.helping ?? 0,
  };
}

/**
 * Returns ISO datetime string of last response by this chatId, or null.
 */
export function getLastResponseTime(
  db: Database.Database,
  chatId: number
): string | null {
  const row = db
    .prepare(
      `SELECT created_at FROM community_pulse_responses
       WHERE chat_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(chatId) as { created_at: string } | undefined;

  return row?.created_at ?? null;
}
