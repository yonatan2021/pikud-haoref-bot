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
  // Re-read on each call so test code can change the env var without module reload
  const raw = process.env.ALERT_UPDATE_WINDOW_SECONDS;
  const parsed = parseInt(raw ?? '', 10);
  return (isNaN(parsed) || parsed <= 0 ? 120 : parsed) * 1000;
}

export function getActiveMessage(alertType: string): TrackedMessage | null {
  const tracked = activeMessages.get(alertType);
  if (!tracked) return null;
  if (Date.now() - tracked.sentAt > windowMs()) {
    deleteWindow(alertType);
    activeMessages.delete(alertType);
    return null;
  }
  return { ...tracked };
}

export function trackMessage(alertType: string, msg: TrackedMessage): void {
  activeMessages.set(alertType, msg);
  upsertWindow(alertType, msg);
}

export function clearAll(): void {
  activeMessages.clear();
  clearAllWindows();
}

export function clearMemoryOnly(): void {
  activeMessages.clear();
}

export function loadActiveMessages(): void {
  const windows = loadAllWindows();
  const now = Date.now();
  const windowMs_ = (parseInt(process.env.ALERT_UPDATE_WINDOW_SECONDS ?? '120', 10)) * 1000;
  for (const { alertType, msg } of windows) {
    if (now - msg.sentAt <= windowMs_) {
      activeMessages.set(alertType, msg);
    } else {
      deleteWindow(alertType);
    }
  }
}
