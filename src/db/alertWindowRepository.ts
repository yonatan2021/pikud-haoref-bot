import { getDb } from './schema.js';
import type { TrackedMessage } from '../alertWindowTracker.js';

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
  const rows = getDb().prepare('SELECT * FROM alert_window').all() as any[];
  return rows
    .map((r) => {
      try {
        return {
          alertType: r.alert_type as string,
          msg: {
            messageId: r.message_id as number,
            chatId: r.chat_id as string,
            topicId: r.topic_id != null ? (r.topic_id as number) : undefined,
            alert: JSON.parse(r.alert_json as string),
            sentAt: r.sent_at as number,
            hasPhoto: r.has_photo === 1,
          },
        };
      } catch (err) {
        console.error(`[AlertWindow] Corrupt row for alert_type=${r.alert_type as string} — skipping:`, err);
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function clearAllWindows(): void {
  getDb().prepare('DELETE FROM alert_window').run();
}
