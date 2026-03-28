import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DmQueue, extractRetryAfter } from '../services/dmQueue.js';

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
});
