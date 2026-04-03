import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { initSchema } from '../../../db/schema.js';
import { upsertGroup, getAllGroups } from '../../../db/whatsappGroupRepository.js';
import { createWhatsAppRouter } from '../../../dashboard/routes/whatsapp.js';
import type { WhatsAppServiceDeps } from '../../../dashboard/routes/whatsapp.js';

// ─── Mock whatsapp service state ─────────────────────────────────────────────

let mockStatus: string = 'disconnected';
let mockQr: string | null = null;
let mockPhone: string | null = null;
let mockCachedGroups: { id: string; name: string }[] = [];
let initializeCalled = false;
let disconnectCalled = false;
let refreshGroupsCalled = false;

const mockSvc: WhatsAppServiceDeps = {
  getStatus: () => mockStatus as any,
  getQr: () => mockQr,
  getPhone: () => mockPhone,
  getCachedGroups: () => mockCachedGroups as any,
  initialize: () => { initializeCalled = true; },
  disconnect: async () => { disconnectCalled = true; mockStatus = 'disconnected'; mockPhone = null; mockCachedGroups = []; },
  clearSession: async () => { mockStatus = 'disconnected'; mockPhone = null; mockCachedGroups = []; },
  refreshGroups: async () => { refreshGroupsCalled = true; },
};

// ─── Test setup ──────────────────────────────────────────────────────────────

let db: Database.Database;
let app: express.Express;

before(() => {
  db = new Database(':memory:');
  initSchema(db);
  app = express();
  app.use(express.json());
  app.use('/api/whatsapp', createWhatsAppRouter(db, mockSvc));
});

after(() => db.close());

beforeEach(() => {
  // Reset mock state
  mockStatus = 'disconnected';
  mockQr = null;
  mockPhone = null;
  mockCachedGroups = [];
  initializeCalled = false;
  disconnectCalled = false;
  refreshGroupsCalled = false;
  // Clear DB groups
  db.prepare('DELETE FROM whatsapp_groups').run();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/whatsapp/status', () => {
  it('returns { status: "disconnected", groupCount: 0 } when not initialized', async () => {
    const res = await request(app).get('/api/whatsapp/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'disconnected');
    assert.equal(res.body.groupCount, 0);
    assert.equal(res.body.qr, undefined);
    assert.equal(res.body.phone, undefined);
  });

  it('includes qr field when status is "qr"', async () => {
    mockStatus = 'qr';
    mockQr = 'data:image/png;base64,fakeqr';
    const res = await request(app).get('/api/whatsapp/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'qr');
    assert.equal(res.body.qr, 'data:image/png;base64,fakeqr');
  });

  it('includes phone field when status is "ready"', async () => {
    mockStatus = 'ready';
    mockPhone = '972501234567';
    mockCachedGroups = [{ id: '111@g.us', name: 'קבוצה א' }];
    const res = await request(app).get('/api/whatsapp/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.equal(res.body.phone, '972501234567');
    assert.equal(res.body.groupCount, 1);
  });

  it('returns { status: "connecting", groupCount: 0 } without qr or phone when connecting', async () => {
    mockStatus = 'connecting';
    mockQr = null;
    mockPhone = null;
    mockCachedGroups = [];
    const res = await request(app).get('/api/whatsapp/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'connecting');
    assert.equal(res.body.qr, undefined);
    assert.equal(res.body.phone, undefined);
    assert.equal(res.body.groupCount, 0);
  });
});

describe('GET /api/whatsapp/groups', () => {
  it('returns empty array when no groups', async () => {
    const res = await request(app).get('/api/whatsapp/groups');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  it('returns DB groups with inClient: false and type field when not in live cache', async () => {
    upsertGroup(db, '111@g.us', 'קבוצה א', true, ['missiles']);
    // mockCachedGroups is empty — group is not in live client
    const res = await request(app).get('/api/whatsapp/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].groupId, '111@g.us');
    assert.equal(res.body[0].name, 'קבוצה א');
    assert.equal(res.body[0].enabled, true);
    assert.deepEqual(res.body[0].alertTypes, ['missiles']);
    assert.equal(res.body[0].inClient, false);
    assert.equal(res.body[0].type, 'group');
  });

  it('marks DB groups with inClient: true when present in live cache', async () => {
    upsertGroup(db, '111@g.us', 'קבוצה א', true, ['missiles']);
    mockCachedGroups = [{ id: '111@g.us', name: 'קבוצה א' }];
    const res = await request(app).get('/api/whatsapp/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].inClient, true);
  });

  it('includes live-only groups (not in DB) with enabled: false and type', async () => {
    mockCachedGroups = [{ id: '222@g.us', name: 'קבוצה ב' }];
    const res = await request(app).get('/api/whatsapp/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].groupId, '222@g.us');
    assert.equal(res.body[0].enabled, false);
    assert.deepEqual(res.body[0].alertTypes, []);
    assert.equal(res.body[0].inClient, true);
    assert.equal(res.body[0].type, 'group');
  });

  it('returns type "newsletter" for channel entries', async () => {
    mockCachedGroups = [{ id: '120363001@newsletter', name: 'ערוץ א' }];
    const res = await request(app).get('/api/whatsapp/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].type, 'newsletter');
  });
});

describe('PATCH /api/whatsapp/groups/:id', () => {
  it('returns 400 with Hebrew error when unknown alertType provided', async () => {
    const res = await request(app)
      .patch('/api/whatsapp/groups/111%40g.us')
      .send({ enabled: true, alertTypes: ['missiles', 'unknownType'] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.ok(res.body.error.includes('unknownType'));
  });

  it('upserts group and returns { ok: true }', async () => {
    mockCachedGroups = [{ id: '111@g.us', name: 'קבוצה א' }];
    const res = await request(app)
      .patch('/api/whatsapp/groups/111%40g.us')
      .send({ enabled: true, alertTypes: ['missiles', 'earthQuake'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    // Verify DB was updated
    const groups = getAllGroups(db);
    const group = groups.find((g) => g.groupId === '111@g.us');
    assert.ok(group);
    assert.equal(group.enabled, true);
    assert.deepEqual(group.alertTypes, ['missiles', 'earthQuake']);
  });

  it('returns 400 when enabled is not boolean', async () => {
    const res = await request(app)
      .patch('/api/whatsapp/groups/111%40g.us')
      .send({ enabled: 'yes', alertTypes: ['missiles'] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when alertTypes is not an array', async () => {
    const res = await request(app)
      .patch('/api/whatsapp/groups/111%40g.us')
      .send({ enabled: true, alertTypes: 'missiles' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('uses DB name as fallback when group not in live cache', async () => {
    upsertGroup(db, '333@g.us', 'קבוצה ג', false, []);
    const res = await request(app)
      .patch('/api/whatsapp/groups/333%40g.us')
      .send({ enabled: true, alertTypes: ['missiles'] });
    assert.equal(res.status, 200);
    const groups = getAllGroups(db);
    const group = groups.find((g) => g.groupId === '333@g.us');
    assert.ok(group);
    assert.equal(group.name, 'קבוצה ג');
  });

  it('returns 400 when alertTypes array length exceeds ALL_ALERT_TYPES.length', async () => {
    // ALL_ALERT_TYPES has 19 entries; send 20 to exceed the limit
    const tooMany = Array.from({ length: 20 }, () => 'missiles');
    const res = await request(app)
      .patch('/api/whatsapp/groups/111%40g.us')
      .send({ enabled: true, alertTypes: tooMany });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe('POST /api/whatsapp/reconnect', () => {
  it('returns { ok: true }', async () => {
    const res = await request(app).post('/api/whatsapp/reconnect');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('calls initialize() when disconnected', async () => {
    mockStatus = 'disconnected';
    initializeCalled = false;
    disconnectCalled = false;
    await request(app).post('/api/whatsapp/reconnect');
    assert.equal(initializeCalled, true);
    assert.equal(disconnectCalled, false, 'should not disconnect when already disconnected');
  });

  it('calls disconnect() then initialize() when already ready', async () => {
    mockStatus = 'ready';
    initializeCalled = false;
    disconnectCalled = false;
    await request(app).post('/api/whatsapp/reconnect');
    assert.equal(disconnectCalled, true, 'should disconnect when already ready');
    assert.equal(initializeCalled, true, 'should re-initialize after disconnect');
  });
});

describe('POST /api/whatsapp/disconnect', () => {
  it('returns { ok: true }', async () => {
    const res = await request(app).post('/api/whatsapp/disconnect');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('calls disconnect()', async () => {
    disconnectCalled = false;
    await request(app).post('/api/whatsapp/disconnect');
    assert.equal(disconnectCalled, true);
  });
});

describe('GET /api/whatsapp/chats', () => {
  it('returns empty array when no chats cached', async () => {
    mockCachedGroups = [];
    const res = await request(app).get('/api/whatsapp/chats');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns chats with id, name, type from cached groups', async () => {
    mockCachedGroups = [
      { id: '120363001@g.us', name: 'Group A' },
      { id: '120363002@newsletter', name: 'Channel B' },
    ] as any;
    const res = await request(app).get('/api/whatsapp/chats');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].type, 'group');
    assert.equal(res.body[1].type, 'newsletter');
  });
});
