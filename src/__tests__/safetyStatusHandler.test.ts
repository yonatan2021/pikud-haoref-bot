import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema, initDb, getDb } from '../db/schema.js';
import { insertSafetyPrompt } from '../db/safetyPromptRepository.js';
import { getSafetyStatus, upsertSafetyStatus } from '../db/safetyStatusRepository.js';
import {
  setSafetyStatusHandlerDeps,
  registerSafetyStatusHandler,
  notifyContactsOfStatusChange,
} from '../bot/safetyStatusHandler.js';
import { createContactWithPermissions, acceptContact } from '../db/contactRepository.js';
import type { Bot } from 'grammy';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

/** Captures the grammY callback handler registered via bot.callbackQuery for the regex pattern */
function captureHandler(db: Database.Database): (ctx: unknown) => Promise<void> {
  setSafetyStatusHandlerDeps(db);
  const bot = { command: mock.fn(), callbackQuery: mock.fn() } as unknown as Bot;
  registerSafetyStatusHandler(bot);
  const calls = (bot.callbackQuery as unknown as ReturnType<typeof mock.fn>).mock.calls;
  // Find the call registered with the regex pattern (not a plain string)
  const regexCall = calls.find((c: { arguments: unknown[] }) => c.arguments[0] instanceof RegExp);
  return regexCall!.arguments[1] as (ctx: unknown) => Promise<void>;
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

// ─── /status command + contacts view tests ──────────────────────────────────
// Uses initDb() singleton because listContacts/getPermissions call getDb() internally.

describe('safetyStatusHandler — /status and contacts view', () => {
  before(() => {
    process.env['DB_PATH'] = ':memory:';
    initDb();
  });

  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM contact_permissions').run();
    db.prepare('DELETE FROM contacts').run();
    db.prepare('DELETE FROM safety_status').run();
    db.prepare('DELETE FROM users').run();
    setSafetyStatusHandlerDeps(db);
  });

  /** Registers all handlers and returns command/callback dispatchers. */
  function buildBot() {
    const commands: Record<string, (ctx: unknown) => Promise<void>> = {};
    const callbacks: Array<[string | RegExp, (ctx: unknown) => Promise<void>]> = [];
    const bot: any = {
      command: (name: string, h: (ctx: unknown) => Promise<void>) => { commands[name] = h; },
      callbackQuery: (pat: string | RegExp, h: (ctx: unknown) => Promise<void>) => {
        callbacks.push([pat, h]);
      },
    };
    registerSafetyStatusHandler(bot);
    return {
      fireCmd: async (name: string, ctx: unknown) => commands[name]?.(ctx),
      fireCb: async (data: string, ctx: unknown) => {
        for (const [pat, h] of callbacks) {
          if (typeof pat === 'string' && pat === data) { await h(ctx); return; }
          if (pat instanceof RegExp && pat.test(data)) { await h(ctx); return; }
        }
      },
    };
  }

  function makeCtx(chatId: number, data = '') {
    const replies:  Array<{ text: string; opts: unknown }> = [];
    const edits:    Array<{ text: string; opts: unknown }> = [];
    const answers:  string[] = [];
    return {
      ctx: {
        from: { id: chatId },
        callbackQuery: { data },
        reply:           async (text: string, opts?: unknown) => { replies.push({ text, opts: opts ?? null }); },
        editMessageText: async (text: string, opts?: unknown) => { edits.push({ text, opts: opts ?? null }); },
        answerCallbackQuery: async (msg?: string) => { answers.push(msg ?? ''); },
      } as unknown,
      replies,
      edits,
      answers,
    };
  }

  // ── Test 1 ──
  it('/status — no active status → reply includes "אין סטטוס פעיל"', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    const { fireCmd } = buildBot();
    const { ctx, replies } = makeCtx(1001);
    await fireCmd('status', ctx);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].text.includes('אין סטטוס פעיל'), `Got: ${replies[0].text}`);
  });

  // ── Test 2 ──
  it('/status — active status → reply includes status emoji and relative time', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1002)').run();
    upsertSafetyStatus(db, 1002, 'ok');
    const { fireCmd } = buildBot();
    const { ctx, replies } = makeCtx(1002);
    await fireCmd('status', ctx);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].text.includes('✅'), `Got: ${replies[0].text}`);
    assert.ok(
      replies[0].text.includes('עכשיו') || replies[0].text.includes('דקות'),
      `Got: ${replies[0].text}`
    );
  });

  // ── Test 3 ──
  it('/status — expired status → treated as no status', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1003)').run();
    db.prepare(`
      INSERT INTO safety_status (chat_id, status, updated_at, expires_at)
      VALUES (1003, 'ok', datetime('now', '-2 hours'), datetime('now', '-1 second'))
    `).run();
    const { fireCmd } = buildBot();
    const { ctx, replies } = makeCtx(1003);
    await fireCmd('status', ctx);
    assert.equal(replies.length, 1, 'expected exactly one reply');
    assert.ok(replies[0].text.includes('אין סטטוס פעיל'), `Got: ${replies[0].text}`);
  });

  // ── Test 4 ──
  it('safety:contacts — no contacts → editMessageText includes "אין אנשי קשר פעילים"', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1004)').run();
    const { fireCb } = buildBot();
    const { ctx, edits } = makeCtx(1004);
    await fireCb('safety:contacts', ctx);
    assert.equal(edits.length, 1);
    assert.ok(edits[0].text.includes('אין אנשי קשר פעילים'), `Got: ${edits[0].text}`);
  });

  // ── Test 5 ──
  it('safety:contacts — contact with safety_status=true → contact id and status appear in message', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1005)').run();
    db.prepare('INSERT INTO users (chat_id) VALUES (1006)').run();
    upsertSafetyStatus(db, 1006, 'help');
    const contact = createContactWithPermissions(1005, 1006, { safety_status: true });
    acceptContact(contact.id);
    const { fireCb } = buildBot();
    const { ctx, edits } = makeCtx(1005);
    await fireCb('safety:contacts', ctx);
    assert.ok(edits[0].text.includes('1006'), `Expected 1006 in text. Got: ${edits[0].text}`);
    assert.ok(edits[0].text.includes('⚠️'), `Expected help emoji. Got: ${edits[0].text}`);
  });

  // ── Test 6 ──
  it('safety:contacts — contact with safety_status=false → NOT shown, counted in footer', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1007)').run();
    db.prepare('INSERT INTO users (chat_id) VALUES (1008)').run();
    upsertSafetyStatus(db, 1008, 'ok');
    const contact = createContactWithPermissions(1007, 1008, { safety_status: false });
    acceptContact(contact.id);
    const { fireCb } = buildBot();
    const { ctx, edits } = makeCtx(1007);
    await fireCb('safety:contacts', ctx);
    const text = edits[0].text;
    assert.ok(!text.includes('1008'), `Should not show hidden contact. Got: ${text}`);
    assert.ok(text.includes('אינם משתפים סטטוס'), `Should show hidden footer. Got: ${text}`);
  });

  // ── Test 7 ──
  it('safety:contacts — contact status expired → shown as "⬜ לא ידוע"', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1009)').run();
    db.prepare('INSERT INTO users (chat_id) VALUES (1010)').run();
    db.prepare(`
      INSERT INTO safety_status (chat_id, status, updated_at, expires_at)
      VALUES (1010, 'ok', datetime('now', '-2 hours'), datetime('now', '-1 second'))
    `).run();
    const contact = createContactWithPermissions(1009, 1010, { safety_status: true });
    acceptContact(contact.id);
    const { fireCb } = buildBot();
    const { ctx, edits } = makeCtx(1009);
    await fireCb('safety:contacts', ctx);
    assert.equal(edits.length, 1, 'expected exactly one editMessageText call');
    assert.ok(edits[0].text.includes('⬜ לא ידוע'), `Got: ${edits[0].text}`);
  });

  // ── Test 8 ──
  it('safety:back → editMessageText includes "הסטטוס שלך" and answerCallbackQuery is called', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (1011)').run();
    const { fireCb } = buildBot();
    const { ctx, edits, answers } = makeCtx(1011);
    await fireCb('safety:back', ctx);
    assert.equal(edits.length, 1);
    assert.ok(edits[0].text.includes('הסטטוס שלך'), `Got: ${edits[0].text}`);
    assert.ok(answers.length >= 1, 'answerCallbackQuery must be called');
  });

  // ── Test 9 ──
  it('notifyContactsOfStatusChange — sends DM to contact with safety_status=true, skips safety_status=false', async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (chat_id) VALUES (2001)').run();
    db.prepare('INSERT INTO users (chat_id) VALUES (2002)').run();
    db.prepare('INSERT INTO users (chat_id) VALUES (2003)').run();

    // contact A — permission granted
    const c1 = createContactWithPermissions(2001, 2002, { safety_status: true });
    acceptContact(c1.id);

    // contact B — permission denied
    const c2 = createContactWithPermissions(2001, 2003, { safety_status: false });
    acceptContact(c2.id);

    const sentMessages: Array<{ chatId: number; text: string }> = [];
    const mockBot: any = {
      api: {
        sendMessage: async (chatId: number, text: string) => {
          sentMessages.push({ chatId, text });
        },
      },
    };

    await notifyContactsOfStatusChange(db, mockBot, 2001, 'ok');

    assert.equal(sentMessages.length, 1, 'should only notify contact with permission');
    assert.equal(sentMessages[0].chatId, 2002);
    assert.ok(sentMessages[0].text.includes('בסדר'), `Got: ${sentMessages[0].text}`);
  });
});
