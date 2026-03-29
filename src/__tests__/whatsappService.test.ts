import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// Suppress logger stdout so output doesn't pollute test results
let stdoutSpy: ReturnType<typeof mock.method>;
before(() => {
  stdoutSpy = mock.method(process.stdout, 'write', () => true);
});
after(() => {
  stdoutSpy.mock.restore();
});

// ─── Test 1 & 2 & 3: Import service without mocking Client ───────────────────
// Since WHATSAPP_ENABLED is not 'true' by default in test env, no real
// Puppeteer/Chromium will be spawned on import.

import {
  getStatus,
  getClient,
  getCachedGroups,
  initialize,
  refreshGroups,
} from '../whatsapp/whatsappService';

describe('whatsappService — initial state', () => {
  it('getStatus() returns "disconnected" on first import', () => {
    assert.equal(getStatus(), 'disconnected');
  });

  it('getClient() returns null on first import', () => {
    assert.equal(getClient(), null);
  });

  it('getCachedGroups() returns empty array on first import', () => {
    assert.deepEqual(getCachedGroups(), []);
  });
});

describe('whatsappService — initialize() when WHATSAPP_ENABLED is not "true"', () => {
  it('does not create a Client when WHATSAPP_ENABLED is absent', () => {
    const originalValue = process.env.WHATSAPP_ENABLED;
    delete process.env.WHATSAPP_ENABLED;

    initialize();

    assert.equal(getClient(), null, 'client should remain null when WHATSAPP_ENABLED is not set');
    assert.equal(getStatus(), 'disconnected', 'status should remain disconnected');

    if (originalValue !== undefined) {
      process.env.WHATSAPP_ENABLED = originalValue;
    }
  });

  it('does not create a Client when WHATSAPP_ENABLED is "false"', () => {
    const originalValue = process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_ENABLED = 'false';

    initialize();

    assert.equal(getClient(), null, 'client should remain null when WHATSAPP_ENABLED=false');
    assert.equal(getStatus(), 'disconnected', 'status should remain disconnected');

    if (originalValue !== undefined) {
      process.env.WHATSAPP_ENABLED = originalValue;
    } else {
      delete process.env.WHATSAPP_ENABLED;
    }
  });
});

describe('whatsappService — refreshGroups() when client is null', () => {
  it('resolves without throwing when client is null', async () => {
    // client is null because WHATSAPP_ENABLED was never set to 'true'
    assert.equal(getClient(), null, 'precondition: client must be null');

    await assert.doesNotReject(
      () => refreshGroups(),
      'refreshGroups() should not throw when client is null'
    );
  });

  it('returns void (undefined) when client is null', async () => {
    const result = await refreshGroups();
    assert.equal(result, undefined, 'refreshGroups() should return undefined when client is null');
  });
});

describe('whatsappService — initialize() guard: double-call is a no-op', () => {
  it('calling initialize() twice with WHATSAPP_ENABLED=false never creates a Client', () => {
    // Because whatsapp-web.js requires Puppeteer which cannot run in tests,
    // we verify the guard behavior with WHATSAPP_ENABLED=false.
    // The guard has two layers:
    //   1. Early-return when WHATSAPP_ENABLED !== 'true'
    //   2. Early-return when client !== null (already initialised)
    // This test exercises layer 1: calling initialize() N times is always safe.
    const originalValue = process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_ENABLED = 'false';

    // These calls must not throw and must not create a Client
    initialize();
    initialize();
    initialize();

    assert.equal(
      getClient(),
      null,
      'client must remain null after multiple initialize() calls with WHATSAPP_ENABLED=false'
    );
    assert.equal(
      getStatus(),
      'disconnected',
      'status must remain disconnected after initialize() calls with WHATSAPP_ENABLED=false'
    );

    // Restore
    if (originalValue !== undefined) {
      process.env.WHATSAPP_ENABLED = originalValue;
    } else {
      delete process.env.WHATSAPP_ENABLED;
    }
  });

  it('calling initialize() many times with WHATSAPP_ENABLED=false never throws', () => {
    // Verifies that the early-return guard is robust: any number of calls is safe.
    const originalValue = process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_ENABLED = 'false';

    assert.doesNotThrow(() => {
      for (let i = 0; i < 10; i++) {
        initialize();
      }
    }, 'initialize() should never throw regardless of call count when disabled');

    assert.equal(getClient(), null, 'client must remain null after repeated disabled calls');

    // Restore
    if (originalValue !== undefined) {
      process.env.WHATSAPP_ENABLED = originalValue;
    } else {
      delete process.env.WHATSAPP_ENABLED;
    }
  });

  it('getStatus() and getClient() remain stable across multiple no-op initialize() calls', () => {
    // Regression guard: rapid sequential calls with WHATSAPP_ENABLED=false
    // must leave state identical to the initial state.
    const originalValue = process.env.WHATSAPP_ENABLED;
    delete process.env.WHATSAPP_ENABLED;

    const statusBefore = getStatus();
    const clientBefore = getClient();

    initialize();
    initialize();
    initialize();

    assert.equal(getStatus(), statusBefore, 'status must not change after no-op initialize() calls');
    assert.equal(getClient(), clientBefore, 'client must not change after no-op initialize() calls');

    // Restore
    if (originalValue !== undefined) {
      process.env.WHATSAPP_ENABLED = originalValue;
    }
  });
});
