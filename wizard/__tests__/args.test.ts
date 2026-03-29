import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs } from '../src/args.js'

describe('parseArgs', () => {
  it('returns empty flags for no arguments', () => {
    const flags = parseArgs([])
    assert.equal(flags.help, undefined)
    assert.equal(flags.full, undefined)
    assert.equal(flags.verify, undefined)
    assert.equal(flags.update, undefined)
  })

  it('sets help flag with --help', () => {
    assert.equal(parseArgs(['--help']).help, true)
  })

  it('sets help flag with -h', () => {
    assert.equal(parseArgs(['-h']).help, true)
  })

  it('sets full flag with --full', () => {
    assert.equal(parseArgs(['--full']).full, true)
  })

  it('sets verify flag with --verify', () => {
    assert.equal(parseArgs(['--verify']).verify, true)
  })

  it('sets update flag with --update', () => {
    assert.equal(parseArgs(['--update']).update, true)
  })

  it('parses --token=value', () => {
    assert.equal(parseArgs(['--token=mytoken']).token, 'mytoken')
  })

  it('parses --token value (space-separated)', () => {
    assert.equal(parseArgs(['--token', 'mytoken']).token, 'mytoken')
  })

  it('parses --chat-id value', () => {
    assert.equal(parseArgs(['--chat-id=-1001234567890'])['chat-id'], '-1001234567890')
  })

  it('parses --mapbox value', () => {
    assert.equal(parseArgs(['--mapbox=pk.abc123']).mapbox, 'pk.abc123')
  })

  it('parses --output path', () => {
    assert.equal(parseArgs(['--output=/home/user/.env']).output, '/home/user/.env')
  })

  it('parses --dashboard value', () => {
    assert.equal(parseArgs(['--dashboard=secret123']).dashboard, 'secret123')
  })

  it('parses --proxy value', () => {
    assert.equal(parseArgs(['--proxy=http://proxy:8080']).proxy, 'http://proxy:8080')
  })

  it('parses --invite-link value', () => {
    assert.equal(parseArgs(['--invite-link=https://t.me/+abc'])['invite-link'], 'https://t.me/+abc')
  })

  it('handles multiple flags together', () => {
    const flags = parseArgs(['--full', '--token=tok', '--chat-id=-123', '--verify'])
    assert.equal(flags.full, true)
    assert.equal(flags.token, 'tok')
    assert.equal(flags['chat-id'], '-123')
    assert.equal(flags.verify, true)
  })

  it('ignores unknown flags gracefully', () => {
    assert.doesNotThrow(() => parseArgs(['--unknown-flag=value']))
  })

  it('does not consume next flag as value for space-separated flag', () => {
    const flags = parseArgs(['--token', '--verify'])
    assert.equal(flags.verify, true)
    assert.equal(flags.token, undefined)
  })

  it('parses space-separated flag value that does not start with dash', () => {
    assert.equal(parseArgs(['--token', 'mytoken123']).token, 'mytoken123')
  })
})
