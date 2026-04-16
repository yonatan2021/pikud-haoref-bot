// src/__tests__/communityPulseHandler.test.ts
// Run via: DB_PATH=:memory: npx tsx --test src/__tests__/communityPulseHandler.test.ts
// (npm test already sets DB_PATH=:memory: for all __tests__/*.test.ts)
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Bot } from 'grammy';
import { initDb, getDb } from '../db/schema.js';
import { registerCommunityPulseHandler } from '../bot/communityPulseHandler.js';
import { createPulse } from '../db/communityPulseRepository.js';

const FINGERPRINT = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
const CHAT_ID = 777;

/**
 * Captures handlers registered by registerCommunityPulseHandler.
 * The handler registers two callbackQuery patterns: pulse:ok|scared|helping and pulse:agg.
 * We return them as [answerHandler, aggHandler] in registration order.
 */
function captureHandlers(bot: Bot): [(ctx: unknown) => Promise<void>, (ctx: unknown) => Promise<void>] {
  const captured: Array<(ctx: unknown) => Promise<void>> = [];
  const mockBot = {
    callbackQuery: (_pattern: unknown, fn: (ctx: unknown) => Promise<void>) => {
      captured.push(fn);
    },
  } as unknown as Bot;
  registerCommunityPulseHandler(mockBot);
  if (captured.length < 2) throw new Error('expected 2 handlers from registerCommunityPulseHandler');
  return [captured[0]!, captured[1]!];
}

/** Spy context for a pulse:ok|scared|helping callback. */
function makeAnswerCtx(callbackData: string, fromId = CHAT_ID) {
  const editCalls: string[] = [];
  return {
    ctx: {
      from: { id: fromId },
      callbackQuery: { data: callbackData },
      answerCallbackQuery: async () => {},
      editMessageText: async (text: string) => { editCalls.push(text); return { message_id: 1 }; },
    },
    editCalls,
  };
}

/** Spy context for a pulse:agg callback. */
function makeAggCtx(callbackData: string) {
  const editCalls: string[] = [];
  return {
    ctx: {
      callbackQuery: { data: callbackData },
      answerCallbackQuery: async () => {},
      editMessageText: async (text: string) => { editCalls.push(text); return { message_id: 1 }; },
    },
    editCalls,
  };
}

describe('communityPulseHandler — answer callbacks', () => {
  let answerHandler: (ctx: unknown) => Promise<void>;
  let aggHandler: (ctx: unknown) => Promise<void>;
  let pulseId: number;

  before(() => {
    initDb();
  });

  beforeEach(() => {
    // Clean up between tests
    getDb().prepare('DELETE FROM community_pulse_responses').run();
    getDb().prepare('DELETE FROM community_pulses').run();

    // Create a fresh pulse for each test
    const pulse = createPulse(getDb(), FINGERPRINT, 'missiles', ['תל אביב']);
    pulseId = pulse.id;

    // Capture fresh handlers each test (singleton bot registration is idempotent via pattern match)
    const mockBot = {
      callbackQuery: (_p: unknown, fn: (ctx: unknown) => Promise<void>) => fn,
    } as unknown as Bot;
    [answerHandler, aggHandler] = captureHandlers(mockBot);
  });

  it('first response — edits message with תודה', async () => {
    const { ctx, editCalls } = makeAnswerCtx(`pulse:ok:${pulseId}`);
    await answerHandler(ctx);

    assert.equal(editCalls.length, 1, 'editMessageText should be called once');
    assert.ok(editCalls[0]!.includes('תודה'), `expected תודה in response: "${editCalls[0]}"`);
  });

  it('duplicate response — edits message with already-responded message', async () => {
    const data = `pulse:scared:${pulseId}`;

    // First response
    const { ctx: ctx1 } = makeAnswerCtx(data);
    await answerHandler(ctx1);

    // Second response (same user, same pulse)
    const { ctx: ctx2, editCalls } = makeAnswerCtx(data);
    await answerHandler(ctx2);

    assert.equal(editCalls.length, 1);
    assert.ok(
      editCalls[0]!.includes('כבר ענית'),
      `expected "כבר ענית" in duplicate response: "${editCalls[0]}"`
    );
  });

  it('different users can each respond once', async () => {
    const data1 = `pulse:ok:${pulseId}`;
    const data2 = `pulse:helping:${pulseId}`;

    const { ctx: ctx1, editCalls: calls1 } = makeAnswerCtx(data1, 101);
    const { ctx: ctx2, editCalls: calls2 } = makeAnswerCtx(data2, 102);

    await answerHandler(ctx1);
    await answerHandler(ctx2);

    // Both should see תודה (first response each)
    assert.ok(calls1[0]!.includes('תודה'));
    assert.ok(calls2[0]!.includes('תודה'));
  });

  it('missing ctx.from — returns without editing', async () => {
    const editCalls: string[] = [];
    const ctx = {
      from: undefined, // no sender
      callbackQuery: { data: `pulse:ok:${pulseId}` },
      answerCallbackQuery: async () => {},
      editMessageText: async (text: string) => { editCalls.push(text); return { message_id: 1 }; },
    };
    await answerHandler(ctx);
    // Handler returns early when from is falsy — editMessageText not called
    assert.equal(editCalls.length, 0, 'should not edit when from is missing');
  });
});

describe('communityPulseHandler — aggregate view callbacks', () => {
  let answerHandler: (ctx: unknown) => Promise<void>;
  let aggHandler: (ctx: unknown) => Promise<void>;
  let pulseId: number;

  before(() => {
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM community_pulse_responses').run();
    getDb().prepare('DELETE FROM community_pulses').run();

    const pulse = createPulse(getDb(), FINGERPRINT + '2', 'missiles', ['חיפה']);
    pulseId = pulse.id;

    const mockBot = {} as unknown as Bot;
    [answerHandler, aggHandler] = captureHandlers(mockBot);
  });

  it('pulse:agg — below threshold shows "מוקדם" message', async () => {
    // No responses — threshold default is 5
    const { ctx, editCalls } = makeAggCtx(`pulse:agg:${pulseId}`);
    await aggHandler(ctx);

    assert.equal(editCalls.length, 1);
    assert.ok(editCalls[0]!.includes('מוקדם'), `expected מוקדם in: "${editCalls[0]}"`);
  });

  it('pulse:agg — at threshold shows aggregate counts', async () => {
    // Seed pulse_aggregate_threshold = 2 so we can hit it easily
    getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('pulse_aggregate_threshold', '2')`).run();

    // Seed 2 responses from different users
    getDb().prepare('INSERT INTO community_pulse_responses (pulse_id, chat_id, answer) VALUES (?, ?, ?)').run(pulseId, 801, 'ok');
    getDb().prepare('INSERT INTO community_pulse_responses (pulse_id, chat_id, answer) VALUES (?, ?, ?)').run(pulseId, 802, 'scared');

    const { ctx, editCalls } = makeAggCtx(`pulse:agg:${pulseId}`);
    await aggHandler(ctx);

    assert.equal(editCalls.length, 1);
    assert.ok(editCalls[0]!.includes('תוצאות'), `expected תוצאות in: "${editCalls[0]}"`);
    assert.ok(editCalls[0]!.includes('2'), 'should show total count');

    // Cleanup settings
    getDb().prepare(`DELETE FROM settings WHERE key = 'pulse_aggregate_threshold'`).run();
  });
});
