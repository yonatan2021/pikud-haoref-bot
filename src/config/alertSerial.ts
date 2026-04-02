/** Daily alert serial number — incremented per alert, resets at midnight UTC. */

let dailyCounter = 0;
let lastCounterDate = '';

/** Seeds the counter from DB on startup so numbering survives restarts. */
export function initAlertSerial(todayCount: number): void {
  dailyCounter = todayCount;
  lastCounterDate = new Date().toISOString().slice(0, 10);
}

/** Returns the next serial number for today, auto-resetting on date rollover (UTC). */
export function getNextAlertSerial(): number {
  const today = new Date().toISOString().slice(0, 10);
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
