import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createSubscribersRouter } from '../../../dashboard/routes/subscribers.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/subscribers', createSubscribersRouter(db));
});

beforeEach(() => {
  db.prepare('DELETE FROM subscriptions').run();
  db.prepare('DELETE FROM users').run();
  db.prepare(`INSERT INTO users (chat_id, format, quiet_hours_enabled) VALUES (111, 'short', 0)`).run();
  db.prepare(`INSERT INTO subscriptions (chat_id, city_name) VALUES (111, 'תל אביב')`).run();
  db.prepare(`INSERT INTO subscriptions (chat_id, city_name) VALUES (111, 'רמת גן')`).run();
});

after(() => db.close());

describe('GET /api/subscribers', () => {
  it('returns user list with city_count', async () => {
    const res = await request(app).get('/api/subscribers');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data[0].chat_id, 111);
    assert.equal(res.body.data[0].city_count, 2);
    assert.equal(typeof res.body.total, 'number');
  });

  it('returns profile fields in list', async () => {
    db.prepare("UPDATE users SET display_name = 'יונתן', home_city = 'אבו גוש', onboarding_completed = 1 WHERE chat_id = 111").run();
    const res = await request(app).get('/api/subscribers');
    assert.equal(res.body.data[0].display_name, 'יונתן');
    assert.equal(res.body.data[0].home_city, 'אבו גוש');
    assert.equal(res.body.data[0].onboarding_completed, 1);
    assert.equal(res.body.data[0].locale, 'he');
  });

  it('searches by display_name', async () => {
    db.prepare("UPDATE users SET display_name = 'יונתן' WHERE chat_id = 111").run();
    const res = await request(app).get('/api/subscribers?search=יונתן');
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].chat_id, 111);
  });

  it('searches by home_city', async () => {
    db.prepare("UPDATE users SET home_city = 'אבו גוש' WHERE chat_id = 111").run();
    const res = await request(app).get('/api/subscribers?search=אבו');
    assert.equal(res.body.data.length, 1);
  });
});

describe('GET /api/subscribers/:id', () => {
  it('returns user with cities array', async () => {
    const res = await request(app).get('/api/subscribers/111');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.cities));
    assert.ok(res.body.cities.includes('תל אביב'));
  });

  it('returns 404 for unknown user', async () => {
    const res = await request(app).get('/api/subscribers/999');
    assert.equal(res.status, 404);
  });

  it('returns profile fields in detail', async () => {
    db.prepare("UPDATE users SET display_name = 'דני', home_city = 'אבו גוש', locale = 'he', onboarding_completed = 1 WHERE chat_id = 111").run();
    const res = await request(app).get('/api/subscribers/111');
    assert.equal(res.body.display_name, 'דני');
    assert.equal(res.body.home_city, 'אבו גוש');
    assert.equal(res.body.locale, 'he');
    assert.equal(res.body.onboarding_completed, 1);
  });
});

describe('PATCH /api/subscribers/:id', () => {
  it('updates format', async () => {
    const res = await request(app).patch('/api/subscribers/111').send({ format: 'detailed' });
    assert.equal(res.status, 200);
    const user = db.prepare('SELECT format FROM users WHERE chat_id = 111').get() as { format: string };
    assert.equal(user.format, 'detailed');
  });

  it('updates quiet_hours_enabled', async () => {
    const res = await request(app).patch('/api/subscribers/111').send({ quiet_hours_enabled: true });
    assert.equal(res.status, 200);
    const user = db.prepare('SELECT quiet_hours_enabled FROM users WHERE chat_id = 111').get() as { quiet_hours_enabled: number };
    assert.equal(user.quiet_hours_enabled, 1);
  });

  it('updates display_name', async () => {
    const res = await request(app).patch('/api/subscribers/111').send({ display_name: 'שם חדש' });
    assert.equal(res.status, 200);
    const user = db.prepare('SELECT display_name FROM users WHERE chat_id = 111').get() as { display_name: string };
    assert.equal(user.display_name, 'שם חדש');
  });

  it('updates home_city', async () => {
    const res = await request(app).patch('/api/subscribers/111').send({ home_city: 'אבו גוש' });
    assert.equal(res.status, 200);
    const user = db.prepare('SELECT home_city FROM users WHERE chat_id = 111').get() as { home_city: string };
    assert.equal(user.home_city, 'אבו גוש');
  });

  it('clears display_name with null', async () => {
    db.prepare("UPDATE users SET display_name = 'old' WHERE chat_id = 111").run();
    const res = await request(app).patch('/api/subscribers/111').send({ display_name: null });
    assert.equal(res.status, 200);
    const user = db.prepare('SELECT display_name FROM users WHERE chat_id = 111').get() as { display_name: string | null };
    assert.equal(user.display_name, null);
  });
});

describe('DELETE /api/subscribers/:id', () => {
  it('removes user and cascades subscriptions', async () => {
    const res = await request(app).delete('/api/subscribers/111');
    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT * FROM users WHERE chat_id = 111').get(), undefined);
    assert.equal((db.prepare('SELECT * FROM subscriptions WHERE chat_id = 111').all() as any[]).length, 0);
  });
});

describe('DELETE /api/subscribers/:id/cities/:city', () => {
  it('removes one subscription', async () => {
    const res = await request(app).delete('/api/subscribers/111/cities/%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91');
    assert.equal(res.status, 200);
    const rows = db.prepare('SELECT city_name FROM subscriptions WHERE chat_id = 111').all() as { city_name: string }[];
    assert.ok(!rows.map(r => r.city_name).includes('תל אביב'));
    assert.ok(rows.map(r => r.city_name).includes('רמת גן'));
  });
});

describe('GET /api/subscribers/export/csv', () => {
  it('returns CSV content-type', async () => {
    const res = await request(app).get('/api/subscribers/export/csv');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type']?.includes('text/csv'));
  });

  it('includes profile fields in CSV header', async () => {
    const res = await request(app).get('/api/subscribers/export/csv');
    const header = res.text.split('\n')[0];
    assert.ok(header.includes('display_name'));
    assert.ok(header.includes('home_city'));
    assert.ok(header.includes('onboarding'));
  });
});
