import type { Alert } from './types';
import type { TrackedMessage } from './alertWindowTracker';
import { log, logAlert } from './logger.js';
import { ALERT_TYPE_HE, ALERT_TYPE_EMOJI } from './telegramBot.js';
import { ALERT_TYPE_CATEGORY } from './topicRouter.js';

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
  broadcastToWhatsApp?: (alert: Alert) => Promise<void>;
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
    broadcastToWhatsApp,
  } = deps;

  const skipMap = shouldSkipMap(alert.type);
  const topicId = getTopicId(alert.type);

  // The resolved alert that DM subscribers should receive — either the merged
  // alert (edit path) or the original (fresh send path).
  let finalAlert = alert;
  let sentToGroup = false;
  let wasEdit = false;
  // Cities to dispatch to DM subscribers — only NEW cities on the edit path,
  // full list on the fresh send path.
  let dmCities = alert.cities;

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

      const prevCitySet = new Set(active.alert.cities);
      dmCities = alert.cities.filter((c) => !prevCitySet.has(c));

      let imageBuffer: Buffer | null = null;
      if (!skipMap) {
        try {
          imageBuffer = await generateMapImage(mergedAlert);
        } catch (mapErr) {
          log('error', 'AlertHandler', `כישלון ביצירת מפה (עריכה) — שולח טקסט בלבד: ${mapErr}`);
        }
      }

      let editHandled = false;
      try {
        await editAlert(active, mergedAlert, imageBuffer);
        trackMessage(alert.type, { ...active, alert: mergedAlert });
        editHandled = true;
        sentToGroup = true;
        wasEdit = true;
      } catch (editErr) {
        if (isUnmodifiedError(editErr)) {
          // Telegram 400 "message is not modified" — content unchanged, treat as success
          log('warn', 'AlertHandler', `הודעה לא שונתה (Telegram 400) — type=${alert.type}, cities=${mergedAlert.cities.length}`);
          trackMessage(alert.type, { ...active, alert: mergedAlert });
          editHandled = true;
          sentToGroup = true;
          wasEdit = true;
        } else {
          log('error', 'AlertHandler', `עריכת הודעה נכשלה — שולח הודעה חדשה: ${editErr}`);
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
          sentToGroup = true;
          try {
            insertAlertHistory(mergedAlert);
          } catch (histErr) {
            log('error', 'AlertHandler', `כישלון בשמירת היסטוריה (type=${alert.type}, cities=${mergedAlert.cities.length}): ${histErr}`);
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
          log('error', 'AlertHandler', `כישלון ביצירת מפה — שולח טקסט בלבד: ${mapErr}`);
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
      sentToGroup = true;
      try {
        insertAlertHistory(alert);
      } catch (histErr) {
        log('error', 'AlertHandler', `כישלון בשמירת היסטוריה (type=${alert.type}, cities=${alert.cities.length}): ${histErr}`);
      }
    }
  } catch (err) {
    log('error', 'AlertHandler', `כישלון בשידור לערוץ type=${alert.type} cities=${alert.cities.length}: ${err}`);
    // DM dispatch still runs below — alert data is valid even if channel post failed
  }

  logAlert({
    emoji:     ALERT_TYPE_EMOJI[alert.type] ?? '⚠️',
    titleHe:   ALERT_TYPE_HE[alert.type] ?? ALERT_TYPE_HE['unknown'] ?? 'התרעה',
    category:  ALERT_TYPE_CATEGORY[alert.type] ?? 'general',
    cities:    finalAlert.cities,
    sentToGroup,
    isEdit:    wasEdit,
  });

  // DM dispatch is outside the channel try/catch — a channel failure must not prevent
  // subscriber notification; alert data is valid regardless of whether the channel post succeeded.
  // On the edit path, only dispatch cities that are NEW (not already sent in a prior DM).
  if (dmCities.length > 0) {
    // Spread original `alert` (not `finalAlert`): DM subscribers receive the incoming
    // alert's type/instructions with only the NEW cities (dmCities). `finalAlert` is
    // the merged channel state used for Telegram channel edits only.
    notifySubscribers({ ...alert, cities: dmCities });
  }

  if (broadcastToWhatsApp) {
    try {
      await broadcastToWhatsApp(finalAlert);
    } catch (err) {
      log('error', 'AlertHandler', `כישלון בשידור לוואטסאפ type=${alert.type} cities=${finalAlert.cities.length}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
  }
}
