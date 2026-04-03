/** Daily alert serial number — incremented per alert, resets at Israel midnight. */

let dailyCounter = 0;
let lastCounterDate = '';

/** Returns today's date in Israel timezone as YYYY-MM-DD. */
function getTodayIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** Seeds the counter from DB on startup so numbering survives restarts. */
export function initAlertSerial(todayCount: number): void {
  dailyCounter = todayCount;
  lastCounterDate = getTodayIsrael();
}

/** Returns the next serial number for today, auto-resetting on date rollover (Israel time). */
export function getNextAlertSerial(): number {
  const today = getTodayIsrael();
  if (today !== lastCounterDate) {
    dailyCounter = 0;
    lastCounterDate = today;
  }
  return ++dailyCounter;
}

/** Exported for testing — resets internal state. */
export function _resetSerial(): void {
  dailyCounter = 0;
  lastCounterDate = '';
}
