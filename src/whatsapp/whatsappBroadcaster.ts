import type { Alert } from '../types.js';
import type Database from 'better-sqlite3';
import type { Chat, Message } from 'whatsapp-web.js';
import { MessageMedia } from 'whatsapp-web.js';
import { getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository.js';
import { getStatus, getClient } from './whatsappService.js';
import { formatAlertForWhatsApp } from './whatsappFormatter.js';
import { getSetting } from '../dashboard/settingsRepository.js';
import { log } from '../logger.js';

export interface BroadcasterDeps {
  getStatusFn: () => string;
  getClientFn: () => { getChatById: (id: string) => Promise<Chat> } | null;
  getEnabledGroupsFn: (db: Database.Database, alertType: string) => string[];
  formatFn: (alert: Alert) => string;
  scheduleFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelScheduleFn?: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultDeps: BroadcasterDeps = {
  getStatusFn: getStatus,
  getClientFn: getClient as () => { getChatById: (id: string) => Promise<Chat> } | null,
  getEnabledGroupsFn: getEnabledGroupsForAlertType,
  formatFn: formatAlertForWhatsApp,
  scheduleFn: (cb, ms) => setTimeout(cb, ms),
  cancelScheduleFn: (t) => clearTimeout(t),
};

// ─── Edit-window tracking ────────────────────────────────────────────────────
// Tracks sent text messages per group per alert type so we can edit instead of
// sending duplicates within the time window (same logic as Telegram's
// alertWindowTracker). Map images are sent via a debounce timer after text edits
// settle, so the map always shows the complete set of cities.

interface TrackedWhatsAppState {
  textMessage: Message;
  sentAt: number;
  debounceTimer?: ReturnType<typeof setTimeout>;
  latestImageBuffer?: Buffer;
  /** Monotonically increasing counter — incremented on each alert wave.
   *  Debounce callbacks capture the waveId at schedule time and skip if
   *  it no longer matches the current state (stale timer guard). */
  waveId: number;
  /** Set to true after map image is sent for this wave; reset on each new wave. */
  mapSent: boolean;
}

let nextWaveId = 1;

// Key: `${groupId}:${alertType}`
const activeMessages = new Map<string, TrackedWhatsAppState>();

function windowMs(): number {
  const raw = process.env.ALERT_UPDATE_WINDOW_SECONDS;
  const parsed = parseInt(raw ?? '', 10);
  return (isNaN(parsed) || parsed <= 0 ? 120 : parsed) * 1000;
}

function mapDebounceMs(db: Database.Database): number {
  const dbVal = getSetting(db, 'whatsapp_map_debounce_seconds');
  if (dbVal) {
    const parsed = parseInt(dbVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  const envVal = parseInt(process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS ?? '', 10);
  return (isNaN(envVal) || envVal <= 0 ? 15 : envVal) * 1000;
}

function getTracked(groupId: string, alertType: string, cancelFn: (t: ReturnType<typeof setTimeout>) => void): TrackedWhatsAppState | null {
  const key = `${groupId}:${alertType}`;
  const tracked = activeMessages.get(key);
  if (!tracked) return null;
  if (Date.now() - tracked.sentAt > windowMs()) {
    if (tracked.debounceTimer) cancelFn(tracked.debounceTimer);
    activeMessages.delete(key);
    return null;
  }
  return tracked;
}

function track(groupId: string, alertType: string, state: TrackedWhatsAppState): void {
  activeMessages.set(`${groupId}:${alertType}`, state);
}

// Exported for test isolation
export function clearTrackedMessages(): void {
  for (const state of activeMessages.values()) {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
  }
  activeMessages.clear();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendFreshText(
  chat: Chat,
  text: string,
): Promise<Message> {
  return await chat.sendMessage(text);
}

async function sendDebouncedMap(
  groupId: string,
  alertType: string,
  getClientFn: BroadcasterDeps['getClientFn'],
  expectedWaveId: number,
): Promise<void> {
  const key = `${groupId}:${alertType}`;
  const state = activeMessages.get(key);
  if (!state?.latestImageBuffer) return;

  // Stale timer guard — skip if a newer wave has superseded this one
  if (state.waveId !== expectedWaveId) return;

  // Already sent for this wave — skip duplicate
  if (state.mapSent) return;

  const client = getClientFn();
  if (!client) return;

  try {
    const chat = await client.getChatById(groupId);
    const media = new MessageMedia(
      'image/png',
      state.latestImageBuffer.toString('base64'),
      'alert-map.png',
    );
    await chat.sendMessage(media);
    state.latestImageBuffer = undefined;
    state.debounceTimer = undefined;
    state.mapSent = true;
  } catch (err: unknown) {
    log('error', 'WhatsApp', `שגיאה בשליחת מפה מושהית לקבוצה ${groupId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Broadcaster factory ─────────────────────────────────────────────────────

export function createBroadcaster(
  db: Database.Database,
  deps: BroadcasterDeps = defaultDeps,
): (alert: Alert, imageBuffer?: Buffer | null) => Promise<void> {
  const { getStatusFn, getClientFn, getEnabledGroupsFn, formatFn } = deps;
  const schedule = deps.scheduleFn ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const cancelSchedule = deps.cancelScheduleFn ?? ((t: ReturnType<typeof setTimeout>) => clearTimeout(t));

  return async function broadcastToWhatsApp(alert: Alert, imageBuffer?: Buffer | null): Promise<void> {
    if (getStatusFn() !== 'ready') {
      log('warn', 'WhatsApp', `לא מחובר — דילוג על שידור (type=${alert.type})`);
      return;
    }

    const groupIds = getEnabledGroupsFn(db, alert.type);

    if (groupIds.length === 0) {
      return;
    }

    let text: string;
    try {
      text = formatFn(alert);
    } catch (err: unknown) {
      log(
        'error',
        'WhatsApp',
        `שגיאה בעיצוב הודעה · type=${alert.type}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const whatsappClient = getClientFn();

    if (!whatsappClient) {
      log('warn', 'WhatsApp', 'client null לאחר בדיקת ready — מדלג על שידור');
      return;
    }

    const debounceDelay = mapDebounceMs(db);

    let sendCount = 0;
    let editCount = 0;
    let mapScheduledCount = 0;
    let failCount = 0;

    await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          const chat = await whatsappClient.getChatById(groupId);
          const tracked = getTracked(groupId, alert.type, cancelSchedule);

          if (tracked) {
            // Edit path — update existing text message within the window
            let updatedMessage = tracked.textMessage;
            try {
              const edited = await tracked.textMessage.edit(text);
              if (edited) {
                updatedMessage = edited;
                editCount++;
              } else {
                // Edit returned null — send fresh text
                updatedMessage = await sendFreshText(chat, text);
                sendCount++;
              }
            } catch {
              // Edit failed — send fresh text as fallback
              updatedMessage = await sendFreshText(chat, text);
              sendCount++;
            }

            // Cancel existing debounce and reschedule if image available
            if (tracked.debounceTimer) cancelSchedule(tracked.debounceTimer);
            const waveId = nextWaveId++;
            const newTimer = imageBuffer
              ? schedule(() => { sendDebouncedMap(groupId, alert.type, getClientFn, waveId); }, debounceDelay)
              : undefined;

            track(groupId, alert.type, {
              textMessage: updatedMessage,
              sentAt: Date.now(),
              debounceTimer: newTimer,
              latestImageBuffer: imageBuffer ?? tracked.latestImageBuffer,
              waveId,
              mapSent: false,
            });
            if (newTimer) mapScheduledCount++;
          } else {
            // Fresh send — text only, schedule map via debounce
            const sent = await sendFreshText(chat, text);
            sendCount++;

            const waveId = nextWaveId++;
            const timer = imageBuffer
              ? schedule(() => { sendDebouncedMap(groupId, alert.type, getClientFn, waveId); }, debounceDelay)
              : undefined;

            track(groupId, alert.type, {
              textMessage: sent,
              sentAt: Date.now(),
              debounceTimer: timer,
              latestImageBuffer: imageBuffer ?? undefined,
              waveId,
              mapSent: false,
            });
            if (timer) mapScheduledCount++;
          }
        } catch (err: unknown) {
          failCount++;
          log(
            'error',
            'WhatsApp',
            `שגיאה בשליחה לקבוצה ${groupId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );

    const totalSuccess = sendCount + editCount;
    const totalGroups = groupIds.length;
    const mapNote = mapScheduledCount > 0 ? `, ${mapScheduledCount} מפות מתוזמנות` : '';
    if (failCount === 0) {
      log('info', 'WhatsApp', `שודר לוואטסאפ: ${totalSuccess} קבוצות (${sendCount} חדש, ${editCount} עריכה${mapNote}) · type=${alert.type}`);
    } else if (totalSuccess > 0) {
      log('warn', 'WhatsApp', `שודר חלקית: ${totalSuccess}/${totalGroups} קבוצות (${sendCount} חדש, ${editCount} עריכה${mapNote}) · type=${alert.type}`);
    } else {
      log('error', 'WhatsApp', `שידור נכשל לכל הקבוצות (${totalGroups}) · type=${alert.type}`);
    }
  };
}
