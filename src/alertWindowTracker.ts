import { Alert } from './types';
import { upsertWindow, deleteWindow, clearAllWindows, loadAllWindows } from './db/alertWindowRepository.js';
import { log } from './logger.js';
import { getDb } from './db/schema.js';
import { getNumber } from './config/configResolver.js';

const DEFAULT_WINDOW_SECONDS = 120;

export interface TrackedMessage {
  messageId: number;
  chatId: string;
  topicId: number | undefined;
  alert: Alert;
  sentAt: number;
  hasPhoto: boolean;
}

const activeMessages = new Map<string, TrackedMessage>();

let windowCloseCallback: ((alertType: string, tracked: TrackedMessage) => void) | null = null;

/** Pending close timers keyed by alertType. */
const closeTimers = new Map<string, NodeJS.Timeout>();

export function setWindowCloseCallback(
  fn: (alertType: string, tracked: TrackedMessage) => void
): void {
  windowCloseCallback = fn;
}

function windowMs(): number {
  // Re-read on each call so dashboard edits to `alert_window_seconds` take effect
  // without a process restart. getNumber resolves DB → env (ALERT_UPDATE_WINDOW_SECONDS) → default.
  // The try/catch keeps unit tests working when DB schema isn't initialised — they rely on
  // env fallback. Guard pattern mirrors dmQueue/allClearTracker.
  let seconds = DEFAULT_WINDOW_SECONDS;
  try {
    seconds = getNumber(getDb(), 'alert_window_seconds', DEFAULT_WINDOW_SECONDS);
  } catch {
    const raw = process.env.ALERT_UPDATE_WINDOW_SECONDS;
    const parsed = Number(raw);
    seconds = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_WINDOW_SECONDS;
  }
  const valid = Number.isFinite(seconds) && seconds >= 1 ? seconds : DEFAULT_WINDOW_SECONDS;
  return valid * 1000;
}

/** Schedule (or reschedule) the close timer for a given alertType. */
function scheduleCloseTimer(alertType: string, msg: TrackedMessage): void {
  const existing = closeTimers.get(alertType);
  if (existing) clearTimeout(existing);

  const delay = windowMs() - (Date.now() - msg.sentAt);
  if (delay <= 0) return; // already expired — caller handles eviction separately

  const timer = setTimeout(() => {
    closeTimers.delete(alertType);
    const stillActive = activeMessages.get(alertType);
    if (!stillActive) return; // already expired or deleted elsewhere
    if (windowCloseCallback) {
      try {
        windowCloseCallback(alertType, { ...stillActive });
      } catch (err) {
        log('error', 'AlertWindow', `windowCloseCallback timer error: ${String(err)}`);
      }
    }
    activeMessages.delete(alertType);
    try { deleteWindow(alertType); } catch (err) { log('warn', 'AlertWindow', `deleteWindow on timer failed: ${err}`); }
  }, delay);
  closeTimers.set(alertType, timer);
}

export function getActiveMessage(alertType: string): TrackedMessage | null {
  const tracked = activeMessages.get(alertType);
  if (!tracked) return null;
  if (Date.now() - tracked.sentAt > windowMs()) {
    if (windowCloseCallback) {
      try {
        windowCloseCallback(alertType, { ...tracked });
      } catch (err) {
        log('error', 'AlertWindow', `windowCloseCallback error: ${String(err)}`);
      }
    }
    // Cancel the timer since we're handling expiry inline here
    const t = closeTimers.get(alertType);
    if (t) { clearTimeout(t); closeTimers.delete(alertType); }
    try {
      deleteWindow(alertType);
    } catch (err) {
      log('error', 'AlertWindow', `Failed to delete expired window for type=${alertType}: ${String(err)}`);
    }
    activeMessages.delete(alertType);
    return null;
  }
  // Shallow copy — callers must not mutate the stored reference.
  // Nested objects (e.g. alert.cities array) are NOT copied; mutating them corrupts in-memory state.
  return { ...tracked };
}

export function trackMessage(alertType: string, msg: TrackedMessage): void {
  activeMessages.set(alertType, msg);
  scheduleCloseTimer(alertType, msg);
  try {
    upsertWindow(alertType, msg);
  } catch (err) {
    log('error', 'AlertWindow', `Failed to persist window for type=${alertType} — restart within window may cause duplicate channel message: ${String(err)}`);
  }
}

export function clearAll(): void {
  // Cancel all pending timers before clearing
  for (const t of closeTimers.values()) clearTimeout(t);
  closeTimers.clear();
  activeMessages.clear();
  try {
    clearAllWindows();
  } catch (err) {
    log('error', 'AlertWindow', `Failed to clear all windows from DB: ${String(err)}`);
  }
}

// Clears only the in-memory map. Use in tests to reset state between cases without touching
// the DB. Use clearAll() in production reset flows (clears both memory and the DB).
export function clearMemoryOnly(): void {
  for (const t of closeTimers.values()) clearTimeout(t);
  closeTimers.clear();
  activeMessages.clear();
}

export function loadActiveMessages(): void {
  let windows: Array<{ alertType: string; msg: TrackedMessage }> = [];
  try {
    windows = loadAllWindows();
  } catch (err) {
    log('error', 'AlertWindow', `Failed to load windows from DB — starting with empty state: ${String(err)}`);
    return;
  }
  const now = Date.now();
  let restored = 0;
  for (const { alertType, msg } of windows) {
    if (now - msg.sentAt <= windowMs()) {
      activeMessages.set(alertType, msg);
      scheduleCloseTimer(alertType, msg);
      restored++;
    } else {
      try {
        deleteWindow(alertType);
      } catch (err) {
        log('error', 'AlertWindow', `Failed to delete expired window for type=${alertType}: ${String(err)}`);
      }
    }
  }
  log('info', 'AlertWindow', `Loaded ${windows.length} window(s) from DB — ${restored} active, ${windows.length - restored} expired`);
}

/** Cancel all pending close timers. Call during graceful shutdown. */
export function clearAllCloseTimers(): void {
  for (const t of closeTimers.values()) clearTimeout(t);
  closeTimers.clear();
}
