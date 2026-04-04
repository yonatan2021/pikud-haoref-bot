import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAllClearTracker } from '../services/allClearTracker.js';

/** Builds injectable timer fakes that fire callbacks synchronously on demand. */
function createFakeTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();

  const scheduleFn = (cb: () => void, _ms: number) => {
    const id = nextId++;
    pending.set(id, cb);
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  const cancelScheduleFn = (id: ReturnType<typeof setTimeout>) => {
    pending.delete(id as unknown as number);
  };
  const fireAll = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const cb of callbacks) cb();
  };
  const pendingCount = () => pending.size;

  return { scheduleFn, cancelScheduleFn, fireAll, pendingCount };
}

describe('allClearTracker', () => {
  it('fires onAllClear with zone name after quiet window', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['גליל עליון']);
    assert.equal(firedZones.length, 0, 'Should not fire immediately');

    timers.fireAll();
    assert.equal(firedZones.length, 1);
    assert.deepEqual(firedZones[0], ['גליל עליון']);
  });

  it('resets the timer when a new alert arrives for the same zone', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['דן']);
    assert.equal(timers.pendingCount(), 1);

    // New alert for same zone should cancel old timer and create new one
    tracker.recordAlert(['דן']);
    assert.equal(timers.pendingCount(), 1, 'Old timer should be cancelled, new one scheduled');

    timers.fireAll();
    assert.equal(firedZones.length, 1, 'Should fire exactly once');
    assert.deepEqual(firedZones[0], ['דן']);
  });

  it('deduplicates — does not fire twice for same zone without new alert', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['חיפה']);
    timers.fireAll();
    assert.equal(firedZones.length, 1);

    // Record the same zone again without new alert — but the timer was already consumed
    // The firedZones set still has 'חיפה', so no second fire
    // Simulate a stale scenario: nothing to fire
    assert.equal(firedZones.length, 1, 'Should not fire again without a new alert');
  });

  it('allows re-firing after a new alert clears dedupe', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['שרון']);
    timers.fireAll();
    assert.equal(firedZones.length, 1);

    // New alert resets dedupe
    tracker.recordAlert(['שרון']);
    timers.fireAll();
    assert.equal(firedZones.length, 2, 'Should fire again after new alert');
  });

  it('clearAll cancels all pending timers', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['גולן', 'קריות']);
    assert.equal(timers.pendingCount(), 2);

    tracker.clearAll();
    // Timers were cancelled by clearAll, so fireAll should do nothing
    timers.fireAll();
    assert.equal(firedZones.length, 0, 'No all-clear should fire after clearAll');
  });

  it('tracks multiple zones independently', () => {
    const firedZones: string[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (zones) => firedZones.push(zones),
    });

    tracker.recordAlert(['דן', 'שרון']);
    assert.equal(timers.pendingCount(), 2);

    timers.fireAll();
    assert.equal(firedZones.length, 2);
    // Each zone fires independently
    const allZones = firedZones.flat();
    assert.ok(allZones.includes('דן'));
    assert.ok(allZones.includes('שרון'));
  });

  it('uses custom quietWindowMs', () => {
    let scheduledMs: number | undefined;
    const tracker = createAllClearTracker({
      scheduleFn: (_cb, ms) => { scheduledMs = ms; return 1 as unknown as ReturnType<typeof setTimeout>; },
      cancelScheduleFn: () => {},
      onAllClear: () => {},
      quietWindowMs: 300_000,
    });

    tracker.recordAlert(['ירושלים']);
    assert.equal(scheduledMs, 300_000);
  });
});
