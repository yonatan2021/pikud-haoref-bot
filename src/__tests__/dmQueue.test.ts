import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DmQueue } from '../services/dmQueue.js';

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
});
