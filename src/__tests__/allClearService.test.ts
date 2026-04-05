import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAllClearService } from '../services/allClearService.js';
import type { AllClearEvent } from '../services/allClearService.js';
import type { SubscriberInfo } from '../db/subscriptionRepository.js';
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

function makeSubscriber(overrides: Partial<SubscriberInfo> & { chat_id: number }): SubscriberInfo {
  return {
    format: 'short',
    quiet_hours_enabled: false,
    muted_until: null,
    home_city: null,
    matchedCities: [],
    ...overrides,
  };
}

// Builds a service instance with controllable spies.
function makeService(opts: {
  mode: string;
  topicId?: number;
  getUserIdsByZone?: (zones: string[]) => number[];
  getUsersByHomeCityInCities?: (cityNames: string[]) => SubscriberInfo[];
  shouldSkipForQuietHours?: (alertType: string, quietEnabled: boolean, now: Date) => boolean;
  dmAllClearText?: string;
}) {
  const settings: Record<string, string> = { all_clear_mode: opts.mode };
  if (opts.topicId !== undefined) settings['all_clear_topic_id'] = String(opts.topicId);
  if (opts.dmAllClearText !== undefined) settings['dm_all_clear_text'] = opts.dmAllClearText;

  const dmCalls: Array<{ userId: number; text: string }> = [];
  const telegramCalls: Array<{ chatId: string; topicId: number | undefined; text: string }> = [];

  const service = createAllClearService({
    db: fakeDb(settings),
    chatId: 'chan-123',
    sendTelegram: async (chatId, tid, text) => { telegramCalls.push({ chatId, topicId: tid, text }); },
    getUserIdsByZone: opts.getUserIdsByZone ?? (() => []),
    getUsersByHomeCityInCities: opts.getUsersByHomeCityInCities ?? (() => []),
    shouldSkipForQuietHours: opts.shouldSkipForQuietHours ?? (() => false),
    sendDm: async (userId, text) => { dmCalls.push({ userId, text }); },
    renderTemplate: (zone, alertType) => `[${alertType}] ${zone}`,
  });

  return { service, dmCalls, telegramCalls };
}

describe('allClearService — dm mode', () => {
  it('sends DM to subscribers whose home_city is in alertCities', async () => {
    const { service, dmCalls, telegramCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: (cities) =>
        cities.includes('תל אביב')
          ? [makeSubscriber({ chat_id: 10, home_city: 'תל אביב' }), makeSubscriber({ chat_id: 20, home_city: 'תל אביב' })]
          : [],
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב', 'רמת גן'] }]);

    assert.equal(dmCalls.length, 2);
    assert.equal(dmCalls[0].userId, 10);
    assert.equal(dmCalls[1].userId, 20);
    assert.ok(dmCalls[0].text.includes('דן'), 'Rendered text passed to DM');
    assert.equal(telegramCalls.length, 0, 'No channel message in dm mode');
  });

  it('sends no DM when no subscribers have home_city in alertCities', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [],
    });
    await service.handleAllClear([{ zone: 'גולן', alertType: 'missiles', alertCities: ['קצרין'] }]);
    assert.equal(dmCalls.length, 0);
  });

  it('uses default dm mode when all_clear_mode is not set', async () => {
    const dmCalls: Array<{ userId: number }> = [];
    const service = createAllClearService({
      db: fakeDb({}), // no all_clear_mode key → defaults to 'dm'
      chatId: 'c',
      sendTelegram: async () => { throw new Error('should not be called'); },
      getUserIdsByZone: () => [99],
      getUsersByHomeCityInCities: () => [makeSubscriber({ chat_id: 99, home_city: 'חיפה' })],
      shouldSkipForQuietHours: () => false,
      sendDm: async (userId) => { dmCalls.push({ userId }); },
      renderTemplate: () => 'text',
    });
    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['חיפה'] }]);
    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 99);
  });
});

describe('allClearService — channel mode', () => {
  it('sends to channel with configured topicId, no DMs', async () => {
    const { service, dmCalls, telegramCalls } = makeService({
      mode: 'channel',
      topicId: 555,
      getUserIdsByZone: () => [1, 2],
      getUsersByHomeCityInCities: () => [makeSubscriber({ chat_id: 1 }), makeSubscriber({ chat_id: 2 })],
    });

    await service.handleAllClear([{ zone: 'שרון', alertType: 'missiles', alertCities: ['נתניה'] }]);

    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].chatId, 'chan-123');
    assert.equal(telegramCalls[0].topicId, 555);
    assert.ok(telegramCalls[0].text.includes('שרון'));
    assert.equal(dmCalls.length, 0);
  });

  it('sends with undefined topicId when not configured', async () => {
    const { service, telegramCalls } = makeService({ mode: 'channel' }); // no topicId
    await service.handleAllClear([{ zone: 'חיפה', alertType: 'missiles', alertCities: ['חיפה'] }]);
    assert.equal(telegramCalls[0].topicId, undefined);
  });
});

describe('allClearService — both mode', () => {
  it('sends DM and channel message', async () => {
    const { service, dmCalls, telegramCalls } = makeService({
      mode: 'both',
      topicId: 777,
      getUsersByHomeCityInCities: () => [makeSubscriber({ chat_id: 99, home_city: 'ירושלים' })],
    });

    await service.handleAllClear([{ zone: 'ירושלים', alertType: 'missiles', alertCities: ['ירושלים'] }]);

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 99);
    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].topicId, 777);
  });
});

describe('allClearService — multiple events', () => {
  it('processes each zone event independently', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: (cities) =>
        cities.includes('תל אביב')
          ? [makeSubscriber({ chat_id: 1, home_city: 'תל אביב' })]
          : cities.includes('נתניה')
            ? [makeSubscriber({ chat_id: 2, home_city: 'נתניה' })]
            : [],
    });

    await service.handleAllClear([
      { zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] },
      { zone: 'שרון', alertType: 'missiles', alertCities: ['נתניה'] },
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
      getUserIdsByZone: () => [],
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 1 }),
        makeSubscriber({ chat_id: 2 }),
        makeSubscriber({ chat_id: 3 }),
      ],
      shouldSkipForQuietHours: () => false,
      sendDm: async (userId) => {
        if (userId === 2) throw new Error('Telegram 429');
        successfulIds.push(userId);
      },
      renderTemplate: () => 'text',
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.deepEqual(successfulIds.sort(), [1, 3], 'Users 1 and 3 received DM despite failure for user 2');
  });

  it('continues to next event when sendTelegram throws', async () => {
    let callCount = 0;
    const service = createAllClearService({
      db: fakeDb({ all_clear_mode: 'channel' }),
      chatId: 'c',
      sendTelegram: async () => { callCount++; throw new Error('network error'); },
      getUserIdsByZone: () => [],
      getUsersByHomeCityInCities: () => [],
      shouldSkipForQuietHours: () => false,
      sendDm: async () => {},
      renderTemplate: () => 'text',
    });

    // Two events — both should be attempted even though the first throws
    await service.handleAllClear([
      { zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] },
      { zone: 'שרון', alertType: 'missiles', alertCities: ['נתניה'] },
    ]);

    assert.equal(callCount, 2, 'Both channel sends attempted despite first failure');
  });
});

describe('allClearService — home_city filtering', () => {
  it('user with home_city in alertCities receives all-clear', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: (cities) =>
        cities.includes('חיפה')
          ? [makeSubscriber({ chat_id: 42, home_city: 'חיפה' })]
          : [],
    });

    await service.handleAllClear([{ zone: 'חיפה', alertType: 'missiles', alertCities: ['חיפה', 'קריית אתא'] }]);

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].userId, 42);
  });

  it('user with home_city NOT in alertCities does NOT receive all-clear', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      // getUsersByHomeCityInCities correctly returns empty when home_city not in list
      getUsersByHomeCityInCities: () => [],
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 0, 'No DM sent when home_city not in alertCities');
  });
});

describe('allClearService — quiet hours and snooze', () => {
  it('user in quiet hours does NOT receive all-clear for drills', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 50, home_city: 'תל אביב', quiet_hours_enabled: true }),
      ],
      shouldSkipForQuietHours: (_alertType, quietEnabled) => quietEnabled,
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'drill', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 0, 'DM skipped for quiet-hours user');
  });

  it('user in quiet hours DOES receive all-clear for security alerts', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 51, home_city: 'תל אביב', quiet_hours_enabled: true }),
      ],
      // shouldSkipForQuietHours returns false for security alerts even when quiet is enabled
      shouldSkipForQuietHours: () => false,
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 1, 'DM sent for security alert despite quiet hours');
    assert.equal(dmCalls[0].userId, 51);
  });

  it('snoozed user does NOT receive all-clear for general alerts', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 60, home_city: 'תל אביב', muted_until: futureDate }),
      ],
    });

    // 'general' category is suppressible by snooze
    await service.handleAllClear([{ zone: 'דן', alertType: 'newsFlash', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 0, 'DM skipped for snoozed user');
  });

  it('snoozed user DOES receive all-clear for security alerts', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 61, home_city: 'תל אביב', muted_until: futureDate }),
      ],
    });

    // 'missiles' maps to 'security' category — snooze does NOT apply
    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 1, 'DM sent for security alert despite snooze');
    assert.equal(dmCalls[0].userId, 61);
  });
});

describe('allClearService — dm_all_clear_text setting', () => {
  it('uses dm_all_clear_text when configured, substituting {{עיר}}', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      dmAllClearText: '🕊️ נשמו! ההתראה ב{{עיר}} הסתיימה.',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 70, home_city: 'חיפה' }),
      ],
    });

    await service.handleAllClear([{ zone: 'קריות', alertType: 'missiles', alertCities: ['חיפה'] }]);

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].text, '🕊️ נשמו! ההתראה בחיפה הסתיימה.');
  });

  it('falls back to renderTemplate when dm_all_clear_text is not set', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 71, home_city: 'תל אביב' }),
      ],
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls.length, 1);
    assert.equal(dmCalls[0].text, '[missiles] דן', 'Falls back to renderTemplate output');
  });

  it('substitutes {{עיר}} with zone when subscriber has no home_city', async () => {
    const { service, dmCalls } = makeService({
      mode: 'dm',
      dmAllClearText: 'נשמו ב{{עיר}}!',
      getUsersByHomeCityInCities: () => [
        makeSubscriber({ chat_id: 72, home_city: null }),
      ],
    });

    await service.handleAllClear([{ zone: 'דן', alertType: 'missiles', alertCities: ['תל אביב'] }]);

    assert.equal(dmCalls[0].text, 'נשמו בדן!', 'Falls back to zone name when home_city is null');
  });
});
