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
 *  Preliminary newsFlash alerts (pre-warnings) DO get a map for zone-level context.
 *  `skipDrillsFn` is an injectable resolver for the `mapbox_skip_drills` flag;
 *  defaults to reading `process.env.MAPBOX_SKIP_DRILLS` directly (useful for
 *  unit tests). Production (src/index.ts) injects a DB-backed resolver via
 *  `getBool(db, 'mapbox_skip_drills', false)` so dashboard edits take effect
 *  without a restart. */
export function shouldSkipMap(
  alertType: string,
  instructions?: string,
  skipDrillsFn: () => boolean = () => process.env.MAPBOX_SKIP_DRILLS === 'true',
): boolean {
  if (alertType === 'newsFlash') {
    return !isPreliminaryAlert(instructions);
  }
  if (isDrillAlert(alertType) && skipDrillsFn()) return true;
  return false;
}
