type AlertCategory = 'security' | 'nature' | 'environmental' | 'drills' | 'general';

const ALERT_TYPE_CATEGORY: Record<string, AlertCategory> = {
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
 * or undefined if the env var for that category is not set.
 */
export function getTopicId(alertType: string): number | undefined {
  const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
  const envVar = CATEGORY_ENV_VAR[category];
  const raw = process.env[envVar];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? undefined : parsed;
}
