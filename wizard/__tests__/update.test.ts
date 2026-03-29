import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildUpdateFields } from '../src/modes/update.js'

describe('buildUpdateFields', () => {
  it('includes WHATSAPP_ENABLED in the field list', () => {
    assert.ok(buildUpdateFields().some((f) => f.key === 'WHATSAPP_ENABLED'))
  })
  it('includes all existing core fields', () => {
    const keys = buildUpdateFields().map((f) => f.key)
    for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN', 'PROXY_URL', 'DASHBOARD_SECRET']) {
      assert.ok(keys.includes(k), `missing ${k}`)
    }
  })
  it('WHATSAPP_ENABLED is not secret and validates true/false only', () => {
    const wa = buildUpdateFields().find((f) => f.key === 'WHATSAPP_ENABLED')!
    assert.equal(wa.secret, undefined)
    assert.ok(wa.validate, 'should have a validator')
    assert.equal(wa.validate!('true'),  undefined)
    assert.equal(wa.validate!('false'), undefined)
    assert.ok(wa.validate!('yes'),  'should reject "yes"')
    assert.ok(wa.validate!('1'),    'should reject "1"')
    assert.ok(wa.validate!('True'), 'should reject mixed-case "True"')
    assert.ok(wa.validate!('TRUE'), 'should reject uppercase "TRUE"')
  })
})
