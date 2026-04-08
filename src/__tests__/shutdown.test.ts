// Tests for src/shutdown.ts — locks down the 8-step graceful shutdown
// sequence documented in the saved memory pattern_graceful_shutdown.md.
//
// Why this test exists: prior incidents hung or crashed the bot when a
// shutdown step was missed or reordered. Until the I9 refactor, shutdown
// lived inside the index.ts IIFE with closures over a dozen locals and
// could not be tested. The refactor extracts it to src/shutdown.ts as a
// factory over an injectable handles interface.
//
// The "step order is load-bearing" claim is verified concretely here: each
// mock handle method pushes its name into a shared recorder, and we assert
// the recorder ends up with the exact expected sequence.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createShutdown,
  _resetShutdownState,
  type ShutdownHandles,
} from '../shutdown.js';

interface RecorderHandles extends ShutdownHandles {
  steps: string[];
  exitCalls: number[];
}

function buildHandles(opts: {
  whatsappEnabled?: boolean;
  tgListenerEnabled?: boolean;
  hasDashboard?: boolean;
  botStopThrows?: boolean;
  closeDbThrows?: boolean;
  waDisconnectThrows?: boolean;
} = {}): RecorderHandles {
  const steps: string[] = [];
  const exitCalls: number[] = [];

  // The interval handles need to be real Node.js Timeout objects so
  // clearInterval() doesn't throw. Use real ones with .unref() so they
  // don't keep the test process alive.
  const ci = setInterval(() => undefined, 60_000); ci.unref();
  const sp = setInterval(() => undefined, 60_000); sp.unref();

  return {
    steps,
    exitCalls,
    contactCleanupInterval: ci,
    safetyPruneInterval: sp,
    allClearTracker: { clearAll: () => { steps.push('allClearTracker.clearAll'); } },
    poller: { stop: () => { steps.push('poller.stop'); } },
    bot: {
      stop: async () => {
        steps.push('bot.stop');
        if (opts.botStopThrows) throw new Error('bot.stop kaboom');
      },
    },
    healthServer: { close: () => { steps.push('healthServer.close'); } },
    dashboardHttpServer: opts.hasDashboard !== false
      ? { close: () => { steps.push('dashboardHttpServer.close'); } }
      : null,
    whatsappEnabled: opts.whatsappEnabled ?? false,
    disconnectWhatsApp: async () => {
      steps.push('disconnectWhatsApp');
      if (opts.waDisconnectThrows) throw new Error('wa kaboom');
    },
    tgListenerEnabled: opts.tgListenerEnabled ?? false,
    disconnectTelegramListener: async () => { steps.push('disconnectTelegramListener'); },
    closeDb: () => {
      steps.push('closeDb');
      if (opts.closeDbThrows) throw new Error('closeDb kaboom');
    },
  };
}

const noopLog = () => undefined;

beforeEach(() => {
  // The shuttingDown guard is module-level. Reset between tests so each
  // test sees a fresh shutdown lifecycle.
  _resetShutdownState();
});

describe('createShutdown — step ordering', () => {
  it('runs the 8 steps in the documented order on a minimal config', async () => {
    const h = buildHandles();
    const shutdown = createShutdown(h, {
      forceExitMs: 0,
      exit: (code) => { h.exitCalls.push(code); },
      log: noopLog,
    });

    await shutdown('SIGTERM');

    // Steps that always fire, in the load-bearing order:
    //   timers cleared (no observable side effect — implicit)
    //   → allClearTracker.clearAll
    //   → poller.stop
    //   → bot.stop
    //   → healthServer.close
    //   → dashboardHttpServer.close
    //   → closeDb (last — every prior step may have written to it)
    assert.deepEqual(h.steps, [
      'allClearTracker.clearAll',
      'poller.stop',
      'bot.stop',
      'healthServer.close',
      'dashboardHttpServer.close',
      'closeDb',
    ]);
    assert.deepEqual(h.exitCalls, [0], 'must call exit(0) on clean shutdown');
  });

  it('includes WhatsApp disconnect when enabled, in the right slot', async () => {
    const h = buildHandles({ whatsappEnabled: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: () => undefined, log: noopLog });
    await shutdown('SIGTERM');

    // disconnectWhatsApp must come AFTER healthServer/dashboard close and
    // BEFORE closeDb.
    const idxWa = h.steps.indexOf('disconnectWhatsApp');
    const idxDashboard = h.steps.indexOf('dashboardHttpServer.close');
    const idxCloseDb = h.steps.indexOf('closeDb');
    assert.ok(idxWa > idxDashboard, 'WA disconnect must run AFTER dashboardHttpServer.close');
    assert.ok(idxWa < idxCloseDb, 'WA disconnect must run BEFORE closeDb');
  });

  it('includes Telegram listener disconnect when enabled, in the right slot', async () => {
    const h = buildHandles({ tgListenerEnabled: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: () => undefined, log: noopLog });
    await shutdown('SIGTERM');

    const idxTg = h.steps.indexOf('disconnectTelegramListener');
    const idxDashboard = h.steps.indexOf('dashboardHttpServer.close');
    const idxCloseDb = h.steps.indexOf('closeDb');
    assert.ok(idxTg > idxDashboard);
    assert.ok(idxTg < idxCloseDb);
  });

  it('skips dashboardHttpServer.close when no dashboard is configured', async () => {
    const h = buildHandles({ hasDashboard: false });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: () => undefined, log: noopLog });
    await shutdown('SIGTERM');

    assert.ok(!h.steps.includes('dashboardHttpServer.close'));
    // closeDb must still run last.
    assert.equal(h.steps[h.steps.length - 1], 'closeDb');
  });

  it('closes DB last regardless of which optional integrations are enabled', async () => {
    const h = buildHandles({ whatsappEnabled: true, tgListenerEnabled: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: () => undefined, log: noopLog });
    await shutdown('SIGTERM');

    assert.equal(
      h.steps[h.steps.length - 1],
      'closeDb',
      'closeDb must always be the LAST step — every prior step may write to it'
    );
  });
});

describe('createShutdown — error tolerance', () => {
  it('continues shutdown even when bot.stop() throws', async () => {
    const h = buildHandles({ botStopThrows: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: (c) => { h.exitCalls.push(c); }, log: noopLog });
    await shutdown('SIGTERM');

    // bot.stop fired, then later steps still ran:
    assert.ok(h.steps.includes('bot.stop'));
    assert.ok(h.steps.includes('healthServer.close'), 'healthServer.close must still run after bot.stop throws');
    assert.ok(h.steps.includes('closeDb'));
    assert.deepEqual(h.exitCalls, [0], 'shutdown still exits cleanly after a non-fatal error');
  });

  it('continues shutdown even when WhatsApp disconnect throws', async () => {
    const h = buildHandles({ whatsappEnabled: true, waDisconnectThrows: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: (c) => { h.exitCalls.push(c); }, log: noopLog });
    await shutdown('SIGTERM');

    assert.ok(h.steps.includes('disconnectWhatsApp'));
    assert.ok(h.steps.includes('closeDb'), 'closeDb must still run after WA disconnect throws');
    assert.deepEqual(h.exitCalls, [0]);
  });

  it('continues to exit(0) even when closeDb throws', async () => {
    const h = buildHandles({ closeDbThrows: true });
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: (c) => { h.exitCalls.push(c); }, log: noopLog });
    await shutdown('SIGTERM');

    assert.ok(h.steps.includes('closeDb'));
    assert.deepEqual(h.exitCalls, [0], 'must still exit(0) — closeDb errors are non-fatal');
  });
});

describe('createShutdown — re-entrancy', () => {
  it('is idempotent — second shutdown call is a no-op', async () => {
    const h = buildHandles();
    const shutdown = createShutdown(h, { forceExitMs: 0, exit: (c) => { h.exitCalls.push(c); }, log: noopLog });

    await shutdown('SIGTERM');
    const firstStepCount = h.steps.length;
    const firstExitCount = h.exitCalls.length;

    await shutdown('SIGINT');
    assert.equal(h.steps.length, firstStepCount, 'second shutdown must NOT re-run any steps');
    assert.equal(h.exitCalls.length, firstExitCount, 'second shutdown must NOT call exit() again');
  });
});
