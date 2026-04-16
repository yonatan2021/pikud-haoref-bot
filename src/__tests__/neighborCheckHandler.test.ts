// src/__tests__/neighborCheckHandler.test.ts
// Run with: npx tsx --test src/__tests__/neighborCheckHandler.test.ts
// No DB_PATH needed — uses its own :memory: Database via setNeighborCheckHandlerDb.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import type { Bot } from 'grammy';
import { initSchema } from '../db/schema.js';
import {
  registerNeighborCheckHandler,
  setNeighborCheckHandlerDb,
} from '../bot/neighborCheckHandler.js';
import { insertPrompt } from '../db/neighborCheckRepository.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

/**
 * Captures the single callbackQuery handler registered by registerNeighborCheckHandler.
 * Grammy registers handlers via bot.callbackQuery(pattern, fn) — we mock the bot and
 * capture `fn` so tests can invoke it directly with a fake context.
 */
function captureHandler(db: Database.Database): (ctx: unknown) => Promise<void> {
  setNeighborCheckHandlerDb(db);
  let captured: ((ctx: unknown) => Promise<void>) | null = null;
  const mockBot = {
    callbackQuery: (_pattern: unknown, fn: (ctx: unknown) => Promise<void>) => {
      if (!captured) captured = fn;
    },
  } as unknown as Bot;
  registerNeighborCheckHandler(mockBot);
  if (!captured) throw new Error('handler not captured — check registerNeighborCheckHandler');
  return captured;
}

/** Build a fake Grammy context for an nc:* callback_data string. */
function makeCtx(callbackData: string) {
  const match = callbackData.match(/^nc:(checked|unable|dismissed):(\d+):([a-f0-9]{8})$/);
  return {
    match,
    answerCallbackQuery: async () => {},
    editMessageText: async (_text: string) => ({ message_id: 1 }),
    // Track the last text passed to editMessageText for assertions
    _lastEditText: null as string | null,
  };
}

/** Same as makeCtx but records editMessageText argument for assertion. */
function makeSpyCtx(callbackData: string) {
  const calls: string[] = [];
  const match = callbackData.match(/^nc:(checked|unable|dismissed):(\d+):([a-f0-9]{8})$/);
  return {
    ctx: {
      match,
      answerCallbackQuery: async () => {},
      editMessageText: async (text: string) => { calls.push(text); return { message_id: 1 }; },
    },
    editCalls: calls,
  };
}

const FINGERPRINT = 'abcdef1234567890abcdef1234567890abcdef12';
const FP_SHORT = FINGERPRINT.slice(0, 8); // 'abcdef12'
const CHAT_ID = 555;

describe('neighborCheckHandler — nc:* callbacks', () => {
  let db: Database.Database;
  let handler: (ctx: unknown) => Promise<void>;

  beforeEach(() => {
    db = createTestDb();
    handler = captureHandler(db);
    // neighbor_check_prompts.chat_id → users(chat_id) FK — seed user first
    db.prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(CHAT_ID);
    insertPrompt(db, CHAT_ID, FINGERPRINT, 10);
  });

  it('nc:checked — edits message with תודה and marks prompt as responded', async () => {
    const { ctx, editCalls } = makeSpyCtx(`nc:checked:${CHAT_ID}:${FP_SHORT}`);
    await handler(ctx);

    assert.equal(editCalls.length, 1, 'editMessageText should be called once');
    assert.ok(editCalls[0]!.includes('תודה'), `expected תודה in: "${editCalls[0]}"`);

    const row = db
      .prepare('SELECT responded FROM neighbor_check_prompts WHERE chat_id = ? AND fingerprint = ?')
      .get(CHAT_ID, FINGERPRINT) as { responded: number };
    assert.equal(row.responded, 1, 'prompt should be marked as responded');
  });

  it('nc:unable — edits message with תודה', async () => {
    const { ctx, editCalls } = makeSpyCtx(`nc:unable:${CHAT_ID}:${FP_SHORT}`);
    await handler(ctx);

    assert.equal(editCalls.length, 1);
    assert.ok(editCalls[0]!.includes('תודה'), `expected תודה in: "${editCalls[0]}"`);
  });

  it('nc:dismissed — edits message with הובן (not תודה)', async () => {
    const { ctx, editCalls } = makeSpyCtx(`nc:dismissed:${CHAT_ID}:${FP_SHORT}`);
    await handler(ctx);

    assert.equal(editCalls.length, 1);
    assert.ok(editCalls[0]!.includes('הובן'), `expected הובן in: "${editCalls[0]}"`);
    assert.ok(!editCalls[0]!.includes('תודה'), 'dismissed should NOT contain תודה');
  });

  it('already responded — does NOT record a second event', async () => {
    // Pre-mark as responded
    db.prepare('UPDATE neighbor_check_prompts SET responded = 1 WHERE chat_id = ? AND fingerprint = ?')
      .run(CHAT_ID, FINGERPRINT);

    const { ctx } = makeSpyCtx(`nc:checked:${CHAT_ID}:${FP_SHORT}`);
    await handler(ctx);

    // markResponded + recordEvent are skipped when row.responded is already true
    const events = db.prepare('SELECT COUNT(*) as cnt FROM neighbor_check_events').get() as { cnt: number };
    assert.equal(events.cnt, 0, 'recordEvent must NOT be called when already responded');
  });

  it('unknown fp_short — edits message with expiry notice', async () => {
    // Use a fingerprint prefix that has no matching row
    const { ctx, editCalls } = makeSpyCtx(`nc:checked:${CHAT_ID}:00000000`);
    await handler(ctx);

    assert.equal(editCalls.length, 1, 'should still call editMessageText for expiry');
    assert.ok(editCalls[0]!.includes('פג תוקף'), `expected expiry message, got: "${editCalls[0]}"`);
  });
});
