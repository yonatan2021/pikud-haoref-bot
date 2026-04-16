import type Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { getBool, getNumber, getString } from '../config/configResolver.js';
import { computeAlertFingerprint } from '../alertHelpers.js';
import { getCityData } from '../cityLookup.js';
import { getUsersForCities } from '../db/subscriptionRepository.js';
import { shouldSkipForQuietHours } from './dmDispatcher.js';
import {
  createPulse,
  getLastResponseTime,
} from '../db/communityPulseRepository.js';
import type { TrackedMessage } from '../alertWindowTracker.js';
import { log } from '../logger.js';

export interface CommunityPulseDeps {
  /** Override send fan-out for tests. Defaults to Promise.allSettled over direct bot calls. */
  enqueue?: (tasks: Array<() => Promise<void>>) => void;
  now?: Date;
}

function getZonesFromCities(cities: string[]): string[] {
  const seen = new Set<string>();
  for (const city of cities) {
    const zone = getCityData(city)?.zone;
    if (zone) seen.add(zone);
  }
  return Array.from(seen);
}

/**
 * Called from alertWindowTracker close callback when a window expires.
 * Fans out a survey DM to all subscribers in the affected zones.
 */
export async function fireCommunityPulse(
  db: Database.Database,
  bot: Bot,
  alertType: string,
  trackedAlert: TrackedMessage,
  deps?: CommunityPulseDeps
): Promise<void> {
  const cities = trackedAlert.alert.cities ?? [];
  if (cities.length === 0) {
    log('info', 'CommunityPulse', `no cities for alertType=${alertType} — skipping pulse`);
    return;
  }

  const pulseEnabled = getBool(db, 'pulse_enabled', true);
  if (!pulseEnabled) {
    log('info', 'CommunityPulse', `pulse_enabled=false — skipping for ${alertType}`);
    return;
  }

  const now = deps?.now ?? new Date();
  const fingerprint = computeAlertFingerprint(alertType, cities);
  const zones = getZonesFromCities(cities);

  const pulse = createPulse(db, fingerprint, alertType, zones);

  const cooldownHours = getNumber(db, 'pulse_cooldown_hours', 6);
  const promptText = getString(db, 'pulse_prompt_text', 'איך אתה מרגיש אחרי האזעקה?');

  const subscribers = getUsersForCities(cities);
  log('info', 'CommunityPulse', `pulse id=${pulse.id} — ${subscribers.length} מנויים · ${alertType}`);

  const tasks: Array<() => Promise<void>> = [];

  for (const sub of subscribers) {
    if (!sub) continue;

    // Quiet-hours check
    if (shouldSkipForQuietHours(alertType, sub.quiet_hours_enabled, now)) continue;

    // Snooze check
    if (sub.muted_until && new Date(sub.muted_until) > now) continue;

    // Cooldown: skip if user responded to any pulse in last N hours
    const lastResponse = getLastResponseTime(db, sub.chat_id);
    if (lastResponse) {
      const msDiff = now.getTime() - new Date(lastResponse).getTime();
      const hoursDiff = msDiff / (1000 * 60 * 60);
      if (hoursDiff < cooldownHours) continue;
    }

    const chatId = sub.chat_id;
    const pulseId = pulse.id;

    tasks.push(async () => {
      const reply_markup = {
        inline_keyboard: [[
          { text: '✅ בסדר',          callback_data: `pulse:ok:${pulseId}`      },
          { text: '😰 מפחד/ת',        callback_data: `pulse:scared:${pulseId}`  },
          { text: '🤝 עוזר/ת לאחרים', callback_data: `pulse:helping:${pulseId}` },
        ]],
      };
      try {
        await bot.api.sendMessage(chatId, promptText, {
          parse_mode: 'HTML',
          reply_markup,
        });
      } catch (err) {
        log('error', 'CommunityPulse', `כישלון בשליחה ל-${chatId}: ${String(err)}`);
      }
    });
  }

  if (tasks.length === 0) {
    log('info', 'CommunityPulse', `pulse id=${pulse.id} — אין מנויים להשלחה`);
    return;
  }

  log('info', 'CommunityPulse', `שולחים ${tasks.length} סקרים · pulse=${pulse.id}`);

  const enqueue = deps?.enqueue;
  if (enqueue) {
    enqueue(tasks);
  } else {
    Promise.allSettled(tasks.map((fn) => fn())).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        log('error', 'CommunityPulse', `${failed}/${results.length} שליחות נכשלו · pulse=${pulse.id}`);
      }
    });
  }
}
