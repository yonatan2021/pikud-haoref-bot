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

const CLOCK_RE = /\(\d{2}:\d{2}\)$/;

describe('formatRelativeHe', () => {
  it('returns "עכשיו (HH:MM)" for < 1 minute ago', () => {
    const firedAt = new Date(Date.now() - 30_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('עכשיו'), 'should include עכשיו');
    assert.match(result, CLOCK_RE, 'should include (HH:MM) suffix');
  });

  it('returns minutes phrase with (HH:MM) for < 60 minutes ago', () => {
    const firedAt = new Date(Date.now() - 10 * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני 10 דקות'), 'should include לפני 10 דקות');
    assert.match(result, CLOCK_RE, 'should include (HH:MM) suffix');
  });

  it('returns hours phrase with (HH:MM) for < 48 hours ago', () => {
    const firedAt = new Date(Date.now() - 3 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני 3 שעות'), 'should include לפני 3 שעות');
    assert.match(result, CLOCK_RE, 'should include (HH:MM) suffix');
  });

  it('returns days phrase with (HH:MM) for >= 3 days ago', () => {
    const firedAt = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני 3 ימים'), 'should include לפני 3 ימים');
    assert.match(result, CLOCK_RE, 'should include (HH:MM) suffix');
  });

  it('singular: exactly 1 minute → "לפני דקה (HH:MM)"', () => {
    const firedAt = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני דקה'), 'should include לפני דקה');
    assert.match(result, CLOCK_RE);
  });

  it('singular: exactly 1 hour → "לפני שעה (HH:MM)"', () => {
    const firedAt = new Date(Date.now() - 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני שעה'), 'should include לפני שעה');
    assert.match(result, CLOCK_RE);
  });

  it('singular: exactly 1 day → "אתמול (HH:MM)"', () => {
    const firedAt = new Date(Date.now() - 24 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('אתמול'), 'should include אתמול');
    assert.match(result, CLOCK_RE);
  });

  it('dual: exactly 2 hours → "לפני שעתיים (HH:MM)"', () => {
    const firedAt = new Date(Date.now() - 2 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני שעתיים'), 'should include לפני שעתיים');
    assert.match(result, CLOCK_RE);
  });

  it('dual: exactly 2 days → "לפני יומיים (HH:MM)"', () => {
    const firedAt = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const result = formatRelativeHe(firedAt);
    assert.ok(result.includes('לפני יומיים'), 'should include לפני יומיים');
    assert.match(result, CLOCK_RE);
  });
});

describe('buildHistoryMessage', () => {
  it('shows alert type, city list, and relative time with clock', () => {
    const rows = [makeRow('missiles', ['אבו גוש', 'אביעזר'], 30)];
    const msg = buildHistoryMessage(rows);
    assert.ok(msg.includes('אבו גוש'));
    assert.ok(msg.includes('לפני 30 דקות'));
    assert.match(msg, /\(\d{2}:\d{2}\)/, 'should include (HH:MM) clock time');
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
