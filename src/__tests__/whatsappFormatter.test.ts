import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';

// Suppress logger stdout so output doesn't pollute test results
let stdoutSpy: ReturnType<typeof mock.method>;
beforeEach(() => {
  stdoutSpy = mock.method(process.stdout, 'write', () => true);
});
afterEach(() => {
  stdoutSpy.mock.restore();
});

// Import after mocks are set up. The template cache uses buildDefaultCache() at
// module load time, so getAllCached() returns sensible defaults without needing
// a real database.
import { formatAlertForWhatsApp } from '../whatsapp/whatsappFormatter';

describe('formatAlertForWhatsApp — bold title', () => {
  it('wraps title in WhatsApp *bold* markers, not HTML', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('*התרעת טילים*'), 'expected *bold* Hebrew title');
    assert.ok(!result.includes('<b>'), 'should not contain HTML <b> tags');
    assert.ok(!result.includes('&amp;'), 'should not contain HTML entities');
  });

  it('includes emoji prefix before the bold title', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.startsWith('🔴 *התרעת טילים*'));
  });
});

describe('formatAlertForWhatsApp — zone header with countdown', () => {
  it('formats zone header with countdown for city that has countdown data', () => {
    // אבו גוש (id=511) is a well-known city with zone='בית שמש' and countdown>0
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('📍 *בית שמש*'), 'expected zone header for אבו גוש');
    assert.ok(result.includes('⏱'), 'expected countdown indicator for known city');
    assert.ok(result.includes("שנ׳"), "expected שנ׳ countdown unit");
    assert.ok(result.includes('אבו גוש'), 'expected city name listed under zone');
  });

  it('includes all cities under the same zone on one line', () => {
    // Both cities belong to zone בית שמש
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);

    const zoneHeaderCount = (result.match(/📍 \*בית שמש\*/g) ?? []).length;
    assert.equal(zoneHeaderCount, 1, 'should have exactly one zone header');
    assert.ok(result.includes('אבו גוש'), 'city 1 should appear');
    assert.ok(result.includes('בית שמש'), 'city 2 should appear');
  });
});

describe('formatAlertForWhatsApp — unzoned cities', () => {
  it('appends cities with no zone data at end without zone header', () => {
    const unknownCity = 'עיר_לא_קיימת_בכלל';
    const alert: Alert = { type: 'missiles', cities: [unknownCity] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(!result.includes('📍'), 'should have no zone header for unknown city');
    assert.ok(result.includes(unknownCity), 'unknown city should still appear');
  });

  it('places unzoned cities after zoned cities', () => {
    const unknownCity = 'עיר_לא_קיימת_בכלל';
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', unknownCity] };
    const result = formatAlertForWhatsApp(alert);

    const zoneHeaderIndex = result.indexOf('📍');
    const unknownCityIndex = result.indexOf(unknownCity);

    assert.ok(zoneHeaderIndex !== -1, 'should have zone header for אבו גוש');
    assert.ok(unknownCityIndex > zoneHeaderIndex, 'unzoned city should appear after zone section');
  });
});

describe('formatAlertForWhatsApp — instructions', () => {
  it('appends instructions when alert.instructions is set', () => {
    const alert: Alert = {
      type: 'missiles',
      cities: [],
      instructions: 'היכנסו למרחב המוגן',
    };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('\n\n📌 היכנסו למרחב המוגן'), 'expected instructions appended with separator');
  });

  it('does not append instructions section when not set', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(!result.includes('📌'), 'should have no instructions marker');
  });
});

describe('formatAlertForWhatsApp — unknown alert type fallback', () => {
  it('falls back to ⚠️ emoji and התרעה title for unknown type', () => {
    const alert: Alert = { type: 'completelyUnknownAlertType_xyz', cities: [] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.startsWith('⚠️ *התרעה*'), `expected fallback title, got: ${result}`);
  });
});
