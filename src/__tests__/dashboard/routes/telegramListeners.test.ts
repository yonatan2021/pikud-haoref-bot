import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import {
  createListener,
  upsertKnownChat,
  upsertKnownTopic,
} from '../../../db/telegramListenerRepository.js';
import {
  createTelegramListenerRouter,
  type TelegramClientDeps,
} from '../../../dashboard/routes/telegramListeners.js';

// ─── Mock bot ─────────────────────────────────────────────────────────────────

const mockBot = {
  api: { raw: { getForumTopics: async () => ({ topics: [] }) } },
};

// ─── Mock client deps ─────────────────────────────────────────────────────────

let mockStatus: string = 'disconnected';
let mockPhone: string | null = null;
let startPhoneAuthCalled = false;
let lastPhoneArg: string | null = null;
let submitCodeCalled = false;
let submitPasswordCalled = false;
let disconnectCalled = false;
let refreshChatsCalled = false;
let startPhoneAuthShouldThrow: string | null = null;
let submitCodeShouldThrow: string | null = null;
let submitPasswordShouldThrow: string | null = null;
let refreshChatsCount = 0;

const mockClientDeps: TelegramClientDeps = {
  getStatus: () => mockStatus as any,
  getPhone: () => mockPhone,
  startPhoneAuth: async (_db, phone) => {
    startPhoneAuthCalled = true;
    lastPhoneArg = phone;
    if (startPhoneAuthShouldThrow) throw new Error(startPhoneAuthShouldThrow);
    return { phoneCodeHash: 'test-hash-123' };
  },
  submitCode: async (_db, _code, _hash) => {
    submitCodeCalled = true;
    if (submitCodeShouldThrow) throw new Error(submitCodeShouldThrow);
  },
  submitPassword: async (_db, _password) => {
    submitPasswordCalled = true;
    if (submitPasswordShouldThrow) throw new Error(submitPasswordShouldThrow);
  },
  disconnect: async (_db) => {
    disconnectCalled = true;
    mockStatus = 'disconnected';
    mockPhone = null;
  },
  refreshKnownChats: async (_db) => {
    refreshChatsCalled = true;
    refreshChatsCount++;
  },
};

// ─── Test setup ───────────────────────────────────────────────────────────────

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/telegram', createTelegramListenerRouter(db, mockBot as any, mockClientDeps));
});

after(() => db.close());

beforeEach(() => {
  mockStatus = 'disconnected';
  mockPhone = null;
  startPhoneAuthCalled = false;
  lastPhoneArg = null;
  submitCodeCalled = false;
  submitPasswordCalled = false;
  disconnectCalled = false;
  refreshChatsCalled = false;
  refreshChatsCount = 0;
  startPhoneAuthShouldThrow = null;
  submitCodeShouldThrow = null;
  submitPasswordShouldThrow = null;
  db.prepare('DELETE FROM telegram_listeners').run();
  db.prepare('DELETE FROM telegram_known_chats').run();
});

// ─── Base fixture ─────────────────────────────────────────────────────────────

const BASE = {
  chatId: '-100test',
  chatName: 'Test Channel',
  chatType: 'channel',
  keywords: [] as string[],
  telegramTopicId: null,
  telegramTopicName: null,
  forwardToWhatsApp: false,
  isActive: true,
  sourceTopicId: null as number | null,
};

// ─── GET /api/telegram/status ─────────────────────────────────────────────────

describe('GET /api/telegram/status', () => {
  it('returns { status: "disconnected", phone: null } by default', async () => {
    const res = await request(app).get('/api/telegram/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'disconnected');
    assert.equal(res.body.phone, null);
  });

  it('returns connected status and phone when connected', async () => {
    mockStatus = 'connected';
    mockPhone = '+972501234567';
    const res = await request(app).get('/api/telegram/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'connected');
    assert.equal(res.body.phone, '+972501234567');
  });

  it('returns awaiting_code status', async () => {
    mockStatus = 'awaiting_code';
    const res = await request(app).get('/api/telegram/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'awaiting_code');
  });

  it('returns awaiting_password status', async () => {
    mockStatus = 'awaiting_password';
    const res = await request(app).get('/api/telegram/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'awaiting_password');
  });

  it('returns connecting status', async () => {
    mockStatus = 'connecting';
    const res = await request(app).get('/api/telegram/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'connecting');
  });
});

// ─── POST /api/telegram/connect ───────────────────────────────────────────────

describe('POST /api/telegram/connect', () => {
  it('calls startPhoneAuth with phone and returns phoneCodeHash', async () => {
    const res = await request(app).post('/api/telegram/connect').send({ phone: '+972501234567' });
    assert.equal(res.status, 200);
    assert.equal(res.body.phoneCodeHash, 'test-hash-123');
    assert.equal(startPhoneAuthCalled, true);
    assert.equal(lastPhoneArg, '+972501234567');
  });

  it('returns 400 when phone is missing', async () => {
    const res = await request(app).post('/api/telegram/connect').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when phone is empty string', async () => {
    const res = await request(app).post('/api/telegram/connect').send({ phone: '   ' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 500 when startPhoneAuth throws', async () => {
    startPhoneAuthShouldThrow = 'PHONE_NUMBER_INVALID';
    const res = await request(app).post('/api/telegram/connect').send({ phone: '+000' });
    assert.equal(res.status, 500);
    assert.ok(res.body.error); // generic error — raw GramJS message not exposed to client
  });
});

// ─── POST /api/telegram/verify ────────────────────────────────────────────────

describe('POST /api/telegram/verify', () => {
  it('calls submitCode and returns { ok: true } on success', async () => {
    const res = await request(app).post('/api/telegram/verify').send({ code: '12345', phoneCodeHash: 'abc123' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(submitCodeCalled, true);
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(app).post('/api/telegram/verify').send({ phoneCodeHash: 'abc' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when phoneCodeHash is missing', async () => {
    const res = await request(app).post('/api/telegram/verify').send({ code: '12345' });
    assert.equal(res.status, 400);
  });

  it('returns 400 { error: "SESSION_PASSWORD_NEEDED" } when 2FA is required', async () => {
    submitCodeShouldThrow = 'SESSION_PASSWORD_NEEDED';
    const res = await request(app).post('/api/telegram/verify').send({ code: '12345', phoneCodeHash: 'abc' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'SESSION_PASSWORD_NEEDED');
  });

  it('returns 500 on other errors from submitCode', async () => {
    submitCodeShouldThrow = 'NETWORK_ERROR';
    const res = await request(app).post('/api/telegram/verify').send({ code: '12345', phoneCodeHash: 'abc' });
    assert.equal(res.status, 500);
    assert.ok(res.body.error); // generic error — raw GramJS message not exposed to client
  });
});

// ─── POST /api/telegram/verify-password ──────────────────────────────────────

describe('POST /api/telegram/verify-password', () => {
  it('calls submitPassword and returns { ok: true }', async () => {
    const res = await request(app).post('/api/telegram/verify-password').send({ password: 'secret' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(submitPasswordCalled, true);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/telegram/verify-password').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 500 when submitPassword throws', async () => {
    submitPasswordShouldThrow = 'PASSWORD_HASH_INVALID';
    const res = await request(app).post('/api/telegram/verify-password').send({ password: 'wrong' });
    assert.equal(res.status, 500);
    assert.ok(res.body.error); // generic error — raw GramJS message not exposed to client
  });
});

// ─── POST /api/telegram/disconnect ───────────────────────────────────────────

describe('POST /api/telegram/disconnect', () => {
  it('calls disconnect and returns { ok: true }', async () => {
    mockStatus = 'connected';
    const res = await request(app).post('/api/telegram/disconnect');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(disconnectCalled, true);
  });
});

// ─── GET /api/telegram/chats ─────────────────────────────────────────────────

describe('GET /api/telegram/chats', () => {
  it('returns empty array when no known chats', async () => {
    const res = await request(app).get('/api/telegram/chats');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns known chats from DB', async () => {
    upsertKnownChat(db, { chatId: '-100abc', chatName: 'Test Group', chatType: 'group', isForum: false });
    const res = await request(app).get('/api/telegram/chats');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].chatId, '-100abc');
    assert.equal(res.body[0].chatName, 'Test Group');
    assert.equal(res.body[0].chatType, 'group');
    assert.equal(res.body[0].isForum, false);
  });

  it('marks forum groups with isForum=true', async () => {
    upsertKnownChat(db, { chatId: '-100forum', chatName: 'Forum Group', chatType: 'supergroup', isForum: true });
    const res = await request(app).get('/api/telegram/chats');
    assert.equal(res.status, 200);
    assert.equal(res.body[0].isForum, true);
  });
});

// ─── GET /api/telegram/listeners ─────────────────────────────────────────────

describe('GET /api/telegram/listeners', () => {
  it('returns empty array when no listeners', async () => {
    const res = await request(app).get('/api/telegram/listeners');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns all listeners', async () => {
    createListener(db, BASE);
    const res = await request(app).get('/api/telegram/listeners');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].chatId, '-100test');
  });
});

// ─── POST /api/telegram/listeners ────────────────────────────────────────────

describe('POST /api/telegram/listeners', () => {
  it('creates a new listener and returns 201', async () => {
    const res = await request(app).post('/api/telegram/listeners').send(BASE);
    assert.equal(res.status, 201);
    assert.equal(res.body.chatId, '-100test');
    assert.equal(res.body.chatName, 'Test Channel');
    assert.equal(res.body.forwardToWhatsApp, false);
    assert.equal(res.body.isActive, true);
    assert.ok(res.body.id > 0);
  });

  it('returns 400 on missing chatId', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ chatName: 'X', chatType: 'group' });
    assert.equal(res.status, 400);
  });

  it('returns 400 on missing chatName', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ chatId: '-100x', chatType: 'group' });
    assert.equal(res.status, 400);
  });

  it('returns 400 on invalid chatType', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, chatType: 'dm' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when keywords is not an array of strings', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, keywords: 'bad' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when isActive is not boolean', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, isActive: 'yes' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when forwardToWhatsApp is not boolean', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, forwardToWhatsApp: 1 });
    assert.equal(res.status, 400);
  });

  it('returns 409 on duplicate chatId', async () => {
    createListener(db, BASE);
    const res = await request(app).post('/api/telegram/listeners').send(BASE);
    assert.equal(res.status, 409);
  });

  it('stores forwardToWhatsApp=true correctly', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, chatId: '-100wa', forwardToWhatsApp: true });
    assert.equal(res.status, 201);
    assert.equal(res.body.forwardToWhatsApp, true);
  });

  it('accepts supergroup as valid chatType', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, chatId: '-100sg', chatType: 'supergroup' });
    assert.equal(res.status, 201);
    assert.equal(res.body.chatType, 'supergroup');
  });

  it('stores sourceTopicId when provided', async () => {
    const res = await request(app).post('/api/telegram/listeners').send({ ...BASE, chatId: '-100stopic', sourceTopicId: 42 });
    assert.equal(res.status, 201);
    assert.equal(res.body.sourceTopicId, 42);
  });

  it('defaults sourceTopicId to null when omitted', async () => {
    const res = await request(app).post('/api/telegram/listeners').send(BASE);
    assert.equal(res.status, 201);
    assert.equal(res.body.sourceTopicId, null);
  });
});

// ─── PATCH /api/telegram/listeners/:id ───────────────────────────────────────

describe('PATCH /api/telegram/listeners/:id', () => {
  it('updates an existing listener and returns 200', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ chatName: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.chatName, 'Updated');
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).patch('/api/telegram/listeners/9999').send({ chatName: 'X' });
    assert.equal(res.status, 404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).patch('/api/telegram/listeners/abc').send({ chatName: 'X' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when isActive is not boolean', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ isActive: 'yes' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when chatType is invalid', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ chatType: 'dm' });
    assert.equal(res.status, 400);
  });

  it('updates forwardToWhatsApp correctly', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ forwardToWhatsApp: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.forwardToWhatsApp, true);
  });

  it('partial update leaves other fields unchanged', async () => {
    const c = createListener(db, { ...BASE, keywords: ['test'] });
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ isActive: false });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.keywords, ['test']);
    assert.equal(res.body.isActive, false);
  });

  it('updates sourceTopicId', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ sourceTopicId: 77 });
    assert.equal(res.status, 200);
    assert.equal(res.body.sourceTopicId, 77);
  });

  it('clears sourceTopicId to null', async () => {
    const c = createListener(db, { ...BASE, chatId: '-100clr', sourceTopicId: 5 });
    const res = await request(app).patch(`/api/telegram/listeners/${c.id}`).send({ sourceTopicId: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.sourceTopicId, null);
  });
});

// ─── DELETE /api/telegram/listeners/:id ──────────────────────────────────────

describe('DELETE /api/telegram/listeners/:id', () => {
  it('deletes an existing listener and returns { ok: true }', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).delete(`/api/telegram/listeners/${c.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const listRes = await request(app).get('/api/telegram/listeners');
    assert.equal(listRes.body.length, 0);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).delete('/api/telegram/listeners/9999');
    assert.equal(res.status, 404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).delete('/api/telegram/listeners/abc');
    assert.equal(res.status, 400);
  });
});

// ─── GET /api/telegram/listeners/telegram-topics ─────────────────────────────

describe('GET /api/telegram/listeners/telegram-topics', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const TOPIC_ENV_KEYS = [
    'TELEGRAM_CHAT_ID', 'TELEGRAM_FORWARD_GROUP_ID',
    'TELEGRAM_TOPIC_ID_SECURITY', 'TELEGRAM_TOPIC_ID_WHATSAPP',
  ];

  before(() => { for (const k of TOPIC_ENV_KEYS) savedEnv[k] = process.env[k]; });
  after(() => {
    for (const k of TOPIC_ENV_KEYS) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
      else delete process.env[k];
    }
  });
  beforeEach(() => { for (const k of TOPIC_ENV_KEYS) delete process.env[k]; });

  it('returns empty array when no chat ID and no env topics', async () => {
    const res = await request(app).get('/api/telegram/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns env-configured topics when bot returns no live topics', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_SECURITY'] = '42';
    const res = await request(app).get('/api/telegram/listeners/telegram-topics');
    assert.equal(res.status, 200);
    const secTopic = res.body.find((t: { id: number }) => t.id === 42);
    assert.ok(secTopic, 'should include env-configured security topic');
    assert.ok(secTopic.name.includes('ביטחוני'));
  });

  it('skips topic ID 1 (reserved in Telegram)', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_SECURITY'] = '1';
    const res = await request(app).get('/api/telegram/listeners/telegram-topics');
    assert.equal(res.status, 200);
    const bad = res.body.find((t: { id: number }) => t.id === 1);
    assert.equal(bad, undefined);
  });

  it('returns TG news/updates topic when TELEGRAM_TOPIC_ID_WHATSAPP is set', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_WHATSAPP'] = '77';
    const res = await request(app).get('/api/telegram/listeners/telegram-topics');
    assert.equal(res.status, 200);
    const topic = res.body.find((t: { id: number }) => t.id === 77);
    assert.ok(topic);
    assert.ok(topic.name.includes('עדכונים'));
  });
});

// ─── POST /api/telegram/refresh-chats ────────────────────────────────────────

describe('POST /api/telegram/refresh-chats', () => {
  it('calls refreshKnownChats and returns count', async () => {
    upsertKnownChat(db, { chatId: '-100a', chatName: 'Group A', chatType: 'group', isForum: false });
    upsertKnownChat(db, { chatId: '-100b', chatName: 'Group B', chatType: 'supergroup', isForum: true });
    const res = await request(app).post('/api/telegram/refresh-chats');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.count, 2);
    assert.equal(refreshChatsCalled, true);
  });

  it('returns count of 0 when no chats after refresh', async () => {
    const res = await request(app).post('/api/telegram/refresh-chats');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.count, 0);
    assert.equal(refreshChatsCalled, true);
  });
});

// ─── GET /api/telegram/chats/:chatId/topics ───────────────────────────────────

describe('GET /api/telegram/chats/:chatId/topics', () => {
  beforeEach(() => {
    upsertKnownChat(db, { chatId: '-100forum', chatName: 'Forum Group', chatType: 'supergroup', isForum: true });
  });

  it('returns topics for a forum chat', async () => {
    upsertKnownTopic(db, { topicId: 1, chatId: '-100forum', topicName: 'כללי' });
    upsertKnownTopic(db, { topicId: 2, chatId: '-100forum', topicName: 'חדשות' });
    const res = await request(app).get('/api/telegram/chats/-100forum/topics');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.ok(res.body.some((t: { topicId: number }) => t.topicId === 1));
    assert.ok(res.body.some((t: { topicId: number }) => t.topicId === 2));
  });

  it('returns empty array for chat with no topics', async () => {
    const res = await request(app).get('/api/telegram/chats/-100forum/topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns empty array for unknown chatId', async () => {
    const res = await request(app).get('/api/telegram/chats/-100notexist/topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
});
