import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('metrics', () => {
  it('returns null lastAlertAt before any update', async () => {
    const { getMetrics } = await import('../metrics.js');
    assert.equal(getMetrics().lastAlertAt, null);
  });

  it('records lastAlertAt after updateLastAlertAt()', async () => {
    const { getMetrics, updateLastAlertAt } = await import('../metrics.js');
    updateLastAlertAt();
    assert.ok(getMetrics().lastAlertAt instanceof Date);
  });
});
