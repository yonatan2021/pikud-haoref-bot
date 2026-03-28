import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  upsertWindow,
  deleteWindow,
  loadAllWindows,
  clearAllWindows,
} from '../db/alertWindowRepository';
import type { TrackedMessage } from '../alertWindowTracker';

const BASE_MSG: TrackedMessage = {
  messageId: 123,
  chatId: '-100testchat',
  topicId: undefined,
  sentAt: 1_700_000_000_000,
  hasPhoto: false,
  alert: { type: 'missiles', cities: ['אבו גוש'] },
};

describe('alertWindowRepository', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => { getDb().prepare('DELETE FROM alert_window').run(); });

  it('upsertWindow + loadAllWindows: inserts and retrieves a window', () => {
    upsertWindow('missiles', BASE_MSG);
    const rows = loadAllWindows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].alertType, 'missiles');
    assert.equal(rows[0].msg.messageId, 123);
    assert.equal(rows[0].msg.chatId, '-100testchat');
    assert.equal(rows[0].msg.hasPhoto, false);
    assert.deepEqual(rows[0].msg.alert, BASE_MSG.alert);
  });

  it('upsertWindow: second call for same alertType updates instead of duplicating', () => {
    upsertWindow('missiles', BASE_MSG);
    const updated: TrackedMessage = { ...BASE_MSG, messageId: 999 };
    upsertWindow('missiles', updated);
    const rows = loadAllWindows();
    assert.equal(rows.length, 1, 'should have exactly one row after two upserts for same type');
    assert.equal(rows[0].msg.messageId, 999);
  });

  it('deleteWindow: removes the row for the given alert type', () => {
    upsertWindow('missiles', BASE_MSG);
    deleteWindow('missiles');
    const rows = loadAllWindows();
    assert.equal(rows.length, 0);
  });

  it('clearAllWindows: removes all rows across multiple alert types', () => {
    upsertWindow('missiles', BASE_MSG);
    upsertWindow('earthquake', { ...BASE_MSG, alert: { type: 'earthquake', cities: [] } });
    clearAllWindows();
    const rows = loadAllWindows();
    assert.equal(rows.length, 0);
  });

  it('loadAllWindows: skips rows with corrupt alert_json and returns remaining valid rows', () => {
    // Insert a valid row via upsertWindow
    upsertWindow('missiles', BASE_MSG);
    // Insert a corrupt row directly into the DB
    getDb()
      .prepare(`INSERT INTO alert_window (alert_type, message_id, chat_id, topic_id, alert_json, sent_at, has_photo)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('earthquake', 456, '-100testchat', null, 'NOT_VALID_JSON', Date.now(), 0);
    const rows = loadAllWindows();
    assert.equal(rows.length, 1, 'corrupt row should be skipped; only valid row returned');
    assert.equal(rows[0].alertType, 'missiles');
  });

  it('loadAllWindows: topic_id null round-trips as undefined', () => {
    const msgWithoutTopic: TrackedMessage = { ...BASE_MSG, topicId: undefined };
    upsertWindow('missiles', msgWithoutTopic);
    const rows = loadAllWindows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].msg.topicId, undefined, 'topic_id=null should come back as undefined');
  });

  it('loadAllWindows: topic_id non-null round-trips correctly', () => {
    const msgWithTopic: TrackedMessage = { ...BASE_MSG, topicId: 42 };
    upsertWindow('missiles', msgWithTopic);
    const rows = loadAllWindows();
    assert.equal(rows[0].msg.topicId, 42);
  });
});
