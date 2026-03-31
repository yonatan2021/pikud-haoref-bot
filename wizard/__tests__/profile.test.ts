import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fieldsForProfile, isValidProfile, PROFILE_FIELDS } from '../src/steps/profile.js'
import type { Profile } from '../src/steps/profile.js'

describe('fieldsForProfile', () => {
  it('returns exactly 3 fields for minimal + telegram', () => {
    const fields = fieldsForProfile('minimal', 'telegram')
    assert.equal(fields.length, 3)
    const keys = fields.map(f => f.key)
    assert.deepEqual(keys, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MAPBOX_ACCESS_TOKEN'])
  })

  it('returns 0 fields for minimal + whatsapp (no telegram/mapbox needed)', () => {
    const fields = fieldsForProfile('minimal', 'whatsapp')
    assert.equal(fields.length, 0)
  })

  it('returns 3 fields for minimal + both (same as telegram)', () => {
    const fields = fieldsForProfile('minimal', 'both')
    assert.equal(fields.length, 3)
  })

  it('recommended + telegram includes minimal fields plus recommended fields', () => {
    const fields = fieldsForProfile('recommended', 'telegram')
    const keys = fields.map(f => f.key)
    // Must include all 3 minimal fields
    assert.ok(keys.includes('TELEGRAM_BOT_TOKEN'))
    assert.ok(keys.includes('TELEGRAM_CHAT_ID'))
    assert.ok(keys.includes('MAPBOX_ACCESS_TOKEN'))
    // Must include some recommended fields
    assert.ok(keys.includes('DASHBOARD_SECRET'))
    assert.ok(keys.includes('PROXY_URL'))
    assert.ok(keys.includes('TELEGRAM_TOPIC_ID_SECURITY'))
    assert.ok(keys.includes('HEALTH_PORT'))
    // Must NOT include full-only fields
    assert.ok(!keys.includes('GA4_MEASUREMENT_ID'))
    assert.ok(!keys.includes('GITHUB_PAT'))
  })

  it('recommended + telegram excludes WhatsApp-guarded fields', () => {
    const fields = fieldsForProfile('recommended', 'telegram')
    const keys = fields.map(f => f.key)
    // WhatsApp fields have platformGuard: needsWhatsApp — should be excluded for telegram
    assert.ok(!keys.includes('WHATSAPP_ENABLED'))
    assert.ok(!keys.includes('WHATSAPP_INVITE_LINK'))
    assert.ok(!keys.includes('PUPPETEER_EXECUTABLE_PATH'))
  })

  it('full + both returns all fields', () => {
    const fields = fieldsForProfile('full', 'both')
    // Should return all fields since 'both' satisfies all platform guards
    assert.equal(fields.length, PROFILE_FIELDS.length)
  })

  it('full + telegram excludes WhatsApp-only fields', () => {
    const allFields = fieldsForProfile('full', 'both')
    const telegramFields = fieldsForProfile('full', 'telegram')
    // Telegram profile should have fewer fields (WhatsApp-guarded ones excluded)
    assert.ok(telegramFields.length < allFields.length)
    const keys = telegramFields.map(f => f.key)
    assert.ok(!keys.includes('WHATSAPP_ENABLED'))
    assert.ok(!keys.includes('PUPPETEER_EXECUTABLE_PATH'))
  })

  it('full + whatsapp excludes Telegram-only fields', () => {
    const fields = fieldsForProfile('full', 'whatsapp')
    const keys = fields.map(f => f.key)
    assert.ok(!keys.includes('TELEGRAM_BOT_TOKEN'))
    assert.ok(!keys.includes('TELEGRAM_CHAT_ID'))
    assert.ok(!keys.includes('TELEGRAM_TOPIC_ID_SECURITY'))
    // Should include non-guarded fields
    assert.ok(keys.includes('DASHBOARD_SECRET'))
    assert.ok(keys.includes('GA4_MEASUREMENT_ID'))
  })

  it('profile rank ordering: minimal < recommended < full', () => {
    const minLen = fieldsForProfile('minimal', 'both').length
    const recLen = fieldsForProfile('recommended', 'both').length
    const fullLen = fieldsForProfile('full', 'both').length
    assert.ok(minLen < recLen, `minimal (${minLen}) should be less than recommended (${recLen})`)
    assert.ok(recLen < fullLen, `recommended (${recLen}) should be less than full (${fullLen})`)
  })

  it('every field has a non-empty key and label', () => {
    for (const field of PROFILE_FIELDS) {
      assert.ok(field.key.length > 0, `field key should not be empty`)
      assert.ok(field.label.length > 0, `field ${field.key} should have a label`)
    }
  })

  it('minimal-profile fields all have validators', () => {
    const minimalFields = PROFILE_FIELDS.filter(f => f.minProfile === 'minimal')
    for (const field of minimalFields) {
      assert.ok(field.validate, `minimal field ${field.key} should have a validator`)
    }
  })
})

describe('isValidProfile', () => {
  it('accepts valid profile names', () => {
    assert.equal(isValidProfile('minimal'), true)
    assert.equal(isValidProfile('recommended'), true)
    assert.equal(isValidProfile('full'), true)
  })

  it('rejects invalid profile names', () => {
    assert.equal(isValidProfile('invalid'), false)
    assert.equal(isValidProfile(''), false)
    assert.equal(isValidProfile('MINIMAL'), false)
  })
})
