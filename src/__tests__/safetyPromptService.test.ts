import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { shouldSendSafetyPrompt, dispatchSafetyPrompts } from '../services/safetyPromptService.js';
import { hasPromptBeenSent } from '../db/safetyPromptRepository.js';
import { computeAlertFingerprint } from '../alertHelpers.js';
import type { User } from '../db/userRepository.js';
import type { Alert } from '../types.js';
import type { Bot } from 'grammy';

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

// ─── dispatchSafetyPrompts ─────────────────────────────────────────────────

describe('dispatchSafetyPrompts', () => {
  function makeDb(): Database.Database {
    const db = new Database(':memory:');
    initSchema(db);
    return db;
  }

  function makeMockBot(messageId = 999) {
    return {
      api: {
        sendMessage: mock.fn(async () => ({ message_id: messageId })),
      },
    };
  }

  function insertUserWithHomeCity(db: Database.Database, chatId: number, city: string): void {
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(chatId);
    db.prepare('UPDATE users SET home_city = ?, is_dm_active = 1 WHERE chat_id = ?').run(city, chatId);
  }

  it('8 — sends prompt to a matching user', async () => {
    const db = makeDb();
    const bot = makeMockBot();
    insertUserWithHomeCity(db, 1001, 'תל אביב - יפו');

    const alert: Alert = { type: 'missiles', cities: ['תל אביב - יפו'], receivedAt: Date.now() };
    await dispatchSafetyPrompts(db, alert, bot as unknown as Bot);

    assert.equal(
      (bot.api.sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1
    );
  });

  it('9 — dedup: second call with same fingerprint sends nothing', async () => {
    const db = makeDb();
    const bot = makeMockBot();
    insertUserWithHomeCity(db, 1001, 'תל אביב - יפו');

    const alert: Alert = { type: 'missiles', cities: ['תל אביב - יפו'], receivedAt: Date.now() };
    await dispatchSafetyPrompts(db, alert, bot as unknown as Bot);
    await dispatchSafetyPrompts(db, alert, bot as unknown as Bot); // same fingerprint

    assert.equal(
      (bot.api.sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1
    );
  });

  it('10 — uses bot.api.sendMessage with HTML parse_mode and inline keyboard', async () => {
    const db = makeDb();
    const bot = makeMockBot();
    insertUserWithHomeCity(db, 1001, 'תל אביב - יפו');

    const alert: Alert = { type: 'missiles', cities: ['תל אביב - יפו'], receivedAt: Date.now() };
    await dispatchSafetyPrompts(db, alert, bot as unknown as Bot);

    const calls = (bot.api.sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(calls.length, 1);
    const [chatIdArg, , optsArg] = calls[0].arguments as [number, string, Record<string, unknown>];
    assert.equal(chatIdArg, 1001);
    assert.equal(optsArg['parse_mode'], 'HTML');
    assert.ok(optsArg['reply_markup'], 'reply_markup (inline keyboard) must be passed');
  });

  it('11 — stores the prompt in DB after successful send', async () => {
    const db = makeDb();
    const bot = makeMockBot(42);
    insertUserWithHomeCity(db, 1001, 'תל אביב - יפו');

    const alert: Alert = { type: 'missiles', cities: ['תל אביב - יפו'], receivedAt: Date.now() };
    await dispatchSafetyPrompts(db, alert, bot as unknown as Bot);

    const fingerprint = computeAlertFingerprint('missiles', ['תל אביב - יפו']);
    assert.equal(hasPromptBeenSent(db, 1001, fingerprint), true);
  });

  it('12 — partial failure: one user throws, others still processed', async () => {
    const db = makeDb();
    let callCount = 0;
    const bot = {
      api: {
        sendMessage: mock.fn(async () => {
          callCount++;
          if (callCount === 1) throw new Error('Telegram API down');
          return { message_id: 999 };
        }),
      },
    };
    insertUserWithHomeCity(db, 1001, 'תל אביב - יפו');
    insertUserWithHomeCity(db, 1002, 'תל אביב - יפו');

    const alert: Alert = { type: 'missiles', cities: ['תל אביב - יפו'], receivedAt: Date.now() };

    await assert.doesNotReject(() => dispatchSafetyPrompts(db, alert, bot as unknown as Bot));

    assert.equal(
      (bot.api.sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2
    );
  });
});
