import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb, getDb, closeDb } from '../../../db/schema.js';
import { createGroupsRouter, groupMutateLimiter } from '../../../dashboard/routes/groups.js';
import {
  createGroup,
  addMember,
  countMembersOfGroup,
  findGroupById,
} from '../../../db/groupRepository.js';

// IMPORTANT: this test runs with DB_PATH=:memory: set on the command line.
// We use initDb()+getDb() (not new Database(':memory:')) so the singleton
// is the SAME instance the route's getUser() calls read from. Without this,
// owner display names would be silently null even though we seeded them
// (pattern_getuser_singleton_vs_di.md).

let app: express.Express;

before(() => {
  initDb();
  app = express();
  app.use(express.json());
  app.use('/api/groups', createGroupsRouter(getDb()));
});

after(() => closeDb());

beforeEach(() => {
  const db = getDb();
  // Cascade order: groups → group_members (via FK CASCADE)
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM users').run();
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(1001, 'אבא');
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(1002, 'אמא');
  db.prepare("INSERT INTO users (chat_id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(1003, 'ילד');
  // Reset DELETE rate limit state between tests so multiple tests can hit DELETE.
  // Pattern: pattern_rate_limiter_test_isolation.md.
  groupMutateLimiter.clearStore();
});

describe('GET /api/groups', () => {
  it('returns empty list when no groups exist', async () => {
    const res = await request(app).get('/api/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.groups, []);
  });

  it('returns groups with member count and owner display name', async () => {
    const db = getDb();
    const g1 = createGroup(db, { name: 'family', ownerId: 1001, inviteCode: 'API001' });
    const g2 = createGroup(db, { name: 'work',   ownerId: 1002, inviteCode: 'API002' });
    addMember(db, g2.id, 1003);

    const res = await request(app).get('/api/groups');
    assert.equal(res.status, 200);
    assert.equal(res.body.groups.length, 2);

    const byId = new Map(res.body.groups.map((g: any) => [g.id, g]));
    const familyGroup = byId.get(g1.id) as any;
    assert.equal(familyGroup.name, 'family');
    assert.equal(familyGroup.ownerId, 1001);
    assert.equal(familyGroup.ownerDisplayName, 'אבא', 'getUser() must resolve via singleton — pattern_getuser_singleton_vs_di');
    assert.equal(familyGroup.memberCount, 1);
    assert.equal(familyGroup.inviteCode, 'API001');

    const workGroup = byId.get(g2.id) as any;
    assert.equal(workGroup.memberCount, 2);
    assert.equal(workGroup.ownerDisplayName, 'אמא');
  });
});

describe('GET /api/groups/stats', () => {
  it('returns zero stats when no groups exist', async () => {
    const res = await request(app).get('/api/groups/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.avgMembers, 0);
    assert.deepEqual(res.body.top10, []);
  });

  it('computes total + avgMembers + top10 correctly', async () => {
    const db = getDb();
    const g1 = createGroup(db, { name: 'tiny', ownerId: 1001, inviteCode: 'STAT01' });
    const g2 = createGroup(db, { name: 'big',  ownerId: 1002, inviteCode: 'STAT02' });
    addMember(db, g2.id, 1003);

    const res = await request(app).get('/api/groups/stats');
    assert.equal(res.body.total, 2);
    // (1 + 2) / 2 = 1.5
    assert.equal(res.body.avgMembers, 1.5);
    assert.equal(res.body.top10.length, 2);
    // Sorted desc by memberCount → 'big' first
    assert.equal(res.body.top10[0].id, g2.id);
    assert.equal(res.body.top10[0].name, 'big');
    assert.equal(res.body.top10[0].memberCount, 2);
  });

  // Make sure /stats doesn't get matched as /:id
  it('static /stats route takes precedence over /:id', async () => {
    const res = await request(app).get('/api/groups/stats');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total, 'number', 'should return stats shape, not group-not-found');
  });
});

describe('GET /api/groups/:id', () => {
  it('returns 400 for invalid id (NaN / negative / zero)', async () => {
    for (const badId of ['abc', '-5', '0']) {
      const res = await request(app).get(`/api/groups/${badId}`);
      assert.equal(res.status, 400, `expected 400 for badId="${badId}"`);
      assert.equal(res.body.ok, false);
    }
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/groups/999999');
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  it('returns full group + member list for known id', async () => {
    const db = getDb();
    const group = createGroup(db, { name: 'detail', ownerId: 1001, inviteCode: 'DTL001' });
    addMember(db, group.id, 1002);

    const res = await request(app).get(`/api/groups/${group.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.group.id, group.id);
    assert.equal(res.body.group.name, 'detail');
    assert.equal(res.body.members.length, 2);

    // Member entries enriched with display name + role + notify_group
    const owner = res.body.members.find((m: any) => m.userId === 1001);
    assert.ok(owner);
    assert.equal(owner.displayName, 'אבא');
    assert.equal(owner.role, 'owner');
    assert.equal(owner.notifyGroup, true);

    const member = res.body.members.find((m: any) => m.userId === 1002);
    assert.equal(member.role, 'member');
    assert.equal(member.displayName, 'אמא');
  });
});

describe('DELETE /api/groups/:id', () => {
  it('returns 400 for invalid id', async () => {
    const res = await request(app).delete('/api/groups/abc');
    assert.equal(res.status, 400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/groups/999999');
    assert.equal(res.status, 404);
  });

  it('deletes group and CASCADEs to remove member rows', async () => {
    const db = getDb();
    const group = createGroup(db, { name: 'doomed', ownerId: 1001, inviteCode: 'DEL001' });
    addMember(db, group.id, 1002);
    addMember(db, group.id, 1003);
    assert.equal(countMembersOfGroup(db, group.id), 3);

    const res = await request(app).delete(`/api/groups/${group.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    // Group is gone
    assert.equal(findGroupById(db, group.id), undefined);
    // CASCADE removed all 3 member rows
    const remainingMembers = db
      .prepare('SELECT * FROM group_members WHERE group_id = ?')
      .all(group.id);
    assert.equal(remainingMembers.length, 0);
  });

  it('rate limits after 5 requests in a minute', async () => {
    const db = getDb();
    // Create 6 groups so we can try 6 deletes
    for (let i = 0; i < 6; i++) {
      createGroup(db, { name: `g${i}`, ownerId: 1001, inviteCode: `RL${i.toString().padStart(4, '0')}` });
    }
    const groupIds = db.prepare('SELECT id FROM groups ORDER BY id ASC').all() as Array<{ id: number }>;

    // First 5 deletes succeed
    for (let i = 0; i < 5; i++) {
      const id = groupIds[i]?.id;
      const res = await request(app).delete(`/api/groups/${id}`);
      assert.equal(res.status, 200, `delete ${i + 1} should succeed`);
    }

    // 6th delete is rate-limited
    const lastId = groupIds[5]?.id;
    const res = await request(app).delete(`/api/groups/${lastId}`);
    assert.equal(res.status, 429, '6th delete in window should be rate-limited');
  });
});
