import type { Alert } from '../types.js';
import type Database from 'better-sqlite3';
import type { Chat } from 'whatsapp-web.js';
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

export function createBroadcaster(
  db: Database.Database,
  deps: BroadcasterDeps = defaultDeps
): (alert: Alert) => Promise<void> {
  const { getStatusFn, getClientFn, getEnabledGroupsFn, formatFn } = deps;

  return async function broadcastToWhatsApp(alert: Alert): Promise<void> {
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

    let failCount = 0;
    await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          const chat = await whatsappClient.getChatById(groupId);
          await chat.sendMessage(text);
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

    const successCount = groupIds.length - failCount;
    if (failCount === 0) {
      log('info', 'WhatsApp', `שודר לוואטסאפ: ${successCount} קבוצות · type=${alert.type}`);
    } else if (successCount > 0) {
      log('warn', 'WhatsApp', `שודר חלקית: ${successCount}/${groupIds.length} קבוצות · type=${alert.type}`);
    } else {
      log('error', 'WhatsApp', `שידור נכשל לכל הקבוצות (${groupIds.length}) · type=${alert.type}`);
    }
  };
}
