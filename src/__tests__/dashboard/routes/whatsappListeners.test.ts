import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createListener } from '../../../db/whatsappListenerRepository.js';
import { createListenersRouter } from '../../../dashboard/routes/whatsappListeners.js';

const mockBot = {
  api: { raw: { getForumTopics: async () => ({ topics: [] }) } },
};

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/whatsapp/listeners', createListenersRouter(db, mockBot as any));
});
after(() => db.close());
beforeEach(() => { db.prepare('DELETE FROM whatsapp_listeners').run(); });

const BASE = { channelId: 'ch@g.us', channelName: 'Ch', channelType: 'group', keywords: [], telegramTopicId: null, telegramTopicName: null, isActive: true };

describe('GET /api/whatsapp/listeners', () => {
  it('returns empty array when no listeners', async () => {
    const res = await request(app).get('/api/whatsapp/listeners');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns all listeners', async () => {
    createListener(db, BASE);
    const res = await request(app).get('/api/whatsapp/listeners');
    assert.equal(res.body.length, 1);
  });
});

describe('POST /api/whatsapp/listeners', () => {
  it('creates a new listener and returns 201', async () => {
    const res = await request(app).post('/api/whatsapp/listeners').send(BASE);
    assert.equal(res.status, 201);
    assert.equal(res.body.channelId, 'ch@g.us');
  });

  it('returns 400 on missing channelId', async () => {
    const res = await request(app).post('/api/whatsapp/listeners').send({ channelName: 'X' });
    assert.equal(res.status, 400);
  });

  it('returns 400 on missing channelName', async () => {
    const res = await request(app).post('/api/whatsapp/listeners').send({ channelId: 'x@g.us' });
    assert.equal(res.status, 400);
  });

  it('returns 400 on invalid channelType', async () => {
    const res = await request(app).post('/api/whatsapp/listeners').send({ ...BASE, channelType: 'dm' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when keywords is not an array of strings', async () => {
    const res = await request(app).post('/api/whatsapp/listeners').send({ ...BASE, keywords: 'bad' });
    assert.equal(res.status, 400);
  });

  it('returns 409 on duplicate channelId', async () => {
    createListener(db, BASE);
    const res = await request(app).post('/api/whatsapp/listeners').send(BASE);
    assert.equal(res.status, 409);
  });
});

describe('PATCH /api/whatsapp/listeners/:id', () => {
  it('updates an existing listener', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/whatsapp/listeners/${c.id}`).send({ channelName: 'New' });
    assert.equal(res.status, 200);
    assert.equal(res.body.channelName, 'New');
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).patch('/api/whatsapp/listeners/9999').send({ channelName: 'X' });
    assert.equal(res.status, 404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).patch('/api/whatsapp/listeners/abc').send({ channelName: 'X' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when isActive is not boolean', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).patch(`/api/whatsapp/listeners/${c.id}`).send({ isActive: 'yes' });
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/whatsapp/listeners/:id', () => {
  it('deletes an existing listener', async () => {
    const c = createListener(db, BASE);
    const res = await request(app).delete(`/api/whatsapp/listeners/${c.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).delete('/api/whatsapp/listeners/9999');
    assert.equal(res.status, 404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).delete('/api/whatsapp/listeners/abc');
    assert.equal(res.status, 400);
  });
});

describe('GET /api/whatsapp/listeners/telegram-topics', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const TOPIC_ENV_KEYS = [
    'TELEGRAM_CHAT_ID', 'TELEGRAM_FORWARD_GROUP_ID',
    'TELEGRAM_TOPIC_ID_SECURITY', 'TELEGRAM_TOPIC_ID_NATURE',
    'TELEGRAM_TOPIC_ID_ENVIRONMENTAL', 'TELEGRAM_TOPIC_ID_DRILLS',
    'TELEGRAM_TOPIC_ID_GENERAL', 'TELEGRAM_TOPIC_ID_WHATSAPP',
  ];

  before(() => { for (const k of TOPIC_ENV_KEYS) savedEnv[k] = process.env[k]; });
  after(() => { for (const k of TOPIC_ENV_KEYS) { if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]; else delete process.env[k]; } });
  beforeEach(() => { for (const k of TOPIC_ENV_KEYS) delete process.env[k]; });

  it('returns empty array when no chat ID and no env topics', async () => {
    const res = await request(app).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns env-configured topics when bot returns no live topics', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_SECURITY'] = '42';
    const res = await request(app).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
    const secTopic = res.body.find((t: { id: number }) => t.id === 42);
    assert.ok(secTopic, 'should include env-configured security topic');
    assert.ok(secTopic.name.includes('ביטחוני'), 'name should be Hebrew label');
  });

  it('skips topic ID 1 (invalid in Telegram)', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_SECURITY'] = '1';
    const res = await request(app).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    const bad = res.body.find((t: { id: number }) => t.id === 1);
    assert.equal(bad, undefined, 'topic ID 1 should be filtered out');
  });

  it('returns env topics when bot throws (group is not a forum)', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_DRILLS'] = '99';
    const throwingBot = {
      api: { raw: { getForumTopics: async () => { throw new Error('FORUM_CHAT_NOT_FOUND'); } } },
    };
    const throwingApp = express();
    throwingApp.use(express.json());
    throwingApp.use('/api/whatsapp/listeners', createListenersRouter(db, throwingBot as any));
    const res = await request(throwingApp).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.find((t: { id: number }) => t.id === 99));
  });

  it('does not duplicate topics already present from live API', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    process.env['TELEGRAM_TOPIC_ID_SECURITY'] = '42';
    // Mock bot returns topic with same ID 42
    const liveBot = {
      api: { raw: { getForumTopics: async () => ({ topics: [{ message_thread_id: 42, name: 'Live Security' }] }) } },
    };
    const liveApp = express();
    liveApp.use(express.json());
    liveApp.use('/api/whatsapp/listeners', createListenersRouter(db, liveBot as any));
    const res = await request(liveApp).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    const matching = res.body.filter((t: { id: number }) => t.id === 42);
    assert.equal(matching.length, 1, 'should not duplicate topic ID 42');
    assert.equal(matching[0].name, 'Live Security', 'live API name should take precedence');
  });
});
