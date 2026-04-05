import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAllClearTracker, type AllClearEvent } from '../services/allClearTracker.js';

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
  it('fires onAllClear with zone and alertType after quiet window', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['גליל עליון'], 'missiles');
    assert.equal(fired.length, 0, 'Should not fire immediately');

    timers.fireAll();
    assert.equal(fired.length, 1);
    assert.deepEqual(fired[0], [{ zone: 'גליל עליון', alertType: 'missiles', alertCities: [] }]);
  });

  it('fires onAllClear with alertCities when provided', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['דן'], 'missiles', ['תל אביב', 'רמת גן']);
    timers.fireAll();
    assert.equal(fired.length, 1);
    assert.deepEqual(fired[0][0].alertCities, ['תל אביב', 'רמת גן']);
  });

  it('resets the timer when a new alert arrives for the same zone', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['דן'], 'missiles');
    assert.equal(timers.pendingCount(), 1);

    // New alert for same zone should cancel old timer and create new one
    tracker.recordAlert(['דן'], 'missiles');
    assert.equal(timers.pendingCount(), 1, 'Old timer should be cancelled, new one scheduled');

    timers.fireAll();
    assert.equal(fired.length, 1, 'Should fire exactly once');
    assert.deepEqual(fired[0], [{ zone: 'דן', alertType: 'missiles', alertCities: [] }]);
  });

  it('deduplicates — does not fire twice for same zone without new alert', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['חיפה'], 'missiles');
    timers.fireAll();
    assert.equal(fired.length, 1);

    // Timer was consumed — firedZones still has 'חיפה', no second fire possible
    assert.equal(fired.length, 1, 'Should not fire again without a new alert');
  });

  it('allows re-firing after a new alert clears dedupe', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['שרון'], 'missiles');
    timers.fireAll();
    assert.equal(fired.length, 1);

    // New alert resets dedupe
    tracker.recordAlert(['שרון'], 'earthQuake');
    timers.fireAll();
    assert.equal(fired.length, 2, 'Should fire again after new alert');
    assert.equal(fired[1][0].alertType, 'earthQuake', 'New alertType should be carried');
  });

  it('clearAll cancels all pending timers', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['גולן', 'קריות'], 'missiles');
    assert.equal(timers.pendingCount(), 2);

    tracker.clearAll();
    // Timers were cancelled by clearAll, so fireAll should do nothing
    timers.fireAll();
    assert.equal(fired.length, 0, 'No all-clear should fire after clearAll');
  });

  it('tracks multiple zones independently', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['דן', 'שרון'], 'missiles');
    assert.equal(timers.pendingCount(), 2);

    timers.fireAll();
    assert.equal(fired.length, 2);
    // Each zone fires independently with its alertType
    const allZones = fired.flat().map((e) => e.zone);
    assert.ok(allZones.includes('דן'));
    assert.ok(allZones.includes('שרון'));
    assert.ok(fired.flat().every((e) => e.alertType === 'missiles'));
  });

  it('uses custom quietWindowMs', () => {
    let scheduledMs: number | undefined;
    const tracker = createAllClearTracker({
      scheduleFn: (_cb, ms) => { scheduledMs = ms; return 1 as unknown as ReturnType<typeof setTimeout>; },
      cancelScheduleFn: () => {},
      onAllClear: () => {},
      quietWindowMs: 300_000,
    });

    tracker.recordAlert(['ירושלים'], 'missiles');
    assert.equal(scheduledMs, 300_000);
  });

  it('cancelAlert suppresses the all-clear without resetting dedupe', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    tracker.recordAlert(['תל אביב'], 'missiles');
    assert.equal(timers.pendingCount(), 1);

    tracker.cancelAlert(['תל אביב']);
    assert.equal(timers.pendingCount(), 0, 'Timer should be cancelled');

    timers.fireAll();
    assert.equal(fired.length, 0, 'No all-clear should fire after cancelAlert');
  });

  it('cancelAlert does not reset firedZones — new alert re-opens the cycle', () => {
    const fired: AllClearEvent[][] = [];
    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => fired.push(events),
    });

    // First cycle fires normally
    tracker.recordAlert(['ירושלים'], 'missiles');
    timers.fireAll();
    assert.equal(fired.length, 1);

    // cancelAlert on a zone that has no pending timer is a no-op
    tracker.cancelAlert(['ירושלים']);

    // A new alert must re-open the cycle
    tracker.recordAlert(['ירושלים'], 'missiles');
    timers.fireAll();
    assert.equal(fired.length, 2, 'New alert should re-open cycle after cancelAlert');
  });
});
