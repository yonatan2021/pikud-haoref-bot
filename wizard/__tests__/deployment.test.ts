import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppNote, runNodeSetup, type SpawnFn } from '../src/steps/deployment.js'

// ── Fake spawn factory ────────────────────────────────────────────────────────
//
// Returns { spawnFn, trigger, getLastCwd } where:
//   spawnFn              drop-in replacement for node:child_process spawn
//   trigger.close(code, signal?)  fires the 'close' event on the fake child
//   trigger.error(err)            fires the 'error' event on the fake child
//   getLastCwd()                  returns the cwd option from the last spawn call
//
// spawnStep registers .on() handlers synchronously inside the Promise constructor,
// so setImmediate(() => trigger.*) is safe — handlers are in place before it fires.
//
type Handler = (...args: unknown[]) => void

function makeFakeSpawn() {
  const handlers: Record<string, Handler[]> = {}
  let lastCwd: string | undefined

  const fakeChild = {
    on(event: string, handler: Handler) {
      handlers[event] ??= []
      handlers[event].push(handler)
      return fakeChild
    },
  }

  const spawnFn: SpawnFn = (_cmd, _args, opts) => {
    lastCwd = (opts as { cwd?: string } | undefined)?.cwd
    return fakeChild as unknown as ReturnType<SpawnFn>
  }

  const trigger = {
    close: (code: number | null, signal?: string) =>
      handlers['close']?.forEach(h => h(code, signal ?? null)),
    error: (err: Error) =>
      handlers['error']?.forEach(h => h(err)),
  }

  return { spawnFn, trigger, getLastCwd: () => lastCwd }
}

// ── Stub deps ─────────────────────────────────────────────────────────────────
const noopCopyFile  = () => Promise.resolve()
const noopRm        = () => Promise.resolve()
const noopAccess    = () => Promise.resolve()  // dir exists
const missingAccess = () =>                    // dir does not exist (ENOENT)
  Promise.reject(Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }))

// ── Existing tests ────────────────────────────────────────────────────────────

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

// ── spawnStep error paths (tested via runNodeSetup) ───────────────────────────

describe('spawnStep — non-zero exit code', () => {
  it('rejects with Hebrew exit code message', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(1))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      /קוד שגיאה 1/,
    )
  })
})

describe('spawnStep — signal-killed process', () => {
  it('rejects with signal name, not "null"', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(null, 'SIGKILL'))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      /SIGKILL/,
    )
  })
})

describe('spawnStep — executable not found (ENOENT)', () => {
  it('rejects with human-readable "not found" message', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => {
      const err = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })
      trigger.error(err)
      trigger.close(null)  // both fire when exe is missing
    })

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      /לא נמצא/,
    )
  })

  it('double-reject guard: first rejection wins, second is silently dropped', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => {
      const err = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })
      trigger.error(err)
      trigger.close(null)  // fires after error — must be ignored by settled guard
    })

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      (err: Error) => {
        // The error message must come from the 'error' handler, not the 'close' handler
        assert.ok(err.message.includes('לא נמצא'), `unexpected message: ${err.message}`)
        return true
      },
    )
  })
})

// ── runNodeSetup — directory-exists (skip-clone) branch ──────────────────────

describe('runNodeSetup — directory already exists', () => {
  it('skips git clone: spawn is called exactly once (npm install only)', async () => {
    let spawnCallCount = 0
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(0))  // npm install succeeds

    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: ((cmd, args, opts) => { spawnCallCount++; return spawnFn(cmd, args, opts) }) as SpawnFn,
      copyFile: noopCopyFile,
      access: noopAccess,  // dir exists → clone skipped
      rm: noopRm,
    })

    assert.equal(spawnCallCount, 1, 'only npm install should spawn')
  })

  it('passes targetPath as cwd to npm install', async () => {
    const { spawnFn, trigger, getLastCwd } = makeFakeSpawn()
    setImmediate(() => trigger.close(0))

    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: spawnFn, copyFile: noopCopyFile, access: noopAccess, rm: noopRm,
    })

    assert.ok(getLastCwd()?.includes('pikud-haoref-bot'), `unexpected cwd: ${getLastCwd()}`)
  })
})

// ── runNodeSetup — clone failure cleanup ─────────────────────────────────────

describe('runNodeSetup — clone failure', () => {
  it('calls rm on targetPath when git clone exits non-zero', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    let rmCalledWith: string | undefined

    setImmediate(() => trigger.close(128))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn,
        copyFile: noopCopyFile,
        access: missingAccess,
        rm: (p) => { rmCalledWith = p; return Promise.resolve() },
      }),
    )

    assert.ok(rmCalledWith?.includes('pikud-haoref-bot'), `rm not called on target dir, got: ${rmCalledWith}`)
  })
})

// ── runNodeSetup — copyFile failure ──────────────────────────────────────────

describe('runNodeSetup — copyFile failure', () => {
  it('rejects with manual recovery hint including cp command', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(0))  // git clone succeeds

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn,
        copyFile: () => Promise.reject(
          Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
        ),
        access: missingAccess,
        rm: noopRm,
      }),
      /cp "/,
    )
  })
})

// ── runNodeSetup — access() EACCES propagates ────────────────────────────────

describe('runNodeSetup — access() non-ENOENT error', () => {
  it('propagates EACCES instead of silently treating it as missing', async () => {
    const eaccesAccess = () =>
      Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: (() => {}) as unknown as SpawnFn,
        copyFile: noopCopyFile,
        access: eaccesAccess,
        rm: noopRm,
      }),
      /EACCES|שגיאת גישה/,
    )
  })
})

// ── spawnStep — non-ENOENT error event ───────────────────────────────────────

describe('spawnStep — non-ENOENT spawn error (e.g. EACCES)', () => {
  it('rejects with "cannot run" message, not "not found"', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => {
      const err = Object.assign(new Error('spawn git EACCES'), { code: 'EACCES' })
      trigger.error(err)
      trigger.close(null)
    })

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      (err: Error) => {
        assert.ok(err.message.includes('לא ניתן להפעיל'), `unexpected message: ${err.message}`)
        assert.ok(!err.message.includes('לא נמצא'), `should not say "not found": ${err.message}`)
        return true
      },
    )
  })
})

// ── runNodeSetup — rm failure does not shadow clone error ─────────────────────

describe('runNodeSetup — rm failure does not shadow clone error', () => {
  it('propagates clone error even when rm also fails', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(128))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn,
        copyFile: noopCopyFile,
        access: missingAccess,
        rm: () => Promise.reject(new Error('EPERM: rm failed')),
      }),
      (err: Error) => {
        assert.ok(err.message.includes('קוד שגיאה 128'), `expected clone error, got: ${err.message}`)
        assert.ok(!err.message.includes('EPERM'), `rm error should not surface: ${err.message}`)
        return true
      },
    )
  })
})
