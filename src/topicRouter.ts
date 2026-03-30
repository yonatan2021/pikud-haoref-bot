import { isRoutingCacheLoaded, getTopicIdCached } from './config/routingCache.js';

export type AlertCategory = 'security' | 'nature' | 'environmental' | 'drills' | 'general';

export const ALERT_TYPE_CATEGORY: Readonly<Record<string, AlertCategory>> = {
  missiles: 'security',
  hostileAircraftIntrusion: 'security',
  terroristInfiltration: 'security',

  earthQuake: 'nature',
  tsunami: 'nature',

  hazardousMaterials: 'environmental',
  radiologicalEvent: 'environmental',

  missilesDrill: 'drills',
  earthQuakeDrill: 'drills',
  tsunamiDrill: 'drills',
  hostileAircraftIntrusionDrill: 'drills',
  hazardousMaterialsDrill: 'drills',
  terroristInfiltrationDrill: 'drills',
  radiologicalEventDrill: 'drills',
  generalDrill: 'drills',

  newsFlash: 'general',
  general: 'general',
  unknown: 'general',
};

const CATEGORY_ENV_VAR: Record<AlertCategory, string> = {
  security: 'TELEGRAM_TOPIC_ID_SECURITY',
  nature: 'TELEGRAM_TOPIC_ID_NATURE',
  environmental: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL',
  drills: 'TELEGRAM_TOPIC_ID_DRILLS',
  general: 'TELEGRAM_TOPIC_ID_GENERAL',
};

/**
 * Returns the Telegram message_thread_id for the given alert type,
 * or undefined if the env var for that category is not set or is invalid.
 * Topic ID 1 is rejected — it is reserved in Telegram forum groups and causes
 * "message thread not found" errors.
 *
 * When the routing cache has been loaded (after DB init), the cache is used
 * so that dashboard-configured topic IDs take effect without a restart.
 */
export function getTopicId(alertType: string): number | undefined {
  if (isRoutingCacheLoaded()) return getTopicIdCached(alertType);
  const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
  const envVar = CATEGORY_ENV_VAR[category];
  const raw = process.env[envVar];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed === 1) return undefined;
  return parsed;
}
