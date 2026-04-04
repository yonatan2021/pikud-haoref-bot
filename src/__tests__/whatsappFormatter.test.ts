import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';

// NOTE: No process.stdout.write mock here — that pattern silently suppresses
// node:test TAP output (see src/CLAUDE.md gotcha). The formatter does not call
// log() directly, so there is no log noise to suppress.

import {
  formatAlertForWhatsApp,
  buildWAZoneHeader,
  buildWACityList,
  buildWAZonedCityList,
  buildWAZoneOnlyList,
} from '../whatsapp/whatsappFormatter';

// ─── buildWAZoneHeader ────────────────────────────────────────────────────────

describe('buildWAZoneHeader', () => {
  it('includes zone name, count, and countdown when countdown is valid', () => {
    const result = buildWAZoneHeader('שפלה', 3, 45);
    assert.equal(result, '▸ *שפלה* (3)  ⏱ 45 שנ׳');
  });

  it('omits countdown when countdown is null', () => {
    const result = buildWAZoneHeader('שפלה', 3, null);
    assert.equal(result, '▸ *שפלה* (3)');
  });

  it('omits countdown when countdown is 0', () => {
    const result = buildWAZoneHeader('שפלה', 3, 0);
    assert.equal(result, '▸ *שפלה* (3)');
  });

  it('uses *bold* markers around zone name (not HTML)', () => {
    const result = buildWAZoneHeader('בית שמש', 1, null);
    assert.ok(result.includes('*בית שמש*'), 'expected WhatsApp bold markers');
    assert.ok(!result.includes('<b>'), 'should not contain HTML tags');
  });
});

// ─── buildWACityList ──────────────────────────────────────────────────────────

describe('buildWACityList', () => {
  it('sorts cities in Hebrew locale order', () => {
    const result = buildWACityList(['תל אביב', 'אבו גוש', 'נצרת']);
    const cities = result.split(', ');
    assert.equal(cities[0], 'אבו גוש', 'אבו גוש should come first alphabetically');
  });

  it('caps at 25 cities and appends overflow text', () => {
    const cities = Array.from({ length: 26 }, (_, i) => `עיר ${String(i + 1).padStart(2, '0')}`);
    const result = buildWACityList(cities);
    assert.ok(result.includes('ועוד 1 ערים נוספות'), 'expected plain-text overflow indicator');
    assert.ok(!result.includes('<i>'), 'overflow should be plain text, not HTML');
    const displayedCities = result.split('\n')[0].split(', ');
    assert.equal(displayedCities.length, 25, 'exactly 25 cities before overflow');
  });

  it('returns plain comma-separated string with no overflow for ≤25 cities', () => {
    const result = buildWACityList(['תל אביב', 'חיפה']);
    assert.equal(result, 'חיפה, תל אביב');
    assert.ok(!result.includes('ועוד'), 'no overflow for 2 cities');
  });
});

// ─── formatAlertForWhatsApp — bold title ────────────────────────────────────

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

  it('includes city count in header when cities are present', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);
    // Header is two lines: "emoji *title*\n⏰ HH:MM  ·  N ערים"
    const headerBlock = result.split('\n\n')[0];
    assert.ok(headerBlock.includes('2 ערים'), `expected city count in header block, got: ${headerBlock}`);
  });

  it('omits city count when cities array is empty', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    const headerLine = result.split('\n')[0];
    assert.ok(!headerLine.includes('ערים'), 'no city count for empty cities');
  });
});

// ─── formatAlertForWhatsApp — zone header with countdown ────────────────────

describe('formatAlertForWhatsApp — zone header with countdown', () => {
  it('formats zone header with ▸ marker (not 📍) for city that has countdown data', () => {
    // אבו גוש (id=511) is a well-known city with zone='בית שמש' and countdown>0
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(/▸ .*\*בית שמש\*/.test(result), `expected ▸ zone header for אבו גוש, got:\n${result}`);
    assert.ok(!result.includes('📍'), 'should not use 📍 pin emoji for zone headers');
    assert.ok(result.includes('⏱'), 'expected countdown indicator for known city');
    assert.ok(result.includes("שנ׳"), "expected שנ׳ countdown unit");
    assert.ok(result.includes('אבו גוש'), 'expected city name listed under zone');
  });

  it('includes zone city count (N) in zone header', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(/▸ .*\*בית שמש\* \(2\)/.test(result), `expected zone count (2), got:\n${result}`);
  });

  it('includes all cities under the same zone with exactly one zone header', () => {
    // Both cities belong to zone בית שמש
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);

    const zoneHeaderCount = (result.match(/▸ .*\*בית שמש\*/g) ?? []).length;
    assert.equal(zoneHeaderCount, 1, 'should have exactly one zone header');
    assert.ok(result.includes('אבו גוש'), 'city 1 should appear');
    assert.ok(result.includes('בית שמש'), 'city 2 should appear');
  });

  it('sorts cities alphabetically within zone', () => {
    // בית שמש and אבו גוש — alphabetically אבו גוש comes first
    const alert: Alert = { type: 'missiles', cities: ['בית שמש', 'אבו גוש'] };
    const result = formatAlertForWhatsApp(alert);
    const zoneSection = result.split('\n\n').find((s) => /▸ .*\*בית שמש\*/.test(s)) ?? '';
    const cityLine = zoneSection.split('\n').slice(1).join('');
    assert.ok(cityLine.indexOf('אבו גוש') < cityLine.indexOf('בית שמש'), 'cities should be sorted Hebrew-alphabetically');
  });
});

// ─── formatAlertForWhatsApp — unzoned cities ────────────────────────────────

describe('formatAlertForWhatsApp — unzoned cities', () => {
  it('uses ▸ ערים נוספות label for unzoned cities (no bold zone name)', () => {
    const unknownCity = 'עיר_לא_קיימת_בכלל';
    const alert: Alert = { type: 'missiles', cities: [unknownCity] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(!result.includes('▸ *'), 'should have no *bold* zone name for unknown city');
    assert.ok(result.includes('▸ ערים נוספות'), 'should use ▸ ערים נוספות label');
    assert.ok(result.includes(unknownCity), 'unknown city should still appear');
  });

  it('places unzoned cities after zoned cities', () => {
    const unknownCity = 'עיר_לא_קיימת_בכלל';
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', unknownCity] };
    const result = formatAlertForWhatsApp(alert);

    const zoneHeaderIndex = result.indexOf('▸ ');
    const unknownCityIndex = result.indexOf(unknownCity);

    assert.ok(zoneHeaderIndex !== -1, 'should have ▸ zone header for אבו גוש');
    assert.ok(unknownCityIndex > zoneHeaderIndex, 'unzoned city should appear after zone section');
  });
});

// ─── formatAlertForWhatsApp — instructions ───────────────────────────────────

describe('formatAlertForWhatsApp — instructions', () => {
  it('uses instructionsPrefix from templateCache (🛡 for missiles), not hardcoded 📌', () => {
    const alert: Alert = {
      type: 'missiles',
      cities: [],
      instructions: 'היכנסו למרחב המוגן',
    };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('\n\n🛡 היכנסו למרחב המוגן'), `expected 🛡 prefix from cache, got:\n${result}`);
    assert.ok(!result.includes('📌'), 'should not use hardcoded 📌');
  });

  it('shows instructions without prefix for newsFlash (empty prefix)', () => {
    // newsFlash has instructionsPrefix: '' by default
    const alert: Alert = {
      type: 'newsFlash',
      cities: [],
      instructions: 'צפויות להתקבל התרעות',
    };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('\n\nצפויות להתקבל התרעות'), 'instructions should appear without prefix for newsFlash');
    assert.ok(!result.includes('🛡'), 'newsFlash should not have 🛡 prefix');
  });

  it('shows instructions BEFORE zone groups when cities are present', () => {
    // אבו גוש (id=511) has zone='בית שמש' — ensures a ▸ zone header is emitted
    const alert: Alert = {
      type: 'missiles',
      cities: ['אבו גוש'],
      instructions: 'היכנסו למרחב המוגן',
    };
    const result = formatAlertForWhatsApp(alert);
    const instrPos = result.indexOf('🛡');
    const zonePos  = result.indexOf('▸ ');
    assert.ok(instrPos !== -1, 'should contain 🛡 instructions prefix');
    assert.ok(zonePos  !== -1, 'should contain ▸ zone header');
    assert.ok(
      instrPos < zonePos,
      `instructions (pos ${instrPos}) must appear before zone header (pos ${zonePos})`
    );
  });

  it('does not append instructions section when not set', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(!result.includes('📌'), 'should have no 📌 marker');
    assert.ok(!result.includes('🛡'), 'should have no 🛡 prefix when no instructions');
  });

  it('uses \\n\\n separator between header, instructions, and city list', () => {
    const alert: Alert = {
      type: 'missiles',
      cities: ['אבו גוש'],
      instructions: 'היכנסו מיידית',
    };
    const result = formatAlertForWhatsApp(alert);
    const sections = result.split('\n\n');
    assert.ok(sections.length >= 3, `expected ≥3 sections separated by \\n\\n, got ${sections.length}: ${JSON.stringify(sections)}`);
  });
});

// ─── formatAlertForWhatsApp — newsFlash zone-only ────────────────────────────

describe('formatAlertForWhatsApp — newsFlash zone-only list', () => {
  it('shows zone names but NOT individual city names for newsFlash', () => {
    // אבו גוש is in zone בית שמש
    const alert: Alert = { type: 'newsFlash', cities: ['אבו גוש'] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('▸ *בית שמש*'), 'should include zone name');
    assert.ok(!result.includes('אבו גוש'), 'should NOT include individual city name for newsFlash');
  });

  it('includes zone count in newsFlash zone header', () => {
    const alert: Alert = { type: 'newsFlash', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('(2)'), 'expected count in newsFlash zone header');
  });

  it('skips unrecognized cities silently for newsFlash (no ▸ ערים נוספות section)', () => {
    const alert: Alert = { type: 'newsFlash', cities: ['עיר_לא_קיימת'] };
    const result = formatAlertForWhatsApp(alert);
    // buildWAZoneOnlyList skips no-zone cities, same as Telegram's buildZoneOnlyList
    assert.ok(!result.includes('▸'), 'no zone section when all cities are unrecognized');
  });
});

// ─── formatAlertForWhatsApp — city overflow ──────────────────────────────────

describe('formatAlertForWhatsApp — city overflow >25 per zone', () => {
  it('shows ועוד N ערים נוספות in plain text when zone has >25 cities', () => {
    // Create a mock alert with 26 cities all in the same zone.
    // We use real cities from zone 'שפלה' if available; if not, the test
    // relies on buildWAZonedCityList aggregating unknowns into ▸ ערים נוספות.
    // Use buildWAZonedCityList directly to test the overflow logic:
    const cities = Array.from({ length: 26 }, (_, i) => `testcity_${i}`);
    const result = buildWAZonedCityList(cities);
    // All unknown → go to noZone → ▸ ערים נוספות with overflow
    assert.ok(result.includes('ועוד 1 ערים נוספות'), `expected overflow indicator, got:\n${result}`);
    assert.ok(!result.includes('<i>'), 'overflow text must be plain text, not HTML italic');
  });
});

// ─── formatAlertForWhatsApp — receivedAt timestamp ──────────────────────────

describe('formatAlertForWhatsApp — receivedAt timestamp', () => {
  it('uses alert.receivedAt for the time display, not wall clock', () => {
    // 2024-01-15T14:30:00Z = 16:30 Israel time (UTC+2 in winter)
    const receivedAt = new Date('2024-01-15T14:30:00Z').getTime();
    const alert: Alert = { type: 'missiles', cities: [], receivedAt };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.includes('16:30'), `expected 16:30 Israel time, got:\n${result}`);
  });
});

// ─── formatAlertForWhatsApp — drill alert type ──────────────────────────────

describe('formatAlertForWhatsApp — drill alert type', () => {
  it('drill alert type uses 🔵 emoji and correct Hebrew title', () => {
    // missilesDrill has default emoji 🔵 and title תרגיל — התרעת טילים
    const alert: Alert = { type: 'missilesDrill', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.startsWith('🔵 *'), `expected result to start with 🔵 *, got: ${result}`);
    assert.ok(result.includes('תרגיל — התרעת טילים'), `expected drill title, got: ${result}`);
  });
});

// ─── formatAlertForWhatsApp — earthQuake alert type ────────────────────────

describe('formatAlertForWhatsApp — earthQuake alert type', () => {
  it('earthQuake alert type uses 🟠 emoji and correct Hebrew title', () => {
    // earthQuake has default emoji 🟠 and title רעידת אדמה
    const alert: Alert = { type: 'earthQuake', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.startsWith('🟠 *'), `expected result to start with 🟠 *, got: ${result}`);
    assert.ok(result.includes('רעידת אדמה'), `expected earthQuake title, got: ${result}`);
  });
});

// ─── formatAlertForWhatsApp — unknown alert type fallback ───────────────────

describe('formatAlertForWhatsApp — unknown alert type fallback', () => {
  it('falls back to ⚠️ emoji and התרעה title for unknown type', () => {
    const alert: Alert = { type: 'completelyUnknownAlertType_xyz', cities: [] };
    const result = formatAlertForWhatsApp(alert);

    assert.ok(result.startsWith('⚠️ *התרעה*'), `expected fallback title, got: ${result}`);
  });
});

describe('formatAlertForWhatsApp — summary line', () => {
  it('shows "N ערים" for single-zone alert', () => {
    // אבו גוש + בית שמש → both in בית שמש zone
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('2 ערים'), `Expected "2 ערים" in: ${result}`);
  });

  it('shows "N אזורים · M ערים" for multi-zone alert', () => {
    // אור יהודה → דן, החותרים → חיפה → 2 zones
    const alert: Alert = { type: 'missiles', cities: ['אור יהודה', 'החותרים'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('2 אזורים · 2 ערים'), `Expected zone+city count: ${result}`);
  });

  it('omits summary line when cities array is empty', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(!result.includes('ערים'), `Should not show summary for empty cities: ${result}`);
  });
});

describe('formatAlertForWhatsApp — urgency sorting', () => {
  it('sorts zones by urgency (most urgent first)', () => {
    // החותרים → חיפה (60s), אור יהודה → דן (90s) — חיפה must appear first
    const alert: Alert = { type: 'missiles', cities: ['אור יהודה', 'החותרים'] };
    const result = formatAlertForWhatsApp(alert);
    const haifaIdx = result.indexOf('חיפה');
    const danIdx = result.indexOf('דן');
    assert.ok(haifaIdx < danIdx, `חיפה (60s) must precede דן (90s): ${result}`);
  });

  it('zone header includes urgency emoji', () => {
    // החותרים → חיפה (60s) → 🟡
    const alert: Alert = { type: 'missiles', cities: ['החותרים'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('🟡'), `Expected urgency emoji 🟡: ${result}`);
  });
});

describe('formatAlertForWhatsApp — zone header format', () => {
  it('uses ▸ prefix', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('▸'), 'should use ▸ zone prefix');
  });

  it('includes city count (N) in zone header', () => {
    // אבו גוש + בית שמש → both in בית שמש → (2)
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'בית שמש'] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('(2)'), `Expected "(2)" in zone header: ${result}`);
  });

  it('uses ⏰ clock icon', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const result = formatAlertForWhatsApp(alert);
    assert.ok(result.includes('⏰'), 'should use ⏰ clock icon');
    assert.ok(!result.includes('🕐'), 'should not use old 🕐 clock icon');
  });
});
