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
  it('WHATSAPP_ENABLED has no validator and is not secret', () => {
    const wa = buildUpdateFields().find((f) => f.key === 'WHATSAPP_ENABLED')!
    assert.equal(wa.validate, undefined)
    assert.equal(wa.secret, undefined)
  })
})
