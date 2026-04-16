import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Bot, Context } from 'grammy';
import { initDb, getDb } from '../db/schema.js';
import { upsertSkill } from '../db/userSkillsRepository.js';
import {
  registerSkillsHandler,
  clearPendingSkillNote,
  hasPendingSkillNote,
} from '../bot/skillsHandler.js';

before(() => {
  process.env['DB_PATH'] = ':memory:';
  initDb();
  // Seed a user
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO users (chat_id, display_name, home_city, onboarding_completed)
     VALUES (?, ?, ?, 1)`
  ).run(12345, 'TestUser', 'תל אביב');
});

type HandlerFn = (ctx: Context, next?: () => Promise<void>) => Promise<void>;

function createMockBot() {
  const commandHandlers = new Map<string, HandlerFn>();
  const callbackHandlers = new Map<string | RegExp, HandlerFn>();
  const textHandlers: HandlerFn[] = [];

  const bot = {
    command: (name: string, fn: HandlerFn) => {
      commandHandlers.set(name, fn);
    },
    callbackQuery: (pat: string | RegExp, fn: HandlerFn) => {
      callbackHandlers.set(pat, fn);
    },
    on: (event: string, fn: HandlerFn) => {
      if (event === 'message:text') textHandlers.push(fn);
    },
    api: {
      sendMessage: mock.fn(async () => ({ message_id: 1 })),
    },
  } as unknown as Bot;

  return { bot, commandHandlers, callbackHandlers, textHandlers };
}

function createMockCtx(overrides: Record<string, unknown> = {}): Context {
  return {
    from: { id: 12345, first_name: 'Test' },
    chat: { id: 12345, type: 'private' },
    message: { text: '' },
    match: null,
    reply: mock.fn(async () => ({ message_id: 1 })),
    editMessageText: mock.fn(async () => ({})),
    answerCallbackQuery: mock.fn(async () => {}),
    ...overrides,
  } as unknown as Context;
}

function findCallbackHandler(
  handlers: Map<string | RegExp, HandlerFn>,
  data: string
): HandlerFn | undefined {
  for (const [pat, fn] of handlers) {
    if (typeof pat === 'string' && pat === data) return fn;
    if (pat instanceof RegExp && pat.test(data)) return fn;
  }
  return undefined;
}

describe('skillsHandler', () => {
  let commandHandlers: Map<string, HandlerFn>;
  let callbackHandlers: Map<string | RegExp, HandlerFn>;
  let textHandlers: HandlerFn[];

  beforeEach(() => {
    const mocked = createMockBot();
    commandHandlers = mocked.commandHandlers;
    callbackHandlers = mocked.callbackHandlers;
    textHandlers = mocked.textHandlers;
    registerSkillsHandler(mocked.bot);
    clearPendingSkillNote(12345);
  });

  it('registers the /need command', () => {
    assert.ok(commandHandlers.has('need'), '/need command must be registered');
  });

  it('/need without arg shows catalog keyboard', async () => {
    const fn = commandHandlers.get('need')!;
    const ctx = createMockCtx({ match: '' });
    await fn(ctx);
    const replyMock = ctx.reply as unknown as ReturnType<typeof mock.fn>;
    assert.equal(replyMock.mock.calls.length, 1);
    const text = replyMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('עזרה בשעת חירום'), 'should show catalog prompt');
  });

  it('/need <key> shows results for known skill', async () => {
    const fn = commandHandlers.get('need')!;
    // Seed user with public skill
    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO users (chat_id, display_name, onboarding_completed) VALUES (?, ?, 1)`
    ).run(9001, 'Helper');
    upsertSkill(db, 9001, 'first_aid', 'public', null);

    const ctx = createMockCtx({ match: 'first_aid' });
    await fn(ctx);
    const replyMock = ctx.reply as unknown as ReturnType<typeof mock.fn>;
    assert.equal(replyMock.mock.calls.length, 1);
  });

  it('/need <key> replies with error for unknown skill', async () => {
    const fn = commandHandlers.get('need')!;
    const ctx = createMockCtx({ match: 'nonexistent_xyz' });
    await fn(ctx);
    const replyMock = ctx.reply as unknown as ReturnType<typeof mock.fn>;
    assert.equal(replyMock.mock.calls.length, 1);
    const text = replyMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('לא נמצא'), 'should indicate skill not found');
  });

  it('sk:list callback shows skills list', async () => {
    const fn = findCallbackHandler(callbackHandlers, 'sk:list');
    assert.ok(fn, 'sk:list must be registered');
    const ctx = createMockCtx();
    await fn!(ctx);
    const answerMock = ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>;
    assert.equal(answerMock.mock.calls.length, 1, 'must answer callback query');
    const editMock = ctx.editMessageText as unknown as ReturnType<typeof mock.fn>;
    assert.equal(editMock.mock.calls.length, 1, 'must edit message with skills list');
  });

  it('sk:pick callback shows catalog buttons', async () => {
    const fn = findCallbackHandler(callbackHandlers, 'sk:pick');
    assert.ok(fn, 'sk:pick must be registered');
    const ctx = createMockCtx();
    await fn!(ctx);
    const answerMock = ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>;
    assert.equal(answerMock.mock.calls.length, 1);
    const editMock = ctx.editMessageText as unknown as ReturnType<typeof mock.fn>;
    assert.equal(editMock.mock.calls.length, 1);
    const text = editMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('בחר כישור'), 'should show catalog prompt');
  });

  it('sk:add:<key> adds skill and shows visibility keyboard', async () => {
    const fn = findCallbackHandler(callbackHandlers, 'sk:add:shelter_host');
    assert.ok(fn, 'sk:add regex handler must be registered');
    const ctx = createMockCtx({ match: ['sk:add:shelter_host', 'shelter_host'] });
    await fn!(ctx);
    const answerMock = ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>;
    assert.equal(answerMock.mock.calls.length, 1);
    const editMock = ctx.editMessageText as unknown as ReturnType<typeof mock.fn>;
    assert.equal(editMock.mock.calls.length, 1);
    const text = editMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('נוסף'), 'should confirm skill was added');
  });

  it('sk:rm:<key> removes skill', async () => {
    // First add the skill
    const db = getDb();
    upsertSkill(db, 12345, 'ride_share', 'contacts', null);

    const fn = findCallbackHandler(callbackHandlers, 'sk:rm:ride_share');
    assert.ok(fn, 'sk:rm regex handler must be registered');
    const ctx = createMockCtx({ match: ['sk:rm:ride_share', 'ride_share'] });
    await fn!(ctx);
    const answerMock = ctx.answerCallbackQuery as unknown as ReturnType<typeof mock.fn>;
    assert.equal(answerMock.mock.calls.length, 1);
    const editMock = ctx.editMessageText as unknown as ReturnType<typeof mock.fn>;
    assert.equal(editMock.mock.calls.length, 1);
  });

  it('sk:note:<key> sets pendingSkillNote and prompts for note', async () => {
    const fn = findCallbackHandler(callbackHandlers, 'sk:note:first_aid');
    assert.ok(fn, 'sk:note regex handler must be registered');
    assert.equal(hasPendingSkillNote(12345), false);
    const ctx = createMockCtx({ match: ['sk:note:first_aid', 'first_aid'] });
    await fn!(ctx);
    assert.equal(hasPendingSkillNote(12345), true, 'pendingSkillNote should be set');
    const editMock = ctx.editMessageText as unknown as ReturnType<typeof mock.fn>;
    assert.equal(editMock.mock.calls.length, 1);
    const text = editMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('הוסף הערה'), 'should prompt for note');
    clearPendingSkillNote(12345);
  });

  it('text handler calls next() when NOT in pendingSkillNote', async () => {
    const handler = textHandlers[textHandlers.length - 1];
    assert.ok(handler, 'text handler must be registered');
    assert.equal(hasPendingSkillNote(12345), false);
    const nextFn = mock.fn(async () => {});
    const ctx = createMockCtx({ message: { text: 'hello' } });
    await handler(ctx, nextFn as unknown as () => Promise<void>);
    assert.equal((nextFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1, 'next() must be called');
  });

  it('text handler saves note and clears state when IN pendingSkillNote', async () => {
    // Set up pending state
    const fn = findCallbackHandler(callbackHandlers, 'sk:note:water_food');
    assert.ok(fn);
    const noteCtx = createMockCtx({ match: ['sk:note:water_food', 'water_food'] });
    await fn!(noteCtx);
    assert.equal(hasPendingSkillNote(12345), true);

    const handler = textHandlers[textHandlers.length - 1];
    const nextFn = mock.fn(async () => {});
    const ctx = createMockCtx({ message: { text: 'I have water supplies' } });
    await handler(ctx, nextFn as unknown as () => Promise<void>);

    assert.equal((nextFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 0, 'next() must NOT be called when handling note');
    assert.equal(hasPendingSkillNote(12345), false, 'pending state should be cleared after note saved');
    const replyMock = ctx.reply as unknown as ReturnType<typeof mock.fn>;
    assert.equal(replyMock.mock.calls.length, 1, 'should send confirmation reply');
    const text = replyMock.mock.calls[0].arguments[0] as string;
    assert.ok(text.includes('נשמרה'), 'should confirm note was saved');
  });
});
