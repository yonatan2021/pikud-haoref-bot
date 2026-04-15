import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Bot } from 'grammy';
import { initDb, getDb, closeDb } from '../db/schema.js';
import { fireCommunityPulse } from '../services/communityPulseService.js';
import type { TrackedMessage } from '../alertWindowTracker.js';

// Use the singleton DB with in-memory path so getUsersForCities / configResolver work correctly.
before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
});

function createTrackedMessage(cities: string[] = ['תל אביב']): TrackedMessage {
  return {
    messageId: 42,
    chatId: '-100123456',
    topicId: undefined,
    alert: {
      type: 'missiles',
      cities,
      instructions: 'היכנסו למרחב מוגן',
      receivedAt: Date.now(),
    },
    sentAt: Date.now(),
    hasPhoto: false,
  };
}

function createMockBot(): Bot {
  return {
    api: {
      sendMessage: mock.fn(async () => ({ message_id: 1 })),
    },
  } as unknown as Bot;
}

function setSetting(key: string, value: string): void {
  getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
}

function deleteSetting(key: string): void {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

function insertUserWithSub(chatId: number, city: string): void {
  getDb().prepare(`INSERT OR IGNORE INTO users (chat_id) VALUES (?)`).run(chatId);
  getDb().prepare(`INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)`).run(chatId, city);
}

describe('fireCommunityPulse', () => {
  beforeEach(() => {
    // Clean slate per test
    getDb().prepare(`DELETE FROM community_pulse_responses`).run();
    getDb().prepare(`DELETE FROM community_pulses`).run();
    getDb().prepare(`DELETE FROM subscriptions`).run();
    getDb().prepare(`DELETE FROM users`).run();
    deleteSetting('pulse_enabled');
    deleteSetting('pulse_cooldown_hours');
    deleteSetting('pulse_aggregate_threshold');
    deleteSetting('pulse_prompt_text');
  });

  test('returns early when pulse_enabled=false', async () => {
    setSetting('pulse_enabled', 'false');
    const bot = createMockBot();
    insertUserWithSub(1001, 'תל אביב');

    await fireCommunityPulse(getDb(), bot, 'missiles', createTrackedMessage());

    const sendMock = bot.api.sendMessage as unknown as ReturnType<typeof mock.fn>;
    assert.equal(sendMock.mock.calls.length, 0, 'should not send any DMs when disabled');
  });

  test('calls createPulse exactly once for same fingerprint on multiple calls', async () => {
    const bot = createMockBot();
    insertUserWithSub(2001, 'תל אביב');
    const tracked = createTrackedMessage(['תל אביב']);
    const db = getDb();

    const tasks1: Array<() => Promise<void>> = [];
    const tasks2: Array<() => Promise<void>> = [];

    await fireCommunityPulse(db, bot, 'missiles', tracked, { enqueue: (ts) => tasks1.push(...ts) });
    await fireCommunityPulse(db, bot, 'missiles', tracked, { enqueue: (ts) => tasks2.push(...ts) });

    const fp = db.prepare(`SELECT COUNT(*) as c FROM community_pulses WHERE alert_type = 'missiles'`).get() as { c: number };
    assert.equal(fp.c, 1, 'only one pulse row should exist');
  });

  test('fires DM with correct callback data (pulse:ok, pulse:scared, pulse:helping)', async () => {
    insertUserWithSub(3001, 'תל אביב');

    const sentMessages: Array<{ chatId: number; text: string; opts: unknown }> = [];
    const bot: Bot = {
      api: {
        sendMessage: mock.fn(async (chatId: number, text: string, opts: unknown) => {
          sentMessages.push({ chatId, text, opts });
          return { message_id: 1 };
        }),
      },
    } as unknown as Bot;

    const tasks: Array<() => Promise<void>> = [];
    await fireCommunityPulse(getDb(), bot, 'missiles', createTrackedMessage(['תל אביב']), {
      enqueue: (ts) => tasks.push(...ts),
    });

    await Promise.all(tasks.map((fn) => fn()));

    assert.equal(sentMessages.length, 1, 'should send exactly one DM');
    const opts = sentMessages[0].opts as { reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } };
    const buttons = opts.reply_markup.inline_keyboard[0];
    const cbData = buttons.map((b) => b.callback_data);

    assert.ok(cbData.some((d) => d.startsWith('pulse:ok:')), 'should have ok callback');
    assert.ok(cbData.some((d) => d.startsWith('pulse:scared:')), 'should have scared callback');
    assert.ok(cbData.some((d) => d.startsWith('pulse:helping:')), 'should have helping callback');
  });

  test('skips user with is_dm_active=0', async () => {
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO users (chat_id, is_dm_active) VALUES (?, 0)`).run(4001);
    db.prepare(`INSERT OR IGNORE INTO subscriptions (chat_id, city_name) VALUES (?, ?)`).run(4001, 'תל אביב');

    const bot = createMockBot();
    const tasks: Array<() => Promise<void>> = [];
    await fireCommunityPulse(db, bot, 'missiles', createTrackedMessage(['תל אביב']), {
      enqueue: (ts) => tasks.push(...ts),
    });

    assert.equal(tasks.length, 0, 'should not enqueue tasks for inactive DM users');
  });

  test('skips user whose last response was within cooldown window', async () => {
    insertUserWithSub(5001, 'תל אביב');
    setSetting('pulse_cooldown_hours', '6');
    const db = getDb();

    const pulse = db.prepare(
      `INSERT INTO community_pulses (fingerprint, alert_type, zones) VALUES ('old_fp', 'missiles', '[]')`
    ).run();
    db.prepare(
      `INSERT INTO community_pulse_responses (pulse_id, chat_id, answer) VALUES (?, ?, 'ok')`
    ).run(pulse.lastInsertRowid, 5001);

    const bot = createMockBot();
    const tasks: Array<() => Promise<void>> = [];
    const now = new Date();
    await fireCommunityPulse(db, bot, 'missiles', createTrackedMessage(['תל אביב']), {
      enqueue: (ts) => tasks.push(...ts),
      now,
    });

    assert.equal(tasks.length, 0, 'should skip user within cooldown window');
  });

  test('sends DM when user last responded more than cooldown hours ago', async () => {
    insertUserWithSub(6001, 'תל אביב');
    setSetting('pulse_cooldown_hours', '1');
    const db = getDb();

    const pulse = db.prepare(
      `INSERT INTO community_pulses (fingerprint, alert_type, zones) VALUES ('old_fp2', 'missiles', '[]')`
    ).run();
    db.prepare(
      `INSERT INTO community_pulse_responses (pulse_id, chat_id, answer, created_at)
       VALUES (?, ?, 'ok', datetime('now', '-2 hours'))`
    ).run(pulse.lastInsertRowid, 6001);

    const bot = createMockBot();
    const tasks: Array<() => Promise<void>> = [];
    await fireCommunityPulse(db, bot, 'missiles', createTrackedMessage(['תל אביב']), {
      enqueue: (ts) => tasks.push(...ts),
    });

    assert.equal(tasks.length, 1, 'should enqueue DM when past cooldown');
  });
});
