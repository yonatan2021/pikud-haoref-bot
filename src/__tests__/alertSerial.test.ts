import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initAlertSerial,
  getNextAlertSerial,
  _resetSerial,
} from '../config/alertSerial.js';

describe('alertSerial', () => {
  beforeEach(() => {
    _resetSerial();
  });

  it('getNextAlertSerial() starts at 1 after _resetSerial()', () => {
    assert.equal(getNextAlertSerial(), 1);
  });

  it('getNextAlertSerial() increments monotonically', () => {
    assert.equal(getNextAlertSerial(), 1);
    assert.equal(getNextAlertSerial(), 2);
    assert.equal(getNextAlertSerial(), 3);
  });

  it('initAlertSerial(n) seeds counter so next call returns n+1', () => {
    initAlertSerial(5);
    assert.equal(getNextAlertSerial(), 6);
    assert.equal(getNextAlertSerial(), 7);
  });

  it('initAlertSerial(0) behaves the same as _resetSerial — next call returns 1', () => {
    initAlertSerial(0);
    assert.equal(getNextAlertSerial(), 1);
  });

  it('date rollover: counter resets when Israel date changes', () => {
    // Seed with a past date string via _resetSerial + initAlertSerial so
    // lastCounterDate is set to "today".  Then fast-forward Date.now by 24h so
    // Intl.DateTimeFormat returns a different date — getNextAlertSerial() must
    // detect the mismatch and reset to 1.
    initAlertSerial(42);
    assert.equal(getNextAlertSerial(), 43, 'increments normally before rollover');

    const origDate = globalThis.Date;
    // Advance time by 25 hours to guarantee a new calendar day in any timezone.
    const fakeNow = Date.now() + 25 * 60 * 60 * 1000;
    // Minimal Date shim — only intercepts the zero-arg constructor that
    // Intl.DateTimeFormat.format() uses internally.
    class FakeDate extends origDate {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fakeNow);
        } else {
          super(...args as []);
        }
      }
      static now() { return fakeNow; }
    }
    // @ts-expect-error replacing global Date for test
    globalThis.Date = FakeDate;
    try {
      const serial = getNextAlertSerial();
      assert.equal(serial, 1, 'counter must reset to 1 on date rollover');
    } finally {
      globalThis.Date = origDate;
    }
  });

  it('no rollover when same day is called twice', () => {
    initAlertSerial(10);
    assert.equal(getNextAlertSerial(), 11);
    assert.equal(getNextAlertSerial(), 12);
  });
});
