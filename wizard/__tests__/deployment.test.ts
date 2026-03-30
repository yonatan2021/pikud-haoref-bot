import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppNote } from '../src/steps/deployment.js'

describe('buildWhatsAppNote', () => {
  it('returns non-empty lines for "whatsapp" platform', () => {
    const lines = buildWhatsAppNote('whatsapp')
    assert.ok(lines.length > 0)
    assert.ok(lines.some((l) => l.includes('QR')))
  })
  it('returns non-empty lines for "both" platform', () => {
    assert.ok(buildWhatsAppNote('both').length > 0)
  })
  it('returns empty array for "telegram" platform', () => {
    assert.deepEqual(buildWhatsAppNote('telegram'), [])
  })
})
