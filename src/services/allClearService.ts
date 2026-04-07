import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { getSetting } from '../dashboard/settingsRepository.js';
import { log } from '../logger.js';
import { clearStalePromptMessages } from './safetyPromptService.js';
import { deleteUnrespondedPromptsByAlertType } from '../db/safetyPromptRepository.js';
import { ALERT_TYPE_CATEGORY } from '../topicRouter.js';
import type { AllClearEvent } from './allClearTracker.js';
import type { SubscriberInfo } from '../db/subscriptionRepository.js';
export type { AllClearEvent };

export type AllClearMode = 'dm' | 'channel' | 'both';

export interface AllClearServiceDeps {
  db: Database.Database;
  chatId: string;
  sendTelegram: (chatId: string, topicId: number | undefined, text: string) => Promise<void>;
  getUsersByHomeCityInCities: (cityNames: string[]) => SubscriberInfo[];
  shouldSkipForQuietHours: (alertType: string, quietEnabled: boolean, now: Date) => boolean;
  sendDm: (userId: number, text: string) => Promise<void>;
  renderTemplate: (zone: string, alertType: string) => string;
  bot?: Bot; // when set, edits stale safety-prompt messages before deleting on all-clear
}

export function createAllClearService(deps: AllClearServiceDeps) {
  async function handleAllClear(events: AllClearEvent[]): Promise<void> {
    const mode = (getSetting(deps.db, 'all_clear_mode') ?? 'dm') as AllClearMode;
    const topicIdStr = getSetting(deps.db, 'all_clear_topic_id');
    const topicId = topicIdStr ? Number(topicIdStr) : undefined;

    for (const { zone, alertType, alertCities } of events) {
      let text: string;
      try {
        text = deps.renderTemplate(zone, alertType);
      } catch (renderErr) {
        log('error', 'AllClear', `שגיאה ב-renderTemplate zone="${zone}": ${String(renderErr)}`);
        continue;
      }

      if (mode === 'dm' || mode === 'both') {
        const subscribers = deps.getUsersByHomeCityInCities(alertCities);
        const now = new Date();

        // DM-specific all-clear text (configurable via dashboard). Falls back to channel template.
        const dmAllClearRaw = getSetting(deps.db, 'dm_all_clear_text') || null;

        // Quiet-hours and snooze: only suppress drills/general categories.
        // Security, nature, and environmental alerts always pass through.
        const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
        const muteApplies = category === 'drills' || category === 'general';

        let skippedQH = 0;
        let skippedMuted = 0;

        for (const subscriber of subscribers) {
          // Quiet-hours filter
          if (deps.shouldSkipForQuietHours(alertType, subscriber.quiet_hours_enabled, now)) {
            skippedQH++;
            continue;
          }
          // Snooze filter
          if (muteApplies && subscriber.muted_until && new Date(subscriber.muted_until) > now) {
            skippedMuted++;
            continue;
          }
          // Personalize DM: substitute {{עיר}} with subscriber's home city
          const dmText = dmAllClearRaw
            ? dmAllClearRaw.replace(/\{\{עיר\}\}/g, subscriber.home_city ?? zone)
            : text;
          // In production, sendDm enqueues synchronously via dmQueue — delivery errors are
          // handled by the queue's per-message retry logic, not by this catch block.
          try {
            await deps.sendDm(subscriber.chat_id, dmText);
          } catch (err) {
            log('error', 'AllClear', `DM נכשל למשתמש ${subscriber.chat_id} (אזור "${zone}"): ${String(err)}`);
          }
        }

        if (skippedQH > 0) log('info', 'AllClear', `🔕 שעות שקט: ${skippedQH} מנויים דולגו (${alertType})`);
        if (skippedMuted > 0) log('info', 'AllClear', `🔇 מושתק: ${skippedMuted} מנויים דולגו (${alertType})`);
      }

      if (mode === 'channel' || mode === 'both') {
        try {
          await deps.sendTelegram(deps.chatId, topicId, text);
        } catch (err) {
          log('error', 'AllClear', `שליחה לערוץ נכשלה (אזור "${zone}"): ${String(err)}`);
        }
      }

      // Edit stale prompt messages BEFORE deleting rows (rows must exist for the query).
      if (deps.bot) {
        await clearStalePromptMessages(deps.db, deps.bot, alertType).catch((err) =>
          log('error', 'AllClear', `כישלון בעדכון הודעות בטיחות: ${String(err)}`)
        );
      }

      const cleared = deleteUnrespondedPromptsByAlertType(deps.db, alertType);
      if (cleared > 0) {
        log('info', 'SAFETY', `נוקו ${cleared} פרומפטים ישנים לסוג: ${alertType}`);
      }
    }
  }

  return { handleAllClear };
}
