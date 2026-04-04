import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAllClearService } from '../services/allClearService.js';
import type Database from 'better-sqlite3';

// Builds a fake better-sqlite3 DB that returns settings from an in-memory map.
// getSetting() calls: db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
function fakeDb(settings: Record<string, string>): Database.Database {
  return {
    prepare: (_sql: string) => ({
      get: (key: string) => {
        const val = settings[key];
        return val !== undefined ? { value: val } : null;
      },
    }),
  } as unknown as Database.Database;
}

// Builds a service instance with controllable spies.
function makeService(
  mode: string,
  topicId?: number,
  getUserIdsByZone: (zones: string[]) => number[] = () => []
) {
  const settings: Record<string, string> = { all_clear_mode: mode };
  if (topicId !== undefined) settings['all_clear_topic_id'] = String(topicId);

  const dmCalls: Array<{ userId: number; text: string }> = [];
  const telegramCalls: Array<{ chatId: string; topicId: number | undefined; text: string }> = [];

  const service = createAllClearService({
    db: fakeDb(settings),
    chatId: 'chan-123',
    sendTelegram: async (chatId, tid, text) => { telegramCalls.push({ chatId, topicId: tid, text }); },
    getUserIdsByZone,
    sendDm: async (userId, text) => { dmCalls.push({ userId, text }); },
    renderTemplate: (zone, alertType) => `[${alertType}] ${zone}`,
  });

  return { service, dmCalls, telegramCalls };
}

describe('allClearService — dm mode', () => {
  it('sends DM to all subscribers of the zone', async () => {
    const { service, dmCalls, telegramCalls } = makeService('dm', undefined, () => [10, 20]);

    await service.handleAllClear([{ zone: 'גליל עליון', alertType: 'missiles' }]);

    assert.equal(dmCalls.length, 2);
    assert.equal(dmCalls[0].userId, 10);
    assert.equal(dmCalls[1].userId, 20);
    assert.ok(dmCalls[0].text.includes('גליל עליון'), 'Rendered text passed to DM');
    assert.equal(telegramCalls.length, 0, 'No channel message in dm mode');
  });

  it('sends no DM when zone has no subscribers', async () => {
    const { service, dmCalls } = makeService('dm', undefined, () => []);
    await service.handleAllClear([{ zone: 'גולן', alertType: 'missiles' }]);
    assert.equal(dmCalls.length, 0);
  });

  it('uses default dm mode when all_clear_mode is not set', async () => {
    const dmCalls: Array<{ userId: number }> = [];
    const service = createAllClearService({
      db: fakeDb({}), // no all_clear_mode key → defaults to 'dm'
      chatId: 'c',
      sendTelegram: async () => { throw new Error('should not be called'); },
      getUserIdsByZone: () => [99],
      sendDm: async (userId) => { dmCalls.push({ userId }); },
      renderTemplate: () => 'text',
    });
    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles' }]);
    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 99);
  });
});

describe('allClearService — channel mode', () => {
  it('sends to channel with configured topicId, no DMs', async () => {
    const { service, dmCalls, telegramCalls } = makeService('channel', 555, () => [1, 2]);

    await service.handleAllClear([{ zone: 'שרון', alertType: 'missiles' }]);

    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].chatId, 'chan-123');
    assert.equal(telegramCalls[0].topicId, 555);
    assert.ok(telegramCalls[0].text.includes('שרון'));
    assert.equal(dmCalls.length, 0);
  });

  it('sends with undefined topicId when not configured', async () => {
    const { service, telegramCalls } = makeService('channel'); // no topicId
    await service.handleAllClear([{ zone: 'חיפה', alertType: 'missiles' }]);
    assert.equal(telegramCalls[0].topicId, undefined);
  });
});

describe('allClearService — both mode', () => {
  it('sends DM and channel message', async () => {
    const { service, dmCalls, telegramCalls } = makeService('both', 777, () => [99]);

    await service.handleAllClear([{ zone: 'ירושלים', alertType: 'missiles' }]);

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 99);
    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].topicId, 777);
  });
});

describe('allClearService — multiple events', () => {
  it('processes each zone event independently', async () => {
    const { service, dmCalls } = makeService('dm', undefined, (zones) =>
      zones.includes('דן') ? [1] : zones.includes('שרון') ? [2] : []
    );

    await service.handleAllClear([
      { zone: 'דן', alertType: 'missiles' },
      { zone: 'שרון', alertType: 'missiles' },
    ]);

    const userIds = dmCalls.map((c) => c.userId).sort();
    assert.deepEqual(userIds, [1, 2]);
  });
});

describe('allClearService — error resilience', () => {
  it('continues to remaining users when one sendDm throws', async () => {
    const successfulIds: number[] = [];
    const service = createAllClearService({
      db: fakeDb({ all_clear_mode: 'dm' }),
      chatId: 'c',
      sendTelegram: async () => {},
      getUserIdsByZone: () => [1, 2, 3],
      sendDm: async (userId) => {
        if (userId === 2) throw new Error('Telegram 429');
        successfulIds.push(userId);
      },
      renderTemplate: () => 'text',
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles' }]);

    assert.deepEqual(successfulIds.sort(), [1, 3], 'Users 1 and 3 received DM despite failure for user 2');
  });

  it('continues to next event when sendTelegram throws', async () => {
    let callCount = 0;
    const service = createAllClearService({
      db: fakeDb({ all_clear_mode: 'channel' }),
      chatId: 'c',
      sendTelegram: async () => { callCount++; throw new Error('network error'); },
      getUserIdsByZone: () => [],
      sendDm: async () => {},
      renderTemplate: () => 'text',
    });

    // Two events — both should be attempted even though the first throws
    await service.handleAllClear([
      { zone: 'דן', alertType: 'missiles' },
      { zone: 'שרון', alertType: 'missiles' },
    ]);

    assert.equal(callCount, 2, 'Both channel sends attempted despite first failure');
  });
});
