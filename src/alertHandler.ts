import type { Alert } from './types';
import type { TrackedMessage } from './alertWindowTracker';
import { log, logAlert } from './logger.js';
import { ALERT_TYPE_HE, ALERT_TYPE_EMOJI, isMessageGoneError } from './telegramBot.js';
import { ALERT_TYPE_CATEGORY } from './topicRouter.js';

export interface AlertHandlerDeps {
  chatId: string;
  generateMapImage: (alert: Alert) => Promise<Buffer | null>;
  sendAlert: (
    alert: Alert,
    imageBuffer: Buffer | null,
    topicId?: number,
    serial?: number,
    density?: 'חריג' | 'רגיל' | null
  ) => Promise<{ messageId: number; hasPhoto: boolean }>;
  editAlert: (
    tracked: { messageId: number; chatId: string; hasPhoto: boolean },
    alert: Alert,
    imageBuffer: Buffer | null,
    serial?: number,
    density?: 'חריג' | 'רגיל' | null
  ) => Promise<void>;
  getActiveMessage: (alertType: string) => TrackedMessage | null;
  trackMessage: (alertType: string, msg: TrackedMessage) => void;
  notifySubscribers: (alert: Alert) => void;
  shouldSkipMap: (alertType: string, instructions?: string) => boolean;
  getTopicId: (alertType: string) => number | undefined;
  insertAlertHistory: (alert: Alert) => void;
  broadcastToWhatsApp?: (alert: Alert, imageBuffer?: Buffer | null) => Promise<void>;
  dispatchSafetyPrompts?: (alert: Alert) => Promise<void>;
  getNextSerial?: () => number;
  getDensityHint?: () => 'חריג' | 'רגיל' | null;
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
    dispatchSafetyPrompts,
    getNextSerial,
    getDensityHint,
  } = deps;

  const skipMap = shouldSkipMap(alert.type, alert.instructions);
  const topicId = getTopicId(alert.type);
  const serial = getNextSerial?.();
  const density = getDensityHint?.();

  // The resolved alert that DM subscribers should receive — either the merged
  // alert (edit path) or the original (fresh send path).
  let finalAlert = alert;
  let sentToGroup = false;
  let wasEdit = false;
  // Cities to dispatch to DM subscribers — only NEW cities on the edit path,
  // full list on the fresh send path.
  let dmCities = alert.cities;
  // Map image buffer — captured for reuse by WhatsApp broadcast
  let lastImageBuffer: Buffer | null = null;

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
      lastImageBuffer = imageBuffer;

      let editHandled = false;
      try {
        await editAlert(active, mergedAlert, imageBuffer, serial, density);
        trackMessage(alert.type, { ...active, alert: mergedAlert });
        editHandled = true;
        sentToGroup = true;
        wasEdit = true;
      } catch (editErr) {
        if (isMessageGoneError(editErr)) {
          // Message was deleted or is too old to edit — fall back to sending a fresh message
          log('error', 'AlertHandler', `עריכת הודעה נכשלה — הודעה לא קיימת, שולח הודעה חדשה: ${editErr}`);
        } else {
          // editAlert handles all other errors internally (degraded chain).
          // If it still throws here it is an unexpected internal error — log and treat as handled
          // to avoid sending a duplicate fresh message.
          log('error', 'AlertHandler', `editAlert נכשל בצורה בלתי צפויה — type=${alert.type}: ${editErr}`);
          trackMessage(alert.type, { ...active, alert: mergedAlert });
          editHandled = true;
        }
      }

      if (!editHandled) {
        try {
          const sent = await sendAlert(mergedAlert, imageBuffer, topicId, serial, density);
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
      lastImageBuffer = imageBuffer;
      const sent = await sendAlert(alert, imageBuffer, topicId, serial, density);
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
    if (!sentToGroup) {
      log('warn', 'AlertHandler', `DM נשלח למרות כישלון ערוץ — type=${alert.type}, ${dmCities.length} ערים`);
    }
    notifySubscribers({ ...alert, cities: dmCities });
    dispatchSafetyPrompts?.({ ...alert, cities: dmCities })
      .catch((err) => log('error', 'AlertHandler', `[safetyPrompts] ${err}`));
  }

  if (broadcastToWhatsApp) {
    try {
      await broadcastToWhatsApp(finalAlert, lastImageBuffer);
    } catch (err) {
      log('error', 'AlertHandler', `כישלון בשידור לוואטסאפ type=${alert.type} cities=${finalAlert.cities.length}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
  }
}
