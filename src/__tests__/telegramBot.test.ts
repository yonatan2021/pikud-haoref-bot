import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { escapeHtml, buildCityList } from '../telegramBot.js';

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
