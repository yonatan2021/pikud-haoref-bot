// Graceful shutdown logic extracted from index.ts so it can be unit-tested.
//
// Why this is its own module: the shutdown sequence has a load-bearing
// step order — the saved memory `pattern_graceful_shutdown.md` documents
// how missing or reordering a step has caused real production hangs and
// crashes. Until now there was no test pinning that order: the shutdown()
// function lived inside the index.ts IIFE with closures over a dozen local
// variables, making it impossible to test in isolation.
//
// The refactor is intentionally minimal:
//   1. Move the body to a factory function over a `ShutdownHandles` interface.
//   2. Make `process.exit` and `log` injectable so tests can observe the
//      sequence without actually killing the test process.
//   3. Keep the call site in index.ts a one-liner.
//
// The actual semantic behavior (step order, ignored errors, force-exit
// timer, double-shutdown guard) is unchanged.
import { log as defaultLog } from './logger.js';

export interface ShutdownHandles {
  contactCleanupInterval: NodeJS.Timeout;
  safetyPruneInterval: NodeJS.Timeout;
  allClearTracker: { clearAll: () => void };
  poller: { stop: () => void };
  bot: { stop: () => Promise<void> };
  healthServer: { close: () => void };
  dashboardHttpServer: { close: () => void } | null;
  whatsappEnabled: boolean;
  disconnectWhatsApp: () => Promise<void>;
  tgListenerEnabled: boolean;
  disconnectTelegramListener: () => Promise<void>;
  closeDb: () => void;
}

export interface ShutdownOptions {
  /** Milliseconds to wait before force-exiting (default 10_000). Tests pass a small value or 0 to disable. */
  forceExitMs?: number;
  /** Injectable process.exit. Tests pass a recorder so the test process doesn't actually exit. */
  exit?: (code: number) => void;
  /** Injectable logger. Tests can pass a no-op to silence output. */
  log?: typeof defaultLog;
}

// Module-level guard so a second SIGTERM/SIGINT during an in-progress
// shutdown is a no-op (matches the original behavior in index.ts).
let shuttingDown = false;

/** Test-only — reset the shuttingDown guard between test cases. */
export function _resetShutdownState(): void {
  shuttingDown = false;
}

/**
 * Build a shutdown function bound to a concrete set of runtime handles.
 *
 * Step order is load-bearing — see pattern_graceful_shutdown.md memory.
 * If you reorder these steps, the test in src/__tests__/shutdown.test.ts
 * will fail, which is the entire point of the test.
 */
export function createShutdown(
  handles: ShutdownHandles,
  options: ShutdownOptions = {},
): (signal: string) => Promise<void> {
  const log = options.log ?? defaultLog;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const forceExitMs = options.forceExitMs ?? 10_000;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // Force exit after the configured timeout if cleanup hangs.
    // Tests can pass forceExitMs: 0 to skip arming the timer entirely.
    if (forceExitMs > 0) {
      const forceTimer = setTimeout(() => {
        log('warn', 'Init', 'Shutdown timeout — יוצא בכוח');
        exit(1);
      }, forceExitMs);
      forceTimer.unref();
    }

    log('info', 'Init', `${signal} — מבצע כיבוי מסודר...`);

    // ── Step 1: stop background timers
    clearInterval(handles.contactCleanupInterval);
    clearInterval(handles.safetyPruneInterval);

    // ── Step 2: cancel pending all-clear timers (so they don't fire mid-shutdown)
    handles.allClearTracker.clearAll();

    // ── Step 3: stop the alert poller (no new alerts will be processed)
    handles.poller.stop();

    // ── Step 4: stop the bot (drain in-flight grammy updates)
    try { await handles.bot.stop(); } catch { /* ignore */ }

    // ── Step 5: close the health HTTP server
    handles.healthServer.close();

    // ── Step 6: close the dashboard HTTP server (optional)
    if (handles.dashboardHttpServer) { handles.dashboardHttpServer.close(); }

    // ── Step 7: disconnect external listeners (optional, parallel to each other in spirit)
    if (handles.whatsappEnabled) {
      try { await handles.disconnectWhatsApp(); } catch { /* ignore */ }
    }
    if (handles.tgListenerEnabled) {
      try { await handles.disconnectTelegramListener(); } catch { /* ignore */ }
    }

    // ── Step 8: close the DB last — every prior step may have written to it
    try { handles.closeDb(); } catch { /* ignore */ }

    exit(0);
  };
}
