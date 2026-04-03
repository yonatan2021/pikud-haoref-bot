import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { createListener } from '../db/telegramListenerRepository.js';
import { createMessageHandler } from '../telegram-listener/telegramListenerService.js';

process.env['TELEGRAM_CHAT_ID'] = '-1001234567890';

let db: Database.Database;

before(() => { db = new Database(':memory:'); initSchema(db); });
after(() => db.close());
beforeEach(() => {
  db.prepare('DELETE FROM telegram_listeners').run();
});

const BASE = {
  chatId: '-100dummy',
  chatName: 'Test Channel',
  chatType: 'channel' as const,
  keywords: [] as string[],
  telegramTopicId: null,
  telegramTopicName: null,
  forwardToWhatsApp: false,
  isActive: true,
};

type TestMsg = {
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: number;
  hasMedia: boolean;
};

function makeMsg(chatId: string, body: string, overrides: Partial<TestMsg> = {}): TestMsg {
  return {
    chatId,
    chatName: 'Test Channel',
    senderId: '999',
    senderName: 'Tester',
    body,
    timestamp: 1700000000,
    hasMedia: false,
    ...overrides,
  };
}

function makeBot() {
  const calls: Array<{ chatId: string; text: string; opts: Record<string, unknown> }> = [];
  const sendMessage = mock.fn(async (chatId: string, text: string, opts: Record<string, unknown>) => {
    calls.push({ chatId, text, opts });
  });
  const bot = { api: { sendMessage } } as unknown as Parameters<typeof createMessageHandler>[1];
  return { bot, calls, sendMessage };
}

// ─── Keyword matching ───────────────────────────────────────────────────────

describe('createMessageHandler — keyword matching', () => {
  it('does nothing when no active listener matches chatId', async () => {
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100unknown', 'hello') as any);
    assert.equal(calls.length, 0);
  });

  it('forwards all messages when keywords is empty', async () => {
    createListener(db, { ...BASE, chatId: '-100all', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100all', 'any text') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.text.includes('any text'));
  });

  it('forwards when message contains a keyword', async () => {
    createListener(db, { ...BASE, chatId: '-100kw', keywords: ['ירי'] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100kw', 'יש ירי באזור') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  });

  it('does NOT forward when no keyword matches', async () => {
    createListener(db, { ...BASE, chatId: '-100nm', keywords: ['רקטה'] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100nm', 'הכל שקט') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 0);
  });

  it('skips inactive listeners', async () => {
    createListener(db, { ...BASE, chatId: '-100off', keywords: [], isActive: false });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100off', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 0);
  });

  it('does not throw when sendMessage rejects', async () => {
    createListener(db, { ...BASE, chatId: '-100err', keywords: [] });
    const errorBot = {
      api: {
        sendMessage: mock.fn(async () => { throw new Error('TG down'); }),
      },
    } as unknown as Parameters<typeof createMessageHandler>[1];
    const h = createMessageHandler(db, errorBot);
    await assert.doesNotReject(() => h(makeMsg('-100err', 'msg') as any));
    await new Promise(r => setTimeout(r, 10));
  });
});

// ─── Topic routing ──────────────────────────────────────────────────────────

describe('createMessageHandler — topic routing', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env['TELEGRAM_TOPIC_ID_WHATSAPP'];
    delete process.env['TELEGRAM_TOPIC_ID_WHATSAPP'];
    db.prepare('DELETE FROM telegram_listeners').run();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env['TELEGRAM_TOPIC_ID_WHATSAPP'];
    } else {
      process.env['TELEGRAM_TOPIC_ID_WHATSAPP'] = savedEnv;
    }
  });

  it('passes listener telegramTopicId as message_thread_id', async () => {
    createListener(db, { ...BASE, chatId: '-100tp', telegramTopicId: 42 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100tp', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['message_thread_id'], 42);
  });

  it('uses TELEGRAM_TOPIC_ID_WHATSAPP env when listener has no topicId', async () => {
    process.env['TELEGRAM_TOPIC_ID_WHATSAPP'] = '12';
    createListener(db, { ...BASE, chatId: '-100fb', telegramTopicId: null });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100fb', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['message_thread_id'], 12);
  });

  it('sends without topic when no topicId configured', async () => {
    createListener(db, { ...BASE, chatId: '-100notopic', telegramTopicId: null });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100notopic', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['message_thread_id'], undefined);
  });

  it('listener topicId overrides env var', async () => {
    process.env['TELEGRAM_TOPIC_ID_WHATSAPP'] = '99';
    createListener(db, { ...BASE, chatId: '-100own', telegramTopicId: 7 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100own', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['message_thread_id'], 7);
  });

  it('rejects env var value of 1 (reserved thread ID)', async () => {
    process.env['TELEGRAM_TOPIC_ID_WHATSAPP'] = '1';
    createListener(db, { ...BASE, chatId: '-100reserved', telegramTopicId: null });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100reserved', 'msg') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['message_thread_id'], undefined);
  });
});

// ─── WhatsApp broadcast ─────────────────────────────────────────────────────

describe('createMessageHandler — forwardToWhatsApp', () => {
  it('calls broadcastToWAFn when forwardToWhatsApp=true and keyword matches', async () => {
    createListener(db, { ...BASE, chatId: '-100wa1', forwardToWhatsApp: true });
    const { bot } = makeBot();
    const broadcastCalls: string[] = [];
    const broadcastToWAFn = mock.fn(async (text: string) => { broadcastCalls.push(text); });
    const h = createMessageHandler(db, bot, broadcastToWAFn as any);
    await h(makeMsg('-100wa1', 'alert') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(broadcastCalls.length, 1);
    assert.ok(broadcastCalls[0]!.includes('alert'));
  });

  it('does NOT call broadcastToWAFn when forwardToWhatsApp=false', async () => {
    createListener(db, { ...BASE, chatId: '-100wa2', forwardToWhatsApp: false });
    const { bot } = makeBot();
    const broadcastToWAFn = mock.fn(async () => {});
    const h = createMessageHandler(db, bot, broadcastToWAFn as any);
    await h(makeMsg('-100wa2', 'alert') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(broadcastToWAFn.mock.calls.length, 0);
  });

  it('does NOT call broadcastToWAFn when message does not match keywords', async () => {
    createListener(db, { ...BASE, chatId: '-100wa3', keywords: ['רקטה'], forwardToWhatsApp: true });
    const { bot } = makeBot();
    const broadcastToWAFn = mock.fn(async () => {});
    const h = createMessageHandler(db, bot, broadcastToWAFn as any);
    await h(makeMsg('-100wa3', 'הכל שקט') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(broadcastToWAFn.mock.calls.length, 0);
  });

  it('does not throw when broadcastToWAFn rejects', async () => {
    createListener(db, { ...BASE, chatId: '-100wa4', forwardToWhatsApp: true });
    const { bot } = makeBot();
    const broadcastToWAFn = mock.fn(async () => { throw new Error('WA down'); });
    const h = createMessageHandler(db, bot, broadcastToWAFn as any);
    await assert.doesNotReject(() => h(makeMsg('-100wa4', 'msg') as any));
    await new Promise(r => setTimeout(r, 10));
  });
});

// ─── Caption format ─────────────────────────────────────────────────────────

describe('createMessageHandler — caption format', () => {
  it('caption contains 📡 <b>chatName</b>', async () => {
    createListener(db, { ...BASE, chatId: '-100fmt1', chatName: 'My Channel', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100fmt1', 'body') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('<b>My Channel</b>'), 'channel name should be wrapped in HTML bold');
    assert.ok(calls[0]!.text.startsWith('📡'), 'caption should start with 📡');
  });

  it('caption has blank line between timestamp and body', async () => {
    createListener(db, { ...BASE, chatId: '-100fmt2', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100fmt2', 'message body') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('\n\nmessage body'), 'blank line should separate timestamp from body');
  });

  it('timestamp matches DD.MM · HH:MM format', async () => {
    createListener(db, { ...BASE, chatId: '-100fmt3', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100fmt3', 'test', { timestamp: 1700000000 }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.match(/\d{2}\.\d{2} · \d{2}:\d{2}/), 'caption should contain DD.MM · HH:MM timestamp');
  });

  it('HTML-escapes < in body', async () => {
    createListener(db, { ...BASE, chatId: '-100esc1', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100esc1', 'a < b') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('&lt;'), '< should be HTML-escaped');
    assert.ok(!calls[0]!.text.includes(' < '), 'raw < should not appear');
  });

  it('HTML-escapes & and > in body', async () => {
    createListener(db, { ...BASE, chatId: '-100esc2', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100esc2', 'a & b > c') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('&amp;'), '& should be HTML-escaped');
    assert.ok(calls[0]!.text.includes('&gt;'), '> should be HTML-escaped');
  });

  it('uses parse_mode HTML', async () => {
    createListener(db, { ...BASE, chatId: '-100pm', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100pm', 'test') as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.opts['parse_mode'], 'HTML');
  });
});

// ─── Truncation ─────────────────────────────────────────────────────────────

describe('createMessageHandler — body truncation', () => {
  it('truncates body to 3900 chars with ellipsis', async () => {
    createListener(db, { ...BASE, chatId: '-100long', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100long', 'א'.repeat(5000)) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('…'), 'truncated text should end with ellipsis');
    // 3900 Hebrew chars + ellipsis + header — total under 4096
    assert.ok(calls[0]!.text.length <= 4096, 'total caption should not exceed Telegram limit');
  });

  it('does not truncate body under 3900 chars', async () => {
    createListener(db, { ...BASE, chatId: '-100short', keywords: [] });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    const shortBody = 'שלום עולם';
    await h(makeMsg('-100short', shortBody) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes(shortBody), 'short body should appear untruncated');
    assert.ok(!calls[0]!.text.includes('…'), 'should not add ellipsis to short body');
  });
});
