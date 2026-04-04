import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, escapeHtml } from '../textUtils';

describe('stripHtml', () => {
  it('returns plain text unchanged', () => {
    assert.equal(stripHtml('hello world'), 'hello world');
  });

  it('strips a single HTML tag', () => {
    assert.equal(stripHtml('<b>bold</b>'), 'bold');
  });

  it('strips nested tags', () => {
    assert.equal(stripHtml('<b><i>nested</i></b>'), 'nested');
  });

  it('strips script tags', () => {
    assert.equal(stripHtml('<script>alert(1)</script>'), 'alert(1)');
  });

  it('returns empty string for empty input', () => {
    assert.equal(stripHtml(''), '');
  });

  it('strips self-closing tags', () => {
    assert.equal(stripHtml('before<br/>after'), 'beforeafter');
  });

  it('strips tags with attributes', () => {
    assert.equal(stripHtml('<a href="url">link</a>'), 'link');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
  });

  it('escapes less-than', () => {
    assert.equal(escapeHtml('a<b'), 'a&lt;b');
  });

  it('escapes greater-than', () => {
    assert.equal(escapeHtml('a>b'), 'a&gt;b');
  });

  it('escapes all special characters together', () => {
    assert.equal(escapeHtml('<b>&test</b>'), '&lt;b&gt;&amp;test&lt;/b&gt;');
  });

  it('returns empty string for empty input', () => {
    assert.equal(escapeHtml(''), '');
  });

  it('leaves plain text unchanged', () => {
    assert.equal(escapeHtml('hello'), 'hello');
  });
});
