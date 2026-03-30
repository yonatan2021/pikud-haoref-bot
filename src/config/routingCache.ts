import Database from 'better-sqlite3';
import { getSetting } from '../dashboard/settingsRepository.js';
import { log } from '../logger.js';

export type AlertCategory = 'security' | 'nature' | 'environmental' | 'drills' | 'general';

// Duplicated from topicRouter.ts to avoid circular imports.
// Keep in sync with ALERT_TYPE_CATEGORY in topicRouter.ts.
const ALERT_TYPE_CATEGORY: Readonly<Record<string, AlertCategory>> = {
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

// Duplicated from topicRouter.ts to avoid circular imports.
// Keep in sync with CATEGORY_ENV_VAR in topicRouter.ts.
const CATEGORY_ENV_VAR: Readonly<Record<AlertCategory, string>> = {
  security: 'TELEGRAM_TOPIC_ID_SECURITY',
  nature: 'TELEGRAM_TOPIC_ID_NATURE',
  environmental: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL',
  drills: 'TELEGRAM_TOPIC_ID_DRILLS',
  general: 'TELEGRAM_TOPIC_ID_GENERAL',
};

const CATEGORY_SETTING_KEY: Readonly<Record<AlertCategory, string>> = {
  security: 'topic_id_security',
  nature: 'topic_id_nature',
  environmental: 'topic_id_environmental',
  drills: 'topic_id_drills',
  general: 'topic_id_general',
};

const ALL_CATEGORIES: ReadonlyArray<AlertCategory> = [
  'security',
  'nature',
  'environmental',
  'drills',
  'general',
];

type CategoryCache = Record<AlertCategory, number | undefined>;

let _cache: Readonly<CategoryCache> = Object.freeze({
  security: undefined,
  nature: undefined,
  environmental: undefined,
  drills: undefined,
  general: undefined,
});

let _loaded = false;

function parseTopicId(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed === 1) return undefined;
  return parsed;
}

export function loadRoutingCache(db: Database.Database): void {
  const next: CategoryCache = {
    security: undefined,
    nature: undefined,
    environmental: undefined,
    drills: undefined,
    general: undefined,
  };

  for (const category of ALL_CATEGORIES) {
    // 1. Try DB setting first (takes precedence over env var)
    const settingValue = getSetting(db, CATEGORY_SETTING_KEY[category]);
    const fromSetting = parseTopicId(settingValue);

    if (fromSetting !== undefined) {
      next[category] = fromSetting;
      continue;
    }

    // 2. Fallback to environment variable
    const envValue = process.env[CATEGORY_ENV_VAR[category]];
    next[category] = parseTopicId(envValue);
  }

  _cache = Object.freeze(next);
  _loaded = true;
  log('info', 'Routing', 'מטמון ניתוב נטען');
}

export function getTopicIdCached(alertType: string): number | undefined {
  const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
  return _cache[category];
}

export function isRoutingCacheLoaded(): boolean {
  return _loaded;
}
