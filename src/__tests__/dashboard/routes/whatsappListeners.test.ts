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
  it('returns empty array when bot returns no topics', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    const res = await request(app).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns empty array when bot throws (group is not a forum)', async () => {
    process.env['TELEGRAM_CHAT_ID'] = '-100123';
    const throwingBot = {
      api: { raw: { getForumTopics: async () => { throw new Error('FORUM_CHAT_NOT_FOUND'); } } },
    };
    const throwingApp = express();
    throwingApp.use(express.json());
    throwingApp.use('/api/whatsapp/listeners', createListenersRouter(db, throwingBot as any));
    const res = await request(throwingApp).get('/api/whatsapp/listeners/telegram-topics');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
});
