export type AlertCategory = 'security' | 'nature' | 'environmental' | 'drills' | 'general';

export interface CategoryMeta {
  labelHe: string;
  emoji: string;
  glowVariant: 'amber' | 'blue' | 'green' | 'none';
}

export const CATEGORY_META: Record<AlertCategory, CategoryMeta> = {
  security:      { labelHe: 'ביטחון',    emoji: '🛡',  glowVariant: 'amber' },
  nature:        { labelHe: 'טבע',        emoji: '🌍', glowVariant: 'blue'  },
  environmental: { labelHe: 'סביבתי',     emoji: '☢️', glowVariant: 'amber' },
  drills:        { labelHe: 'תרגילים',    emoji: '🔵', glowVariant: 'none'  },
  general:       { labelHe: 'כללי',       emoji: '📢', glowVariant: 'none'  },
};

// Mirror of topicRouter.ts ALERT_TYPE_CATEGORY — keep in sync
export const ALERT_TYPE_CATEGORY: Record<string, AlertCategory> = {
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

export const ORDERED_CATEGORIES: AlertCategory[] = ['security', 'nature', 'environmental', 'drills', 'general'];
