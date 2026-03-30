import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRequiredResult } from '../src/steps/required.js'

describe('buildRequiredResult', () => {
  it('includes all fields for telegram platform', () => {
    const r = buildRequiredResult('telegram', { token: 'tok', chatId: '-100', mapbox: 'pk.x' })
    assert.deepEqual(r, { token: 'tok', chatId: '-100', mapbox: 'pk.x' })
  })
  it('returns empty object for whatsapp-only platform', () => {
    const r = buildRequiredResult('whatsapp', { token: undefined, chatId: undefined, mapbox: undefined })
    assert.deepEqual(r, {})
  })
  it('includes all fields for both platform', () => {
    const r = buildRequiredResult('both', { token: 'tok', chatId: '-100', mapbox: 'pk.x' })
    assert.ok(r.token && r.chatId && r.mapbox)
  })
})
