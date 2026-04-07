import crypto from 'crypto';

/** Returns a stable SHA1 hex fingerprint for an alert, order-independent over cities. */
export function computeAlertFingerprint(alertType: string, cities: string[]): string {
  const sorted = [...cities].sort().join(',');
  return crypto.createHash('sha1').update(`${alertType}:${sorted}`).digest('hex');
}

/** Exported for testing — checks if an alert type is a drill. */
export function isDrillAlert(alertType: string): boolean {
  return alertType.endsWith('Drill');
}

/** Exported for testing — checks if instructions indicate a pre-warning / preliminary alert. */
export function isPreliminaryAlert(instructions?: string): boolean {
  if (!instructions) return false;
  return (
    instructions.includes('בדקות הקרובות') ||
    instructions.includes('התראה מקדימה') ||
    instructions.includes('צפויות להתקבל')
  );
}

/** Exported for testing — determines if we should skip map generation for this alert.
 *  Preliminary newsFlash alerts (pre-warnings) DO get a map for zone-level context. */
export function shouldSkipMap(alertType: string, instructions?: string): boolean {
  if (alertType === 'newsFlash') {
    return !isPreliminaryAlert(instructions);
  }
  if (process.env.MAPBOX_SKIP_DRILLS === 'true' && isDrillAlert(alertType)) return true;
  return false;
}
