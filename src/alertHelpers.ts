/** Exported for testing — checks if an alert type is a drill. */
export function isDrillAlert(alertType: string): boolean {
  return alertType.endsWith('Drill');
}

/** Exported for testing — determines if we should skip map generation for this alert. */
export function shouldSkipMap(alertType: string): boolean {
  if (alertType === 'newsFlash') return true;
  if (process.env.MAPBOX_SKIP_DRILLS === 'true' && isDrillAlert(alertType)) return true;
  return false;
}
