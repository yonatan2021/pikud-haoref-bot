import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { createListener } from '../db/whatsappListenerRepository.js';
import { createMessageHandler, type IncomingWhatsAppMsg } from '../whatsapp/whatsappListenerService.js';

process.env['TELEGRAM_CHAT_ID'] = '-1001234567890';

let db: Database.Database;
let stdoutSpy: ReturnType<typeof mock.method>;

before(() => { db = new Database(':memory:'); initSchema(db); });
after(() => db.close());
beforeEach(() => {
  db.prepare('DELETE FROM whatsapp_listeners').run();
  stdoutSpy = mock.method(process.stdout, 'write', () => true);
});

const BASE = {
  channelName: 'Ch', channelType: 'group' as const,
  telegramTopicId: null, telegramTopicName: null, isActive: true,
};

function makeMsg(from: string, body: string, overrides: Partial<IncomingWhatsAppMsg> = {}): IncomingWhatsAppMsg {
  return {
    from,
    body,
    timestamp: 1700000000,
    hasMedia: false,
    downloadMedia: async () => null,
    ...overrides,
  };
}

function makeSend() {
  const calls: Array<{ chatId: string; text: string; threadId?: number }> = [];
  const fn = mock.fn(async (chatId: string, text: string, threadId?: number) => {
    calls.push({ chatId, text, threadId });
  });
  return { fn, calls };
}

describe('createMessageHandler', () => {
  it('does nothing when no active listener matches channel', async () => {
    const { fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('unknown@g.us', 'hello'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('forwards all messages when keywords is empty', async () => {
    createListener(db, { ...BASE, channelId: 'all@g.us', keywords: [] });
    const { fn, calls } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('all@g.us', 'any text'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.text.includes('any text'));
  });

  it('forwards when message contains a keyword', async () => {
    createListener(db, { ...BASE, channelId: 'kw@g.us', keywords: ['ירי'] });
    const { fn, calls } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('kw@g.us', 'יש ירי באזור'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  });

  it('does NOT forward when no keyword matches', async () => {
    createListener(db, { ...BASE, channelId: 'nm@g.us', keywords: ['רקטה'] });
    const { fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('nm@g.us', 'הכל שקט'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('passes telegram_topic_id as threadId', async () => {
    createListener(db, { ...BASE, channelId: 'tp@g.us', keywords: [], telegramTopicId: 42 });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('tp@g.us', 'msg'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.threadId, 42);
  });

  it('skips inactive listeners', async () => {
    createListener(db, { ...BASE, channelId: 'off@g.us', keywords: [], isActive: false });
    const { fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('off@g.us', 'msg'));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('does not throw when sendFn rejects', async () => {
    createListener(db, { ...BASE, channelId: 'err@g.us', keywords: [] });
    const throwFn = mock.fn(async () => { throw new Error('TG down'); });
    const h = createMessageHandler(db, throwFn as any);
    assert.doesNotThrow(() => h(makeMsg('err@g.us', 'msg')));
    await new Promise(r => setTimeout(r, 10));
  });

  it('truncates message body to 3900 chars', async () => {
    createListener(db, { ...BASE, channelId: 'long@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('long@g.us', 'א'.repeat(5000)));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.length <= 4096);
  });

  // ─── New tests for HTML format, timestamp, and media ─────────────────────────

  it('caption has blank line between timestamp and body', async () => {
    createListener(db, { ...BASE, channelId: 'nl@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('nl@g.us', 'message body'));
    await new Promise(r => setTimeout(r, 10));
    // Expect: "...🕐 ...\n\nmessage body" — double newline between timestamp and body
    assert.ok(calls[0]!.text.includes('\n\nmessage body'), 'blank line should separate timestamp from body');
  });

  it('caption contains timestamp in DD.MM · HH:MM format', async () => {
    createListener(db, { ...BASE, channelId: 'ts@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    // 1700000000 = Sat Nov 14 2023 22:13:20 UTC → Israel time (UTC+2 in Nov) = 00:13 15 Nov
    h(makeMsg('ts@g.us', 'test', { timestamp: 1700000000 }));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.match(/\d{2}\.\d{2} · \d{2}:\d{2}/), 'caption should contain timestamp pattern DD.MM · HH:MM');
  });

  it('escapes < in body to &lt;', async () => {
    createListener(db, { ...BASE, channelId: 'esc@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('esc@g.us', 'a < b'));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('&lt;'), 'less-than should be HTML-escaped');
    assert.ok(!calls[0]!.text.includes(' < '), 'raw < should not appear in forwarded text');
  });

  it('escapes & and > in body', async () => {
    createListener(db, { ...BASE, channelId: 'esc2@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('esc2@g.us', 'a & b > c'));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('&amp;'), '& should be HTML-escaped');
    assert.ok(calls[0]!.text.includes('&gt;'), '> should be HTML-escaped');
  });

  it('uses sendMessageFn (not sendMediaFn) when hasMedia is false', async () => {
    createListener(db, { ...BASE, channelId: 'nomedia@g.us', keywords: [] });
    const { fn: sendFn, calls: sendCalls } = makeSend();
    const mediaCalls: unknown[] = [];
    const sendMediaFn = mock.fn(async () => { mediaCalls.push(1); });
    const h = createMessageHandler(db, sendFn as any, sendMediaFn as any);
    h(makeMsg('nomedia@g.us', 'text only', { hasMedia: false }));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(sendCalls.length, 1, 'sendMessageFn should be called once');
    assert.equal(mediaCalls.length, 0, 'sendMediaFn should NOT be called when hasMedia is false');
  });

  it('calls sendMessageFn even when hasMedia is true and sendMediaFn is not provided', async () => {
    createListener(db, { ...BASE, channelId: 'nomediafn@g.us', keywords: [] });
    const { fn: sendFn, calls: sendCalls } = makeSend();
    const downloadMedia = mock.fn(async () => ({
      data: Buffer.from('fake').toString('base64'),
      mimetype: 'image/jpeg',
    }));
    const h = createMessageHandler(db, sendFn as any); // no sendMediaFn
    h(makeMsg('nomediafn@g.us', 'caption text', { hasMedia: true, downloadMedia: downloadMedia as any }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(sendCalls.length, 1, 'sendMessageFn should be called as fallback when sendMediaFn is absent');
    assert.equal(downloadMedia.mock.calls.length, 0, 'downloadMedia should not be called when sendMediaFn is absent');
  });

  it('calls sendMediaFn when hasMedia is true and sendMediaFn is provided', async () => {
    createListener(db, { ...BASE, channelId: 'hasmedia@g.us', keywords: [] });
    const { fn: sendFn, calls: sendCalls } = makeSend();
    const mediaCalls: Array<{ buffer: Buffer; mimetype: string; caption: string }> = [];
    const sendMediaFn = mock.fn(async (_chatId: string, buffer: Buffer, mimetype: string, caption: string) => {
      mediaCalls.push({ buffer, mimetype, caption });
    });
    const fakeData = Buffer.from('fake-image').toString('base64');
    const downloadMedia = mock.fn(async () => ({ data: fakeData, mimetype: 'image/jpeg' }));
    const h = createMessageHandler(db, sendFn as any, sendMediaFn as any);
    h(makeMsg('hasmedia@g.us', 'photo caption', { hasMedia: true, downloadMedia: downloadMedia as any }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(mediaCalls.length, 1, 'sendMediaFn should be called for media messages');
    assert.equal(sendCalls.length, 0, 'sendMessageFn should NOT be called when sendMediaFn succeeds');
    assert.equal(mediaCalls[0]!.mimetype, 'image/jpeg');
    assert.ok(mediaCalls[0]!.caption.includes('photo caption'));
  });

  it('caption uses HTML bold for channel name', async () => {
    createListener(db, { ...BASE, channelName: 'TestChannel', channelId: 'html@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h(makeMsg('html@g.us', 'body'));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.includes('<b>TestChannel</b>'), 'channel name should be wrapped in HTML bold');
  });
});
