import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AlertHistoryRow } from '../db/alertHistoryRepository';
import { buildStatsMessage } from '../bot/statsHandler';

function makeRow(type: string, cities: string[] = ['אבו גוש']): AlertHistoryRow {
  return { id: 1, type, cities, instructions: undefined, fired_at: '2026-03-28 12:00:00' };
}

describe('buildStatsMessage', () => {
  it('counts alerts by category and shows per-category emoji', () => {
    const rows: AlertHistoryRow[] = [
      makeRow('missiles'),
      makeRow('missiles'),
      makeRow('earthQuake'),
      makeRow('missilesDrill'),
      makeRow('newsFlash'),
    ];
    const msg = buildStatsMessage(rows, []);
    assert.ok(msg.includes('🔴'), 'security emoji present');
    assert.ok(msg.includes('🌍'), 'nature emoji present');
    assert.ok(msg.includes('🔵'), 'drills emoji present');
    assert.ok(msg.includes('📢'), 'general emoji present');
  });

  it('shows correct total count', () => {
    const rows = [makeRow('missiles'), makeRow('newsFlash'), makeRow('earthQuake')];
    const msg = buildStatsMessage(rows, []);
    assert.ok(msg.includes('3'), 'total should be 3');
  });

  it('omits personal line when no subscribed cities', () => {
    const msg = buildStatsMessage([makeRow('missiles')], []);
    assert.ok(!msg.includes('אזורך'), 'no personal line when no subscriptions');
  });

  it('shows personal count matching subscribed cities', () => {
    const rows = [
      makeRow('missiles', ['אבו גוש']),
      makeRow('newsFlash', ['נהריה']),
    ];
    const msg = buildStatsMessage(rows, ['אבו גוש']);
    assert.ok(msg.includes('אזורך'), 'personal line appears');
    assert.ok(msg.includes('1'), 'personal count is 1');
  });

  it('handles empty rows gracefully', () => {
    const msg = buildStatsMessage([], []);
    assert.ok(msg.includes('0'), 'shows zero counts');
  });

  it('unknown alert type falls into the general category bucket', () => {
    const rows = [makeRow('unknownType9999')];
    const msg = buildStatsMessage(rows, []);
    // The general category emoji (📢) should appear because unknownType9999 is not in ALERT_TYPE_CATEGORY
    assert.ok(msg.includes('📢'), 'unknown type should fall into general (📢) bucket');
    assert.ok(msg.includes('1'), 'count of 1 should appear');
  });
});
