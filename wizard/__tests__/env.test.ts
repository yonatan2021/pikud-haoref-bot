import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readEnvFile, writeEnvFile, mergeEnvVars, maskValue } from '../src/env.js'

let tmpDir: string
let tmpFile: string

beforeEach(() => {
  tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-test-'))
  tmpFile = path.join(tmpDir, '.env')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('readEnvFile', () => {
  it('returns an empty object when file does not exist', () => {
    const result = readEnvFile(path.join(tmpDir, 'nonexistent.env'))
    assert.deepEqual(result, {})
  })

  it('parses KEY=value pairs', () => {
    fs.writeFileSync(tmpFile, 'FOO=bar\nBAZ=qux\n')
    assert.deepEqual(readEnvFile(tmpFile), { FOO: 'bar', BAZ: 'qux' })
  })

  it('strips surrounding quotes from values', () => {
    fs.writeFileSync(tmpFile, 'TOKEN="my secret token"\n')
    assert.deepEqual(readEnvFile(tmpFile), { TOKEN: 'my secret token' })
  })

  it('ignores comment lines', () => {
    fs.writeFileSync(tmpFile, '# comment\nKEY=value\n')
    assert.deepEqual(readEnvFile(tmpFile), { KEY: 'value' })
  })

  it('ignores blank lines', () => {
    fs.writeFileSync(tmpFile, '\nKEY=value\n\n')
    assert.deepEqual(readEnvFile(tmpFile), { KEY: 'value' })
  })

  it('handles values with = signs in them', () => {
    fs.writeFileSync(tmpFile, 'TOKEN=abc=def=ghi\n')
    assert.deepEqual(readEnvFile(tmpFile), { TOKEN: 'abc=def=ghi' })
  })
})

describe('writeEnvFile', () => {
  it('writes KEY=value pairs to file', () => {
    writeEnvFile(tmpFile, { FOO: 'bar', BAZ: 'qux' })
    const content = fs.readFileSync(tmpFile, 'utf8')
    assert.ok(content.includes('FOO=bar'))
    assert.ok(content.includes('BAZ=qux'))
  })

  it('quotes values that contain spaces', () => {
    writeEnvFile(tmpFile, { KEY: 'value with spaces' })
    const content = fs.readFileSync(tmpFile, 'utf8')
    assert.ok(content.includes('KEY="value with spaces"'))
  })

  it('does not quote values without spaces', () => {
    writeEnvFile(tmpFile, { TOKEN: 'abc123' })
    const content = fs.readFileSync(tmpFile, 'utf8')
    assert.ok(content.includes('TOKEN=abc123'))
    assert.ok(!content.includes('TOKEN="abc123"'))
  })

  it('skips null and undefined values', () => {
    writeEnvFile(tmpFile, { PRESENT: 'yes', ABSENT: null as unknown as string })
    const content = fs.readFileSync(tmpFile, 'utf8')
    assert.ok(content.includes('PRESENT=yes'))
    assert.ok(!content.includes('ABSENT'))
  })

  it('includes a header comment', () => {
    writeEnvFile(tmpFile, { KEY: 'val' })
    const content = fs.readFileSync(tmpFile, 'utf8')
    assert.ok(content.startsWith('#'))
  })

  it('written file is readable by readEnvFile (round-trip)', () => {
    const vars = { TOKEN: 'abc123', CHAT: '-1001234', NAME: 'my bot name' }
    writeEnvFile(tmpFile, vars)
    const readBack = readEnvFile(tmpFile)
    assert.deepEqual(readBack, vars)
  })
})

describe('mergeEnvVars', () => {
  it('returns a new object combining existing and updates', () => {
    const existing = { A: '1', B: '2' }
    const updates  = { B: 'new', C: '3' }
    const result   = mergeEnvVars(existing, updates)
    assert.deepEqual(result, { A: '1', B: 'new', C: '3' })
  })

  it('does not mutate the original objects', () => {
    const existing = { A: '1' }
    const updates  = { A: '2' }
    mergeEnvVars(existing, updates)
    assert.equal(existing.A, '1')
    assert.equal(updates.A, '2')
  })

  it('filters out null/undefined values from updates', () => {
    const existing = { A: '1', B: '2' }
    const updates  = { B: null as unknown as string }
    const result   = mergeEnvVars(existing, updates)
    // B should remain from existing since update is null
    assert.equal(result.B, '2')
  })
})

describe('maskValue', () => {
  it('masks all but last 4 chars of a long value', () => {
    assert.equal(maskValue('1234567890:ABCDEFGHIJ'), '***GHIJ')
  })

  it('masks a short value entirely with ***', () => {
    assert.equal(maskValue('abc'), '***')
  })

  it('masks an empty string as ***', () => {
    assert.equal(maskValue(''), '***')
  })
})
