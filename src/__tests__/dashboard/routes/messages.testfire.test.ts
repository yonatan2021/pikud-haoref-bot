// Regression tests for POST /api/messages/test-fire platform handling.
//
// Context: src/dashboard/routes/messages.ts:317-427 accepts a `platform`
// field in the body ('telegram' | 'whatsapp' | 'both', default 'telegram')
// and routes the test send accordingly. The existing messages.test.ts
// covers template CRUD + history + rollback but NOT this endpoint. These
// tests lock down the branching so a future refactor cannot break the
// graceful-degradation behavior when WhatsApp is unavailable.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema, getDb } from '../../../db/schema.js';
import {
  createMessagesRouter,
  testFireLimiter,
  type WhatsAppDeps,
} from '../../../dashboard/routes/messages.js';
import { loadTemplateCache } from '../../../config/templateCache.js';

interface TelegramSendCall {
  chatId: string | number;
  text: string;
  opts?: unknown;
}

let db: Database.Database;
const telegramSends: TelegramSendCall[] = [];

const mockBot = {
  api: {
    sendMessage: async (chatId: string | number, text: string, opts?: unknown) => {
      telegramSends.push({ chatId, text, opts });
      return { message_id: telegramSends.length };
    },
  },
};

// Per-test state so tests can toggle WhatsApp status/client independently.
let waStatus: 'ready' | 'disconnected' = 'ready';
let waClientPresent = true;
let waEnabledGroups: string[] = ['group-1@g.us'];
const waSendCalls: string[] = [];

const mockWhatsAppDeps: WhatsAppDeps = {
  getStatus: () => waStatus,
  getClient: () =>
    waClientPresent
      ? {
          getChatById: async (id: string) => ({
            sendMessage: async (text: string) => {
              waSendCalls.push(`${id}:${text}`);
              return {};
            },
          }),
        }
      : null,
  getEnabledGroups: () => [...waEnabledGroups],
};

// Two apps — one WITH injected WhatsApp deps, one WITHOUT. That mirrors
// the real wiring in index.ts (WhatsApp is optional).
let appWithWa: express.Express;
let appWithoutWa: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);

  // templateCache uses the global singleton — make sure it exists + is loaded.
  // loadTemplateCache() reads the getDb() singleton internally, no argument.
  initSchema(getDb());
  loadTemplateCache();

  // Seed TELEGRAM_CHAT_ID so the telegram branch can resolve a target.
  db.prepare('INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?, ?, 0)')
    .run('telegram_chat_id', '-100123456789');

  appWithWa = express();
  appWithWa.use(express.json());
  appWithWa.use(
    '/api/messages',
    createMessagesRouter(
      db,
      mockBot as unknown as Parameters<typeof createMessagesRouter>[1],
      mockWhatsAppDeps
    )
  );

  appWithoutWa = express();
  appWithoutWa.use(express.json());
  appWithoutWa.use(
    '/api/messages',
    createMessagesRouter(
      db,
      mockBot as unknown as Parameters<typeof createMessagesRouter>[1]
      // no whatsappDeps
    )
  );
});

after(() => db.close());

beforeEach(() => {
  telegramSends.length = 0;
  waSendCalls.length = 0;
  waStatus = 'ready';
  waClientPresent = true;
  waEnabledGroups = ['group-1@g.us'];
  testFireLimiter.clearStore();
});

describe('POST /api/messages/test-fire — platform handling', () => {
  it('platform=telegram fires only the Telegram send', async () => {
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'telegram' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.telegram, 'number', 'must return telegram message_id');
    assert.equal(telegramSends.length, 1, 'exactly one Telegram send');
    assert.equal(waSendCalls.length, 0, 'must NOT touch WhatsApp when platform=telegram');
  });

  it('platform=whatsapp + no injected WhatsApp deps returns 400', async () => {
    // This is the app constructed without whatsappDeps — the route has
    // no choice but to reject with 400 "WhatsApp לא זמין".
    const res = await request(appWithoutWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'whatsapp' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('WhatsApp'));
    assert.equal(telegramSends.length, 0, 'must NOT send to Telegram on this branch');
    assert.equal(waSendCalls.length, 0);
  });

  it('platform=whatsapp + WhatsApp not ready returns 500 with error', async () => {
    waStatus = 'disconnected';
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'whatsapp' });

    // Route pushes to errors, then: if errors.length > 0 && results empty → 500.
    assert.equal(res.status, 500);
    assert.ok(res.body.error.includes('WhatsApp'), 'error must mention WhatsApp');
    assert.equal(waSendCalls.length, 0);
  });

  it('platform=whatsapp + ready client sends to enabled groups', async () => {
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'whatsapp' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.whatsappGroups, 1);
    assert.equal(waSendCalls.length, 1, 'sends to the one enabled group');
    assert.equal(telegramSends.length, 0, 'must NOT send to Telegram');
  });

  it('platform=both fires both sends', async () => {
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'both' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.telegram, 'number');
    assert.equal(res.body.whatsappGroups, 1);
    assert.equal(telegramSends.length, 1);
    assert.equal(waSendCalls.length, 1);
  });

  it('platform=both + WhatsApp failure does not fail the whole request — returns 200 with warnings', async () => {
    waClientPresent = false; // client === null
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'both' });

    // Telegram succeeded → results.telegram set → final check passes,
    // errors array surfaced as warnings.
    assert.equal(res.status, 200, 'partial failure must NOT cause 500 when at least one path succeeded');
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.telegram, 'number');
    assert.ok(
      Array.isArray(res.body.warnings) && res.body.warnings.length > 0,
      'warnings array must be populated when WA fails'
    );
  });

  it('unknown platform value returns 400', async () => {
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: ['אבו גוש'], platform: 'email' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('platform'));
    assert.equal(telegramSends.length, 0);
    assert.equal(waSendCalls.length, 0);
  });

  it('unknown alertType returns 400 regardless of platform', async () => {
    const res = await request(appWithWa)
      .post('/api/messages/test-fire')
      .send({ alertType: 'notARealType', cities: [], platform: 'telegram' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.equal(telegramSends.length, 0);
  });
});
