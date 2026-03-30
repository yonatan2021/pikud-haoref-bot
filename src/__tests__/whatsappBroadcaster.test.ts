import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';
import type { BroadcasterDeps } from '../whatsapp/whatsappBroadcaster';

// Use in-memory DB
process.env['DB_PATH'] = ':memory:';

// Suppress logger stdout
let stdoutSpy: ReturnType<typeof mock.method>;
beforeEach(() => {
  stdoutSpy = mock.method(process.stdout, 'write', () => true);
});
afterEach(() => {
  stdoutSpy.mock.restore();
});

import { createBroadcaster } from '../whatsapp/whatsappBroadcaster';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema';
import { upsertGroup, getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

type SendMessageFn = ReturnType<typeof mock.fn>;

function makeDeps(overrides: Partial<BroadcasterDeps> = {}): BroadcasterDeps & {
  sendMessage: SendMessageFn;
} {
  const sendMessage = mock.fn(async () => {});
  const getChatById = mock.fn(async () => ({ sendMessage }));

  return {
    getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
    getClientFn: mock.fn(() => ({ getChatById })) as unknown as BroadcasterDeps['getClientFn'],
    getEnabledGroupsFn: mock.fn((_db: Database.Database, _type: string) => ['group1', 'group2']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
    formatFn: mock.fn(() => 'formatted message') as unknown as BroadcasterDeps['formatFn'],
    sendMessage,
    ...overrides,
  };
}

const BASE_ALERT: Alert = { type: 'missiles', cities: ['תל אביב'] };

describe('whatsappBroadcaster — disconnected status', () => {
  it('returns early without calling getClient when status is disconnected', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'disconnected') as unknown as () => string,
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when disconnected'
    );
  });

  it('returns early for qr status as well', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'qr') as unknown as () => string,
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when qr status'
    );
  });
});

describe('whatsappBroadcaster — ready status with groups', () => {
  it('calls sendMessage for each enabled group when status is ready', async () => {
    const db = makeDb();
    const sendMessage = mock.fn(async () => {});
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    // getEnabledGroupsFn returns ['group1', 'group2'] by default
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'sendMessage should be called once per group'
    );
  });

  it('calls formatFn to build message text', async () => {
    const db = makeDb();
    const formatFn = mock.fn(() => 'test formatted message');
    const deps = makeDeps({
      formatFn: formatFn as unknown as BroadcasterDeps['formatFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (formatFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
      'formatFn should be called once'
    );
  });
});

describe('whatsappBroadcaster — partial failure', () => {
  it('continues sending to other groups when one group fails', async () => {
    const db = makeDb();
    let callCount = 0;
    const sendMessage = mock.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('send failed for group1');
    });
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const getClientFn = mock.fn(() => ({ getChatById }));
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    // Should not throw even when one group fails
    await assert.doesNotReject(() => broadcast(BASE_ALERT));

    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      2,
      'sendMessage should be attempted for both groups despite first failure'
    );
  });
});

describe('whatsappBroadcaster — null client despite ready', () => {
  it('skips broadcast when getClientFn returns null even with ready status and groups', async () => {
    const db = makeDb();
    const sendMessage = mock.fn(async () => {});
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
      getEnabledGroupsFn: mock.fn(() => ['group1@g.us']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: mock.fn(() => null) as unknown as BroadcasterDeps['getClientFn'],
    });
    const broadcaster = createBroadcaster(db, deps);
    await assert.doesNotReject(() => broadcaster(BASE_ALERT));
    // getChatById and sendMessage should never be called since client is null
    assert.equal(
      (getChatById as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getChatById must not be called when getClientFn returns null'
    );
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'sendMessage must not be called when getClientFn returns null'
    );
  });

  it('returns early without sending when formatFn throws', async () => {
    const db = makeDb();
    const sendMessage = mock.fn(async () => {});
    const getChatById = mock.fn(async () => ({ sendMessage }));
    const deps = makeDeps({
      getStatusFn: mock.fn(() => 'ready') as unknown as () => string,
      getEnabledGroupsFn: mock.fn(() => ['group1@g.us']) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
      getClientFn: mock.fn(() => ({ getChatById })) as unknown as BroadcasterDeps['getClientFn'],
      formatFn: mock.fn(() => { throw new Error('formatter exploded'); }) as unknown as BroadcasterDeps['formatFn'],
    });
    const broadcaster = createBroadcaster(db, deps);
    await assert.doesNotReject(() => broadcaster(BASE_ALERT));
    assert.equal(
      (getChatById as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getChatById must not be called when formatter throws'
    );
    assert.equal(
      (sendMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'sendMessage must not be called when formatter throws'
    );
  });
});

describe('whatsappBroadcaster — no enabled groups', () => {
  it('does not call getClient when no groups are enabled for alert type', async () => {
    const db = makeDb();
    const getClientFn = mock.fn(() => null);
    const deps = makeDeps({
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      getEnabledGroupsFn: mock.fn(() => []) as unknown as BroadcasterDeps['getEnabledGroupsFn'],
    });

    const broadcast = createBroadcaster(db, deps);
    await broadcast(BASE_ALERT);

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when no groups enabled'
    );
  });

  it('works correctly with a real DB that has no matching groups', async () => {
    const db = makeDb();
    // Only add a group for earthquakes, not missiles
    upsertGroup(db, 'group-eq', 'Earthquake Group', true, ['earthQuake']);

    const getClientFn = mock.fn(() => null);
    const sendMessage = mock.fn(async () => {});

    const realDeps: BroadcasterDeps = {
      getStatusFn: () => 'ready',
      getClientFn: getClientFn as unknown as BroadcasterDeps['getClientFn'],
      getEnabledGroupsFn: (d, type) => {
        // Use the real repository function
        return getEnabledGroupsForAlertType(d, type) as string[];
      },
      formatFn: () => 'text',
    };

    const broadcast = createBroadcaster(db, realDeps);
    await broadcast(BASE_ALERT); // missiles — no group should match

    assert.equal(
      (getClientFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
      'getClient should not be called when no group matches missiles type'
    );
  });
});
