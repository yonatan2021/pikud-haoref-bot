import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCached, setCached } from '../../dashboard/statsCache.js';

describe('statsCache', () => {
  it('getCached returns null for an unknown key', () => {
    const result = getCached('nonexistent:key');
    assert.equal(result, null);
  });

  it('getCached returns data before expiry', () => {
    const data = { uptime: 123, alertsToday: 5 };
    setCached('stats:health:test1', data, 60_000);
    const result = getCached<typeof data>('stats:health:test1');
    assert.deepEqual(result, data);
  });

  it('getCached returns null after TTL expires', async () => {
    const data = { value: 'ephemeral' };
    setCached('stats:health:test2', data, 1);
    // Wait slightly longer than 1ms TTL
    await new Promise(resolve => setTimeout(resolve, 10));
    const result = getCached('stats:health:test2');
    assert.equal(result, null);
  });

  it('setCached overwrites an existing entry', () => {
    const original = { count: 1 };
    const updated = { count: 2 };
    setCached('stats:overview:test3', original, 60_000);
    setCached('stats:overview:test3', updated, 60_000);
    const result = getCached<typeof updated>('stats:overview:test3');
    assert.deepEqual(result, updated);
  });
});
