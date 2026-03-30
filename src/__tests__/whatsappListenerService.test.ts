import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { createListener } from '../db/whatsappListenerRepository.js';
import { createMessageHandler } from '../whatsapp/whatsappListenerService.js';

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
    h('unknown@g.us', 'hello');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('forwards all messages when keywords is empty', async () => {
    createListener(db, { ...BASE, channelId: 'all@g.us', keywords: [] });
    const { fn, calls } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('all@g.us', 'any text');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.text.includes('any text'));
  });

  it('forwards when message contains a keyword', async () => {
    createListener(db, { ...BASE, channelId: 'kw@g.us', keywords: ['ירי'] });
    const { fn, calls } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('kw@g.us', 'יש ירי באזור');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  });

  it('does NOT forward when no keyword matches', async () => {
    createListener(db, { ...BASE, channelId: 'nm@g.us', keywords: ['רקטה'] });
    const { fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('nm@g.us', 'הכל שקט');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('passes telegram_topic_id as threadId', async () => {
    createListener(db, { ...BASE, channelId: 'tp@g.us', keywords: [], telegramTopicId: 42 });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('tp@g.us', 'msg');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(calls[0]!.threadId, 42);
  });

  it('skips inactive listeners', async () => {
    createListener(db, { ...BASE, channelId: 'off@g.us', keywords: [], isActive: false });
    const { fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('off@g.us', 'msg');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fn.mock.calls.length, 0);
  });

  it('does not throw when sendFn rejects', async () => {
    createListener(db, { ...BASE, channelId: 'err@g.us', keywords: [] });
    const throwFn = mock.fn(async () => { throw new Error('TG down'); });
    const h = createMessageHandler(db, throwFn as any);
    assert.doesNotThrow(() => h('err@g.us', 'msg'));
    await new Promise(r => setTimeout(r, 10));
  });

  it('truncates message body to 3900 chars', async () => {
    createListener(db, { ...BASE, channelId: 'long@g.us', keywords: [] });
    const { calls, fn } = makeSend();
    const h = createMessageHandler(db, fn as any);
    h('long@g.us', 'א'.repeat(5000));
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls[0]!.text.length <= 4096);
  });
});
