import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { createListener, upsertKnownChat } from '../db/telegramListenerRepository.js';
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
  sourceTopicId: null,
};

type TestMsg = {
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: number;
  hasMedia: boolean;
  mediaBuffer?: Buffer;
  mediaMimetype?: string;
  mediaFilename?: string;
  topicId: number | null;
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
    topicId: null,
    ...overrides,
  };
}

function makeBot() {
  const calls: Array<{ chatId: string; text: string; opts: Record<string, unknown> }> = [];
  const photoCalls: Array<{ chatId: string; opts: Record<string, unknown> }> = [];
  const docCalls: Array<{ chatId: string; opts: Record<string, unknown> }> = [];

  const sendMessage = mock.fn(async (chatId: string, text: string, opts: Record<string, unknown>) => {
    calls.push({ chatId, text, opts });
  });
  const sendPhoto = mock.fn(async (chatId: string, _file: unknown, opts: Record<string, unknown>) => {
    photoCalls.push({ chatId, opts });
  });
  const sendDocument = mock.fn(async (chatId: string, _file: unknown, opts: Record<string, unknown>) => {
    docCalls.push({ chatId, opts });
  });

  const bot = { api: { sendMessage, sendPhoto, sendDocument } } as unknown as Parameters<typeof createMessageHandler>[1];
  return { bot, calls, photoCalls, docCalls, sendMessage, sendPhoto, sendDocument };
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

// ─── Source topic filter ─────────────────────────────────────────────────────

describe('createMessageHandler — source topic filter', () => {
  beforeEach(() => { db.prepare('DELETE FROM telegram_listeners').run(); });

  it('forwards when listener has no sourceTopicId (all topics)', async () => {
    createListener(db, { ...BASE, chatId: '-100st1', sourceTopicId: null });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100st1', 'msg', { topicId: 5 }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  });

  it('forwards when message topicId matches listener sourceTopicId', async () => {
    createListener(db, { ...BASE, chatId: '-100st2', sourceTopicId: 5 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100st2', 'msg', { topicId: 5 }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  });

  it('does NOT forward when message topicId does not match sourceTopicId', async () => {
    createListener(db, { ...BASE, chatId: '-100st3', sourceTopicId: 5 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100st3', 'msg', { topicId: 3 }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 0);
  });

  it('does NOT forward when message has no topicId but listener has sourceTopicId', async () => {
    createListener(db, { ...BASE, chatId: '-100st4', sourceTopicId: 5 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100st4', 'msg', { topicId: null }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 0);
  });
});

// ─── Media forwarding ────────────────────────────────────────────────────────

describe('createMessageHandler — media forwarding', () => {
  beforeEach(() => { db.prepare('DELETE FROM telegram_listeners').run(); });

  it('sends photo via sendPhoto when mediaBuffer is image/jpeg', async () => {
    createListener(db, { ...BASE, chatId: '-100ph1', keywords: [] });
    const { bot, calls, photoCalls } = makeBot();
    const h = createMessageHandler(db, bot);
    const buf = Buffer.from('fake-image-bytes');
    await h(makeMsg('-100ph1', 'caption text', { hasMedia: true, mediaBuffer: buf, mediaMimetype: 'image/jpeg' }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(photoCalls.length, 1, 'sendPhoto should be called');
    assert.equal(calls.length, 0, 'sendMessage should NOT be called for image');
    assert.equal(photoCalls[0]!.opts['parse_mode'], 'HTML');
  });

  it('sends document via sendDocument for video/mp4', async () => {
    createListener(db, { ...BASE, chatId: '-100vid1', keywords: [] });
    const { bot, calls, docCalls } = makeBot();
    const h = createMessageHandler(db, bot);
    const buf = Buffer.from('fake-video-bytes');
    await h(makeMsg('-100vid1', '', { hasMedia: true, mediaBuffer: buf, mediaMimetype: 'video/mp4', mediaFilename: 'clip.mp4' }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(docCalls.length, 1, 'sendDocument should be called for video');
    assert.equal(calls.length, 0, 'sendMessage should NOT be called for video');
  });

  it('sends document via sendDocument for application/pdf', async () => {
    createListener(db, { ...BASE, chatId: '-100doc1', keywords: [] });
    const { bot, calls, docCalls } = makeBot();
    const h = createMessageHandler(db, bot);
    const buf = Buffer.from('fake-pdf-bytes');
    await h(makeMsg('-100doc1', 'see attached', { hasMedia: true, mediaBuffer: buf, mediaMimetype: 'application/pdf', mediaFilename: 'file.pdf' }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(docCalls.length, 1, 'sendDocument should be called for PDF');
    assert.equal(calls.length, 0, 'sendMessage should NOT be called for PDF');
    assert.equal(docCalls[0]!.opts['parse_mode'], 'HTML');
  });

  it('media-only message (empty body) forwards with header-only caption via sendPhoto', async () => {
    createListener(db, { ...BASE, chatId: '-100mo1', keywords: [] });
    const { bot, photoCalls } = makeBot();
    const h = createMessageHandler(db, bot);
    const buf = Buffer.from('img');
    await h(makeMsg('-100mo1', '', { hasMedia: true, mediaBuffer: buf, mediaMimetype: 'image/jpeg' }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(photoCalls.length, 1);
    // caption should contain the 📡 header but no double newline + body
    const caption = photoCalls[0]!.opts['caption'] as string;
    assert.ok(caption.startsWith('📡'), 'caption should start with 📡');
    assert.ok(!caption.includes('\n\n'), 'no body separator in media-only caption');
  });

  it('falls back to sendMessage when sendPhoto rejects', async () => {
    createListener(db, { ...BASE, chatId: '-100phfail', keywords: [] });
    const { calls, photoCalls, docCalls } = makeBot();
    const fallbackCalls: Array<{ chatId: string }> = [];
    const failBot = {
      api: {
        sendPhoto: mock.fn(async () => { throw new Error('TG photo error'); }),
        sendDocument: mock.fn(async () => {}),
        sendMessage: mock.fn(async (chatId: string) => { fallbackCalls.push({ chatId }); }),
      },
    } as unknown as Parameters<typeof createMessageHandler>[1];
    const h = createMessageHandler(db, failBot);
    const buf = Buffer.from('img');
    await h(makeMsg('-100phfail', 'txt', { hasMedia: true, mediaBuffer: buf, mediaMimetype: 'image/jpeg' }) as any);
    // sendPhoto is fire-and-forget; wait for its rejection to trigger the catch
    await new Promise(r => setTimeout(r, 50));
    assert.equal(fallbackCalls.length, 1, 'sendMessage fallback should be called after sendPhoto failure');
    void calls; void photoCalls; void docCalls; // suppress unused warnings
  });

  it('uses sendMessage (not sendPhoto) when no mediaBuffer present', async () => {
    createListener(db, { ...BASE, chatId: '-100nomedia', keywords: [] });
    const { bot, calls, photoCalls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg('-100nomedia', 'just text', { hasMedia: false }) as any);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1, 'sendMessage should be called for text-only');
    assert.equal(photoCalls.length, 0, 'sendPhoto should NOT be called for text-only');
  });
});

// ─── Diagnostic logging ──────────────────────────────────────────────────────

describe('createMessageHandler — diagnostic logging (no-listener warn)', () => {
  it('does not throw and returns without error when no listeners match', async () => {
    // listener for a different chatId — incoming chatId won't match
    createListener(db, { ...BASE, chatId: '-100other' });
    const { bot } = makeBot();
    const h = createMessageHandler(db, bot);
    // Should resolve cleanly (the warning log is side-effect, hard to assert without mocking logger)
    await assert.doesNotReject(() => h(makeMsg('-100unknown', 'hello') as any));
  });
});

// ─── General-topic (forum topic id=1) normalization ──────────────────────────
// In Telegram forum supergroups, the "General" topic (id=1) sends messages
// WITHOUT replyToTopId — they arrive with topicId=null. The service must
// normalise null → 1 for forum groups so rules with sourceTopicId=1 match.

describe('createMessageHandler — General-topic normalization', () => {
  const FORUM_CHAT_ID = '-100forum';

  beforeEach(() => {
    db.prepare('DELETE FROM telegram_listeners').run();
    db.prepare('DELETE FROM telegram_known_chats').run();
  });

  it('isForum=true, sourceTopicId=1, topicId=null → message IS forwarded (null normalised to 1)', async () => {
    upsertKnownChat(db, { chatId: FORUM_CHAT_ID, chatName: 'Forum', chatType: 'supergroup', isForum: true });
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: 1 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'general topic msg', { topicId: null }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 1, 'should forward because null is treated as topic 1 in forum groups');
  });

  it('isForum=true, sourceTopicId=1, topicId=2 → message is NOT forwarded (different topic)', async () => {
    upsertKnownChat(db, { chatId: FORUM_CHAT_ID, chatName: 'Forum', chatType: 'supergroup', isForum: true });
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: 1 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'topic 2 msg', { topicId: 2 }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 0, 'should NOT forward — topic 2 does not match sourceTopicId 1');
  });

  it('isForum=false, sourceTopicId=1, topicId=null → message is NOT forwarded (not a forum)', async () => {
    upsertKnownChat(db, { chatId: FORUM_CHAT_ID, chatName: 'Non-Forum', chatType: 'supergroup', isForum: false });
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: 1 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'regular group msg', { topicId: null }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 0, 'should NOT forward — not a forum group so null is not normalised to 1');
  });

  it('isForum=true, sourceTopicId=null (forward all), topicId=null → message IS forwarded', async () => {
    upsertKnownChat(db, { chatId: FORUM_CHAT_ID, chatName: 'Forum', chatType: 'supergroup', isForum: true });
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: null });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'any topic msg', { topicId: null }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 1, 'sourceTopicId=null means forward all topics');
  });

  it('chat===null (not in DB), sourceTopicId=1, topicId=null → message is NOT forwarded (unknown chat, topic filter applies)', async () => {
    // chat NOT inserted into telegram_known_chats — simulates stale/cleared table
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: 1 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'unknown chat msg', { topicId: null }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 0, 'unknown chat: effectiveTopicId stays null, does not match sourceTopicId=1');
  });

  it('chat===null (not in DB), sourceTopicId=1, topicId=2 → message is NOT forwarded', async () => {
    // chat NOT inserted — topicId=2 clearly does not match sourceTopicId=1
    createListener(db, { ...BASE, chatId: FORUM_CHAT_ID, sourceTopicId: 1 });
    const { bot, calls } = makeBot();
    const h = createMessageHandler(db, bot);
    await h(makeMsg(FORUM_CHAT_ID, 'topic 2 unknown chat', { topicId: 2 }) as any);
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(calls.length, 0, 'unknown chat + topicId=2: topic filter correctly rejects');
  });
});
