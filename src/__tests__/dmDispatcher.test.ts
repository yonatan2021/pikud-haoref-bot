import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_TYPE_EMOJI, ALERT_TYPE_HE } from '../telegramBot';
import type { Alert } from '../types';
import { buildNewsFlashDmMessage, buildDmText, shouldSkipForQuietHours } from '../services/dmDispatcher';

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

describe('buildDmText — personalization integration', () => {
  it('short format shows only matchedCities, not all alert cities', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert, 'short');
    assert.ok(msg.includes('אבו גוש'), 'matched city must appear');
    assert.ok(!msg.includes('נהריה'), 'unmatched city must not appear');
    assert.ok(!msg.includes('חיפה'), 'unmatched city must not appear');
  });

  it('detailed format uses formatAlertMessage with matched cities only', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert, 'detailed');
    assert.ok(msg.includes('אבו גוש'));
    assert.ok(!msg.includes('נהריה'));
  });

  it('newsFlash uses buildNewsFlashDmMessage regardless of format', () => {
    const personalAlert: Alert = { type: 'newsFlash', cities: ['אבו גוש'], instructions: 'הנחיות' };
    const msg = buildDmText(personalAlert, 'short');
    assert.ok(msg.startsWith('📢'), 'newsFlash must use newsFlash formatter');
    assert.ok(msg.includes('הנחיות'));
  });
});

describe('shouldSkipForQuietHours', () => {
  // UTC 23:00 → Israel 01:00–02:00 — always in quiet window
  const NIGHT = new Date('2026-03-28T23:00:00.000Z');
  // UTC 08:00 → Israel 10:00–11:00 — always daytime
  const DAY   = new Date('2026-03-28T08:00:00.000Z');

  it('returns false when quiet hours disabled, even at night', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', false, NIGHT), false);
  });

  it('returns false during daytime when enabled', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', true, DAY), false);
  });

  it('blocks newsFlash at night when enabled', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', true, NIGHT), true);
  });

  it('blocks general type at night', () => {
    assert.equal(shouldSkipForQuietHours('general', true, NIGHT), true);
  });

  it('blocks unknown type at night', () => {
    assert.equal(shouldSkipForQuietHours('unknown', true, NIGHT), true);
  });

  it('blocks drill types at night', () => {
    assert.equal(shouldSkipForQuietHours('missilesDrill', true, NIGHT), true);
    assert.equal(shouldSkipForQuietHours('generalDrill', true, NIGHT), true);
  });

  it('never blocks missiles', () => {
    assert.equal(shouldSkipForQuietHours('missiles', true, NIGHT), false);
  });

  it('never blocks earthquake', () => {
    assert.equal(shouldSkipForQuietHours('earthQuake', true, NIGHT), false);
  });

  it('never blocks hazardous materials', () => {
    assert.equal(shouldSkipForQuietHours('hazardousMaterials', true, NIGHT), false);
  });

  it('blocks all drill subtypes at night when enabled', () => {
    const drills = [
      'missilesDrill', 'earthQuakeDrill', 'tsunamiDrill',
      'hostileAircraftIntrusionDrill', 'hazardousMaterialsDrill',
      'terroristInfiltrationDrill', 'radiologicalEventDrill', 'generalDrill',
    ];
    for (const type of drills) {
      assert.equal(shouldSkipForQuietHours(type, true, NIGHT), true, `${type} must be suppressed at night`);
    }
  });

  it('never blocks security/nature/environmental types regardless of time or setting', () => {
    const alwaysThrough = [
      'missiles', 'hostileAircraftIntrusion', 'terroristInfiltration',
      'earthQuake', 'tsunami',
      'hazardousMaterials', 'radiologicalEvent',
    ];
    for (const type of alwaysThrough) {
      assert.equal(shouldSkipForQuietHours(type, true, NIGHT), false, `${type} must never be suppressed`);
    }
  });
});
