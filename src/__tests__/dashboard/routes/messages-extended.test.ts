import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema, getDb } from '../../../db/schema.js';
import { createMessagesRouter, testFireLimiter, importLimiter, systemMessageLimiter } from '../../../dashboard/routes/messages.js';
import { upsertTemplate, getAllTemplates } from '../../../db/messageTemplateRepository.js';
import { loadTemplateCache } from '../../../config/templateCache.js';

let db: Database.Database;
let app: express.Express;
const mockBot = {
  api: { sendMessage: async () => ({ message_id: 42 }) },
};

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  initSchema(getDb());

  app = express();
  app.use(express.json());
  app.use('/api/messages', createMessagesRouter(db, mockBot as any));
});

after(() => db.close());

beforeEach(() => {
  db.prepare('DELETE FROM message_templates').run();
  db.prepare('DELETE FROM message_template_history').run();
  db.prepare('DELETE FROM alert_history').run();
  loadTemplateCache();
  testFireLimiter.clearStore();
  importLimiter.clearStore();
  systemMessageLimiter.clearStore();
});

// ── GET /api/messages/cities ───────────────────────────────────────────────

describe('GET /api/messages/cities', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/messages/cities');
    assert.equal(res.status, 400);
  });

  it('returns 400 when q is too short (1 char)', async () => {
    const res = await request(app).get('/api/messages/cities?q=א');
    assert.equal(res.status, 400);
  });

  it('returns 200 with array for q >= 2 chars', async () => {
    const res = await request(app).get('/api/messages/cities?q=תל');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    // At least one result for "תל" (Tel Aviv, etc.)
    assert.ok(res.body.length > 0);
  });

  it('each result has name, zone, countdown', async () => {
    const res = await request(app).get('/api/messages/cities?q=תל');
    for (const city of res.body) {
      assert.ok('name' in city);
      assert.ok('zone' in city);
      assert.ok('countdown' in city);
    }
  });

  it('returns max 20 results', async () => {
    // Use a very broad search
    const res = await request(app).get('/api/messages/cities?q=אל');
    assert.equal(res.status, 200);
    assert.ok(res.body.length <= 20);
  });
});

// ── GET /api/messages/export ───────────────────────────────────────────────

describe('GET /api/messages/export', () => {
  it('returns empty templates array on fresh DB', async () => {
    const res = await request(app).get('/api/messages/export');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { templates: [] });
  });

  it('returns customized templates after PATCH', async () => {
    upsertTemplate(db, {
      alert_type: 'missiles',
      emoji: '🚨',
      title_he: 'טילים',
      instructions_prefix: '🛡',
    });
    const res = await request(app).get('/api/messages/export');
    assert.equal(res.status, 200);
    assert.equal(res.body.templates.length, 1);
    assert.equal(res.body.templates[0].alertType, 'missiles');
    assert.equal(res.body.templates[0].emoji, '🚨');
  });
});

// ── POST /api/messages/import ──────────────────────────────────────────────

describe('POST /api/messages/import', () => {
  it('imports valid templates', async () => {
    const res = await request(app)
      .post('/api/messages/import')
      .send({
        templates: [
          { alertType: 'missiles', emoji: '🟡', titleHe: 'טילים', instructionsPrefix: '🛡' },
          { alertType: 'earthQuake', emoji: '🌍', titleHe: 'רעידת אדמה', instructionsPrefix: '🛡' },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.count, 2);
    assert.equal(getAllTemplates(db).length, 2);
  });

  it('rejects unknown alertType (all-or-nothing)', async () => {
    const res = await request(app)
      .post('/api/messages/import')
      .send({
        templates: [
          { alertType: 'missiles', emoji: '🟡', titleHe: 'טילים', instructionsPrefix: '🛡' },
          { alertType: 'notReal', emoji: '❌', titleHe: 'בדיקה', instructionsPrefix: '🛡' },
        ],
      });
    assert.equal(res.status, 400);
    // Nothing should have been imported
    assert.equal(getAllTemplates(db).length, 0);
  });

  it('rejects empty emoji', async () => {
    const res = await request(app)
      .post('/api/messages/import')
      .send({
        templates: [
          { alertType: 'missiles', emoji: '', titleHe: 'טילים', instructionsPrefix: '🛡' },
        ],
      });
    assert.equal(res.status, 400);
  });

  it('rejects missing templates array', async () => {
    const res = await request(app).post('/api/messages/import').send({});
    assert.equal(res.status, 400);
  });
});

// ── GET /api/messages/:type/history ────────────────────────────────────────

describe('GET /api/messages/:type/history', () => {
  it('returns empty array for type with no history', async () => {
    const res = await request(app).get('/api/messages/missiles/history');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns entries after PATCHes', async () => {
    // PATCH creates a history entry of the *previous* state
    await request(app).patch('/api/messages/missiles').send({ emoji: '🟡' });
    await request(app).patch('/api/messages/missiles').send({ emoji: '🔴' });

    const res = await request(app).get('/api/messages/missiles/history');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 2);
  });

  it('history is capped at 10 entries', async () => {
    for (let i = 0; i < 12; i++) {
      await request(app).patch('/api/messages/missiles').send({ emoji: `${i}️⃣` });
    }
    const res = await request(app).get('/api/messages/missiles/history');
    assert.equal(res.status, 200);
    assert.ok(res.body.length <= 10);
  });

  it('returns 400 for unknown alertType', async () => {
    const res = await request(app).get('/api/messages/fakeType/history');
    assert.equal(res.status, 400);
  });
});

// ── POST /api/messages/:type/rollback ──────────────────────────────────────

describe('POST /api/messages/:type/rollback', () => {
  it('restores previous values', async () => {
    // Set initial custom value
    await request(app)
      .patch('/api/messages/missiles')
      .send({ emoji: '🟡', titleHe: 'ישן' });
    // This PATCH saved the *default* state to history (before patch).
    // Now change to a new value — this saves the '🟡' state to history.
    await request(app)
      .patch('/api/messages/missiles')
      .send({ emoji: '🔴', titleHe: 'חדש' });
    // Change again — this saves the '🔴' state to history.
    await request(app)
      .patch('/api/messages/missiles')
      .send({ emoji: '🟢', titleHe: 'אחרון' });

    // Get history — should include an entry with emoji '🔴'
    const historyRes = await request(app).get('/api/messages/missiles/history');
    const targetVersion = historyRes.body.find((h: any) => h.emoji === '🔴');
    assert.ok(targetVersion, 'should find 🔴 version in history');

    // Rollback to it
    const rollbackRes = await request(app)
      .post('/api/messages/missiles/rollback')
      .send({ versionId: targetVersion.id });
    assert.equal(rollbackRes.status, 200);
    assert.equal(rollbackRes.body.ok, true);

    // Verify DB has rolled back
    const rows = getAllTemplates(db);
    const row = rows.find((r) => r.alert_type === 'missiles');
    assert.ok(row);
    assert.equal(row.emoji, '🔴');
  });

  it('returns 400 for versionId that does not match alertType', async () => {
    // Create history for missiles
    await request(app).patch('/api/messages/missiles').send({ emoji: '🟡' });
    const historyRes = await request(app).get('/api/messages/missiles/history');
    const versionId = historyRes.body[0]?.id;
    assert.ok(versionId);

    // Try to rollback earthQuake with missiles versionId
    const res = await request(app)
      .post('/api/messages/earthQuake/rollback')
      .send({ versionId });
    assert.equal(res.status, 400);
  });

  it('returns 404 for nonexistent versionId', async () => {
    const res = await request(app)
      .post('/api/messages/missiles/rollback')
      .send({ versionId: 99999 });
    assert.equal(res.status, 404);
  });

  it('returns 400 when versionId is missing', async () => {
    const res = await request(app)
      .post('/api/messages/missiles/rollback')
      .send({});
    assert.equal(res.status, 400);
  });
});

// ── POST /api/messages/test-fire ───────────────────────────────────────────

describe('POST /api/messages/test-fire', () => {
  it('returns 400 for unknown alertType', async () => {
    const res = await request(app)
      .post('/api/messages/test-fire')
      .send({ alertType: 'fakeType', cities: ['תל אביב'] });
    assert.equal(res.status, 400);
  });

  it('returns 400 for missing alertType', async () => {
    const res = await request(app)
      .post('/api/messages/test-fire')
      .send({ cities: ['תל אביב'] });
    assert.equal(res.status, 400);
  });

  it('returns 400 when cities is not an array', async () => {
    const res = await request(app)
      .post('/api/messages/test-fire')
      .send({ alertType: 'missiles', cities: 'not-array' });
    assert.equal(res.status, 400);
  });
});

// ── PATCH /api/messages/:type — history recording ──────────────────────────

describe('PATCH /api/messages/:type — history recording', () => {
  it('creates a history entry after PATCH', async () => {
    await request(app).patch('/api/messages/missiles').send({ emoji: '🟡' });
    const res = await request(app).get('/api/messages/missiles/history');
    assert.ok(res.body.length >= 1);
  });

  it('after 12 PATCHes, history length <= 10', async () => {
    for (let i = 0; i < 12; i++) {
      await request(app).patch('/api/messages/missiles').send({ emoji: `${i}️⃣` });
    }
    const res = await request(app).get('/api/messages/missiles/history');
    assert.ok(res.body.length <= 10);
  });
});

// ── POST /api/messages/replay-preview ──────────────────────────────────────

describe('POST /api/messages/replay-preview', () => {
  it('returns 400 when alertHistoryId is missing', async () => {
    const res = await request(app)
      .post('/api/messages/replay-preview')
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 404 for unknown alertHistoryId', async () => {
    const res = await request(app)
      .post('/api/messages/replay-preview')
      .send({ alertHistoryId: 99999 });
    assert.equal(res.status, 404);
  });

  it('returns html and charCount for a known history entry', async () => {
    // Insert a fake alert_history row
    db.prepare(
      "INSERT INTO alert_history (type, cities, instructions, fired_at) VALUES (?, ?, ?, datetime('now'))",
    ).run('missiles', JSON.stringify(['תל אביב', 'רמת גן']), 'היכנסו למרחב מוגן');

    const row = db.prepare('SELECT id FROM alert_history ORDER BY id DESC LIMIT 1').get() as { id: number };

    const res = await request(app)
      .post('/api/messages/replay-preview')
      .send({ alertHistoryId: row.id });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.html === 'string');
    assert.ok(typeof res.body.charCount === 'number');
    assert.ok(res.body.charCount > 0);
  });

  it('templateOverride changes the output', async () => {
    db.prepare(
      "INSERT INTO alert_history (type, cities, instructions, fired_at) VALUES (?, ?, ?, datetime('now'))",
    ).run('missiles', JSON.stringify(['תל אביב']), null);

    const row = db.prepare('SELECT id FROM alert_history ORDER BY id DESC LIMIT 1').get() as { id: number };

    // Without override
    const res1 = await request(app)
      .post('/api/messages/replay-preview')
      .send({ alertHistoryId: row.id });

    // With override
    const res2 = await request(app)
      .post('/api/messages/replay-preview')
      .send({ alertHistoryId: row.id, templateOverride: { emoji: '🧪' } });

    assert.ok(res2.body.html.includes('🧪'));
    // Original should NOT have 🧪
    assert.ok(!res1.body.html.includes('🧪'));
  });
});

// ── GET /api/messages/zones ──────────────────────────────────────────────

describe('GET /api/messages/zones', () => {
  it('returns 200 with superRegions array', async () => {
    const res = await request(app).get('/api/messages/zones');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.superRegions));
    assert.ok(res.body.superRegions.length > 0);
  });

  it('each super-region has name and zones array', async () => {
    const res = await request(app).get('/api/messages/zones');
    for (const sr of res.body.superRegions) {
      assert.ok(typeof sr.name === 'string');
      assert.ok(Array.isArray(sr.zones));
      assert.ok(sr.zones.length > 0);
    }
  });

  it('each zone has name, cityCount, and cities array', async () => {
    const res = await request(app).get('/api/messages/zones');
    for (const sr of res.body.superRegions) {
      for (const zone of sr.zones) {
        assert.ok(typeof zone.name === 'string');
        assert.ok(typeof zone.cityCount === 'number');
        assert.ok(Array.isArray(zone.cities));
        assert.equal(zone.cityCount, zone.cities.length);
      }
    }
  });

  it('each city has name, zone, and countdown', async () => {
    const res = await request(app).get('/api/messages/zones');
    const firstZone = res.body.superRegions[0].zones[0];
    assert.ok(firstZone.cities.length > 0);
    for (const city of firstZone.cities) {
      assert.ok(typeof city.name === 'string');
      assert.ok(typeof city.zone === 'string');
      assert.ok(typeof city.countdown === 'number');
    }
  });
});

// ── GET /api/messages/topics ─────────────────────────────────────────────

describe('GET /api/messages/topics', () => {
  it('returns 200 with topics array', async () => {
    const res = await request(app).get('/api/messages/topics');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.topics));
  });

  it('each topic has key, label, and topicId', async () => {
    const res = await request(app).get('/api/messages/topics');
    for (const topic of res.body.topics) {
      assert.ok(typeof topic.key === 'string');
      assert.ok(typeof topic.label === 'string');
      // topicId is number or null
      assert.ok(topic.topicId === null || typeof topic.topicId === 'number');
    }
  });

  it('includes all expected categories', async () => {
    const res = await request(app).get('/api/messages/topics');
    const keys = res.body.topics.map((t: any) => t.key);
    assert.ok(keys.includes('security'));
    assert.ok(keys.includes('nature'));
    assert.ok(keys.includes('environmental'));
    assert.ok(keys.includes('drills'));
    assert.ok(keys.includes('general'));
    assert.ok(keys.includes('whatsapp'));
  });
});

// ── POST /api/messages/system-message ────────────────────────────────────

describe('POST /api/messages/system-message', () => {
  it('returns 400 when text is empty', async () => {
    const res = await request(app)
      .post('/api/messages/system-message')
      .send({ text: '', topicId: 123 });
    assert.equal(res.status, 400);
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post('/api/messages/system-message')
      .send({ topicId: 123 });
    assert.equal(res.status, 400);
  });

  it('returns 400 when topicId is missing', async () => {
    const res = await request(app)
      .post('/api/messages/system-message')
      .send({ text: 'hello' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when text exceeds 4096 chars', async () => {
    const res = await request(app)
      .post('/api/messages/system-message')
      .send({ text: 'x'.repeat(4097), topicId: 123 });
    assert.equal(res.status, 400);
  });

  it('returns 500 when TELEGRAM_CHAT_ID is unset', async () => {
    const orig = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;
    try {
      const res = await request(app)
        .post('/api/messages/system-message')
        .send({ text: 'test', topicId: 123 });
      assert.equal(res.status, 500);
    } finally {
      if (orig !== undefined) process.env.TELEGRAM_CHAT_ID = orig;
    }
  });

  it('returns ok with messageId when TELEGRAM_CHAT_ID is set', async () => {
    process.env.TELEGRAM_CHAT_ID = '-1001234567890';
    try {
      const res = await request(app)
        .post('/api/messages/system-message')
        .send({ text: '<b>test</b>', topicId: 123 });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(typeof res.body.messageId === 'number');
    } finally {
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });
});
