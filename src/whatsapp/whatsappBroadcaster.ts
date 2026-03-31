import type { Alert } from '../types.js';
import type Database from 'better-sqlite3';
import type { Chat, Message } from 'whatsapp-web.js';
import { MessageMedia } from 'whatsapp-web.js';
import { getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository.js';
import { getStatus, getClient } from './whatsappService.js';
import { formatAlertForWhatsApp } from './whatsappFormatter.js';
import { log } from '../logger.js';

export interface BroadcasterDeps {
  getStatusFn: () => string;
  getClientFn: () => { getChatById: (id: string) => Promise<Chat> } | null;
  getEnabledGroupsFn: (db: Database.Database, alertType: string) => string[];
  formatFn: (alert: Alert) => string;
}

const defaultDeps: BroadcasterDeps = {
  getStatusFn: getStatus,
  getClientFn: getClient as () => { getChatById: (id: string) => Promise<Chat> } | null,
  getEnabledGroupsFn: getEnabledGroupsForAlertType,
  formatFn: formatAlertForWhatsApp,
};

// ─── Edit-window tracking ────────────────────────────────────────────────────
// Tracks sent messages per group per alert type so we can edit instead of
// sending duplicates within the time window (same logic as Telegram's
// alertWindowTracker).

interface TrackedWhatsAppMessage {
  message: Message;
  sentAt: number;
}

// Key: `${groupId}:${alertType}`
const activeMessages = new Map<string, TrackedWhatsAppMessage>();

function windowMs(): number {
  const raw = process.env.ALERT_UPDATE_WINDOW_SECONDS;
  const parsed = parseInt(raw ?? '', 10);
  return (isNaN(parsed) || parsed <= 0 ? 120 : parsed) * 1000;
}

function getTracked(groupId: string, alertType: string): TrackedWhatsAppMessage | null {
  const key = `${groupId}:${alertType}`;
  const tracked = activeMessages.get(key);
  if (!tracked) return null;
  if (Date.now() - tracked.sentAt > windowMs()) {
    activeMessages.delete(key);
    return null;
  }
  return tracked;
}

function track(groupId: string, alertType: string, message: Message): void {
  activeMessages.set(`${groupId}:${alertType}`, { message, sentAt: Date.now() });
}

// Exported for test isolation
export function clearTrackedMessages(): void {
  activeMessages.clear();
}

// ─── Broadcaster factory ─────────────────────────────────────────────────────

export function createBroadcaster(
  db: Database.Database,
  deps: BroadcasterDeps = defaultDeps
): (alert: Alert, imageBuffer?: Buffer | null) => Promise<void> {
  const { getStatusFn, getClientFn, getEnabledGroupsFn, formatFn } = deps;

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
        `שגיאה בעיצוב הודעה · type=${alert.type}: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    const whatsappClient = getClientFn();

    if (!whatsappClient) {
      log('warn', 'WhatsApp', 'client null לאחר בדיקת ready — מדלג על שידור');
      return;
    }

    // Build media object from image buffer (if available)
    const media = imageBuffer
      ? new MessageMedia('image/png', imageBuffer.toString('base64'), 'alert-map.png')
      : null;

    let sendCount = 0;
    let editCount = 0;
    let failCount = 0;

    await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          const tracked = getTracked(groupId, alert.type);

          if (tracked) {
            // Edit path — update existing message within the window.
            // WhatsApp msg.edit() only supports text edits, not media replacement.
            // Edit the caption/text; the original image stays.
            try {
              const edited = await tracked.message.edit(text);
              if (edited) {
                track(groupId, alert.type, edited);
                editCount++;
              } else {
                // edit returned null (message too old or deleted) — send fresh
                const chat = await whatsappClient.getChatById(groupId);
                const sent = media
                  ? await chat.sendMessage(media, { caption: text })
                  : await chat.sendMessage(text);
                track(groupId, alert.type, sent);
                sendCount++;
              }
            } catch {
              // Edit failed — send fresh message as fallback
              const chat = await whatsappClient.getChatById(groupId);
              const sent = media
                ? await chat.sendMessage(media, { caption: text })
                : await chat.sendMessage(text);
              track(groupId, alert.type, sent);
              sendCount++;
            }
          } else {
            // Fresh send — no active message in window
            const chat = await whatsappClient.getChatById(groupId);
            const sent = media
              ? await chat.sendMessage(media, { caption: text })
              : await chat.sendMessage(text);
            track(groupId, alert.type, sent);
            sendCount++;
          }
        } catch (err: unknown) {
          failCount++;
          log(
            'error',
            'WhatsApp',
            `שגיאה בשליחה לקבוצה ${groupId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })
    );

    const totalSuccess = sendCount + editCount;
    const totalGroups = groupIds.length;
    if (failCount === 0) {
      log('info', 'WhatsApp', `שודר לוואטסאפ: ${totalSuccess} קבוצות (${sendCount} חדש, ${editCount} עריכה) · type=${alert.type}`);
    } else if (totalSuccess > 0) {
      log('warn', 'WhatsApp', `שודר חלקית: ${totalSuccess}/${totalGroups} קבוצות (${sendCount} חדש, ${editCount} עריכה) · type=${alert.type}`);
    } else {
      log('error', 'WhatsApp', `שידור נכשל לכל הקבוצות (${totalGroups}) · type=${alert.type}`);
    }
  };
}
