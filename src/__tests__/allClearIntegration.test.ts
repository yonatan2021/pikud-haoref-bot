/**
 * Integration tests for allClearTracker + allClearService working together.
 *
 * These tests wire both modules end-to-end without mocking the tracker→service boundary.
 * They complement the unit tests in allClearTracker.test.ts and allClearService.test.ts.
 *
 * Depends on PRs: #133 (tracker alertType + cancelAlert), #136 (allClearService).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAllClearTracker } from '../services/allClearTracker.js';
import { createAllClearService } from '../services/allClearService.js';
import type { SubscriberInfo } from '../db/subscriptionRepository.js';
import type Database from 'better-sqlite3';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Synchronous fake timer — fireAll() triggers all pending callbacks immediately. */
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
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb();
  };

  const pendingCount = () => pending.size;

  return { scheduleFn, cancelScheduleFn, fireAll, pendingCount };
}

/** Simulates better-sqlite3 `prepare().get()` for the settings table. */
function fakeDb(settings: Record<string, string>): Database.Database {
  return {
    prepare: (_sql: string) => ({
      get: (key: string) => {
        const val = settings[key];
        return val !== undefined ? { value: val } : null;
      },
    }),
  } as unknown as Database.Database;
}

function makeSubscriber(chatId: number): SubscriberInfo {
  return {
    chat_id: chatId,
    format: 'short',
    quiet_hours_enabled: false,
    muted_until: null,
    home_city: null,
    matchedCities: [],
  };
}

/**
 * Creates a fully-wired tracker + service stack with injectable spies.
 *
 * @param mode - all_clear_mode setting ('dm' | 'channel' | 'both')
 * @param topicId - all_clear_topic_id (optional)
 * @param getSubscribers - returns subscribers for given cities (default: empty)
 */
function makeStack(
  mode: string,
  topicId?: number,
  getSubscribers: (cities: string[]) => SubscriberInfo[] = () => []
) {
  const settings: Record<string, string> = { all_clear_mode: mode };
  if (topicId !== undefined) settings['all_clear_topic_id'] = String(topicId);

  const dmCalls: Array<{ userId: number; text: string }> = [];
  const telegramCalls: Array<{ chatId: string; topicId: number | undefined; text: string }> = [];
  const renderCalls: Array<{ zone: string; alertType: string }> = [];

  const service = createAllClearService({
    db: fakeDb(settings),
    chatId: 'chan-test',
    sendTelegram: async (chatId, tid, text) => { telegramCalls.push({ chatId, topicId: tid, text }); },
    getUsersByHomeCityInCities: getSubscribers,
    shouldSkipForQuietHours: () => false,
    sendDm: async (userId, text) => { dmCalls.push({ userId, text }); },
    renderTemplate: (zone, alertType) => {
      renderCalls.push({ zone, alertType });
      return `[${alertType}] ${zone}`;
    },
  });

  const timers = createFakeTimers();
  const tracker = createAllClearTracker({
    scheduleFn: timers.scheduleFn,
    cancelScheduleFn: timers.cancelScheduleFn,
    onAllClear: (events) => { void service.handleAllClear(events); },
  });

  return { tracker, timers, dmCalls, telegramCalls, renderCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('allClearIntegration — dm mode', () => {
  it('sends DM to zone subscribers after quiet window expires', async () => {
    const { tracker, timers, dmCalls, telegramCalls } = makeStack('dm', undefined, () => [makeSubscriber(10), makeSubscriber(20)]);

    tracker.recordAlert(['גליל עליון'], 'missiles');
    assert.equal(dmCalls.length, 0, 'No DM before timer fires');

    timers.fireAll();
    // fireAll() triggers the onAllClear callback synchronously,
    // but handleAllClear is async — wait one microtask tick.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 2, 'Both subscribers received DM');
    assert.equal(dmCalls[0].userId, 10);
    assert.equal(dmCalls[1].userId, 20);
    assert.ok(dmCalls[0].text.includes('גליל עליון'));
    assert.equal(telegramCalls.length, 0, 'No channel message in dm mode');
  });

  it('sends no DM when zone has no subscribers', async () => {
    const { tracker, timers, dmCalls } = makeStack('dm', undefined, () => []);

    tracker.recordAlert(['גולן'], 'missiles');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 0);
  });
});

describe('allClearIntegration — cancelAlert (official "האירוע הסתיים")', () => {
  it('suppresses all-clear when cancelAlert is called before timer fires', async () => {
    const { tracker, timers, dmCalls } = makeStack('dm', undefined, () => [makeSubscriber(99)]);

    tracker.recordAlert(['דן'], 'missiles');
    assert.equal(timers.pendingCount(), 1);

    // Official Pikud HaOref cancellation — no all-clear should fire
    tracker.cancelAlert(['דן']);
    assert.equal(timers.pendingCount(), 0, 'Timer cancelled');

    timers.fireAll(); // nothing to fire
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 0, 'No all-clear DM after cancelAlert');
  });

  it('cancelAlert does not prevent future alerts for the same zone', async () => {
    const { tracker, timers, dmCalls } = makeStack('dm', undefined, () => [makeSubscriber(5)]);

    tracker.recordAlert(['דן'], 'missiles');
    tracker.cancelAlert(['דן']); // official cancel

    // New alert (e.g. aftershock) — should be trackable again
    tracker.recordAlert(['דן'], 'missiles');
    assert.equal(timers.pendingCount(), 1);

    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 1, 'Second alert fires all-clear after new quiet window');
  });
});

describe('allClearIntegration — timer reset', () => {
  it('new alert resets the timer and all-clear fires after the second window', async () => {
    const { tracker, timers, dmCalls } = makeStack('dm', undefined, () => [makeSubscriber(1)]);

    tracker.recordAlert(['שרון'], 'missiles');
    assert.equal(timers.pendingCount(), 1, 'First timer scheduled');

    // Second alert resets the timer (first cancelled, new one scheduled)
    tracker.recordAlert(['שרון'], 'missiles');
    assert.equal(timers.pendingCount(), 1, 'Still one timer after reset');

    timers.fireAll(); // fires the second timer
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 1, 'All-clear fired once after second quiet window');
  });
});

describe('allClearIntegration — duplicate suppression', () => {
  it('timer fires only once for the same zone without a new alert', async () => {
    let firedCount = 0;
    const service = createAllClearService({
      db: fakeDb({ all_clear_mode: 'dm' }),
      chatId: 'c',
      sendTelegram: async () => {},
      getUsersByHomeCityInCities: () => [makeSubscriber(1)],
      shouldSkipForQuietHours: () => false,
      sendDm: async () => { firedCount++; },
      renderTemplate: () => 'text',
    });

    const timers = createFakeTimers();
    const tracker = createAllClearTracker({
      scheduleFn: timers.scheduleFn,
      cancelScheduleFn: timers.cancelScheduleFn,
      onAllClear: (events) => { void service.handleAllClear(events); },
    });

    tracker.recordAlert(['ירושלים'], 'missiles');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(firedCount, 1);

    // No new alert — firing again (even if a stray timer fired) must not re-send
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(firedCount, 1, 'Duplicate suppression: all-clear fires only once');
  });
});

describe('allClearIntegration — channel mode', () => {
  it('sends to channel with configured topicId, no DMs', async () => {
    const { tracker, timers, dmCalls, telegramCalls } = makeStack('channel', 888, () => [makeSubscriber(1), makeSubscriber(2)]);

    tracker.recordAlert(['חיפה'], 'missiles');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].chatId, 'chan-test');
    assert.equal(telegramCalls[0].topicId, 888);
    assert.ok(telegramCalls[0].text.includes('חיפה'));
    assert.equal(dmCalls.length, 0, 'No DMs in channel mode');
  });
});

describe('allClearIntegration — both mode', () => {
  it('sends DM and channel message', async () => {
    const { tracker, timers, dmCalls, telegramCalls } = makeStack('both', 999, () => [makeSubscriber(7)]);

    tracker.recordAlert(['נגב'], 'missiles');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 7);
    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].topicId, 999);
  });
});

describe('allClearIntegration — alertType passed through', () => {
  it('renderTemplate receives the correct alertType from recordAlert', async () => {
    const { tracker, timers, renderCalls } = makeStack('dm', undefined, () => [makeSubscriber(1)]);

    tracker.recordAlert(['תל אביב'], 'earthQuake');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(renderCalls.length, 1);
    assert.equal(renderCalls[0].zone, 'תל אביב');
    assert.equal(renderCalls[0].alertType, 'earthQuake');
  });

  it('multiple zones with different alert types each pass their own alertType', async () => {
    const { tracker, timers, renderCalls } = makeStack('dm', undefined, (zones) =>
      zones.length > 0 ? [1] : []
    );

    tracker.recordAlert(['גליל עליון'], 'missiles');
    tracker.recordAlert(['שפלה'], 'hazardousMaterials');
    timers.fireAll();
    await Promise.resolve();
    await Promise.resolve();

    const typeByZone = Object.fromEntries(renderCalls.map(r => [r.zone, r.alertType]));
    assert.equal(typeByZone['גליל עליון'], 'missiles');
    assert.equal(typeByZone['שפלה'], 'hazardousMaterials');
  });
});
