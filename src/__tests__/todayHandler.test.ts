import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayMessage } from '../bot/todayHandler.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

function makeAlert(type: string, cities: string[] = []): AlertHistoryRow {
  return { id: 1, type, cities, instructions: null, firedAt: new Date().toISOString() };
}

describe('buildTodayMessage', () => {
  it('shows "no alerts" message when list is empty', () => {
    const msg = buildTodayMessage([], []);
    assert.ok(msg.includes('אין התראות'), `Expected no-alerts text: ${msg}`);
  });

  it('shows total alert count', () => {
    const alerts = [makeAlert('missiles'), makeAlert('newsFlash')];
    const msg = buildTodayMessage(alerts, []);
    assert.ok(msg.includes('2'), `Expected total count 2 in: ${msg}`);
  });

  it('shows category breakdown', () => {
    const alerts = [makeAlert('missiles'), makeAlert('missiles'), makeAlert('earthQuake')];
    const msg = buildTodayMessage(alerts, []);
    assert.ok(msg.includes('ביטחוני'), `Expected security category: ${msg}`);
    assert.ok(msg.includes('2'), `Expected count 2 for security: ${msg}`);
    assert.ok(msg.includes('אסונות טבע'), `Expected nature category: ${msg}`);
  });

  it('shows personal match count when user cities overlap with alert cities', () => {
    const alerts = [makeAlert('missiles', ['תל אביב', 'חיפה'])];
    const msg = buildTodayMessage(alerts, ['תל אביב']);
    assert.ok(msg.includes('1'), `Expected personal match count: ${msg}`);
    assert.ok(msg.includes('באזורך'), `Expected personal match label: ${msg}`);
  });

  it('shows "no alerts in your area" when user has cities but none match', () => {
    const alerts = [makeAlert('missiles', ['חיפה'])];
    const msg = buildTodayMessage(alerts, ['אילת']);
    assert.ok(msg.includes('לא היו התראות באזורך'), `Expected no-match message: ${msg}`);
  });

  it('omits personal section when user has no subscriptions', () => {
    const alerts = [makeAlert('missiles', ['תל אביב'])];
    const msg = buildTodayMessage(alerts, []);
    assert.ok(!msg.includes('באזורך'), `Should not show personal section: ${msg}`);
  });
});
