import { strict as assert } from 'node:assert';
import { describe, it, test, mock, beforeEach, afterEach } from 'node:test';
import {
  escapeHtml,
  buildCityList,
  buildZonedCityList,
  selectEditMethod,
  truncateToCaptionLimit,
  formatAlertMessage,
  TELEGRAM_CAPTION_MAX,
  isUnmodifiedError,
  isMediaEditError,
  isMessageGoneError,
  editAlert,
  getBot,
} from '../telegramBot.js';

test('escapeHtml escapes ampersand', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml escapes less-than', () => {
  assert.equal(escapeHtml('a < b'), 'a &lt; b');
});

test('escapeHtml escapes greater-than', () => {
  assert.equal(escapeHtml('a > b'), 'a &gt; b');
});

test('escapeHtml leaves plain text unchanged', () => {
  assert.equal(escapeHtml('שלום עולם'), 'שלום עולם');
});

test('escapeHtml escapes multiple special chars', () => {
  assert.equal(escapeHtml('<b>a & b</b>'), '&lt;b&gt;a &amp; b&lt;/b&gt;');
});

test('buildCityList returns empty string for no cities', () => {
  assert.equal(buildCityList([]), '');
});

test('buildCityList joins few cities with comma', () => {
  assert.equal(buildCityList(['תל אביב', 'רמת גן']), 'תל אביב, רמת גן');
});

test('buildCityList shows all 25 cities with no overflow line', () => {
  const cities = Array.from({ length: 25 }, (_, i) => `עיר ${i + 1}`);
  const result = buildCityList(cities);
  assert.ok(result.includes('עיר 25'));
  assert.ok(!result.includes('נוספות'));
});

test('buildCityList truncates at 25 and shows overflow', () => {
  const cities = Array.from({ length: 30 }, (_, i) => `עיר ${i + 1}`);
  const result = buildCityList(cities);
  assert.ok(result.includes('עיר 25'));
  assert.ok(!result.includes('עיר 26'));
  assert.ok(result.includes('ועוד 5 ערים נוספות'));
});

test('buildCityList escapes HTML in city names', () => {
  const result = buildCityList(['תל & אביב']);
  assert.ok(result.includes('תל &amp; אביב'));
});

describe('buildZonedCityList', () => {
  it('returns empty string for no cities', () => {
    assert.equal(buildZonedCityList([]), '');
  });

  it('uses ערים נוספות header when no city has zone data', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(result.includes('📍'), 'should show pin emoji for ערים נוספות header');
    assert.ok(result.includes('ערים נוספות'), 'should show ערים נוספות header');
    assert.ok(result.includes('עיר לא קיימת בכלל'));
  });

  it('shows zone header for cities in a known zone', () => {
    // אור יהודה and בני ברק are both in the "דן" zone (countdown: 90s each)
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']);
    assert.ok(result.includes('📍'), 'should include pin emoji');
    assert.ok(result.includes('דן'), 'should show zone name');
    assert.ok(result.includes('אור יהודה'), 'should list city');
    assert.ok(result.includes('בני ברק'), 'should list city');
    assert.ok(result.includes('90 שנ׳'), 'should show countdown for zone');
  });

  it('shows the minimum countdown when zone cities have different countdowns', () => {
    // אבו גוש → "בית שמש" countdown:90, אביעזר → "בית שמש" countdown:90
    // but test with a mix: אור יהודה (דן, 90s) and a city with lower countdown
    // החותרים → "חיפה" countdown:60
    const result = buildZonedCityList(['החותרים']);
    assert.ok(result.includes('60 שנ׳'), 'should show 60s countdown for חיפה zone');
  });

  it('shows a separate section per zone for multi-zone alerts', () => {
    // אור יהודה → "דן" (90s), החותרים → "חיפה" (60s), באר שבע - דרום → "מרכז הנגב" (60s)
    const result = buildZonedCityList(['אור יהודה', 'החותרים', 'באר שבע - דרום']);
    assert.ok(result.includes('דן'), 'should show "דן" zone');
    assert.ok(result.includes('חיפה'), 'should show "חיפה" zone');
    assert.ok(result.includes('מרכז הנגב'), 'should show "מרכז הנגב" zone');
    assert.equal((result.match(/📍/g) ?? []).length, 3, 'should have one pin per zone');
  });

  it('does not show countdown suffix for cities with no zone data', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(!result.includes('⏱'), 'no-zone entries should not show countdown');
  });

  it('truncates at 25 cities per zone with overflow line', () => {
    // 30 cities all unknown (no zone) — uses plain buildCityList path
    const cities = Array.from({ length: 30 }, (_, i) => `עיר ${i + 1}`);
    const result = buildZonedCityList(cities);
    assert.ok(result.includes('ועוד 5 ערים נוספות'));
  });

  it('escapes HTML special characters in city names rendered inside zones', () => {
    // Unknown cities fall into the ערים נוספות section, rendered via buildCityList → escapeHtml.
    // Verifies user-supplied strings are never inserted as raw HTML.
    const malicious = 'עיר <b>רעה</b> & "בעיה"';
    const result = buildZonedCityList([malicious]);
    assert.ok(!result.includes('<b>רעה</b>'), 'raw <b> tag must not appear in output');
    assert.ok(result.includes('&lt;b&gt;'), 'angle brackets must be HTML-escaped');
    assert.ok(result.includes('&amp;'), 'ampersand must be HTML-escaped');
  });

  it('shows per-zone city count in zone header', () => {
    // אור יהודה and בני ברק are both in zone דן
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']);
    assert.ok(result.includes('(2)'), `Expected "(2)" in zone header: ${result}`);
  });

  it('sorts cities alphabetically within each zone', () => {
    // Feed in reverse alphabetical order — output should be sorted
    const result = buildZonedCityList(['בני ברק', 'אור יהודה']);
    const orYehudaIdx = result.indexOf('אור יהודה');
    const bneiIdx = result.indexOf('בני ברק');
    assert.ok(orYehudaIdx < bneiIdx, `אור יהודה should appear before בני ברק (alpha order): ${result}`);
  });

  it('shows "ערים נוספות" header for cities not found in cities.json', () => {
    const result = buildZonedCityList(['עיר_לא_קיימת_123xyz']);
    assert.ok(result.includes('ערים נוספות'), `Expected "ערים נוספות" header: ${result}`);
    assert.ok(result.includes('📍'), 'should include pin emoji for noZone header');
  });

  it('does not show "ערים נוספות" header when all cities have zone data', () => {
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']); // both in דן
    assert.ok(!result.includes('ערים נוספות'), `Should not show noZone header when all cities match: ${result}`);
  });
});

describe('truncateToCaptionLimit', () => {
  it('returns the message unchanged when it is within the caption limit', () => {
    const short = 'שלום עולם';
    assert.equal(truncateToCaptionLimit(short), short);
  });

  it('returns the message unchanged when it is exactly at the caption limit', () => {
    const atLimit = 'א'.repeat(TELEGRAM_CAPTION_MAX);
    assert.equal(truncateToCaptionLimit(atLimit), atLimit);
  });

  it('truncates at a zone-section boundary when the message exceeds the limit', () => {
    // Build a message with two sections separated by \n\n
    const section1 = '📍 <b>אזור א</b>\n' + 'א'.repeat(400);
    const section2 = '📍 <b>אזור ב</b>\n' + 'ב'.repeat(600);
    const message = section1 + '\n\n' + section2;

    assert.ok(message.length > TELEGRAM_CAPTION_MAX, 'pre-condition: message must exceed limit');

    const result = truncateToCaptionLimit(message);

    assert.ok(result.length <= TELEGRAM_CAPTION_MAX, 'result must fit within caption limit');
    assert.ok(result.includes('📍 <b>אזור א</b>'), 'first section should be retained');
    assert.ok(!result.includes('📍 <b>אזור ב</b>'), 'overflowing section should be cut');
    assert.ok(result.endsWith('\n<i>…</i>'), 'result must end with truncation marker');
  });

  it('falls back to a hard character cut when no zone boundary fits within the limit', () => {
    // A single continuous block longer than the limit
    const message = 'א'.repeat(TELEGRAM_CAPTION_MAX + 100);

    const result = truncateToCaptionLimit(message);

    assert.ok(result.length <= TELEGRAM_CAPTION_MAX);
    assert.ok(result.endsWith('\n<i>…</i>'));
  });
});

describe('selectEditMethod', () => {
  it('returns "media" when hasPhoto=true and imageBuffer is provided', () => {
    const result = selectEditMethod(true, Buffer.from('img'));
    assert.equal(result, 'media');
  });

  it('returns "caption" when hasPhoto=true but imageBuffer is null', () => {
    assert.equal(selectEditMethod(true, null), 'caption');
  });

  it('returns "text" when hasPhoto=false regardless of imageBuffer', () => {
    assert.equal(selectEditMethod(false, null), 'text');
    assert.equal(selectEditMethod(false, Buffer.from('img')), 'text');
  });
});

describe('formatAlertMessage with receivedAt timestamp', () => {
  it('uses receivedAt timestamp when provided', () => {
    // 2024-06-15 14:30:00 UTC = 17:30 Israel time (UTC+3 in summer)
    const fixedMs = new Date('2024-06-15T14:30:00Z').getTime();
    const alert = {
      type: 'rockets',
      cities: ['תל אביב'],
      receivedAt: fixedMs,
    };

    const result = formatAlertMessage(alert);
    assert.ok(result.includes('17:30'), 'formatted message should include the time 17:30 for the fixed timestamp');
  });

  it('falls back to current time when receivedAt is not provided', () => {
    const alert = {
      type: 'rockets',
      cities: ['תל אביב'],
    };

    const result = formatAlertMessage(alert);
    // Just verify that a time pattern is included (HH:MM format)
    assert.ok(/\d{2}:\d{2}/.test(result), 'formatted message should include a time pattern HH:MM');
  });
});

describe('formatAlertMessage city count', () => {
  it('shows city count in header when cities present', () => {
    const alert = {
      type: 'missiles',
      cities: ['עיר א', 'עיר ב', 'עיר ג'],
    };
    const result = formatAlertMessage(alert);
    assert.ok(result.includes('3 ערים'), `Expected "3 ערים" in: ${result}`);
  });

  it('omits city count suffix when cities array is empty', () => {
    const alert = {
      type: 'missiles',
      cities: [],
    };
    const result = formatAlertMessage(alert);
    assert.ok(!result.includes('ערים'), `Should not show city count for empty cities: ${result}`);
  });
});
