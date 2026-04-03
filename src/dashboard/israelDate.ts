/**
 * Israel-timezone date helpers for SQLite queries.
 *
 * SQLite's `date('now')` returns UTC midnight, which is 2-3 hours behind
 * Israel time (UTC+2 standard / UTC+3 daylight saving). These helpers
 * compute the correct Israel midnight boundary as a UTC datetime string
 * so `WHERE fired_at >= ?` queries align with the Israeli calendar day.
 */

const ISRAEL_TZ = 'Asia/Jerusalem';

/** Returns today's date in Israel as 'YYYY-MM-DD'. */
function israelDateString(now?: Date): string {
  // 'en-CA' locale outputs ISO 'YYYY-MM-DD' format
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ }).format(now ?? new Date());
}

/** Returns the Israel UTC offset in hours for a given date (2 or 3). */
function israelOffsetHours(dateStr: string): number {
  // Use noon UTC as a safe reference point (avoids DST boundary edge cases)
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ISRAEL_TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(noonUtc),
    10,
  );
  return israelHour - 12; // 14 → +2 (IST), 15 → +3 (IDT)
}

/**
 * Returns the UTC datetime string for midnight Israel time today.
 * E.g. if it's 2026-04-03 in Israel (IST, UTC+2), returns '2026-04-02 22:00:00'.
 * During daylight saving (IDT, UTC+3), returns '2026-04-02 21:00:00'.
 *
 * Pass to SQLite as `WHERE fired_at >= ?` to get "today" in Israel time.
 */
export function israelMidnight(now?: Date): string {
  const dateStr = israelDateString(now);
  const offset = israelOffsetHours(dateStr);
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
  utcMidnight.setUTCHours(utcMidnight.getUTCHours() - offset);
  return utcMidnight.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Returns the UTC datetime string for midnight Israel time yesterday.
 * Uses calendar-day subtraction (DST-safe) rather than a fixed 86400s offset,
 * which would be wrong on DST changeover nights (Israel spring: 25h day, fall: 23h day).
 */
export function israelYesterdayMidnight(now?: Date): string {
  const dateStr = israelDateString(now);
  const [year, month, day] = dateStr.split('-').map(Number);
  // Subtract one calendar day by building a UTC date at that date minus 1 day
  const yesterdayUtc = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return israelMidnight(yesterdayUtc);
}

/**
 * Returns the UTC datetime string for midnight Israel time N calendar days ago.
 * Uses calendar-day subtraction (DST-safe) — avoids fixed-millisecond offsets
 * which drift by ±1h on DST changeover nights (Israel spring: 23h day, fall: 25h day).
 */
export function israelMidnightDaysAgo(n: number, now?: Date): string {
  const dateStr = israelDateString(now);
  const [year, month, day] = dateStr.split('-').map(Number);
  const pastUtc = new Date(Date.UTC(year!, month! - 1, day! - n));
  return israelMidnight(pastUtc);
}
