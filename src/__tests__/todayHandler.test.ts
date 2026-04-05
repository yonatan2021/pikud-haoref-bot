import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayMessage, buildTodayTimeline } from '../bot/todayHandler.js';
import type { AlertHistoryRow } from '../db/alertHistoryRepository.js';

function makeAlert(type: string, cities: string[] = [], fired_at?: string): AlertHistoryRow {
  return {
    id: 1,
    type,
    cities,
    instructions: undefined,
    fired_at: fired_at ?? new Date().toISOString(),
  };
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

  // Density indicator in summary
  it('shows density "חריג" label when monthlyCounts indicates unusual day', () => {
    // 10 counts all=1 → sorted p90=1; today=2 alerts → 2 > 1 → חריג
    const alerts = [makeAlert('missiles'), makeAlert('rockets')];
    const monthlyCounts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const msg = buildTodayMessage(alerts, [], monthlyCounts);
    assert.ok(msg.includes('חריג'), `Expected חריג label: ${msg}`);
  });

  it('shows density "רגיל" label when monthlyCounts indicates normal day', () => {
    const alerts = [makeAlert('missiles')];
    const monthlyCounts = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // all same → today=1 is רגיל
    const msg = buildTodayMessage(alerts, [], monthlyCounts);
    assert.ok(msg.includes('רגיל'), `Expected רגיל label: ${msg}`);
  });

  it('omits density label when fewer than 5 data points', () => {
    const alerts = [makeAlert('missiles')];
    const msg = buildTodayMessage(alerts, [], [1, 2]);
    assert.ok(!msg.includes('חריג') && !msg.includes('רגיל'), `Should omit density: ${msg}`);
  });

  // Timeline section
  it('includes timeline section when there are alerts', () => {
    const alerts = [makeAlert('missiles', ['תל אביב'])];
    const msg = buildTodayMessage(alerts, []);
    assert.ok(msg.includes('ציר'), `Expected timeline header: ${msg}`);
  });

  it('omits timeline section when no alerts', () => {
    const msg = buildTodayMessage([], []);
    assert.ok(!msg.includes('ציר'), `Should omit timeline when no alerts: ${msg}`);
  });

  it('shows at most 15 events in timeline, with overflow prefix', () => {
    const alerts = Array.from({ length: 20 }, (_, i) =>
      makeAlert('missiles', [`עיר ${i}`])
    );
    const msg = buildTodayMessage(alerts, []);
    // Should show overflow prefix (ועוד N אירועים)
    assert.ok(msg.includes('ועוד'), `Expected overflow prefix for >15 events: ${msg}`);
  });
});

describe('buildTodayTimeline', () => {
  it('returns empty string when no alerts', () => {
    assert.equal(buildTodayTimeline([]), '');
  });

  it('formats a single alert as one compact line with time and emoji', () => {
    const alert = makeAlert('missiles', ['תל אביב'], '2026-04-05T12:32:00.000Z');
    const line = buildTodayTimeline([alert]);
    assert.ok(line.includes('תל אביב'), `Expected city in line: ${line}`);
    assert.ok(line.includes('🔴'), `Expected security emoji: ${line}`);
  });

  it('truncates city list to 3 cities with overflow count', () => {
    const alert = makeAlert('missiles', ['א', 'ב', 'ג', 'ד', 'ה']);
    const line = buildTodayTimeline([alert]);
    assert.ok(line.includes('+2'), `Expected +2 overflow for 5 cities (3 shown): ${line}`);
  });

  it('shows all cities when 3 or fewer', () => {
    const alert = makeAlert('missiles', ['א', 'ב', 'ג']);
    const line = buildTodayTimeline([alert]);
    assert.ok(!line.includes('+'), `Should not show overflow for 3 cities: ${line}`);
    assert.ok(line.includes('א') && line.includes('ב') && line.includes('ג'));
  });
});
