import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { derivePlatformFromFlags } from '../src/steps/platform.js'
import type { Flags } from '../src/args.js'

describe('derivePlatformFromFlags', () => {
  it('returns "whatsapp" when --whatsapp only', () => {
    assert.equal(derivePlatformFromFlags({ whatsapp: true }), 'whatsapp')
  })

  it('returns "both" when --whatsapp + --token', () => {
    assert.equal(
      derivePlatformFromFlags({ whatsapp: true, token: '1234567:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
      'both'
    )
  })

  it('returns "both" when --whatsapp + --chat-id', () => {
    assert.equal(
      derivePlatformFromFlags({ whatsapp: true, 'chat-id': '-100123' }),
      'both'
    )
  })

  it('returns "telegram" when only --token (no --whatsapp)', () => {
    assert.equal(
      derivePlatformFromFlags({ token: '1234567:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
      'telegram'
    )
  })

  it('returns undefined when no platform flags', () => {
    assert.equal(derivePlatformFromFlags({}), undefined)
  })
})
