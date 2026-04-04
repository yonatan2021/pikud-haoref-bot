import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { Alert } from '../types.js';

// Suppress logger stdout so test output stays clean
let stdoutSpy: ReturnType<typeof mock.method>;
beforeEach(() => {
  stdoutSpy = mock.method(process.stdout, 'write', () => true);
});
afterEach(() => {
  stdoutSpy.mock.restore();
});

import { formatAlertMessage } from '../telegramBot.js';
import { formatAlertForWhatsApp } from '../whatsapp/whatsappFormatter.js';

// Three cities from three distinct known zones:
//   אור יהודה → דן (90s)
//   החותרים   → חיפה (60s)
//   אבו גוש   → בית שמש (90s)
const MULTI_ZONE_ALERT: Alert = {
  type: 'missiles',
  cities: ['אור יהודה', 'החותרים', 'אבו גוש'],
  receivedAt: new Date('2024-06-15T14:30:00Z').getTime(),
};

describe('cross-channel formatting parity', () => {
  it('both channels include the alert type emoji', () => {
    const tg = formatAlertMessage(MULTI_ZONE_ALERT);
    const wa = formatAlertForWhatsApp(MULTI_ZONE_ALERT);
    assert.ok(tg.includes('🔴'), `Telegram must include 🔴: ${tg}`);
    assert.ok(wa.includes('🔴'), `WhatsApp must include 🔴: ${wa}`);
  });

  it('both channels include all three zone names', () => {
    const tg = formatAlertMessage(MULTI_ZONE_ALERT);
    const wa = formatAlertForWhatsApp(MULTI_ZONE_ALERT);
    for (const zoneName of ['דן', 'חיפה', 'בית שמש']) {
      assert.ok(tg.includes(zoneName), `TG missing zone "${zoneName}"`);
      assert.ok(wa.includes(zoneName), `WA missing zone "${zoneName}"`);
    }
  });

  it('both channels show "3 אזורים" in summary line', () => {
    const tg = formatAlertMessage(MULTI_ZONE_ALERT);
    const wa = formatAlertForWhatsApp(MULTI_ZONE_ALERT);
    assert.ok(tg.includes('3 אזורים'), `TG missing zone count: ${tg}`);
    assert.ok(wa.includes('3 אזורים'), `WA missing zone count: ${wa}`);
  });

  it('both channels sort zones urgency-first (most urgent first)', () => {
    // Reduce to two zones for an unambiguous position check:
    // החותרים → חיפה (60s) must appear before אור יהודה → דן (90s)
    const alert: Alert = { ...MULTI_ZONE_ALERT, cities: ['אור יהודה', 'החותרים'] };
    const tg = formatAlertMessage(alert);
    const wa = formatAlertForWhatsApp(alert);
    assert.ok(tg.indexOf('חיפה') < tg.indexOf('דן'), `TG: חיפה (60s) must precede דן (90s)`);
    assert.ok(wa.indexOf('חיפה') < wa.indexOf('דן'), `WA: חיפה (60s) must precede דן (90s)`);
  });

  it('both channels include ⏰ clock icon', () => {
    const tg = formatAlertMessage(MULTI_ZONE_ALERT);
    const wa = formatAlertForWhatsApp(MULTI_ZONE_ALERT);
    assert.ok(tg.includes('⏰'), `TG missing ⏰`);
    assert.ok(wa.includes('⏰'), `WA missing ⏰`);
  });

  it('both channels use ▸ as zone header prefix', () => {
    const tg = formatAlertMessage(MULTI_ZONE_ALERT);
    const wa = formatAlertForWhatsApp(MULTI_ZONE_ALERT);
    assert.ok(tg.includes('▸'), `TG missing ▸ zone prefix`);
    assert.ok(wa.includes('▸'), `WA missing ▸ zone prefix`);
  });
});
