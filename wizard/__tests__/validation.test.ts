import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateToken,
  validateChatId,
  validateMapboxToken,
  validateUrl,
} from '../src/validation.js'

describe('validateToken', () => {
  it('accepts a valid bot token', () => {
    // Low-entropy placeholder — intentionally fake, not a real secret
    assert.equal(validateToken('7843291047:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), undefined)
  })

  it('rejects an empty string', () => {
    assert.ok(typeof validateToken('') === 'string')
  })

  it('rejects a token without colon', () => {
    assert.ok(typeof validateToken('7843291047AAF-xKp_abc123defGHIJKLMNOPQRST') === 'string')
  })

  it('rejects a token with short secret part (< 35 chars)', () => {
    assert.ok(typeof validateToken('7843291047:short') === 'string')
  })

  it('rejects a token with non-numeric ID part', () => {
    assert.ok(typeof validateToken('notanumber:AAF-xKp_abc123defGHIJKLMNOPQRSTUV') === 'string')
  })

  it('accepts token with exactly 7 digit ID', () => {
    // Low-entropy placeholder — intentionally fake, not a real secret
    assert.equal(validateToken('1234567:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), undefined)
  })
})

describe('validateChatId', () => {
  it('accepts a negative channel ID', () => {
    assert.equal(validateChatId('-1001234567890'), undefined)
  })

  it('accepts a positive DM ID', () => {
    assert.equal(validateChatId('123456789'), undefined)
  })

  it('rejects an empty string', () => {
    assert.ok(typeof validateChatId('') === 'string')
  })

  it('rejects non-numeric value', () => {
    assert.ok(typeof validateChatId('@mychannel') === 'string')
  })

  it('rejects a float', () => {
    assert.ok(typeof validateChatId('-100.5') === 'string')
  })
})

describe('validateMapboxToken', () => {
  it('accepts a token starting with pk.', () => {
    assert.equal(validateMapboxToken('pk.eyJhbGciOiJIUzI1NiJ9.something'), undefined)
  })

  it('accepts a token starting with sk.', () => {
    assert.equal(validateMapboxToken('sk.eyJhbGciOiJIUzI1NiJ9.something'), undefined)
  })

  it('rejects an empty string', () => {
    assert.ok(typeof validateMapboxToken('') === 'string')
  })

  it('rejects a token without pk. or sk. prefix', () => {
    assert.ok(typeof validateMapboxToken('eyJhbGciOiJIUzI1NiJ9.something') === 'string')
  })
})

describe('validateUrl', () => {
  it('accepts a valid http URL', () => {
    assert.equal(validateUrl('http://proxy.example.com:8080'), undefined)
  })

  it('accepts a valid https URL with auth', () => {
    assert.equal(validateUrl('http://user:pass@proxy.example.com:3128'), undefined)
  })

  it('rejects a non-URL string', () => {
    assert.ok(typeof validateUrl('not a url') === 'string')
  })

  it('rejects an ftp URL (only http/https allowed)', () => {
    assert.ok(typeof validateUrl('ftp://files.example.com') === 'string')
  })

  it('rejects an empty string', () => {
    assert.ok(typeof validateUrl('') === 'string')
  })
})
