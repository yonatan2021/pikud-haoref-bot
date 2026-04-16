// src/__tests__/alertWindowTracker.test.ts
import { describe, it, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveMessage,
  trackMessage,
  clearAll,
  clearAllCloseTimers,
  clearMemoryOnly,
  loadActiveMessages,
  setWindowCloseCallback,
  TrackedMessage,
} from '../alertWindowTracker.js';
import { initDb, closeDb } from '../db/schema.js';

function makeMsg(overrides: Partial<TrackedMessage> = {}): TrackedMessage {
  return {
    messageId: 1,
    chatId: '-100123456',
    topicId: 3,
    alert: { type: 'missiles', cities: ['תל אביב'] },
    sentAt: Date.now(),
    hasPhoto: true,
    ...overrides,
  };
}

describe('alertWindowTracker', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    clearAll();
    process.env = { ...originalEnv, ALERT_UPDATE_WINDOW_SECONDS: '120' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null for unknown type', () => {
    assert.equal(getActiveMessage('missiles'), null);
  });

  it('returns tracked message within window', () => {
    const msg = makeMsg();
    trackMessage('missiles', msg);
    assert.deepEqual(getActiveMessage('missiles'), msg);
  });

  it('returns null for expired message', () => {
    const msg = makeMsg({ sentAt: Date.now() - 200_000 });
    trackMessage('missiles', msg);
    assert.equal(getActiveMessage('missiles'), null);
  });

  it('removes expired entry on access', () => {
    const msg = makeMsg({ sentAt: Date.now() - 200_000 });
    trackMessage('missiles', msg);
    getActiveMessage('missiles');
    assert.equal(getActiveMessage('missiles'), null);
  });

  it('updates existing tracked message on re-track', () => {
    trackMessage('missiles', makeMsg({ messageId: 1 }));
    trackMessage('missiles', makeMsg({ messageId: 2 }));
    assert.equal(getActiveMessage('missiles')?.messageId, 2);
  });

  it('tracks different alert types independently', () => {
    trackMessage('missiles', makeMsg({ topicId: 3, alert: { type: 'missiles', cities: [] } }));
    trackMessage('earthQuake', makeMsg({ topicId: 2, alert: { type: 'earthQuake', cities: [] } }));
    assert.equal(getActiveMessage('missiles')?.topicId, 3);
    assert.equal(getActiveMessage('earthQuake')?.topicId, 2);
  });

  it('respects custom window via env var', () => {
    process.env.ALERT_UPDATE_WINDOW_SECONDS = '10';
    const msg = makeMsg({ sentAt: Date.now() - 15_000 });
    trackMessage('missiles', msg);
    assert.equal(getActiveMessage('missiles'), null);
  });

  it('clearAll removes all tracked messages', () => {
    trackMessage('missiles', makeMsg());
    trackMessage('earthQuake', makeMsg());
    clearAll();
    assert.equal(getActiveMessage('missiles'), null);
    assert.equal(getActiveMessage('earthQuake'), null);
  });

  it('falls back to 120s window when env var is 0', () => {
    process.env.ALERT_UPDATE_WINDOW_SECONDS = '0';
    const msg = makeMsg({ sentAt: Date.now() - 130_000 }); // 130s ago, beyond 120s default
    trackMessage('missiles', msg);
    assert.equal(getActiveMessage('missiles'), null);
  });

  it('falls back to 120s window when env var is not a number', () => {
    process.env.ALERT_UPDATE_WINDOW_SECONDS = 'invalid';
    const msg = makeMsg({ sentAt: Date.now() - 130_000 });
    trackMessage('missiles', msg);
    assert.equal(getActiveMessage('missiles'), null);
  });
});

describe('alertWindowTracker — DB persistence', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => { clearAll(); });

  it('restores tracked message from DB after loadActiveMessages()', () => {
    const msg: TrackedMessage = {
      messageId: 42,
      chatId: '-1001234567890',
      topicId: undefined,
      alert: { type: 'missiles', cities: ['אבו גוש'] },
      sentAt: Date.now(),
      hasPhoto: false,
    };
    trackMessage('missiles', msg);
    // Simulate restart: clear in-memory map without touching DB
    clearMemoryOnly();
    // Restore from DB
    loadActiveMessages();
    const restored = getActiveMessage('missiles');
    assert.ok(restored !== null, 'message should be restored');
    assert.equal(restored!.messageId, 42);
    assert.equal(restored!.chatId, '-1001234567890');
    assert.deepEqual(restored!.alert.cities, ['אבו גוש']);
  });

  it('evicts expired windows from DB during loadActiveMessages()', () => {
    const expiredMsg: TrackedMessage = {
      messageId: 99,
      chatId: '-100987654321',
      topicId: undefined,
      alert: { type: 'earthQuake', cities: ['נהריה'] },
      sentAt: Date.now() - 400_000, // far beyond the 120s default window
      hasPhoto: false,
    };
    trackMessage('earthQuake', expiredMsg);
    // Simulate restart
    clearMemoryOnly();
    // loadActiveMessages should evict the expired entry rather than restore it
    loadActiveMessages();
    assert.equal(getActiveMessage('earthQuake'), null, 'expired window must not be restored from DB');
  });
});

describe('alertWindowTracker — window close callback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    clearAll();
    // Reset module-level callback so it doesn't leak between tests
    setWindowCloseCallback(() => {});
    process.env = { ...originalEnv, ALERT_UPDATE_WINDOW_SECONDS: '120' };
  });

  afterEach(() => {
    setWindowCloseCallback(() => {});
    process.env = originalEnv;
  });

  it('fires callback on lazy expiry detected by getActiveMessage', () => {
    const calls: Array<{ alertType: string; tracked: TrackedMessage }> = [];
    setWindowCloseCallback((alertType, tracked) => calls.push({ alertType, tracked }));

    // Backdating sentAt forces the lazy expiry path in getActiveMessage
    trackMessage('missiles', makeMsg({ sentAt: Date.now() - 200_000 }));
    const result = getActiveMessage('missiles');

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].alertType, 'missiles');
    assert.equal(calls[0].tracked.messageId, 1);
  });

  it('fires callback only once — entry is evicted after first getActiveMessage', () => {
    let callCount = 0;
    setWindowCloseCallback(() => { callCount++; });

    trackMessage('missiles', makeMsg({ sentAt: Date.now() - 200_000 }));

    getActiveMessage('missiles'); // evicts and fires callback
    getActiveMessage('missiles'); // entry gone — no second fire

    assert.equal(callCount, 1);
  });

  it('does not fire callback when message is still within the active window', () => {
    let called = false;
    setWindowCloseCallback(() => { called = true; });

    trackMessage('missiles', makeMsg()); // sentAt = Date.now()
    getActiveMessage('missiles');

    assert.equal(called, false);
  });

  it('callback receives a shallow copy, not the original tracked reference', () => {
    let received: TrackedMessage | null = null;
    setWindowCloseCallback((_, tracked) => { received = tracked; });

    const original = makeMsg({ sentAt: Date.now() - 200_000 });
    trackMessage('missiles', original);
    getActiveMessage('missiles');

    assert.ok(received !== null, 'callback must have been called');
    assert.notStrictEqual(received, original);
    assert.equal((received as TrackedMessage).messageId, original.messageId);
  });

  it('clearAllCloseTimers cancels the scheduled timer; lazy expiry path remains independent', () => {
    const firedTypes: string[] = [];
    setWindowCloseCallback((alertType) => firedTypes.push(alertType));

    // Track a fresh message — scheduleCloseTimer sets a real setTimeout for ~120s
    trackMessage('missiles', makeMsg());
    // Cancel all scheduled timers (simulates graceful shutdown)
    clearAllCloseTimers();

    // Lazy expiry still works independently: evict the fresh entry and add an expired one
    clearMemoryOnly();
    setWindowCloseCallback((alertType) => firedTypes.push(alertType));
    trackMessage('earthQuake', makeMsg({ sentAt: Date.now() - 200_000, alert: { type: 'earthQuake', cities: [] } }));
    getActiveMessage('earthQuake'); // lazy path fires for earthQuake only

    // Only earthQuake fired — missiles timer was cancelled, never fired
    assert.equal(firedTypes.length, 1);
    assert.equal(firedTypes[0], 'earthQuake');
  });
});
