import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createOperationsRouter } from '../../../dashboard/routes/operations.js';

let db: Database.Database;
let app: express.Express;
const mockBot = { api: { sendMessage: async () => ({}) } };

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/operations', createOperationsRouter(db, mockBot as any));
});

after(() => db.close());

describe('GET /api/operations/queue', () => {
  it('returns stats object with pending count', async () => {
    const res = await request(app).get('/api/operations/queue');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.pending, 'number');
    assert.equal(typeof res.body.rateLimited, 'boolean');
  });
});

describe('GET /api/operations/alert-window', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/operations/alert-window');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('DELETE /api/operations/alert-window/:type', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM alert_window').run();
    db.prepare(`INSERT INTO alert_window (alert_type, message_id, chat_id, alert_json, sent_at, has_photo) VALUES ('missiles', 1, '123', '{}', ${Date.now()}, 0)`).run();
  });

  it('removes a specific alert window', async () => {
    const res = await request(app).delete('/api/operations/alert-window/missiles');
    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT * FROM alert_window WHERE alert_type = ?').get('missiles'), undefined);
  });
});

describe('POST /api/operations/broadcast', () => {
  it('rejects empty text', async () => {
    const res = await request(app).post('/api/operations/broadcast').send({ text: '' });
    assert.equal(res.status, 400);
  });

  it('sends to provided chatIds', async () => {
    const res = await request(app).post('/api/operations/broadcast').send({ text: 'שלום', chatIds: [111, 222] });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
  });
});
