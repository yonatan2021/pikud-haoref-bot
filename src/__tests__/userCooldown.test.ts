import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserCooldown } from '../bot/userCooldown.js';

describe('createUserCooldown', () => {
  it('returns false for a user with no cooldown set', () => {
    const cd = createUserCooldown(500);
    assert.equal(cd.isOnCooldown(123), false);
  });

  it('returns true immediately after setCooldown', () => {
    const cd = createUserCooldown(500);
    cd.setCooldown(42);
    assert.equal(cd.isOnCooldown(42), true);
  });

  it('returns false once the cooldown has expired', async () => {
    const cd = createUserCooldown(50);
    cd.setCooldown(99);
    assert.equal(cd.isOnCooldown(99), true, 'should be on cooldown immediately');
    await new Promise(r => setTimeout(r, 80));
    assert.equal(cd.isOnCooldown(99), false, 'should be off cooldown after expiry');
  });

  it('tracks different users independently', () => {
    const cd = createUserCooldown(500);
    cd.setCooldown(1);
    assert.equal(cd.isOnCooldown(1), true, 'user 1 should be on cooldown');
    assert.equal(cd.isOnCooldown(2), false, 'user 2 should not be on cooldown');
  });

  it('allows re-setting cooldown for same user', () => {
    const cd = createUserCooldown(500);
    cd.setCooldown(7);
    cd.setCooldown(7); // reset
    assert.equal(cd.isOnCooldown(7), true, 'user should still be on cooldown after re-set');
  });
});
