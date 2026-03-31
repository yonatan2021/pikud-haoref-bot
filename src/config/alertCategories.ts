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

export const CATEGORY_ENV_VAR: Readonly<Record<AlertCategory, string>> = {
  security: 'TELEGRAM_TOPIC_ID_SECURITY',
  nature: 'TELEGRAM_TOPIC_ID_NATURE',
  environmental: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL',
  drills: 'TELEGRAM_TOPIC_ID_DRILLS',
  general: 'TELEGRAM_TOPIC_ID_GENERAL',
};
