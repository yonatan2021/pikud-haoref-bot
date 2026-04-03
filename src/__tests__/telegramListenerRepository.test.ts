import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  getAllListeners,
  getActiveListenersForChat,
  createListener,
  updateListener,
  deleteListener,
  upsertKnownChat,
  getAllKnownChats,
  clearKnownChats,
} from '../db/telegramListenerRepository.js';

let db: Database.Database;
before(() => { db = new Database(':memory:'); initSchema(db); });
after(() => db.close());
beforeEach(() => {
  db.prepare('DELETE FROM telegram_listeners').run();
  db.prepare('DELETE FROM telegram_known_chats').run();
});

const BASE = {
  chatId: '-100123456789',
  chatName: 'Test Group',
  chatType: 'group',
  keywords: [] as string[],
  telegramTopicId: null,
  telegramTopicName: null,
  forwardToWhatsApp: false,
  isActive: true,
};

describe('createListener', () => {
  it('inserts and returns the new listener with correct shape', () => {
    const r = createListener(db, { ...BASE, chatId: '-100111', keywords: ['חירום', 'רקטה'] });
    assert.equal(r.chatId, '-100111');
    assert.deepEqual(r.keywords, ['חירום', 'רקטה']);
    assert.ok(r.id > 0);
    assert.equal(r.forwardToWhatsApp, false);
    assert.equal(r.isActive, true);
  });

  it('maps forward_to_whatsapp correctly', () => {
    const r = createListener(db, { ...BASE, chatId: '-100222', forwardToWhatsApp: true });
    assert.equal(r.forwardToWhatsApp, true);
  });

  it('throws on duplicate chat_id', () => {
    createListener(db, { ...BASE, chatId: '-100dup' });
    assert.throws(() => createListener(db, { ...BASE, chatId: '-100dup' }));
  });
});

describe('getActiveListenersForChat', () => {
  it('returns only active listeners matching chat_id', () => {
    createListener(db, { ...BASE, chatId: '-100active', isActive: true });
    createListener(db, { ...BASE, chatId: '-100off', isActive: false });
    assert.equal(getActiveListenersForChat(db, '-100active').length, 1);
    assert.equal(getActiveListenersForChat(db, '-100off').length, 0);
    assert.equal(getActiveListenersForChat(db, '-100none').length, 0);
  });
});

describe('updateListener', () => {
  it('updates fields and returns updated record', () => {
    const c = createListener(db, { ...BASE, chatId: '-100upd' });
    const u = updateListener(db, c.id, { chatName: 'New Name', keywords: ['abc'], isActive: false, forwardToWhatsApp: true });
    assert.equal(u?.chatName, 'New Name');
    assert.deepEqual(u?.keywords, ['abc']);
    assert.equal(u?.isActive, false);
    assert.equal(u?.forwardToWhatsApp, true);
  });

  it('returns null when id not found', () => {
    assert.equal(updateListener(db, 9999, { chatName: 'X' }), null);
  });

  it('partial update leaves other fields unchanged', () => {
    const c = createListener(db, { ...BASE, chatId: '-100partial', keywords: ['orig'] });
    const u = updateListener(db, c.id, { isActive: false });
    assert.deepEqual(u?.keywords, ['orig']);
    assert.equal(u?.isActive, false);
  });
});

describe('deleteListener', () => {
  it('removes the row and returns true', () => {
    const c = createListener(db, { ...BASE, chatId: '-100del' });
    assert.equal(deleteListener(db, c.id), true);
    assert.equal(getAllListeners(db).length, 0);
  });

  it('returns false when id not found', () => {
    assert.equal(deleteListener(db, 9999), false);
  });
});

describe('upsertKnownChat / getAllKnownChats / clearKnownChats', () => {
  it('inserts a known chat', () => {
    upsertKnownChat(db, { chatId: '-100chat1', chatName: 'Group A', chatType: 'group' });
    const chats = getAllKnownChats(db);
    assert.equal(chats.length, 1);
    assert.equal(chats[0]!.chatId, '-100chat1');
  });

  it('upsert updates on conflict', () => {
    upsertKnownChat(db, { chatId: '-100chat1', chatName: 'Old', chatType: 'group' });
    upsertKnownChat(db, { chatId: '-100chat1', chatName: 'New', chatType: 'supergroup' });
    const chats = getAllKnownChats(db);
    assert.equal(chats.length, 1);
    assert.equal(chats[0]!.chatName, 'New');
    assert.equal(chats[0]!.chatType, 'supergroup');
  });

  it('clearKnownChats removes all rows', () => {
    upsertKnownChat(db, { chatId: '-100a', chatName: 'A', chatType: 'group' });
    upsertKnownChat(db, { chatId: '-100b', chatName: 'B', chatType: 'channel' });
    clearKnownChats(db);
    assert.equal(getAllKnownChats(db).length, 0);
  });
});
