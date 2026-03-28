import { getDb } from './schema.js';
import type { TrackedMessage } from '../alertWindowTracker.js';

interface RawWindowRow {
  alert_type: string;
  message_id: number;
  chat_id: string;
  topic_id: number | null;
  alert_json: string;
  sent_at: number;
  has_photo: number;
}

export function upsertWindow(alertType: string, msg: TrackedMessage): void {
  getDb().prepare(`
    INSERT INTO alert_window (alert_type, message_id, chat_id, topic_id, alert_json, sent_at, has_photo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(alert_type) DO UPDATE SET
      message_id = excluded.message_id,
      chat_id    = excluded.chat_id,
      topic_id   = excluded.topic_id,
      alert_json = excluded.alert_json,
      sent_at    = excluded.sent_at,
      has_photo  = excluded.has_photo
  `).run(
    alertType, msg.messageId, msg.chatId, msg.topicId ?? null,
    JSON.stringify(msg.alert), msg.sentAt, msg.hasPhoto ? 1 : 0
  );
}

export function deleteWindow(alertType: string): void {
  getDb().prepare('DELETE FROM alert_window WHERE alert_type = ?').run(alertType);
}

export function loadAllWindows(): Array<{ alertType: string; msg: TrackedMessage }> {
  const rows = getDb().prepare('SELECT * FROM alert_window').all() as RawWindowRow[];
  return rows
    .map((r) => {
      try {
        if (typeof r.sent_at !== 'number') {
          console.error(`[AlertWindow] Corrupt sent_at for alert_type=${r.alert_type} — skipping`);
          return null;
        }
        return {
          alertType: r.alert_type,
          msg: {
            messageId: r.message_id,
            chatId: r.chat_id,
            topicId: r.topic_id != null ? r.topic_id : undefined,
            alert: JSON.parse(r.alert_json),
            sentAt: r.sent_at,
            hasPhoto: r.has_photo === 1,
          },
        };
      } catch (err) {
        console.error(`[AlertWindow] Corrupt row for alert_type=${r.alert_type} — skipping:`, err);
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function clearAllWindows(): void {
  getDb().prepare('DELETE FROM alert_window').run();
}
