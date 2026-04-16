/**
 * Pure validation function for a setting value against its schema.
 *
 * Shared by SettingField (per-field onBlur feedback) and useSettingsForm
 * (aggregate hasErrors flag disabling save button). Kept in its own module
 * to avoid circular imports between the hook and the component.
 */

import type { SettingDef } from './settingsSchema';

/** Returns Hebrew error message or null when value is valid. */
export function validateField(def: SettingDef, value: string): string | null {
  if (def.validation?.required && !value.trim()) {
    return 'שדה חובה — לא ניתן להשאיר ריק';
  }
  if (def.type === 'number' && value.trim()) {
    const n = Number(value);
    if (isNaN(n)) return 'יש להזין מספר תקין';
    if (def.validation?.min !== undefined && n < def.validation.min) {
      return `ערך מינימלי: ${def.validation.min}`;
    }
    if (def.validation?.max !== undefined && n > def.validation.max) {
      return `ערך מקסימלי: ${def.validation.max}`;
    }
  }
  if (def.type === 'json' && value.trim()) {
    try {
      JSON.parse(value);
    } catch {
      return 'JSON לא תקין — בדוק סוגריים ומירכאות';
    }
  }
  if (def.validation?.pattern && value.trim()) {
    if (!def.validation.pattern.test(value)) {
      return def.validation.patternError ?? 'פורמט לא תקין';
    }
  }
  return null;
}
