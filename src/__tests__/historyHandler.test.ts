import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelativeHe, buildHistoryMessage } from '../bot/historyHandler';
import type { AlertHistoryRow } from '../db/alertHistoryRepository';

function makeRow(type: string, cities: string[], minutesAgo: number): AlertHistoryRow {
  const firedAt = new Date(Date.now() - minutesAgo * 60_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  return { id: 1, type, cities, instructions: undefined, fired_at: firedAt };
}

describe('formatRelativeHe', () => {
  it('returns "עכשיו" for < 1 minute ago', () => {
    const firedAt = new Date(Date.now() - 30_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'עכשיו');
  });

  it('returns minutes string for < 60 minutes ago', () => {
    const firedAt = new Date(Date.now() - 10 * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'לפני 10 דקות');
  });

  it('returns hours string for < 48 hours ago', () => {
    const firedAt = new Date(Date.now() - 3 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'לפני 3 שעות');
  });

  it('returns days string for >= 48 hours ago', () => {
    const firedAt = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'לפני 3 ימים');
  });

  it('singular: exactly 1 minute → "לפני דקה"', () => {
    const firedAt = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'לפני דקה');
  });

  it('singular: exactly 1 hour → "לפני שעה"', () => {
    const firedAt = new Date(Date.now() - 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'לפני שעה');
  });

  it('singular: exactly 1 day → "אתמול"', () => {
    const firedAt = new Date(Date.now() - 24 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    assert.equal(formatRelativeHe(firedAt), 'אתמול');
  });
});

describe('buildHistoryMessage', () => {
  it('shows alert type and city list', () => {
    const rows = [makeRow('missiles', ['אבו גוש', 'אביעזר'], 30)];
    const msg = buildHistoryMessage(rows);
    assert.ok(msg.includes('אבו גוש'));
    assert.ok(msg.includes('לפני 30 דקות'));
  });

  it('caps displayed cities at 5 and shows +N overflow', () => {
    const cities = Array.from({ length: 8 }, (_, i) => `עיר ${i + 1}`);
    const rows = [makeRow('missiles', cities, 10)];
    const msg = buildHistoryMessage(rows);
    assert.ok(msg.includes('+3'), 'overflow should show +3');
  });

  it('no overflow marker when 5 or fewer cities', () => {
    const rows = [makeRow('missiles', ['א', 'ב', 'ג'], 5)];
    const msg = buildHistoryMessage(rows);
    assert.ok(!msg.includes('+'), 'no overflow for 3 cities');
  });

  it('returns "אין" message for empty rows', () => {
    const msg = buildHistoryMessage([]);
    assert.ok(msg.includes('אין'));
  });
});
