export interface AllClearEvent {
  zone: string;
  alertType: string;
  alertCities: string[];
}

export interface AllClearDeps {
  scheduleFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelScheduleFn?: (id: ReturnType<typeof setTimeout>) => void;
  onAllClear: (events: AllClearEvent[]) => void;
  /** Static fallback (ms). Ignored if getQuietWindowMs is provided. */
  quietWindowMs?: number;
  /**
   * Dynamic quiet-window provider — called on every recordAlert() so dashboard
   * changes to `all_clear_quiet_window_seconds` take effect immediately (no
   * restart needed). Takes precedence over `quietWindowMs` when both are set.
   */
  getQuietWindowMs?: () => number;
  /** Maps a city name to its zone. Used to filter alertCities per zone. */
  getCityZone?: (city: string) => string | undefined;
}

interface ZoneTimer {
  id: ReturnType<typeof setTimeout>;
  alertType: string;
  alertCities: string[];
}

const DEFAULT_QUIET_WINDOW_MS = 600_000; // 10 minutes

export function createAllClearTracker(deps: AllClearDeps) {
  const timers = new Map<string, ZoneTimer>();
  const firedZones = new Set<string>();
  const schedule = deps.scheduleFn ?? setTimeout;
  const cancel = deps.cancelScheduleFn ?? clearTimeout;
  const staticWindowMs = deps.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;
  const getCityZone = deps.getCityZone ?? (() => undefined);

  function resolveWindowMs(): number {
    if (!deps.getQuietWindowMs) return staticWindowMs;
    const ms = deps.getQuietWindowMs();
    // Guard against 0/negative/NaN — would fire all-clear immediately or never.
    return ms > 0 && Number.isFinite(ms) ? ms : staticWindowMs;
  }

  function recordAlert(zones: string[], alertType: string, alertCities: string[] = []): void {
    const windowMs = resolveWindowMs();
    for (const zone of zones) {
      const existing = timers.get(zone);
      if (existing) cancel(existing.id);

      // Filter: only cities belonging to THIS zone (prevents duplicate DMs across zones)
      const zoneCities = alertCities.filter(c => getCityZone(c) === zone);
      // Merge: combine with previously recorded cities for the same zone
      const mergedCities = existing
        ? [...new Set([...existing.alertCities, ...zoneCities])]
        : zoneCities;

      // New alert resets dedupe — a fresh all-clear should fire later
      firedZones.delete(zone);

      const id = schedule(() => {
        if (!firedZones.has(zone)) {
          firedZones.add(zone);
          deps.onAllClear([{ zone, alertType, alertCities: mergedCities }]);
        }
        timers.delete(zone);
      }, windowMs);
      timers.set(zone, { id, alertType, alertCities: mergedCities });
    }
  }

  // Cancels the pending all-clear timer for the given zones without firing it.
  // Does NOT reset firedZones — a new alert will re-open the cycle correctly.
  // Use when an official "האירוע הסתיים" newsFlash has already notified the user.
  function cancelAlert(zones: string[]): void {
    for (const zone of zones) {
      const existing = timers.get(zone);
      if (existing) cancel(existing.id);
      timers.delete(zone);
    }
  }

  function clearAll(): void {
    for (const { id } of timers.values()) cancel(id);
    timers.clear();
    firedZones.clear();
  }

  return { recordAlert, cancelAlert, clearAll };
}
