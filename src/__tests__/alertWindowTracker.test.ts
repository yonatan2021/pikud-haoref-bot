// src/__tests__/alertWindowTracker.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveMessage,
  trackMessage,
  clearAll,
  TrackedMessage,
} from '../alertWindowTracker.js';

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
