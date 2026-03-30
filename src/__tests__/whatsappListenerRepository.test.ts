import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  getAllListeners,
  getActiveListenersForChannel,
  createListener,
  updateListener,
  deleteListener,
} from '../db/whatsappListenerRepository.js';

let db: Database.Database;
before(() => { db = new Database(':memory:'); initSchema(db); });
after(() => db.close());
beforeEach(() => { db.prepare('DELETE FROM whatsapp_listeners').run(); });

const BASE = {
  channelId: 'ch@g.us', channelName: 'Ch', channelType: 'group',
  keywords: [] as string[], telegramTopicId: null, telegramTopicName: null, isActive: true,
};

describe('createListener', () => {
  it('inserts and returns the new listener', () => {
    const r = createListener(db, { ...BASE, channelId: '001@g.us', keywords: ['ירי', 'רקטה'] });
    assert.equal(r.channelId, '001@g.us');
    assert.deepEqual(r.keywords, ['ירי', 'רקטה']);
    assert.ok(r.id > 0);
  });

  it('throws on duplicate channel_id', () => {
    createListener(db, { ...BASE, channelId: 'dup@g.us' });
    assert.throws(() => createListener(db, { ...BASE, channelId: 'dup@g.us' }));
  });
});

describe('getActiveListenersForChannel', () => {
  it('returns only active listeners matching channel_id', () => {
    createListener(db, { ...BASE, channelId: 'active@g.us', isActive: true });
    createListener(db, { ...BASE, channelId: 'off@g.us', isActive: false });
    assert.equal(getActiveListenersForChannel(db, 'active@g.us').length, 1);
    assert.equal(getActiveListenersForChannel(db, 'off@g.us').length, 0);
    assert.equal(getActiveListenersForChannel(db, 'none@g.us').length, 0);
  });
});

describe('updateListener', () => {
  it('updates fields and returns updated record', () => {
    const c = createListener(db, { ...BASE, channelId: 'upd@g.us' });
    const u = updateListener(db, c.id, { channelName: 'New', keywords: ['abc'], isActive: false });
    assert.equal(u?.channelName, 'New');
    assert.deepEqual(u?.keywords, ['abc']);
    assert.equal(u?.isActive, false);
  });

  it('returns null when id not found', () => {
    assert.equal(updateListener(db, 9999, { channelName: 'X' }), null);
  });
});

describe('deleteListener', () => {
  it('removes the row and returns true', () => {
    const c = createListener(db, { ...BASE, channelId: 'del@g.us' });
    assert.equal(deleteListener(db, c.id), true);
    assert.equal(getAllListeners(db).length, 0);
  });

  it('returns false when id not found', () => {
    assert.equal(deleteListener(db, 9999), false);
  });
});
