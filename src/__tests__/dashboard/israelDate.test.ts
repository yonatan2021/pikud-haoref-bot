import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { israelMidnight, israelYesterdayMidnight, israelMidnightDaysAgo } from '../../dashboard/israelDate';

describe('israelMidnight', () => {
  it('returns a valid UTC datetime string in YYYY-MM-DD HH:MM:SS format', () => {
    const result = israelMidnight();
    assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns midnight Israel time (UTC+2) for a winter date', () => {
    // 2026-01-15 03:00 UTC → 05:00 Israel (IST, UTC+2) → Israel date is Jan 15
    // Israel midnight Jan 15 = 2026-01-14 22:00:00 UTC
    const winterDate = new Date('2026-01-15T03:00:00Z');
    const result = israelMidnight(winterDate);
    assert.equal(result, '2026-01-14 22:00:00');
  });

  it('returns midnight Israel time (UTC+3) for a summer date', () => {
    // 2026-07-15 03:00 UTC → 06:00 Israel (IDT, UTC+3) → Israel date is Jul 15
    // Israel midnight Jul 15 = 2026-07-14 21:00:00 UTC
    const summerDate = new Date('2026-07-15T03:00:00Z');
    const result = israelMidnight(summerDate);
    assert.equal(result, '2026-07-14 21:00:00');
  });

  it('handles the boundary just after midnight Israel time', () => {
    // 2026-01-15 22:30 UTC → 2026-01-16 00:30 Israel (IST)
    // Israel date is Jan 16 → Israel midnight = 2026-01-15 22:00:00 UTC
    const justAfterMidnight = new Date('2026-01-15T22:30:00Z');
    const result = israelMidnight(justAfterMidnight);
    assert.equal(result, '2026-01-15 22:00:00');
  });

  it('handles the boundary just before midnight Israel time', () => {
    // 2026-01-15 21:30 UTC → 2026-01-15 23:30 Israel (IST)
    // Israel date is still Jan 15 → Israel midnight = 2026-01-14 22:00:00 UTC
    const justBeforeMidnight = new Date('2026-01-15T21:30:00Z');
    const result = israelMidnight(justBeforeMidnight);
    assert.equal(result, '2026-01-14 22:00:00');
  });
});

describe('israelYesterdayMidnight', () => {
  it('returns midnight for the previous Israel day', () => {
    // 2026-01-15 03:00 UTC → Israel date Jan 15
    // Yesterday = Jan 14 → midnight = 2026-01-13 22:00:00 UTC (IST)
    const winterDate = new Date('2026-01-15T03:00:00Z');
    const result = israelYesterdayMidnight(winterDate);
    assert.equal(result, '2026-01-13 22:00:00');
  });

  it('handles summer DST correctly', () => {
    // 2026-07-15 03:00 UTC → Israel date Jul 15
    // Yesterday = Jul 14 → midnight = 2026-07-13 21:00:00 UTC (IDT)
    const summerDate = new Date('2026-07-15T03:00:00Z');
    const result = israelYesterdayMidnight(summerDate);
    assert.equal(result, '2026-07-13 21:00:00');
  });

  // T5: DST spring-forward boundary
  it('handles spring-forward DST transition correctly (T5)', () => {
    // 2026-03-28T12:00:00Z = 15:00 IDT in Israel (already in summer time by this date)
    // israelDateString → '2026-03-28'; yesterday → '2026-03-27'
    // At noon UTC on 2026-03-27, Israel is in IDT (UTC+3), so midnight = 2026-03-26 21:00:00 UTC
    const dayAfterSpringForward = new Date('2026-03-28T12:00:00Z');
    const result = israelYesterdayMidnight(dayAfterSpringForward);
    assert.equal(result, '2026-03-26 21:00:00',
      'should compute yesterday midnight using calendar-day arithmetic, not fixed-ms offset');
  });

  it('handles fall-back DST transition correctly (T5)', () => {
    // 2026-10-26T12:00:00Z = 14:00 IST in Israel (after fall-back)
    // israelDateString → '2026-10-26'; yesterday → '2026-10-25'
    // At noon UTC on 2026-10-25, Israel is in IST (UTC+2), so midnight = 2026-10-24 22:00:00 UTC
    const dayAfterFallBack = new Date('2026-10-26T12:00:00Z');
    const result = israelYesterdayMidnight(dayAfterFallBack);
    assert.equal(result, '2026-10-24 22:00:00',
      'should compute yesterday midnight for the fall-back transition day');
  });
});

describe('israelMidnightDaysAgo', () => {
  it('returns the same as israelYesterdayMidnight when n=1', () => {
    const ref = new Date('2026-01-15T03:00:00Z');
    assert.equal(israelMidnightDaysAgo(1, ref), israelYesterdayMidnight(ref));
  });

  it('returns midnight 7 calendar days ago (winter reference, IST)', () => {
    // 2026-01-15 → 7 days ago = 2026-01-08 → midnight = 2026-01-07 22:00:00 UTC (IST)
    const ref = new Date('2026-01-15T03:00:00Z');
    const result = israelMidnightDaysAgo(7, ref);
    assert.equal(result, '2026-01-07 22:00:00');
  });

  it('returns midnight 7 calendar days ago crossing DST boundary', () => {
    // Reference: 2026-04-03 (summer, IDT = UTC+3)
    // 7 calendar days ago = 2026-03-27 (also IDT by this date — Israel had already sprung forward)
    // At noon UTC on 2026-03-27, Israel is in IDT (UTC+3) → midnight = 2026-03-26 21:00:00 UTC
    const ref = new Date('2026-04-03T12:00:00Z');
    const result = israelMidnightDaysAgo(7, ref);
    assert.equal(result, '2026-03-26 21:00:00',
      'should use calendar arithmetic, correctly resolving IDT offset for 2026-03-27');
  });
});
