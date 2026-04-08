// Regression tests for the legacy-user onboarding backfill in menuHandler.ts.
//
// Context: v0.4.1 introduced onboarding gating. Pre-v0.4.1 users had
// onboarding_completed = 0 by default, so /start was sending them back into
// the onboarding wizard even though they were already real users with
// subscriptions. The fix (commit da2665e on branch fix/onboarding-backfill,
// merged as PR #208) added a "safety valve" branch at
// src/bot/menuHandler.ts:60-71: if !isOnboardingCompleted(chatId) AND
// getSubscriptionCount(chatId) > 0, call completeOnboarding(chatId) and
// show the main menu instead of the onboarding prompt.
//
// These tests lock down that branch so the bug cannot regress. They are
// tests-only — the fix is already in the source file.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Bot, Context } from 'grammy';
import { registerMenuHandler } from '../bot/menuHandler';
import { initDb } from '../db/schema.js';
import { upsertUser, isOnboardingCompleted, completeOnboarding } from '../db/userRepository.js';
import { addSubscription } from '../db/subscriptionRepository.js';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

function buildMockBot() {
  const commands: Record<string, (ctx: Context) => Promise<void>> = {};
  return {
    command: (name: string, handler: (ctx: Context) => Promise<void>) => {
      commands[name] = handler;
    },
    callbackQuery: () => {},
    on: () => {},
    catch: () => {},
    _fireCmd: async (name: string, ctx: Context) => commands[name]?.(ctx),
  };
}

function makeCtx(chatId: number): Context {
  const replyCalls: [string, unknown][] = [];
  const ctx: unknown = {
    chat: { id: chatId, type: 'private' },
    message: { message_id: 1 },
    me: { username: 'pikud_bot' },
    reply: async (text: string, opts?: unknown) => { replyCalls.push([text, opts]); },
    _replyCalls: replyCalls,
  };
  return ctx as Context;
}

// Distinct chatId range to avoid colliding with other test files that
// share the in-memory DB singleton across tests in the same process.
const LEGACY_USER = 7_201;
const NEW_USER = 7_202;
const ALREADY_ONBOARDED = 7_203;

describe('menuHandler — legacy onboarding backfill', () => {
  it('backfills onboarding_completed for legacy user with subscriptions', async () => {
    // Seed: legacy user — row exists, onboarding_completed = 0, has one sub
    upsertUser(LEGACY_USER);
    addSubscription(LEGACY_USER, 'אבו גוש');
    assert.equal(
      isOnboardingCompleted(LEGACY_USER),
      false,
      'precondition: legacy user must NOT be marked as onboarded'
    );

    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);
    const ctx = makeCtx(LEGACY_USER);
    await bot._fireCmd('start', ctx);

    // Postcondition: the DB flag was flipped by completeOnboarding()
    assert.equal(
      isOnboardingCompleted(LEGACY_USER),
      true,
      'legacy user should be marked as onboarded after /start'
    );
  });

  it('shows main menu (not onboarding prompt) after backfill', async () => {
    // Fresh legacy user for this test
    const chatId = 7_210;
    upsertUser(chatId);
    addSubscription(chatId, 'אבו גוש');

    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);
    const ctx = makeCtx(chatId);
    await bot._fireCmd('start', ctx);

    const replyCalls = (ctx as unknown as { _replyCalls: [string, { reply_markup?: unknown }][] })._replyCalls;
    assert.equal(replyCalls.length, 1, 'should reply exactly once');
    const [text, opts] = replyCalls[0]!;
    assert.ok(
      text.includes('בוט פיקוד העורף'),
      'reply must show the main menu title, not the onboarding name prompt'
    );
    assert.ok(
      !text.includes('ברוך הבא'),
      'reply must NOT include the onboarding welcome text'
    );
    assert.ok(opts.reply_markup, 'main menu must include the inline keyboard');
  });

  it('does NOT backfill when user has zero subscriptions', async () => {
    // A brand-new user with no subs must still go through onboarding.
    upsertUser(NEW_USER);
    assert.equal(isOnboardingCompleted(NEW_USER), false, 'precondition');

    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);
    const ctx = makeCtx(NEW_USER);
    await bot._fireCmd('start', ctx);

    // Flag stays false — user goes to onboarding, not main menu
    assert.equal(
      isOnboardingCompleted(NEW_USER),
      false,
      'user with zero subs must NOT be auto-marked as onboarded'
    );
    const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown][] })._replyCalls;
    assert.equal(replyCalls.length, 1, 'should reply with onboarding prompt');
    assert.ok(
      replyCalls[0]![0].includes('ברוך הבא'),
      'must show the onboarding welcome text'
    );
  });

  it('is idempotent — second /start from a backfilled user does not re-enter onboarding', async () => {
    // Already-onboarded user (either genuinely or via a prior backfill)
    upsertUser(ALREADY_ONBOARDED);
    addSubscription(ALREADY_ONBOARDED, 'אבו גוש');
    completeOnboarding(ALREADY_ONBOARDED);

    const bot = buildMockBot();
    registerMenuHandler(bot as unknown as Bot);
    const ctx = makeCtx(ALREADY_ONBOARDED);

    await bot._fireCmd('start', ctx);
    await bot._fireCmd('start', ctx);

    const replyCalls = (ctx as unknown as { _replyCalls: [string, unknown][] })._replyCalls;
    assert.equal(replyCalls.length, 2, 'both /start calls reply');
    for (const [text] of replyCalls) {
      assert.ok(
        text.includes('בוט פיקוד העורף'),
        'every reply must be the main menu, not onboarding'
      );
      assert.ok(!text.includes('ברוך הבא'));
    }
    assert.equal(
      isOnboardingCompleted(ALREADY_ONBOARDED),
      true,
      'flag must remain true across repeated /start calls'
    );
  });
});
