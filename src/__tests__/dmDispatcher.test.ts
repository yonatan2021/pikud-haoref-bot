import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot';
import type { Alert } from '../types';

// Test the short message format logic (extracted for unit testing)
function buildShortMessage(alert: Alert): string {
  const emoji = ALERT_TYPE_EMOJI[alert.type] ?? '⚠️';
  const title = ALERT_TYPE_HE[alert.type] ?? ALERT_TYPE_HE.unknown ?? 'התרעה';
  const cities = alert.cities.slice(0, 10).join(', ');
  const more = alert.cities.length > 10 ? ` ועוד ${alert.cities.length - 10}` : '';
  return `${emoji} ${title} | ${cities}${more}`;
}

describe('dmDispatcher short format', () => {
  it('formats missiles alert correctly', () => {
    const alert: Alert = { type: 'missiles', cities: ['תל אביב', 'רמת גן'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('🔴'));
    assert.ok(msg.includes('התרעת טילים'));
    assert.ok(msg.includes('תל אביב'));
    assert.ok(msg.includes('רמת גן'));
  });

  it('shows overflow count when more than 10 cities', () => {
    const cities = Array.from({ length: 15 }, (_, i) => `עיר ${i + 1}`);
    const alert: Alert = { type: 'missiles', cities };
    const msg = buildShortMessage(alert);
    assert.ok(msg.includes('ועוד 5'));
  });

  it('no overflow for exactly 10 cities', () => {
    const cities = Array.from({ length: 10 }, (_, i) => `עיר ${i + 1}`);
    const alert: Alert = { type: 'missiles', cities };
    const msg = buildShortMessage(alert);
    assert.ok(!msg.includes('ועוד'));
  });

  it('uses drill emoji for drill types', () => {
    const alert: Alert = { type: 'missilesDrill', cities: ['תל אביב'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('🔵'));
    assert.ok(msg.includes('תרגיל'));
  });

  it('falls back to ⚠️ for unknown type', () => {
    const alert: Alert = { type: 'unknownType', cities: ['תל אביב'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('⚠️'));
  });
});
