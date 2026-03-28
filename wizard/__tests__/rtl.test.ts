import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { visibleWidth, rtlMark, padToWidth } from '../src/ui/rtl.js'

describe('visibleWidth', () => {
  it('counts plain ASCII correctly', () => {
    assert.equal(visibleWidth('hello'), 5)
  })

  it('counts Hebrew chars as 1 column each', () => {
    assert.equal(visibleWidth('שלום'), 4)
  })

  it('strips ANSI color escape codes', () => {
    assert.equal(visibleWidth('\x1b[31mhello\x1b[0m'), 5)
  })

  it('strips bold ANSI codes from Hebrew', () => {
    assert.equal(visibleWidth('\x1b[1mשלום\x1b[0m'), 4)
  })

  it('strips multi-param ANSI codes like 38;2;R;G;B', () => {
    assert.equal(visibleWidth('\x1b[38;2;100;200;50mhi\x1b[0m'), 2)
  })

  it('handles empty string', () => {
    assert.equal(visibleWidth(''), 0)
  })

  it('handles mixed Hebrew and ASCII', () => {
    // 'hi שלום' = 2 + 1 (space) + 4 = 7
    assert.equal(visibleWidth('hi שלום'), 7)
  })

  it('counts wide emoji as 2 columns', () => {
    // Emoji like 🚨 occupy 2 terminal columns
    assert.equal(visibleWidth('🚨'), 2)
  })
})

describe('rtlMark', () => {
  it('prepends RTL mark (U+200F) to string', () => {
    const result = rtlMark('שלום')
    assert.equal(result.charCodeAt(0), 0x200F)
    assert.equal(result.slice(1), 'שלום')
  })

  it('works on empty string', () => {
    assert.equal(rtlMark(''), '\u200F')
  })
})

describe('padToWidth', () => {
  it('pads string to desired visual width with trailing spaces', () => {
    const result = padToWidth('hi', 5)
    assert.equal(result, 'hi   ')
    assert.equal(visibleWidth(result), 5)
  })

  it('does not modify strings already at target width', () => {
    assert.equal(padToWidth('hello', 5), 'hello')
  })

  it('does not truncate strings longer than target width', () => {
    assert.equal(padToWidth('toolong', 3), 'toolong')
  })

  it('pads ANSI-colored strings by visual width, not byte length', () => {
    const colored = '\x1b[31mhi\x1b[0m'  // visually 2 chars wide
    const result = padToWidth(colored, 5)
    assert.equal(visibleWidth(result), 5)
  })

  it('pads Hebrew strings correctly', () => {
    const result = padToWidth('שלום', 7)
    assert.equal(visibleWidth(result), 7)
  })
})
