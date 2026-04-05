import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSendSafetyPrompt } from '../services/safetyPromptService.js';
import type { User } from '../db/userRepository.js';
import type { Alert } from '../types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    chat_id: 1001,
    format: 'short',
    quiet_hours_enabled: false,
    muted_until: null,
    display_name: 'Test User',
    home_city: 'תל אביב - יפו',
    locale: 'he',
    onboarding_completed: true,
    connection_code: null,
    onboarding_step: null,
    is_dm_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    type: 'missiles',
    cities: ['תל אביב - יפו'],
    receivedAt: Date.now(),
    ...overrides,
  };
}

// ─── shouldSendSafetyPrompt ─────────────────────────────────────────────────

describe('shouldSendSafetyPrompt', () => {
  it('1 — returns true when all conditions are met', () => {
    assert.equal(shouldSendSafetyPrompt(makeUser(), makeAlert()), true);
  });

  it('2 — returns false for drill alerts', () => {
    // isDrillAlert('rocketsDrill') → true
    assert.equal(
      shouldSendSafetyPrompt(makeUser(), makeAlert({ type: 'rocketsDrill' })),
      false
    );
  });

  it('3 — returns false when user.home_city is null', () => {
    assert.equal(
      shouldSendSafetyPrompt(makeUser({ home_city: null }), makeAlert()),
      false
    );
  });

  it('4 — returns false when home_city is not in alert.cities', () => {
    assert.equal(
      shouldSendSafetyPrompt(
        makeUser({ home_city: 'ירושלים' }),
        makeAlert({ cities: ['תל אביב - יפו'] })
      ),
      false
    );
  });

  it('5 — returns false during quiet hours for general-category alerts', () => {
    // 'newsFlash' is a general-category type — suppressed during quiet hours.
    // 23:30 Israel time = 21:30 UTC (Israel is UTC+2 in winter).
    const QUIET_NIGHT = new Date('2024-01-15T21:30:00.000Z'); // 23:30 Israel UTC+2
    assert.equal(
      shouldSendSafetyPrompt(
        makeUser({ quiet_hours_enabled: true, home_city: 'ירושלים' }),
        makeAlert({ type: 'newsFlash', cities: ['ירושלים'] }),
        QUIET_NIGHT
      ),
      false
    );
  });

  it('6 — returns false when user.muted_until is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(
      shouldSendSafetyPrompt(makeUser({ muted_until: future }), makeAlert()),
      false
    );
  });

  it('7 — returns false when user.is_dm_active is false', () => {
    assert.equal(
      shouldSendSafetyPrompt(makeUser({ is_dm_active: false }), makeAlert()),
      false
    );
  });
});
