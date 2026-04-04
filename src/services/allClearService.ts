import type Database from 'better-sqlite3';
import { getSetting } from '../dashboard/settingsRepository.js';
import { log } from '../logger.js';

// Mirrors AllClearEvent from allClearTracker.ts (PR #133).
// Import from there once that PR is merged.
export interface AllClearEvent {
  zone: string;
  alertType: string;
}

export type AllClearMode = 'dm' | 'channel' | 'both';

export interface AllClearServiceDeps {
  db: Database.Database;
  chatId: string;
  sendTelegram: (chatId: string, topicId: number | undefined, text: string) => Promise<void>;
  getUserIdsByZone: (zones: string[]) => number[];
  sendDm: (userId: number, text: string) => Promise<void>;
  renderTemplate: (zone: string, alertType: string) => string;
}

export function createAllClearService(deps: AllClearServiceDeps) {
  async function handleAllClear(events: AllClearEvent[]): Promise<void> {
    const mode = (getSetting(deps.db, 'all_clear_mode') ?? 'dm') as AllClearMode;
    const topicIdStr = getSetting(deps.db, 'all_clear_topic_id');
    const topicId = topicIdStr ? Number(topicIdStr) : undefined;

    for (const { zone, alertType } of events) {
      const text = deps.renderTemplate(zone, alertType);

      if (mode === 'dm' || mode === 'both') {
        const userIds = deps.getUserIdsByZone([zone]);
        for (const userId of userIds) {
          try {
            await deps.sendDm(userId, text);
          } catch (err) {
            log('error', 'AllClear', `DM נכשל למשתמש ${userId} (אזור "${zone}"): ${String(err)}`);
          }
        }
      }

      if (mode === 'channel' || mode === 'both') {
        try {
          await deps.sendTelegram(deps.chatId, topicId, text);
        } catch (err) {
          log('error', 'AllClear', `שליחה לערוץ נכשלה (אזור "${zone}"): ${String(err)}`);
        }
      }
    }
  }

  return { handleAllClear };
}
