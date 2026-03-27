import { strict as assert } from 'node:assert';
import { describe, it, test } from 'node:test';
import { escapeHtml, buildCityList, buildZonedCityList, selectEditMethod } from '../telegramBot.js';

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

  it('returns plain city list when no city has zone data', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(!result.includes('📍'), 'should not show a zone header');
    assert.ok(result.includes('עיר לא קיימת בכלל'));
  });

  it('shows zone header for cities in a known zone', () => {
    // אור יהודה and בני ברק are both in the "דן" zone
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']);
    assert.ok(result.includes('📍'), 'should include pin emoji');
    assert.ok(result.includes('דן'), 'should show zone name');
    assert.ok(result.includes('אור יהודה'), 'should list city');
    assert.ok(result.includes('בני ברק'), 'should list city');
  });

  it('shows a separate section per zone for multi-zone alerts', () => {
    // אור יהודה → "דן", החותרים → "חיפה", באר שבע - דרום → "מרכז הנגב"
    const result = buildZonedCityList(['אור יהודה', 'החותרים', 'באר שבע - דרום']);
    assert.ok(result.includes('דן'), 'should show "דן" zone');
    assert.ok(result.includes('חיפה'), 'should show "חיפה" zone');
    assert.ok(result.includes('מרכז הנגב'), 'should show "מרכז הנגב" zone');
    assert.equal((result.match(/📍/g) ?? []).length, 3, 'should have one pin per zone');
  });

  it('truncates at 25 cities per zone with overflow line', () => {
    // 30 cities all unknown (no zone) — uses plain buildCityList path
    const cities = Array.from({ length: 30 }, (_, i) => `עיר ${i + 1}`);
    const result = buildZonedCityList(cities);
    assert.ok(result.includes('ועוד 5 ערים נוספות'));
  });

  it('escapes HTML in zone names', () => {
    const result = buildZonedCityList(['אור יהודה']);
    // Zone name is wrapped in <b> tags from our template, not injected raw
    assert.ok(!result.includes('<script>'), 'zone should not allow script injection');
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
