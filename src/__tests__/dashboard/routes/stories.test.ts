import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createStoriesRouter, storiesLimiter } from '../../../dashboard/routes/stories.js';
import { createSessionStore } from '../../../dashboard/auth.js';
import type { Bot } from 'grammy';

// ── Helpers ───────────────────────────────────────────────────────────────────

let db: Database.Database;
let appNoAuth: express.Express;   // router mounted directly (no auth — for most tests)
let appWithAuth: express.Express; // router behind real auth middleware (for 401 test)

const mockBot = {
  api: { sendMessage: async () => ({ message_id: 42 }) },
} as unknown as Bot;

const AUTH_SECRET = 'test-secret-stories';
const CHAT_ID = 77001;

before(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  db.prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)').run(CHAT_ID);
  db.prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('topic_id_stories', '500', 0)").run();
  process.env['TELEGRAM_CHAT_ID'] = '-100999999';

  // App without auth — tests that verify business logic
  appNoAuth = express();
  appNoAuth.use(express.json());
  appNoAuth.use('/api/stories', createStoriesRouter(db, mockBot));

  // App with auth middleware — tests that verify 401 behavior
  const { authMiddleware } = createSessionStore(db, AUTH_SECRET);
  appWithAuth = express();
  appWithAuth.use(cookieParser());
  appWithAuth.use(express.json());
  appWithAuth.use('/api/stories', authMiddleware, createStoriesRouter(db, mockBot));
});

after(() => db.close());

beforeEach(() => {
  storiesLimiter.clearStore();
  db.prepare('DELETE FROM shelter_stories').run();
  db.prepare("DELETE FROM settings WHERE key = 'topic_id_stories'").run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('topic_id_stories', '500', 0)").run();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/stories', () => {
  it('returns pending stories and counts', async () => {
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'סיפור ראשון');
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'סיפור שני');

    const res = await request(appNoAuth).get('/api/stories?status=pending');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.stories), 'stories should be an array');
    assert.equal(res.body.stories.length, 2);
    assert.ok('counts' in res.body, 'response should include counts');
  });
});

describe('POST /api/stories/:id/approve', () => {
  it('returns 400 when topic_id_stories is unset (0)', async () => {
    db.prepare("DELETE FROM settings WHERE key = 'topic_id_stories'").run();
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'סיפור');
    const row = db.prepare('SELECT id FROM shelter_stories ORDER BY id DESC LIMIT 1').get() as { id: number };

    const res = await request(appNoAuth).post(`/api/stories/${row.id}/approve`).send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('topic_id_stories'), `expected topic error, got: ${JSON.stringify(res.body)}`);
  });

  it('returns 400 when topic_id_stories is 1 (reserved)', async () => {
    db.prepare("DELETE FROM settings WHERE key = 'topic_id_stories'").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('topic_id_stories', '1', 0)").run();
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'סיפור');
    const row = db.prepare('SELECT id FROM shelter_stories ORDER BY id DESC LIMIT 1').get() as { id: number };

    const res = await request(appNoAuth).post(`/api/stories/${row.id}/approve`).send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('topic_id_stories'));
  });

  it('approves story successfully — calls sendMessage and stores messageId', async () => {
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'חוויה אמיתית');
    const row = db.prepare('SELECT id FROM shelter_stories ORDER BY id DESC LIMIT 1').get() as { id: number };

    const res = await request(appNoAuth).post(`/api/stories/${row.id}/approve`).send({});
    assert.equal(res.status, 200, `expected 200, got: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.messageId, 'number');

    const updated = db.prepare('SELECT * FROM shelter_stories WHERE id = ?').get(row.id) as { status: string; published_message_id: number };
    assert.equal(updated.status, 'published');
    assert.equal(updated.published_message_id, 42);
  });

  it('returns 409 when story is already processed', async () => {
    db.prepare('INSERT INTO shelter_stories (chat_id, body, status) VALUES (?,?,?)').run(CHAT_ID, 'נדחה', 'rejected');
    const row = db.prepare("SELECT id FROM shelter_stories WHERE status = 'rejected' ORDER BY id DESC LIMIT 1").get() as { id: number };

    const res = await request(appNoAuth).post(`/api/stories/${row.id}/approve`).send({});
    assert.equal(res.status, 409);
  });
});

describe('POST /api/stories/:id/reject', () => {
  it('rejects story successfully', async () => {
    db.prepare('INSERT INTO shelter_stories (chat_id, body) VALUES (?,?)').run(CHAT_ID, 'לדחות');
    const row = db.prepare('SELECT id FROM shelter_stories ORDER BY id DESC LIMIT 1').get() as { id: number };

    const res = await request(appNoAuth).post(`/api/stories/${row.id}/reject`).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const updated = db.prepare('SELECT status FROM shelter_stories WHERE id = ?').get(row.id) as { status: string };
    assert.equal(updated.status, 'rejected');
  });
});

describe('Rate limiter', () => {
  it('storiesLimiter.clearStore() resets between tests', async () => {
    // clearStore is called in beforeEach — subsequent requests should pass
    const res = await request(appNoAuth).get('/api/stories');
    assert.ok(res.status !== 429, 'should not be rate limited after clearStore');
  });
});

describe('Auth guard', () => {
  it('returns 401 without a valid session cookie', async () => {
    const res = await request(appWithAuth).get('/api/stories');
    assert.equal(res.status, 401);
  });
});
