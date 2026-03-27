import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot';
import type { Alert } from '../types';
import { buildNewsFlashDmMessage } from '../services/dmDispatcher';

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

describe('buildNewsFlashDmMessage', () => {
  it('shows zone names instead of city names', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש', 'נהריה'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('📢'));
    assert.ok(msg.includes('בית שמש'), 'should include zone of אבו גוש');
    assert.ok(msg.includes('קו העימות'), 'should include zone of נהריה');
    assert.ok(!msg.includes('אבו גוש'), 'should NOT list individual cities');
    assert.ok(!msg.includes('נהריה'), 'should NOT list individual cities');
  });

  it('deduplicates zones — two different cities in same zone produce one zone label', () => {
    // אבו גוש (id=511) and אביעזר (id=359) are both in zone בית שמש
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש', 'אביעזר'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    const count = (msg.match(/בית שמש/g) ?? []).length;
    assert.equal(count, 1, 'zone should appear only once for two cities in the same zone');
  });

  it('preserves first-appearance zone order', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['נהריה', 'אבו גוש'], // קו העימות first, then בית שמש
    };
    const msg = buildNewsFlashDmMessage(alert);
    const posFirst = msg.indexOf('קו העימות');
    const posSecond = msg.indexOf('בית שמש');
    assert.ok(posFirst < posSecond, 'first-seen zone should appear before second-seen zone');
  });

  it('appends instructions on a new line when present', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
      instructions: 'ניתן לצאת מהמרחבים המוגנים',
    };
    const msg = buildNewsFlashDmMessage(alert);
    const lines = msg.split('\n');
    assert.equal(lines.length, 2, 'should have exactly two lines when instructions present');
    assert.ok(lines[1] === 'ניתן לצאת מהמרחבים המוגנים', 'second line should be the instructions');
  });

  it('produces a single line when no instructions', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.equal(msg.split('\n').length, 1, 'should be a single line when no instructions');
  });

  it('handles empty city list gracefully', () => {
    const alert: Alert = { type: 'newsFlash', cities: [] };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('📢'));
    assert.ok(!msg.includes('|'));
  });

  it('falls back to city name when no zone data found', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['עיר_לא_קיימת_בכלל'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.includes('עיר_לא_קיימת_בכלל'), 'should fall back to city name');
  });
});
