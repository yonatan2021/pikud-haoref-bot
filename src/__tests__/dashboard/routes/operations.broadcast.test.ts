// Regression tests for POST /api/operations/broadcast partial-failure path.
//
// Context: the broadcast endpoint fires-and-forgets a background loop that
// iterates over every target chatId and calls bot.api.sendMessage with a
// per-chat try/catch. A Telegram 403 ("bot was blocked") or 429
// ("Too Many Requests") for one user must NOT abort the loop for the
// remaining users. The existing operations.test.ts happy-path tests did
// not exercise this — these tests lock it down.
//
// The HTTP response is `res.json({ queued: N })` immediately, so we have
// to flush microtasks / await the background loop before asserting the
// mock bot call log.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createOperationsRouter, broadcastLimiter } from '../../../dashboard/routes/operations.js';

interface CallLogEntry {
  chatId: number;
  text: string;
  error?: Error;
}

let db: Database.Database;
let app: express.Express;
const sendLog: CallLogEntry[] = [];

// Mock bot: records every sendMessage call and throws for chatIds that
// the current test has opted into failing. Reset inside `beforeEach`.
const failingChatIds = new Map<number, Error>();

const mockBot = {
  api: {
    sendMessage: async (chatId: number, text: string) => {
      const err = failingChatIds.get(chatId);
      sendLog.push({ chatId, text, error: err });
      if (err) throw err;
      return {};
    },
  },
};

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/operations', createOperationsRouter(db, mockBot as unknown as Parameters<typeof createOperationsRouter>[1]));
});

after(() => db.close());

beforeEach(() => {
  sendLog.length = 0;
  failingChatIds.clear();
  broadcastLimiter.clearStore();
});

// Wait just long enough for the background send loop to drain. Each
// iteration awaits a resolved/rejected promise, so a single macrotask
// tick is enough for a short chatId list.
async function flushBackground(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 25));
}

describe('POST /api/operations/broadcast — partial-failure path', () => {
  it('continues sending after a 403 bot-blocked error on one chatId', async () => {
    failingChatIds.set(222, Object.assign(new Error('Forbidden: bot was blocked by the user'), { error_code: 403 }));

    const res = await request(app)
      .post('/api/operations/broadcast')
      .send({ text: 'שלום', chatIds: [111, 222, 333] });

    assert.equal(res.status, 200);
    assert.equal(res.body.queued, 3, 'responds immediately with all queued');

    await flushBackground();

    const attempted = sendLog.map(e => e.chatId).sort((a, b) => a - b);
    assert.deepEqual(
      attempted,
      [111, 222, 333],
      'every chatId must be attempted even though 222 throws'
    );
    const failed = sendLog.filter(e => e.error).map(e => e.chatId);
    assert.deepEqual(failed, [222], 'only 222 should be recorded as failed');
  });

  it('continues sending after a 429 rate-limit error', async () => {
    failingChatIds.set(
      111,
      Object.assign(new Error('Too Many Requests: retry after 5'), {
        error_code: 429,
        parameters: { retry_after: 5 },
      })
    );

    const res = await request(app)
      .post('/api/operations/broadcast')
      .send({ text: 'שלום', chatIds: [111, 222] });

    assert.equal(res.status, 200);
    await flushBackground();

    const attempted = sendLog.map(e => e.chatId);
    assert.deepEqual(attempted, [111, 222], 'sequential order preserved, both attempted');
    assert.equal(sendLog[0]!.error?.message.includes('Too Many Requests'), true);
    assert.equal(sendLog[1]!.error, undefined, '222 must succeed');
  });

  it('a single failure in a long list does not abort the remaining sends', async () => {
    // 10 recipients, 5th throws — all 10 must still be attempted.
    const chatIds = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010];
    failingChatIds.set(1005, new Error('Forbidden: user is deactivated'));

    const res = await request(app)
      .post('/api/operations/broadcast')
      .send({ text: 'שלום', chatIds });

    assert.equal(res.body.queued, 10);
    await flushBackground();

    const attempted = sendLog.map(e => e.chatId);
    assert.deepEqual(
      attempted,
      chatIds,
      'all 10 chatIds must be attempted in order despite the mid-loop failure'
    );
  });

  it('returns 200 even when every recipient fails — loop survives total failure', async () => {
    // All 3 chatIds throw — the endpoint must still return { queued: 3 }
    // and the background loop must attempt every one of them.
    //
    // NB: we deliberately don't assert on sendLog.length BEFORE flushing.
    // With a synchronous mock, the background loop drains on the same
    // macrotask as supertest's response callback, so there's no reliable
    // "before" observation point. The important behavior — every chatId
    // gets attempted — is asserted post-flush.
    const chatIds = [2001, 2002, 2003];
    for (const id of chatIds) {
      failingChatIds.set(id, new Error('simulated failure'));
    }

    const res = await request(app)
      .post('/api/operations/broadcast')
      .send({ text: 'שלום', chatIds });

    assert.equal(res.status, 200, 'endpoint returns 200 even when all sends will fail');
    assert.equal(res.body.queued, 3);

    await flushBackground();
    assert.equal(sendLog.length, 3, 'all 3 sends must have been attempted');
    assert.equal(
      sendLog.every(e => e.error),
      true,
      'every send must have recorded its rejection'
    );
    assert.deepEqual(
      sendLog.map(e => e.chatId),
      chatIds,
      'loop visits every chatId in order'
    );
  });
});
