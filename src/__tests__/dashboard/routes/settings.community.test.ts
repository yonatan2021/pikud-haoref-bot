import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { createSettingsRouter, settingsMutateLimiter } from '../../../dashboard/routes/settings.js';

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);

  app = express();
  app.use(express.json());
  app.use('/api/settings', createSettingsRouter(db));
});

beforeEach(() => {
  db.prepare('DELETE FROM settings').run();
  settingsMutateLimiter.clearStore();
});

after(() => db.close());

// ─── Pulse section ────────────────────────────────────────────────────────────

describe('PATCH /api/settings — pulse keys', () => {
  it('accepts pulse_enabled=true', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_enabled: 'true' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('accepts pulse_enabled=false', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_enabled: 'false' });
    assert.equal(res.status, 200);
  });

  it('rejects pulse_enabled=yes (not boolean)', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_enabled: 'yes' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('pulse_enabled'));
  });

  it('accepts pulse_cooldown_hours=24', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_cooldown_hours: '24' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('accepts pulse_cooldown_hours=1 (boundary)', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_cooldown_hours: '1' });
    assert.equal(res.status, 200);
  });

  it('rejects pulse_cooldown_hours=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_cooldown_hours: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('pulse_cooldown_hours'));
  });

  it('rejects pulse_cooldown_hours=-1 (negative)', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_cooldown_hours: '-1' });
    assert.equal(res.status, 400);
  });

  it('accepts pulse_aggregate_threshold=10', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_aggregate_threshold: '10' });
    assert.equal(res.status, 200);
  });

  it('rejects pulse_aggregate_threshold=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ pulse_aggregate_threshold: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('pulse_aggregate_threshold'));
  });

  it('accepts pulse_prompt_text (free text)', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ pulse_prompt_text: 'איך אתה מרגיש?' });
    assert.equal(res.status, 200);
  });
});

// ─── Stories section ──────────────────────────────────────────────────────────

describe('PATCH /api/settings — stories keys', () => {
  it('accepts topic_id_stories=0 (valid non-neg int)', async () => {
    const res = await request(app).patch('/api/settings').send({ topic_id_stories: '0' });
    assert.equal(res.status, 200);
  });

  it('accepts topic_id_stories=42', async () => {
    const res = await request(app).patch('/api/settings').send({ topic_id_stories: '42' });
    assert.equal(res.status, 200);
  });

  it('rejects topic_id_stories=1 (reserved Telegram thread ID)', async () => {
    const res = await request(app).patch('/api/settings').send({ topic_id_stories: '1' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('topic_id_stories'));
  });

  it('rejects topic_id_stories=-1 (negative)', async () => {
    const res = await request(app).patch('/api/settings').send({ topic_id_stories: '-1' });
    assert.equal(res.status, 400);
  });

  it('accepts stories_enabled=false', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_enabled: 'false' });
    assert.equal(res.status, 200);
  });

  it('rejects stories_enabled=1 (not boolean)', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_enabled: '1' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('stories_enabled'));
  });

  it('accepts stories_rate_limit_minutes=60', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_rate_limit_minutes: '60' });
    assert.equal(res.status, 200);
  });

  it('rejects stories_rate_limit_minutes=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_rate_limit_minutes: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('stories_rate_limit_minutes'));
  });

  it('accepts stories_max_length=500', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_max_length: '500' });
    assert.equal(res.status, 200);
  });

  it('rejects stories_max_length=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ stories_max_length: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('stories_max_length'));
  });
});

// ─── Skills section ───────────────────────────────────────────────────────────

describe('PATCH /api/settings — skills keys', () => {
  it('accepts skills_public_enabled=true', async () => {
    const res = await request(app).patch('/api/settings').send({ skills_public_enabled: 'true' });
    assert.equal(res.status, 200);
  });

  it('rejects skills_public_enabled=on (not boolean)', async () => {
    const res = await request(app).patch('/api/settings').send({ skills_public_enabled: 'on' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('skills_public_enabled'));
  });

  it('accepts skills_need_radius_zones=3', async () => {
    const res = await request(app).patch('/api/settings').send({ skills_need_radius_zones: '3' });
    assert.equal(res.status, 200);
  });

  it('rejects skills_need_radius_zones=0 (must be ≥1)', async () => {
    const res = await request(app).patch('/api/settings').send({ skills_need_radius_zones: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('skills_need_radius_zones'));
  });
});

// ─── Neighbor check section ───────────────────────────────────────────────────

describe('PATCH /api/settings — neighbor check keys', () => {
  it('accepts neighbor_check_enabled_default=false', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ neighbor_check_enabled_default: 'false' });
    assert.equal(res.status, 200);
  });

  it('rejects neighbor_check_enabled_default=yes (not boolean)', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ neighbor_check_enabled_default: 'yes' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('neighbor_check_enabled_default'));
  });

  it('accepts neighbor_check_delay_minutes=10', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ neighbor_check_delay_minutes: '10' });
    assert.equal(res.status, 200);
  });

  it('rejects neighbor_check_delay_minutes=0 (must be ≥1)', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ neighbor_check_delay_minutes: '0' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('neighbor_check_delay_minutes'));
  });

  it('accepts neighbor_check_text (free text)', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ neighbor_check_text: 'האם אתה בסדר?' });
    assert.equal(res.status, 200);
  });
});

// ─── All 13 keys together ─────────────────────────────────────────────────────

describe('PATCH /api/settings — all 13 community keys together', () => {
  it('accepts all 13 community keys in a single PATCH', async () => {
    const res = await request(app).patch('/api/settings').send({
      pulse_enabled: 'true',
      pulse_cooldown_hours: '24',
      pulse_aggregate_threshold: '5',
      pulse_prompt_text: 'שאלה בדיקה',
      topic_id_stories: '42',
      stories_enabled: 'true',
      stories_rate_limit_minutes: '30',
      stories_max_length: '300',
      skills_public_enabled: 'false',
      skills_need_radius_zones: '2',
      neighbor_check_enabled_default: 'true',
      neighbor_check_delay_minutes: '15',
      neighbor_check_text: 'בדיקה',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('rejects when any one of the 13 keys is invalid (no partial write)', async () => {
    const res = await request(app).patch('/api/settings').send({
      pulse_enabled: 'true',
      pulse_cooldown_hours: '0', // invalid — triggers 400
    });
    assert.equal(res.status, 400);
    // pulse_enabled must NOT have been written
    const row = db.prepare("SELECT value FROM settings WHERE key = 'pulse_enabled'").get();
    assert.equal(row, undefined, 'pulse_enabled must not have been written before validation failed');
  });
});
