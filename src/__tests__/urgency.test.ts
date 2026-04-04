import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { getUrgencyForCountdown, renderCountdownBar } from '../config/urgency.js';

describe('getUrgencyForCountdown', () => {
  it('returns immediate (מיידי/🔴) for 0 seconds', () => {
    const result = getUrgencyForCountdown(0);
    assert.equal(result.label, 'מיידי');
    assert.equal(result.emoji, '🔴');
  });

  it('returns immediate (מיידי/🔴) for 15 seconds (boundary)', () => {
    const result = getUrgencyForCountdown(15);
    assert.equal(result.label, 'מיידי');
    assert.equal(result.emoji, '🔴');
  });

  it('returns urgent (דחוף/🟠) for 16 seconds', () => {
    const result = getUrgencyForCountdown(16);
    assert.equal(result.label, 'דחוף');
    assert.equal(result.emoji, '🟠');
  });

  it('returns urgent (דחוף/🟠) for 30 seconds (boundary)', () => {
    const result = getUrgencyForCountdown(30);
    assert.equal(result.label, 'דחוף');
    assert.equal(result.emoji, '🟠');
  });

  it('returns fast (מהיר/🟡) for 60 seconds', () => {
    const result = getUrgencyForCountdown(60);
    assert.equal(result.label, 'מהיר');
    assert.equal(result.emoji, '🟡');
  });

  it('returns moderate (מתון/🟢) for 180 seconds', () => {
    const result = getUrgencyForCountdown(180);
    assert.equal(result.label, 'מתון');
    assert.equal(result.emoji, '🟢');
  });

  it('returns normal (רגיל/🔵) for 300 seconds', () => {
    const result = getUrgencyForCountdown(300);
    assert.equal(result.label, 'רגיל');
    assert.equal(result.emoji, '🔵');
  });

  it('returns normal (רגיל/🔵) for Infinity', () => {
    const result = getUrgencyForCountdown(Infinity);
    assert.equal(result.label, 'רגיל');
    assert.equal(result.emoji, '🔵');
  });
});

describe('renderCountdownBar', () => {
  // Unknown / confrontation-line cities → no bar
  it('returns empty string for countdown 0 (unknown)', () => {
    assert.equal(renderCountdownBar(0), '');
  });

  it('returns empty string for negative countdown', () => {
    assert.equal(renderCountdownBar(-1), '');
  });

  it('returns empty string for Infinity', () => {
    assert.equal(renderCountdownBar(Infinity), '');
  });

  // מיידי (≤15s) — 5/5 filled 🔴
  it('renders 5 red squares for 1 second (מיידי)', () => {
    assert.equal(renderCountdownBar(1), '🔴🔴🔴🔴🔴');
  });

  it('renders 5 red squares at boundary 15s (מיידי)', () => {
    assert.equal(renderCountdownBar(15), '🔴🔴🔴🔴🔴');
  });

  // דחוף (≤30s) — 4/5 filled 🟠
  it('renders 4 orange squares at boundary 16s (דחוף)', () => {
    assert.equal(renderCountdownBar(16), '🟠🟠🟠🟠⬜');
  });

  it('renders 4 orange squares at boundary 30s (דחוף)', () => {
    assert.equal(renderCountdownBar(30), '🟠🟠🟠🟠⬜');
  });

  // מהיר (≤60s) — 3/5 filled 🟡
  it('renders 3 yellow squares at boundary 31s (מהיר)', () => {
    assert.equal(renderCountdownBar(31), '🟡🟡🟡⬜⬜');
  });

  it('renders 3 yellow squares at boundary 60s (מהיר)', () => {
    assert.equal(renderCountdownBar(60), '🟡🟡🟡⬜⬜');
  });

  // מתון (≤180s) — 2/5 filled 🟢
  it('renders 2 green squares at boundary 61s (מתון)', () => {
    assert.equal(renderCountdownBar(61), '🟢🟢⬜⬜⬜');
  });

  it('renders 2 green squares at boundary 180s (מתון)', () => {
    assert.equal(renderCountdownBar(180), '🟢🟢⬜⬜⬜');
  });

  // רגיל (>180s) — 1/5 filled 🔵 (distant but still shown for context)
  it('renders 1 blue square at boundary 181s (רגיל)', () => {
    assert.equal(renderCountdownBar(181), '🔵⬜⬜⬜⬜');
  });

  it('renders 1 blue square for 300s (רגיל)', () => {
    assert.equal(renderCountdownBar(300), '🔵⬜⬜⬜⬜');
  });

  // Each bar is exactly 5 emoji characters
  it('bar is always 5 chars for all known levels', () => {
    const testCases = [15, 30, 60, 180, 300];
    for (const sec of testCases) {
      const bar = renderCountdownBar(sec);
      // Each emoji is one character in JS string (emoji are surrogate pairs — count grapheme clusters via spread)
      const graphemes = [...bar];
      assert.equal(graphemes.length, 5, `Expected 5 graphemes for ${sec}s, got ${graphemes.length}: "${bar}"`);
    }
  });
});
