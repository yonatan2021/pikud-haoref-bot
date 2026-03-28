import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { checkTelegramToken, checkMapboxToken } from '../src/modes/verify.js'

// We mock the https module to avoid real network calls
// The functions accept an optional httpGet override for testability

describe('checkTelegramToken', () => {
  it('returns bot username on 200 OK with ok:true', async () => {
    const fakeGet = (_url: string) =>
      Promise.resolve({ ok: true, result: { username: 'MyTestBot', id: 123456 } })

    const result = await checkTelegramToken('fake-token', fakeGet)
    assert.equal(result.valid, true)
    assert.ok(result.detail?.includes('MyTestBot'))
  })

  it('returns invalid on ok:false', async () => {
    const fakeGet = (_url: string) =>
      Promise.resolve({ ok: false, description: 'Unauthorized' })

    const result = await checkTelegramToken('bad-token', fakeGet)
    assert.equal(result.valid, false)
    assert.ok(result.detail?.includes('Unauthorized'))
  })

  it('returns invalid on network error', async () => {
    const fakeGet = (_url: string): Promise<unknown> =>
      Promise.reject(new Error('ENOTFOUND'))

    const result = await checkTelegramToken('any-token', fakeGet)
    assert.equal(result.valid, false)
    assert.ok(result.detail?.includes('ENOTFOUND'))
  })

  it('returns invalid on non-JSON response', async () => {
    const fakeGet = (_url: string): Promise<unknown> =>
      Promise.reject(new Error('Invalid JSON'))

    const result = await checkTelegramToken('any-token', fakeGet)
    assert.equal(result.valid, false)
  })

  it('does not expose token in error message on network failure', async () => {
    const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'
    const fakeGet = (_url: string): Promise<unknown> =>
      Promise.reject(new Error(`connect ECONNREFUSED api.telegram.org/bot${token}/getMe`))

    const result = await checkTelegramToken(token, fakeGet)
    assert.equal(result.valid, false)
    assert.ok(!result.detail?.includes(token), 'Token must not appear in error detail')
  })
})

describe('checkMapboxToken', () => {
  it('returns valid when response body has code: TokenValid', async () => {
    const fakeGet = (_url: string) =>
      Promise.resolve({ code: 'TokenValid' })

    const result = await checkMapboxToken('pk.fake', fakeGet)
    assert.equal(result.valid, true)
  })

  it('returns invalid when response body has error code', async () => {
    // Mapbox returns HTTP 200 with { code: 'TokenExpired' } for bad tokens
    const fakeGet = (_url: string) =>
      Promise.resolve({ code: 'TokenExpired' })

    const result = await checkMapboxToken('pk.expired', fakeGet)
    assert.equal(result.valid, false)
    assert.ok(result.detail?.includes('TokenExpired'))
  })

  it('returns invalid when response has network error code', async () => {
    const fakeGet = (_url: string): Promise<unknown> =>
      Promise.reject(new Error('401'))

    const result = await checkMapboxToken('bad-token', fakeGet)
    assert.equal(result.valid, false)
  })

  it('returns invalid on network error', async () => {
    const fakeGet = (_url: string): Promise<unknown> =>
      Promise.reject(new Error('ENOTFOUND'))

    const result = await checkMapboxToken('pk.fake', fakeGet)
    assert.equal(result.valid, false)
    assert.ok(result.detail?.includes('ENOTFOUND'))
  })
})
