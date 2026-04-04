import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';
import type { BroadcasterDeps } from '../whatsapp/whatsappBroadcaster';

// Use in-memory DB
process.env['DB_PATH'] = ':memory:';

import { createBroadcaster, clearTrackedMessages } from '../whatsapp/whatsappBroadcaster';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { upsertGroup, getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository';
import { setSetting } from '../dashboard/settingsRepository';

// Clean up debounce timers after each test to prevent leaked handles.
// NOTE: stdout spy removed — mocking process.stdout.write interferes with
// node:test's TAP output, causing tests to appear missing in reports.
afterEach(() => {
  clearTrackedMessages();
});

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

// Mock WhatsApp Message object with edit support
function makeMockMessage(editResult: unknown = null) {
  const editFn = mock.fn(async () => editResult);
  return { edit: editFn, fromMe: true, id: { _serialized: 'msg_' + Math.random() } };
}

type SendMessageFn = ReturnType<typeof mock.fn>;

// Captures debounce callbacks for synchronous testing
function makeScheduler() {
  const captured: Array<{ callback: () => void; delayMs: number }> = [];
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();

  const scheduleFn = mock.fn((callback: () => void, delayMs: number) => {
    const id = nextId++;
    const entry = { callback, delayMs };
    captured.push(entry);
    timers.set(id, entry);
    return id as unknown as ReturnType<typeof setTimeout>;
  });

  const cancelScheduleFn = mock.fn((timer: ReturnType<typeof setTimeout>) => {
    timers.delete(timer as unknown as number);
  });

  return {
    scheduleFn: scheduleFn as unknown as BroadcasterDeps['scheduleFn'],
    cancelScheduleFn: cancelScheduleFn as unknown as BroadcasterDeps['cancelScheduleFn'],
    captured,
    timers,
    scheduleMock: scheduleFn,
    cancelMock: cancelScheduleFn,
    fireLatest: () => {
      const last = captured[captured.length - 1];
      if (last) last.callback();
    },
    fireAll: () => {
      for (const entry of captured) entry.callback();
    },
  };
}

function makeDeps(overrides: Partial<BroadcasterDeps> = {}): BroadcasterDeps & {
  sendMessage: SendMessageFn;
} {
  const msgObj = makeMockMessage();
  const sendMessage = mock.fn(async () => msgObj);
  const getChatById = mock.fn(async () => ({ sendMessage }));

  return {
    getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
    getClientFn: mock.fn(() => ({ getChatById })) as unknown as BroadcasterDeps['getClientFn'],
    getEnabledGroupsFn: mock.fn((_db: Database.Database, _type: string) => ['group1', 'group2']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
    formatFn: mock.fn(() => 'formatted message') as unknown as BroadcasterDeps['formatFn'],
    sendMessage,
    ...overrides,
  };
}

const BASE_ALERT: Alert = { type: 'missiles', cities: ['תל אביב'] };

// Wrap all suites in a sequential top-level describe to prevent node:test
// from running them concurrently — concurrent describes share the module-level
// activeMessages Map and the stdout spy, causing silent test drops.
describe('whatsappBroadcaster — disconnected status', () => {
  beforeEach(() => clearTrackedMessages());

  it('returns early without calling getClient when status is disconnected', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'disconnected') as unknown as () => string,
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when disconnected'
    );
  });

  it('returns early for qr status as well', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'qr') as unknown as () => string,
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when qr status'
    );
  });
});

describe('whatsappBroadcaster — ready status with groups', () => {
  beforeEach(() => clearTrackedMessages());

  it('calls sendMessage for each enabled group when status is ready', async () => {
    const db = makeDb();
    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    // getEnabledGroupsFn returns ['group1', 'group2'] by default
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'sendMessage should be called once per group'
    );
  });

  it('calls formatFn to build message text', async () => {
    const db = makeDb();
    const formatFn = mock.fn(() => 'test formatted message');
    const deps = makeDeps({
      formatFn: formatFn as unknown as BroadcasterDeps['formatFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (formatFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'formatFn should be called once'
    );
  });
});

describe('whatsappBroadcaster — edit window', () => {
  beforeEach(() => clearTrackedMessages());

  it('edits existing message on second broadcast within window', async () => {
    const db = makeDb();
    const editedMsg = makeMockMessage();
    const firstMsg = makeMockMessage(editedMsg);
    const sendMessage = mock.fn(async () => firstMsg);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);

    // First broadcast — should send fresh text
    await broadcast(BASE_ALERT);
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'first broadcast should send'
    );

    // Second broadcast — should edit, not send again
    const updatedAlert: Alert = { type: 'missiles', cities: ['תל אביב', 'חיפה'] };
    await broadcast(updatedAlert);

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'second broadcast should not call sendMessage again'
    );
    assert.equal(
      (firstMsg.edit as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'edit should be called on the tracked message'
    );
  });

  it('sends fresh message when edit returns null (message deleted)', async () => {
    const db = makeDb();
    const firstMsg = makeMockMessage(null); // edit returns null
    const secondMsg = makeMockMessage();
    let sendCount = 0;
    const sendMessage = mock.fn(async () => {
      sendCount++;
      return sendCount === 1 ? firstMsg : secondMsg;
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);

    await broadcast(BASE_ALERT);
    await broadcast({ type: 'missiles', cities: ['חיפה'] });

    // edit returned null → should have sent a fresh message
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'should send fresh message when edit returns null'
    );
  });

  it('sends fresh message when edit throws', async () => {
    const db = makeDb();
    const badEditFn = mock.fn(async () => { throw new Error('edit failed'); });
    const firstMsg = { edit: badEditFn, fromMe: true, id: { _serialized: 'msg1' } };
    const secondMsg = makeMockMessage();
    let sendCount = 0;
    const sendMessage = mock.fn(async () => {
      sendCount++;
      return sendCount === 1 ? firstMsg : secondMsg;
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);

    await broadcast(BASE_ALERT);
    await broadcast({ type: 'missiles', cities: ['חיפה'] });

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'should send fresh when edit throws'
    );
  });
});

describe('whatsappBroadcaster — debounced map', () => {
  beforeEach(() => clearTrackedMessages());

  it('sends text-only on first broadcast and schedules map via debounce', async () => {
    const db = makeDb();
    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    const imageBuffer = Buffer.from('map-image');

    // Broadcast with image — should send text only, schedule map
    await broadcast(BASE_ALERT, imageBuffer);

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'should send text-only message immediately'
    );

    // First sendMessage call should be text (no MessageMedia)
    const firstCallArgs = (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls[0].arguments;
    assert.equal(typeof firstCallArgs[0], 'string', 'first send should be text, not media');

    assert.equal(scheduler.captured.length, 1, 'should schedule one debounce timer');
    assert.equal(scheduler.captured[0].delayMs, 15_000, 'debounce delay should be 15s default');
  });

  it('fires debounce callback and sends map image', async () => {
    const db = makeDb();
    const textMsg = makeMockMessage();
    const mapMsg = makeMockMessage();
    let callCount = 0;
    const sendMessage = mock.fn(async () => {
      callCount++;
      return callCount === 1 ? textMsg : mapMsg;
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT, Buffer.from('map-image'));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'before debounce: only text sent'
    );

    // Fire the debounce callback
    scheduler.fireLatest();
    // Give the async sendDebouncedMap a tick to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'after debounce: map image should be sent'
    );

    // Second call should include MessageMedia (not a plain string)
    const secondCallArgs = (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls[1].arguments;
    assert.notEqual(typeof secondCallArgs[0], 'string', 'second send should be media, not text');
  });

  it('reschedules debounce on subsequent broadcasts', async () => {
    const db = makeDb();
    const editedMsg = makeMockMessage();
    const firstMsg = makeMockMessage(editedMsg);
    const sendMessage = mock.fn(async () => firstMsg);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);

    // First broadcast with image
    await broadcast(BASE_ALERT, Buffer.from('image1'));
    assert.equal(scheduler.captured.length, 1, 'first debounce scheduled');

    // Second broadcast with updated image — should cancel first and reschedule
    await broadcast({ type: 'missiles', cities: ['תל אביב', 'חיפה'] }, Buffer.from('image2'));
    assert.equal(
      (scheduler.cancelMock as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'first debounce timer should be cancelled'
    );
    assert.equal(scheduler.captured.length, 2, 'second debounce scheduled');
  });

  it('does not schedule debounce when no imageBuffer provided', async () => {
    const db = makeDb();
    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT); // no imageBuffer

    assert.equal(scheduler.captured.length, 0, 'no debounce should be scheduled without image');
  });

  it('edits text and reschedules map on second broadcast within window', async () => {
    const db = makeDb();
    const editedMsg = makeMockMessage();
    const firstMsg = makeMockMessage(editedMsg);
    const sendMessage = mock.fn(async () => firstMsg);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);

    // 1st: fresh text + schedule map
    await broadcast(BASE_ALERT, Buffer.from('img1'));
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'first: text sent'
    );

    // 2nd: edit text + reschedule map
    await broadcast({ type: 'missiles', cities: ['תל אביב', 'חיפה'] }, Buffer.from('img2'));
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'second: no new sendMessage (edited instead)'
    );
    assert.equal(
      (firstMsg.edit as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'text message was edited'
    );
    assert.equal(scheduler.captured.length, 2, 'debounce rescheduled');

    // Fire latest debounce — should send image
    scheduler.fireLatest();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'map image sent after debounce'
    );
  });

  it('reads debounce delay from DB setting', async () => {
    const db = makeDb();
    setSetting(db, 'whatsapp_map_debounce_seconds', '30');

    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT, Buffer.from('img'));

    assert.equal(scheduler.captured[0].delayMs, 30_000, 'should use DB setting (30s → 30000ms)');
  });

  it('falls back to env var when no DB setting', async () => {
    const db = makeDb();
    // No DB setting, set env var
    const originalEnv = process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS;
    process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS = '20';

    try {
      const msgObj = makeMockMessage();
      const sendMessage = mock.fn(async () => msgObj);
      const getChatById = mock.fn(async () => ({ sendMessage }));
      const getClientFn = mock.fn(() => ({ getChatById }));
      const scheduler = makeScheduler();
      const deps = makeDeps({
        getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
        getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
        scheduleFn: scheduler.scheduleFn,
        cancelScheduleFn: scheduler.cancelScheduleFn,
      });

      const broadcast = createBroadcaster(db, deps);
      await broadcast(BASE_ALERT, Buffer.from('img'));

      assert.equal(scheduler.captured[0].delayMs, 20_000, 'should use env var (20s → 20000ms)');
    } finally {
      if (originalEnv === undefined) delete process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS;
      else process.env.WHATSAPP_MAP_DEBOUNCE_SECONDS = originalEnv;
    }
  });

  it('clears debounce timers on clearTrackedMessages', async () => {
    const db = makeDb();
    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT, Buffer.from('img'));

    assert.equal(scheduler.captured.length, 1, 'debounce scheduled');

    // Clear all tracked messages — should also clear timers
    clearTrackedMessages();

    // Fire the old callback — sendDebouncedMap should be a no-op (state cleared)
    scheduler.fireLatest();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'map should not be sent after clearTrackedMessages'
    );
  });
});

describe('whatsappBroadcaster — duplicate map prevention', () => {
  beforeEach(() => clearTrackedMessages());

  it('stale debounce timer does not send map after new wave supersedes it', async () => {
    const db = makeDb();
    const textMsg = makeMockMessage();
    const editedMsg = makeMockMessage(textMsg);
    const firstMsg = makeMockMessage(editedMsg);
    let sendCount = 0;
    const sendMessage = mock.fn(async () => {
      sendCount++;
      return sendCount === 1 ? firstMsg : makeMockMessage();
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);

    // Wave 1: fresh text + schedule map
    await broadcast(BASE_ALERT, Buffer.from('img1'));
    assert.equal(scheduler.captured.length, 1, 'wave 1 debounce scheduled');

    // Wave 2: edit text + reschedule map (cancels wave 1 timer via cancelScheduleFn)
    await broadcast({ type: 'missiles', cities: ['תל אביב', 'חיפה'] }, Buffer.from('img2'));
    assert.equal(scheduler.captured.length, 2, 'wave 2 debounce scheduled');

    // Simulate stale timer firing (wave 1's callback) — should be a no-op
    // because waveId in the closure won't match the current state's waveId
    scheduler.captured[0].callback();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Only the initial text send should have happened — no map from stale timer
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'stale wave 1 timer must not send map'
    );

    // Now fire wave 2's timer — should send the map
    scheduler.captured[1].callback();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'wave 2 timer should send map'
    );
  });

  it('does not send map twice if debounce fires after map already sent', async () => {
    const db = makeDb();
    const msgObj = makeMockMessage();
    const sendMessage = mock.fn(async () => msgObj);
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const scheduler = makeScheduler();
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      scheduleFn: scheduler.scheduleFn,
      cancelScheduleFn: scheduler.cancelScheduleFn,
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT, Buffer.from('img'));

    // Fire debounce — sends map (call #2)
    scheduler.fireLatest();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'map should be sent once'
    );

    // Fire again (simulating duplicate timer) — mapSent guard should prevent
    scheduler.fireLatest();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'duplicate fire must not send map again (mapSent guard)'
    );
  });
});

describe('whatsappBroadcaster — partial failure', () => {
  beforeEach(() => clearTrackedMessages());

  it('continues sending to other groups when one group fails', async () => {
    const db = makeDb();
    let callCount = 0;
    const sendMessage = mock.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('send failed for group1');
      return makeMockMessage();
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    // Should not throw even when one group fails
    await assert.doesNotReject(() => broadcast(BASE_ALERT));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'sendMessage should be attempted for both groups despite first failure'
    );
  });
});

describe('whatsappBroadcaster — null client despite ready', () => {
  beforeEach(() => clearTrackedMessages());

  it('skips broadcast when getClientFn returns null even with ready status and groups', async () => {
    const db = makeDb();
    const sendMessage = mock.fn(async () => makeMockMessage());
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
      getEnabledGroupsFn: mock.fn(() => ['group1@g.us']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: mock.fn(() => null) as unknown as BroadcasterDeps['getClientFn'],
    });
    const broadcaster = createBroadcaster(db, deps);
    await assert.doesNotReject(() => broadcaster(BASE_ALERT));
    // getChatById and sendMessage should never be called since client is null
    assert.equal(
      (getChatById as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getChatById must not be called when getClientFn returns null'
    );
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'sendMessage must not be called when getClientFn returns null'
    );
  });

  it('returns early without sending when formatFn throws', async () => {
    const db = makeDb();
    const sendMessage = mock.fn(async () => makeMockMessage());
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
      getEnabledGroupsFn: mock.fn(() => ['group1@g.us']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: mock.fn(() => ({ getChatById })) as unknown as BroadcasterDeps['getClientFn'],
      formatFn: mock.fn(() => { throw new Error('formatter exploded'); }) as unknown as BroadcasterDeps['formatFn'],
    });
    const broadcaster = createBroadcaster(db, deps);
    await assert.doesNotReject(() => broadcaster(BASE_ALERT));
    assert.equal(
      (getChatById as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getChatById must not be called when formatter throws'
    );
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'sendMessage must not be called when formatter throws'
    );
  });
});

describe('whatsappBroadcaster — TTL expiry', () => {
  beforeEach(() => clearTrackedMessages());

  it('sends fresh message (not edit) after the edit window expires', async () => {
    const db = makeDb();
    const firstMsg = makeMockMessage();
    let sendCount = 0;
    const sendMessage = mock.fn(async () => {
      sendCount++;
      return sendCount === 1 ? firstMsg : makeMockMessage();
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getEnabledGroupsFn: mock.fn(() => ['group1']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);

    // First broadcast — creates tracked entry (sentAt = Date.now())
    await broadcast(BASE_ALERT);
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'first broadcast should send'
    );

    // Advance Date.now 130 seconds into the future (beyond the 120s default window)
    const origNow = Date.now;
    Date.now = () => origNow() + 130_000;

    try {
      const updatedAlert: Alert = { type: 'missiles', cities: ['חיפה'] };
      await broadcast(updatedAlert);

      // Window expired → getTracked returns null → fresh send, NOT edit
      assert.equal(
        (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        2,
        'second broadcast after TTL expiry should send a fresh message'
      );
      assert.equal(
        (firstMsg.edit as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        0,
        'edit() must NOT be called after the TTL window expires'
      );
    } finally {
      Date.now = origNow;
    }
  });
});

describe('whatsappBroadcaster — one map per alert', () => {
  beforeEach(() => clearTrackedMessages());

  it('does not schedule a second debounce after the map has already been sent', async () => {
    const db = makeDb();
    upsertGroup(db, 'group1', 'Test', true, ['missiles']);

    const mockMsg = makeMockMessage(null);
    const sendMessageFn: SendMessageFn = mock.fn(async () => mockMsg);
    const mockClient = { getChatById: mock.fn(async () => ({ sendMessage: sendMessageFn })) };

    const { scheduleFn, cancelScheduleFn, scheduleMock } = makeScheduler();

    const deps: BroadcasterDeps = {
      getStatusFn: () => 'ready',
      getClientFn: () => mockClient as unknown as ReturnType<BroadcasterDeps['getClientFn']>,
      getEnabledGroupsFn: () => ['group1'],
      formatFn: () => 'alert text',
      scheduleFn,
      cancelScheduleFn,
    };

    const broadcast = createBroadcaster(db, deps);
    const image = Buffer.from('fake-image');
    const alert: Alert = { type: 'missiles', cities: ['תל אביב'] };

    // Wave 1 — fresh send: map debounce is scheduled
    await broadcast(alert, image);
    assert.equal(scheduleMock.mock.calls.length, 1, 'wave 1 should schedule map debounce');

    // Simulate wave 1 debounce firing — sets mapSent = true internally
    const wave1Callback = scheduleMock.mock.calls[0].arguments[0] as () => void;
    wave1Callback();
    // Give the async sendDebouncedMap a tick to complete
    await new Promise((r) => setTimeout(r, 0));

    // Wave 2 — edit path: map should NOT be scheduled again
    await broadcast({ ...alert, cities: ['תל אביב', 'רמת גן'] }, image);
    assert.equal(
      scheduleMock.mock.calls.length,
      1,
      'wave 2 should NOT schedule a new map debounce after map was already sent',
    );

    // Wave 3 — same result
    await broadcast({ ...alert, cities: ['תל אביב', 'רמת גן', 'חולון'] }, image);
    assert.equal(
      scheduleMock.mock.calls.length,
      1,
      'wave 3 should NOT schedule a map debounce either',
    );
  });
});

describe('whatsappBroadcaster — no enabled groups', () => {
  beforeEach(() => clearTrackedMessages());

  it('does not call getClient when no groups are enabled for alert type', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      getEnabledGroupsFn: mock.fn(() => []) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when no groups enabled'
    );
  });

  it('works correctly with a real DB that has no matching groups', async () => {
    const db = makeDb();
    // Only add a group for earthquakes, not missiles
    upsertGroup(db, 'group-eq', 'Earthquake Group', true, ['earthQuake']);

    const getClientFn = mock.fn(() => null);

    const realDeps: BroadcasterDeps = {
      getStatusFn: () => 'ready',
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      getEnabledGroupsFn: (d, type) => {
        // Use the real repository function
        return getEnabledGroupsForAlertType(d, type) as string[];
      },
      formatFn: () => 'text',
    };

    const broadcast = createBroadcaster(db, realDeps);
    await broadcast(BASE_ALERT); // missiles — no group should match

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when no group matches missiles type'
    );
  });
});

