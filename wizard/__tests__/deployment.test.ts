import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { buildWhatsAppNote, runNodeSetup, resolveTargetPath, spawnQuiet, type SpawnFn } from '../src/steps/deployment.js'

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

// ── makeMultiFakeSpawn — sequential spawns with per-call exit codes ────────────
//
// Each spawn call gets a fresh child process that auto-closes with the next
// code from the provided array. Closes are scheduled via setImmediate inside
// the .on('close') registration so handlers are always in place before firing.
//
// IMPORTANT: After a successful clone, runNodeSetup calls setupRemotes() which
// spawns `gh --version` via spawnQuiet. Use code 1 at that index to skip the
// fork prompt (which would hang in tests without interactive input).
//
// Typical fresh-clone sequence: [clone=0, remote-rename=0, gh-check=1, npm-install=0]
//
function makeMultiFakeSpawn(closeCodes: number[]) {
  let callIndex = 0
  const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = []

  const spawnFn: SpawnFn = (cmd, args, opts) => {
    const code = closeCodes[callIndex++] ?? 0
    calls.push({ cmd, args: [...args], cwd: (opts as { cwd?: string } | undefined)?.cwd })
    const handlers: Record<string, Handler[]> = {}
    const fakeChild = {
      on(event: string, handler: Handler) {
        handlers[event] ??= []
        handlers[event].push(handler)
        if (event === 'close') setImmediate(() => handlers['close']?.forEach(h => h(code, null)))
        return fakeChild
      },
    }
    return fakeChild as unknown as ReturnType<SpawnFn>
  }
  return { spawnFn, getCalls: () => calls }
}

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
    // clone(0) + remote-rename(0) + gh-check(1=not installed) → skip fork prompt
    const { spawnFn } = makeMultiFakeSpawn([0, 0, 1])

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

// ── spawnStep — close fires with null code and no signal (null/null branch) ────

describe('spawnStep — close(null) with no prior error event', () => {
  it('rejects with unexpected-termination message when close fires null/null', async () => {
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(null))  // no error event — only close(null, null)

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: missingAccess, rm: noopRm,
      }),
      /ללא קוד יציאה|בלתי צפוי/,
    )
  })
})

// ── runNodeSetup — npm install failure wraps error with recovery hint ─────────

describe('runNodeSetup — npm install failure', () => {
  it('wraps npm install failure with a manual recovery hint', async () => {
    // noopAccess = dir already exists → git clone is skipped;
    // the only spawn call is for npm install, so trigger.close(1) hits that path.
    const { spawnFn, trigger } = makeFakeSpawn()
    setImmediate(() => trigger.close(1))

    await assert.rejects(
      runNodeSetup('/fake/.env', 'telegram', {
        spawn: spawnFn, copyFile: noopCopyFile, access: noopAccess, rm: noopRm,
      }),
      (err: Error) => {
        // The underlying spawnStep message names the command ("npm יצא עם קוד שגיאה 1")
        assert.ok(err.message.includes('npm'), `expected "npm" in message: ${err.message}`)
        assert.ok(err.message.includes('קוד שגיאה 1'), `expected exit-code in message: ${err.message}`)
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

// ── resolveTargetPath — unit tests ────────────────────────────────────────────

describe('resolveTargetPath', () => {
  it('defaults to ~/pikud-haoref-bot when no installDir provided', () => {
    const result = resolveTargetPath()
    assert.equal(result, path.join(os.homedir(), 'pikud-haoref-bot'))
  })

  it('returns absolute path when installDir is already absolute', () => {
    const result = resolveTargetPath('/opt/bots/haoref')
    assert.equal(result, '/opt/bots/haoref')
  })

  it('accepts an ASCII absolute installDir as-is', () => {
    const result = resolveTargetPath('/tmp/pikud-bot')
    assert.equal(result, '/tmp/pikud-bot')
    assert.ok(path.isAbsolute(result))
  })

  it('throws when resolved path contains non-ASCII characters', () => {
    assert.throws(
      () => resolveTargetPath('/opt/\u05D1\u05D5\u05D8/haoref'),
      /\u05EA\u05D5\u05D5\u05D9\u05DD \u05E9\u05D0\u05D9\u05E0\u05DD ASCII/,
    )
  })

  it('throws for Hebrew path via --install-dir', () => {
    assert.throws(
      () => resolveTargetPath('/Users/user/\u05E4\u05E8\u05D5\u05D9\u05D9\u05E7\u05D8\u05D9\u05DD/bot'),
      /\u05EA\u05D5\u05D5\u05D9\u05DD \u05E9\u05D0\u05D9\u05E0\u05DD ASCII/,
    )
  })
})

// ── runNodeSetup — git clone uses --depth 1 and absolute targetPath ──────────

describe('runNodeSetup — git clone uses --depth 1 and absolute targetPath', () => {
  it('passes --depth 1 and absolute path to git clone', async () => {
    // clone(0) + remote-rename(0) + gh-check(1=not installed) + npm-install(0)
    const { spawnFn, getCalls } = makeMultiFakeSpawn([0, 0, 1, 0])

    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: spawnFn,
      copyFile: noopCopyFile,
      access: missingAccess,
      rm: noopRm,
    })

    const cloneCall = getCalls().find(c => c.cmd === 'git' && c.args[0] === 'clone')
    assert.ok(cloneCall !== undefined, 'git clone should have been called')
    assert.ok(cloneCall.args.includes('--depth'), 'clone should include --depth flag')
    assert.ok(cloneCall.args.includes('1'), 'clone should include depth value 1')

    const targetArg = cloneCall.args[cloneCall.args.length - 1]
    assert.ok(
      path.isAbsolute(targetArg),
      `clone target must be absolute, got: ${targetArg}`,
    )
    assert.ok(
      targetArg.includes('pikud-haoref-bot'),
      `clone target must include "pikud-haoref-bot", got: ${targetArg}`,
    )
  })
})

// ── runNodeSetup — remote rename after clone ─────────────────────────────────

describe('runNodeSetup — remote setup after clone', () => {
  it('renames origin to upstream after successful clone', async () => {
    // clone(0) + remote-rename(0) + gh-check(1=not installed) + npm-install(0)
    const { spawnFn, getCalls } = makeMultiFakeSpawn([0, 0, 1, 0])

    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: spawnFn,
      copyFile: noopCopyFile,
      access: missingAccess,
      rm: noopRm,
    })

    const calls = getCalls()
    const renameCall = calls.find(c =>
      c.cmd === 'git' && c.args[0] === 'remote' && c.args[1] === 'rename',
    )
    assert.ok(renameCall !== undefined, 'git remote rename should have been called')
    assert.deepEqual(
      renameCall.args,
      ['remote', 'rename', 'origin', 'upstream'],
      'should rename origin to upstream',
    )
  })

  it('remote rename failure warns but does not abort setup', async () => {
    // clone(0), remote-rename(1=fail) → setupRemotes returns early (no gh check)
    // npm-install(0)
    const { spawnFn } = makeMultiFakeSpawn([0, 1, 0])

    // Should NOT reject — the setup should complete despite remote rename failure
    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: spawnFn,
      copyFile: noopCopyFile,
      access: missingAccess,
      rm: noopRm,
    })
    // If we reach here, the test passes (no rejection thrown)
  })

  it('skips remote setup when directory already exists', async () => {
    // Only npm-install(0) since dir exists
    const { spawnFn, getCalls } = makeMultiFakeSpawn([0])

    await runNodeSetup('/fake/.env', 'telegram', {
      spawn: spawnFn,
      copyFile: noopCopyFile,
      access: noopAccess,  // dir exists → no clone, no remote setup
      rm: noopRm,
    })

    const calls = getCalls()
    const renameCall = calls.find(c => c.cmd === 'git' && c.args[0] === 'remote')
    assert.equal(renameCall, undefined, 'remote rename should not be called when dir exists')
  })
})

// ── spawnQuiet — unit tests ──────────────────────────────────────────────────

describe('spawnQuiet', () => {
  it('resolves true on exit code 0', async () => {
    const { spawnFn } = makeMultiFakeSpawn([0])
    const result = await spawnQuiet(spawnFn, 'gh', ['--version'])
    assert.equal(result, true)
  })

  it('resolves false on non-zero exit code', async () => {
    const { spawnFn } = makeMultiFakeSpawn([1])
    const result = await spawnQuiet(spawnFn, 'gh', ['auth', 'status'])
    assert.equal(result, false)
  })

  it('resolves false when spawn throws', async () => {
    const throwingSpawn: SpawnFn = () => { throw new Error('command not found') }
    const result = await spawnQuiet(throwingSpawn, 'nonexistent', [])
    assert.equal(result, false)
  })
})
