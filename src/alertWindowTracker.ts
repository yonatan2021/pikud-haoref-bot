import { Alert } from './types';
import { upsertWindow, deleteWindow, clearAllWindows, loadAllWindows } from './db/alertWindowRepository.js';

export interface TrackedMessage {
  messageId: number;
  chatId: string;
  topicId: number | undefined;
  alert: Alert;
  sentAt: number;
  hasPhoto: boolean;
}

const activeMessages = new Map<string, TrackedMessage>();

function windowMs(): number {
  // Re-read on each call — caching at module load would capture the env before .env is loaded;
  // also allows test overrides of the env var without requiring a module reload.
  const raw = process.env.ALERT_UPDATE_WINDOW_SECONDS;
  const parsed = parseInt(raw ?? '', 10);
  return (isNaN(parsed) || parsed <= 0 ? 120 : parsed) * 1000;
}

export function getActiveMessage(alertType: string): TrackedMessage | null {
  const tracked = activeMessages.get(alertType);
  if (!tracked) return null;
  if (Date.now() - tracked.sentAt > windowMs()) {
    try {
      deleteWindow(alertType);
    } catch (err) {
      console.error(`[AlertWindow] Failed to delete expired window for type=${alertType}:`, err);
    }
    activeMessages.delete(alertType);
    return null;
  }
  return { ...tracked }; // Shallow copy — callers must not mutate the stored reference
}

export function trackMessage(alertType: string, msg: TrackedMessage): void {
  activeMessages.set(alertType, msg);
  try {
    upsertWindow(alertType, msg);
  } catch (err) {
    console.error(`[AlertWindow] Failed to persist window for type=${alertType} — restart within window may cause duplicate channel message:`, err);
  }
}

export function clearAll(): void {
  activeMessages.clear();
  try {
    clearAllWindows();
  } catch (err) {
    console.error('[AlertWindow] Failed to clear all windows from DB:', err);
  }
}

// Clears only the in-memory map. Use in tests to reset state between cases without touching
// the DB. Use clearAll() in production reset flows (clears both memory and the DB).
export function clearMemoryOnly(): void {
  activeMessages.clear();
}

export function loadActiveMessages(): void {
  let windows: Array<{ alertType: string; msg: TrackedMessage }> = [];
  try {
    windows = loadAllWindows();
  } catch (err) {
    console.error('[AlertWindow] Failed to load windows from DB — starting with empty state:', err);
    return;
  }
  const now = Date.now();
  for (const { alertType, msg } of windows) {
    if (now - msg.sentAt <= windowMs()) {
      activeMessages.set(alertType, msg);
    } else {
      try {
        deleteWindow(alertType);
      } catch (err) {
        console.error(`[AlertWindow] Failed to delete expired window for type=${alertType}:`, err);
      }
    }
  }
}
