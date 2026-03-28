import type { Alert } from './types';
import type { TrackedMessage } from './alertWindowTracker';

export interface AlertHandlerDeps {
  chatId: string;
  generateMapImage: (alert: Alert) => Promise<Buffer | null>;
  sendAlert: (
    alert: Alert,
    imageBuffer: Buffer | null,
    topicId?: number
  ) => Promise<{ messageId: number; hasPhoto: boolean }>;
  editAlert: (
    tracked: { messageId: number; chatId: string; hasPhoto: boolean },
    alert: Alert,
    imageBuffer: Buffer | null
  ) => Promise<void>;
  getActiveMessage: (alertType: string) => TrackedMessage | null;
  trackMessage: (alertType: string, msg: TrackedMessage) => void;
  notifySubscribers: (alert: Alert) => void;
  shouldSkipMap: (alertType: string) => boolean;
  getTopicId: (alertType: string) => number | undefined;
  insertAlertHistory: (alert: Alert) => void;
}

function isUnmodifiedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('message is not modified');
}

export async function handleNewAlert(alert: Alert, deps: AlertHandlerDeps): Promise<void> {
  const {
    chatId,
    generateMapImage,
    sendAlert,
    editAlert,
    getActiveMessage,
    trackMessage,
    notifySubscribers,
    shouldSkipMap,
    getTopicId,
    insertAlertHistory,
  } = deps;

  const skipMap = shouldSkipMap(alert.type);
  const topicId = getTopicId(alert.type);

  // The resolved alert that DM subscribers should receive — either the merged
  // alert (edit path) or the original (fresh send path).
  let finalAlert = alert;

  // Channel broadcast
  try {
    const active = getActiveMessage(alert.type);

    if (active) {
      const mergedAlert: Alert = {
        ...active.alert,
        cities: Array.from(new Set([...active.alert.cities, ...alert.cities])),
        instructions: alert.instructions ?? active.alert.instructions,
      };
      finalAlert = mergedAlert;

      let imageBuffer: Buffer | null = null;
      if (!skipMap) {
        try {
          imageBuffer = await generateMapImage(mergedAlert);
        } catch (mapErr) {
          console.error('[AlertHandler] Map generation failed — sending text-only:', mapErr);
        }
      }

      let editHandled = false;
      try {
        await editAlert(active, mergedAlert, imageBuffer);
        trackMessage(alert.type, { ...active, alert: mergedAlert });
        editHandled = true;
      } catch (editErr) {
        if (isUnmodifiedError(editErr)) {
          // Telegram 400 "message is not modified" — content unchanged, treat as success
          trackMessage(alert.type, { ...active, alert: mergedAlert });
          editHandled = true;
        } else {
          console.error('[AlertHandler] Edit failed — sending new message:', editErr);
        }
      }

      if (!editHandled) {
        try {
          const sent = await sendAlert(mergedAlert, imageBuffer, topicId);
          trackMessage(alert.type, {
            messageId: sent.messageId,
            chatId,
            topicId,
            alert: mergedAlert,
            sentAt: Date.now(),
            hasPhoto: sent.hasPhoto,
          });
          try {
            insertAlertHistory(mergedAlert);
          } catch (histErr) {
            console.error(`[AlertHandler] Failed to insert alert history (type=${alert.type}, cities=${mergedAlert.cities.length}):`, histErr);
          }
        } catch (sendErr) {
          throw new Error('[AlertHandler] Sending new message failed after edit failure', { cause: sendErr });
        }
      }
    } else {
      let imageBuffer: Buffer | null = null;
      if (!skipMap) {
        try {
          imageBuffer = await generateMapImage(alert);
        } catch (mapErr) {
          console.error('[AlertHandler] Map generation failed — sending text-only:', mapErr);
        }
      }
      const sent = await sendAlert(alert, imageBuffer, topicId);
      trackMessage(alert.type, {
        messageId: sent.messageId,
        chatId,
        topicId,
        alert,
        sentAt: Date.now(),
        hasPhoto: sent.hasPhoto,
      });
      try {
        insertAlertHistory(alert);
      } catch (histErr) {
        console.error(`[AlertHandler] Failed to insert alert history (type=${alert.type}, cities=${alert.cities.length}):`, histErr);
      }
    }
  } catch (err) {
    console.error('[AlertHandler] Error handling alert:', err);
  }

  // DM notifications — use the merged alert so subscribers see all cities
  notifySubscribers(finalAlert);
}
