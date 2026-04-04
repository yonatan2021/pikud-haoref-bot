export interface AllClearDeps {
  scheduleFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelScheduleFn?: (id: ReturnType<typeof setTimeout>) => void;
  onAllClear: (zones: string[]) => void;
  quietWindowMs?: number;
}

const DEFAULT_QUIET_WINDOW_MS = 600_000; // 10 minutes

export function createAllClearTracker(deps: AllClearDeps) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const firedZones = new Set<string>();
  const schedule = deps.scheduleFn ?? setTimeout;
  const cancel = deps.cancelScheduleFn ?? clearTimeout;
  const windowMs = deps.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;

  function recordAlert(zones: string[]): void {
    for (const zone of zones) {
      const existing = timers.get(zone);
      if (existing) cancel(existing);

      // New alert resets dedupe — a fresh all-clear should fire later
      firedZones.delete(zone);

      const timer = schedule(() => {
        if (!firedZones.has(zone)) {
          firedZones.add(zone);
          deps.onAllClear([zone]);
        }
        timers.delete(zone);
      }, windowMs);
      timers.set(zone, timer);
    }
  }

  function clearAll(): void {
    for (const timer of timers.values()) cancel(timer);
    timers.clear();
    firedZones.clear();
  }

  return { recordAlert, clearAll };
}
