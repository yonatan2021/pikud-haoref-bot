import { getAllTemplates } from '../db/messageTemplateRepository.js';
import { getDb } from '../db/schema.js';
import { log } from '../logger.js';
import {
  DEFAULT_ALERT_TYPE_HE,
  DEFAULT_ALERT_TYPE_EMOJI,
  DEFAULT_INSTRUCTIONS_PREFIX,
  ALL_ALERT_TYPES,
} from './alertTypeDefaults.js';

export interface CacheEntry {
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
  bodyTemplate: string | null;
}

function buildDefaultCache(): Record<string, CacheEntry> {
  const result: Record<string, CacheEntry> = {};
  for (const alertType of ALL_ALERT_TYPES) {
    result[alertType] = {
      emoji: DEFAULT_ALERT_TYPE_EMOJI[alertType] ?? '⚠️',
      titleHe: DEFAULT_ALERT_TYPE_HE[alertType] ?? DEFAULT_ALERT_TYPE_HE['unknown'] ?? 'התרעה',
      instructionsPrefix:
        DEFAULT_INSTRUCTIONS_PREFIX[alertType] ?? DEFAULT_INSTRUCTIONS_PREFIX['_default'] ?? '🛡',
      bodyTemplate: null,
    };
  }
  return result;
}

let _cache: Readonly<Record<string, CacheEntry>> = Object.freeze(buildDefaultCache());

export function loadTemplateCache(): void {
  const rows = getAllTemplates(getDb());
  const overrides = Object.fromEntries(
    rows.map((row) => [
      row.alert_type,
      {
        emoji: row.emoji,
        titleHe: row.title_he,
        instructionsPrefix: row.instructions_prefix,
        bodyTemplate: row.body_template ?? null,
      },
    ])
  );
  _cache = Object.freeze({ ...buildDefaultCache(), ...overrides });
  log('info', 'Templates', `מטמון תבניות נטען — ${rows.length} עקיפות`);
}

export function getEmoji(alertType: string): string {
  return _cache[alertType]?.emoji ?? DEFAULT_ALERT_TYPE_EMOJI['unknown'] ?? '⚠️';
}

export function getTitleHe(alertType: string): string {
  return _cache[alertType]?.titleHe ?? DEFAULT_ALERT_TYPE_HE['unknown'] ?? 'התרעה';
}

export function getInstructionsPrefix(alertType: string): string {
  return _cache[alertType]?.instructionsPrefix ?? DEFAULT_INSTRUCTIONS_PREFIX['_default'] ?? '🛡';
}

export function getBodyTemplate(alertType: string): string | null {
  return _cache[alertType]?.bodyTemplate ?? null;
}

export function getAllCached(): Readonly<Record<string, CacheEntry>> {
  return _cache;
}
