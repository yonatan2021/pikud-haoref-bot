import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { insertSafetyPrompt } from '../db/safetyPromptRepository.js';
import { getSafetyStatus } from '../db/safetyStatusRepository.js';
import {
  setSafetyStatusHandlerDeps,
  registerSafetyStatusHandler,
} from '../bot/safetyStatusHandler.js';
import type { Bot } from 'grammy';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

/** Captures the grammY callback handler registered via bot.callbackQuery */
function captureHandler(db: Database.Database): (ctx: unknown) => Promise<void> {
  setSafetyStatusHandlerDeps(db);
  const bot = { callbackQuery: mock.fn() } as unknown as Bot;
  registerSafetyStatusHandler(bot);
  const calls = (bot.callbackQuery as unknown as ReturnType<typeof mock.fn>).mock.calls;
  return calls[0].arguments[1] as (ctx: unknown) => Promise<void>;
}

function makeCtx(data: string, chatId = 1001) {
  return {
    callbackQuery: { data },
    from: { id: chatId },
    answerCallbackQuery: mock.fn(async (_text?: string) => {}),
    editMessageText: mock.fn(async () => {}),
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('safetyStatusHandler', () => {
  let db: Database.Database;
  let promptId: number;

  before(() => {
    db = makeDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    const id = insertSafetyPrompt(db, 1001, 'missiles:city1', 123, 'missiles');
    promptId = id!;
  });

  after(() => { db.close(); });

  beforeEach(() => {
    db.prepare('DELETE FROM safety_status').run();
    db.prepare('UPDATE safety_prompts SET responded = 0 WHERE chat_id = 1001').run();
  });

  it('safety:ok stores status "ok" and edits the message', async () => {
    const handler = captureHandler(db);
    const ctx = makeCtx(`safety:ok:${promptId}`);
    await handler(ctx);

    const status = getSafetyStatus(db, 1001);
    assert.ok(status !== null);
    assert.equal(status!.status, 'ok');
    assert.equal(
      (ctx.editMessageText as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1
    );
  });

  it('safety:help stores status "help"', async () => {
    const handler = captureHandler(db);
    const ctx = makeCtx(`safety:help:${promptId}`);
    await handler(ctx);

    assert.equal(getSafetyStatus(db, 1001)!.status, 'help');
  });

  it('safety:dismiss stores status "dismissed" (not "dismiss")', async () => {
    const handler = captureHandler(db);
    const ctx = makeCtx(`safety:dismiss:${promptId}`);
    await handler(ctx);

    assert.equal(getSafetyStatus(db, 1001)!.status, 'dismissed');
  });

  it('answerCallbackQuery is always called (finally block)', async () => {
    const handler = captureHandler(db);
    const ctx = makeCtx(`safety:ok:${promptId}`);
    await handler(ctx);

    const calls = (ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(calls.length >= 1, 'answerCallbackQuery must be called at least once');
  });

  it('stale tap: editMessageText NOT called when already responded', async () => {
    db.prepare(
      'UPDATE safety_prompts SET responded = 1 WHERE chat_id = 1001'
    ).run();

    const handler = captureHandler(db);
    const ctx = makeCtx(`safety:ok:${promptId}`);
    await handler(ctx);

    assert.equal(
      (ctx.editMessageText as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'Must not edit message on stale tap'
    );

    const answerCalls = (ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(String(answerCalls[0].arguments[0]).includes('כבר עדכנת'));
  });
});
