import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { getUrgencyForCountdown } from '../config/urgency.js';

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

  it('returns normal (רגיל/⚪) for 300 seconds', () => {
    const result = getUrgencyForCountdown(300);
    assert.equal(result.label, 'רגיל');
    assert.equal(result.emoji, '⚪');
  });

  it('returns normal (רגיל/⚪) for Infinity', () => {
    const result = getUrgencyForCountdown(Infinity);
    assert.equal(result.label, 'רגיל');
    assert.equal(result.emoji, '⚪');
  });
});
