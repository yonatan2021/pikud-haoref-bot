import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DmQueue, extractRetryAfter, validateChatId, _resetMassDeleteGuard, _safeMassDeleteGuard } from '../services/dmQueue.js';

describe('DmQueue', () => {
  it('calls send for every enqueued task', async () => {
    const calls: string[] = [];
    const q = new DmQueue(async (task) => { calls.push(task.chatId); });
    q.enqueueAll([{ chatId: '1', text: 'a' }, { chatId: '2', text: 'b' }]);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(calls.sort(), ['1', '2']);
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0; let maxConcurrent = 0;
    const q = new DmQueue(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
    }, { concurrency: 3 });
    q.enqueueAll(Array.from({ length: 9 }, (_, i) => ({ chatId: String(i), text: 'x' })));
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(maxConcurrent <= 3, `expected max 3 concurrent, got ${maxConcurrent}`);
  });

  it('retries task after 429 rate-limit and eventually delivers it', async () => {
    let attempts = 0;
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      attempts++;
      if (attempts === 1) {
        // Simulate Telegram 429 with a short retry_after so the test completes quickly
        const err = Object.assign(new Error('Too Many Requests'), {
          parameters: { retry_after: 0.05 },
        });
        throw err;
      }
      calls.push(task.chatId);
    }, { concurrency: 1 });
    q.enqueueAll([{ chatId: '42', text: 'hello' }]);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(calls, ['42'], 'task should be delivered after 429 retry');
    assert.equal(attempts, 2, 'send should have been attempted exactly twice');
  });

  it('continues processing remaining tasks after a bot-blocked error', async () => {
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      if (task.chatId === '1') throw new Error('bot was blocked by the user');
      calls.push(task.chatId);
    }, { concurrency: 1 });
    q.enqueueAll([
      { chatId: '1', text: 'a' },
      { chatId: '2', text: 'b' },
    ]);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(calls, ['2'], 'subsequent task should be sent despite blocked-user error');
  });

  it('does not retry blocked-user tasks — dropped immediately unlike 429', async () => {
    let sendCount = 0;
    const q = new DmQueue(async (task) => {
      sendCount++;
      if (task.chatId === 'blocked') throw new Error('bot was blocked by the user');
    }, { concurrency: 1 });
    q.enqueueAll([
      { chatId: 'blocked', text: 'x' },
      { chatId: 'ok-1',    text: 'y' },
      { chatId: 'ok-2',    text: 'z' },
    ]);
    await new Promise<void>((r) => setTimeout(r, 300));
    // blocked task is attempted once, not retried — total sends = 3 (1 blocked + 2 ok)
    assert.equal(sendCount, 3, 'blocked task must be attempted exactly once (not retried)');
  });

  it('throws if concurrency is 0 or negative', () => {
    assert.throws(() => new DmQueue(async () => {}, { concurrency: 0 }), /concurrency must be positive/);
    assert.throws(() => new DmQueue(async () => {}, { concurrency: -1 }), /concurrency must be positive/);
  });

  it('retries task after message-string 429 (regex path)', async () => {
    let attempts = 0;
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      attempts++;
      if (attempts === 1) {
        // Telegram sometimes sends 429 as a plain error message without a parameters object
        throw new Error('Too Many Requests: retry after 1');
      }
      calls.push(task.chatId);
    }, { concurrency: 1 });
    q.enqueueAll([{ chatId: '99', text: 'hello' }]);
    await new Promise((r) => setTimeout(r, 1500));
    assert.deepEqual(calls, ['99'], 'task should be delivered after message-string 429 retry');
    assert.equal(attempts, 2);
  });

  it('gives up after MAX_RETRIES (5) rate-limit retries', async () => {
    let attempts = 0;
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      attempts++;
      // Always throw 429 with a very short retry_after so the test completes quickly
      const err = Object.assign(new Error('Too Many Requests'), {
        parameters: { retry_after: 0.02 },
      });
      throw err;
    }, { concurrency: 1 });
    q.enqueueAll([{ chatId: '77', text: 'x' }]);
    // Wait long enough for 5 retries at 20ms each (~200ms) plus some buffer
    await new Promise((r) => setTimeout(r, 600));
    // Task should have been attempted 6 times (1 initial + 5 retries) then dropped
    assert.ok(attempts >= 6, `expected at least 6 attempts, got ${attempts}`);
    assert.deepEqual(calls, [], 'task should be dropped after max retries, not delivered');
  });

  it('extractRetryAfter: clamps retry_after > 300 to 300 (structured params path)', () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      parameters: { retry_after: 999 },
    });
    assert.equal(extractRetryAfter(err), 300);
  });

  it('extractRetryAfter: clamps retry_after > 300 to 300 (message string path)', () => {
    assert.equal(extractRetryAfter(new Error('retry after 500')), 300);
  });

  it('extractRetryAfter: returns null for non-429 errors', () => {
    assert.equal(extractRetryAfter(new Error('bot was blocked')), null);
    assert.equal(extractRetryAfter(new Error('random error')), null);
    assert.equal(extractRetryAfter(null), null);
  });

  // I3 — float retry_after values (sub-second cooldowns). The structured
  // params path passes the number through Math.min directly so a float
  // survives. The message-string path uses parseFloat so "retry after 0.5"
  // is also a valid input. Both must return the float value (NOT NaN, NOT 0).
  it('extractRetryAfter: passes through float retry_after from structured params', () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      parameters: { retry_after: 0.5 },
    });
    assert.equal(extractRetryAfter(err), 0.5, 'sub-second retry_after must survive');
  });

  it('extractRetryAfter: parses float from message string ("retry after 0.5")', () => {
    assert.equal(extractRetryAfter(new Error('retry after 0.5')), 0.5);
  });

  it('extractRetryAfter: parses float from message string ("retry after 1.75")', () => {
    assert.equal(extractRetryAfter(new Error('retry after 1.75')), 1.75);
  });

  // Issue 4 — missing error path tests
  it('does not retry "user is deactivated" — drops task and continues', async () => {
    let sendCount = 0;
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      sendCount++;
      if (task.chatId === 'deactivated') throw new Error('user is deactivated');
      calls.push(task.chatId);
    }, { concurrency: 1 });
    q.enqueueAll([
      { chatId: 'deactivated', text: 'x' },
      { chatId: 'ok-1', text: 'y' },
    ]);
    await new Promise<void>((r) => setTimeout(r, 200));
    assert.equal(sendCount, 2, 'deactivated task must be attempted once, not retried');
    assert.deepEqual(calls, ['ok-1'], 'next task must still be processed');
  });

  it('does not retry "chat not found" — drops task and continues', async () => {
    let sendCount = 0;
    const calls: string[] = [];
    const q = new DmQueue(async (task) => {
      sendCount++;
      if (task.chatId === 'notfound') throw new Error('chat not found');
      calls.push(task.chatId);
    }, { concurrency: 1 });
    q.enqueueAll([
      { chatId: 'notfound', text: 'x' },
      { chatId: 'ok-1', text: 'y' },
    ]);
    await new Promise<void>((r) => setTimeout(r, 200));
    assert.equal(sendCount, 2, 'chat-not-found task must be attempted once, not retried');
    assert.deepEqual(calls, ['ok-1'], 'next task must still be processed');
  });

  // Issue 5 — getStats() not tested
  it('getStats(): pending reflects tasks waiting behind concurrency=1', async () => {
    let resolve!: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });
    const q = new DmQueue(async () => blocker, { concurrency: 1 });

    assert.deepEqual(q.getStats(), { pending: 0, rateLimited: false });

    q.enqueueAll([
      { chatId: '1', text: 'a' },
      { chatId: '2', text: 'b' },
      { chatId: '3', text: 'c' },
    ]);
    // concurrency=1: task '1' is in-flight; '2' and '3' are pending
    assert.equal(q.getStats().pending, 2);
    assert.equal(q.getStats().rateLimited, false);

    resolve();
    await new Promise<void>((r) => setTimeout(r, 100));
    assert.equal(q.getStats().pending, 0);
  });

  it('getStats(): rateLimited becomes true during a 429 pause', async () => {
    let attempts = 0;
    const q = new DmQueue(async () => {
      attempts++;
      if (attempts === 1) {
        throw Object.assign(new Error('Too Many Requests'), { parameters: { retry_after: 60 } });
      }
    }, { concurrency: 1 });
    q.enqueueAll([{ chatId: '1', text: 'a' }]);
    await new Promise<void>((r) => setTimeout(r, 50));
    assert.equal(q.getStats().rateLimited, true, 'should be rate-limited after 429');
    assert.equal(q.getStats().pending, 1, 'requeued task must appear as pending');
  });

  // Issue 6 — enqueueAll([]) not tested
  it('enqueueAll([]) is a no-op — nothing sent, no crash', async () => {
    let sendCount = 0;
    const q = new DmQueue(async () => { sendCount++; });
    q.enqueueAll([]);
    await new Promise<void>((r) => setTimeout(r, 50));
    assert.equal(sendCount, 0);
    assert.deepEqual(q.getStats(), { pending: 0, rateLimited: false });
  });
});

// Issue 7 — validateChatId extracted from singleton closure and made testable
describe('validateChatId', () => {
  it('parses a valid integer string', () => {
    assert.equal(validateChatId('123'), 123);
  });

  it('returns null for a non-numeric string', () => {
    assert.equal(validateChatId('invalid'), null);
  });

  it('truncates a float string to integer', () => {
    assert.equal(validateChatId('0.5'), 0);
    assert.equal(validateChatId('456.9'), 456);
  });

  it('returns null for a string that is NaN even after float parse', () => {
    assert.equal(validateChatId('abc.xyz'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(validateChatId(''), null);
  });

  it('returns null for "Infinity"', () => {
    assert.equal(validateChatId('Infinity'), null);
  });

  it('returns null for "-Infinity"', () => {
    assert.equal(validateChatId('-Infinity'), null);
  });
});

// ─── safeMassDeleteGuard ──────────────────────────────────────────────────────

describe('safeMassDeleteGuard', () => {
  beforeEach(() => {
    _resetMassDeleteGuard();
  });

  it('returns true for first MAX_MASS_DELETES (5) calls within the window', () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(_safeMassDeleteGuard(), true, `call ${i + 1} should be allowed`);
    }
  });

  it('returns false on the 6th call within the same window', () => {
    for (let i = 0; i < 5; i++) _safeMassDeleteGuard();
    assert.equal(_safeMassDeleteGuard(), false, '6th call within window should be blocked');
  });

  it('resets and returns true again after _resetMassDeleteGuard()', () => {
    for (let i = 0; i < 6; i++) _safeMassDeleteGuard(); // exhaust
    _resetMassDeleteGuard();
    assert.equal(_safeMassDeleteGuard(), true, 'first call after reset should be allowed');
  });

  it('resets automatically when window expires (simulated via Date.now override)', () => {
    for (let i = 0; i < 6; i++) _safeMassDeleteGuard(); // exhaust and block
    assert.equal(_safeMassDeleteGuard(), false, 'should be blocked before time travel');

    // Fast-forward time by 61 seconds — guard window should reset
    const orig = Date.now;
    Date.now = () => orig() + 61_000;
    try {
      assert.equal(_safeMassDeleteGuard(), true, 'should be allowed after window expires');
    } finally {
      Date.now = orig;
    }
  });
});
