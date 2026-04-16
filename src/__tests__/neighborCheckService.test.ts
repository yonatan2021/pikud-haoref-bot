import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  scheduleNeighborCheck,
  cancelAll,
  getUsersInAlertCities,
} from '../services/neighborCheckService.js';
import type { Alert } from '../types.js';
import type { Bot } from 'grammy';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function makeMockBot(): Bot {
  return {
    api: {
      sendMessage: mock.fn(async () => ({ message_id: 1 })),
    },
  } as unknown as Bot;
}

const REAL_ALERT: Alert = {
  id: 'abcdef1234567890abcdef1234567890abcdef12',
  type: 'missiles',
  cities: ['תל אביב', 'רמת גן'],
};

const DRILL_ALERT: Alert = {
  id: 'drill_fp_1234567890abcdef1234567890abcde',
  type: 'missilesDrill',
  cities: ['תל אביב'],
};

describe('neighborCheckService', () => {
  describe('scheduleNeighborCheck — drill guard', () => {
    it('does NOT schedule for drill alerts', () => {
      const db = makeDb();
      const bot = makeMockBot();
      const scheduleFn = mock.fn((fn: () => void, _ms: number) => setTimeout(fn, 999999));

      scheduleNeighborCheck(db, bot, DRILL_ALERT, { scheduleFn });

      assert.equal(
        (scheduleFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        0,
        'scheduleFn should NOT be called for drill alerts'
      );
    });

    it('schedules for non-drill alerts', () => {
      const db = makeDb();
      const bot = makeMockBot();
      const handles: NodeJS.Timeout[] = [];
      const scheduleFn = mock.fn((fn: () => void, _ms: number): NodeJS.Timeout => {
        const h = setTimeout(() => {}, 999999);
        handles.push(h);
        return h;
      });

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn });

      assert.equal(
        (scheduleFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        1,
        'scheduleFn should be called once for real alerts'
      );

      // Cleanup
      for (const h of handles) clearTimeout(h);
    });
  });

  describe('scheduleNeighborCheck — global kill-switch', () => {
    it('does NOT schedule when neighbor_check_enabled_default = false in DB', () => {
      const db = makeDb();
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('neighbor_check_enabled_default', 'false')`).run();
      const bot = makeMockBot();
      const scheduleFn = mock.fn((fn: () => void, _ms: number) => setTimeout(fn, 999999));

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn });

      assert.equal(
        (scheduleFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        0,
        'scheduleFn should NOT be called when kill-switch is off'
      );
    });
  });

  describe('scheduleNeighborCheck — delay', () => {
    it('schedules with correct delay from DB config', () => {
      const db = makeDb();
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('neighbor_check_delay_minutes', '3')`).run();
      const bot = makeMockBot();

      let capturedMs = 0;
      const scheduleFn = mock.fn((fn: () => void, ms: number): NodeJS.Timeout => {
        capturedMs = ms;
        return setTimeout(() => {}, 999999);
      });

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn });

      assert.equal(capturedMs, 3 * 60 * 1000, 'delay should be 3 minutes in ms');

      // Cleanup handles via cancelAll
      cancelAll();
    });
  });

  describe('scheduleNeighborCheck — fans out DMs', () => {
    it('calls sendFn for each matching user', () => {
      const db = makeDb();
      const bot = makeMockBot();

      // Seed two users with matching home_city
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(101, 'תל אביב', 1, 1);
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(102, 'תל אביב', 1, 1);
      // One user with neighbor_check disabled
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(103, 'תל אביב', 1, 0);
      // One user in a different city
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(104, 'חיפה', 1, 1);

      const sentToIds: number[] = [];
      const sendFn = mock.fn(async (chatId: number, _text: string, _keyboard: object) => {
        sentToIds.push(chatId);
        return { message_id: 1 };
      });

      // Use getUsersInCitiesFn override to use the real DB query
      let timerFired = false;
      const scheduleFn = (fn: () => void, _ms: number): NodeJS.Timeout => {
        // Execute immediately for testing
        fn();
        timerFired = true;
        return setTimeout(() => {}, 0);
      };

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn, sendFn });

      assert.ok(timerFired, 'timer callback should have fired');
      assert.equal(sentToIds.length, 2, 'should send to 2 users with matching city and enabled');
      assert.ok(sentToIds.includes(101), 'should include user 101');
      assert.ok(sentToIds.includes(102), 'should include user 102');
      assert.ok(!sentToIds.includes(103), 'should NOT include user 103 (disabled)');
      assert.ok(!sentToIds.includes(104), 'should NOT include user 104 (different city)');
    });

    it('does not send when no users match', () => {
      const db = makeDb();
      const bot = makeMockBot();
      const sendFn = mock.fn(async () => ({ message_id: 1 }));

      let fired = false;
      const scheduleFn = (fn: () => void, _ms: number): NodeJS.Timeout => {
        fn();
        fired = true;
        return setTimeout(() => {}, 0);
      };

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn, sendFn });

      assert.ok(fired, 'timer should fire');
      assert.equal(
        (sendFn as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        0,
        'sendFn should not be called when no matching users'
      );
    });
  });

  describe('cancelAll', () => {
    it('cancels all active handles', () => {
      const db = makeDb();
      const bot = makeMockBot();
      const cancelledHandles: NodeJS.Timeout[] = [];

      let scheduled = false;
      const scheduleFn = (_fn: () => void, _ms: number): NodeJS.Timeout => {
        const h = setTimeout(() => {}, 999999);
        scheduled = true;
        return h;
      };
      const cancelScheduleFn = mock.fn((h: NodeJS.Timeout) => {
        cancelledHandles.push(h);
        clearTimeout(h);
      });

      scheduleNeighborCheck(db, bot, REAL_ALERT, { scheduleFn, cancelScheduleFn });
      assert.ok(scheduled, 'handle should be scheduled');

      // cancelAll uses clearTimeout internally, not cancelScheduleFn
      cancelAll();

      // After cancelAll, scheduling a new one should work cleanly
      const scheduleFn2 = (_fn: () => void, _ms: number): NodeJS.Timeout => {
        return setTimeout(() => {}, 999999);
      };
      const alert2: Alert = { id: 'ffffffffffffffffffffffffffffffffffffffff', type: 'missiles', cities: [] };
      scheduleNeighborCheck(db, bot, alert2, { scheduleFn: scheduleFn2 });
      cancelAll(); // cleanup
    });
  });

  describe('getUsersInAlertCities', () => {
    it('returns empty array for empty cities', () => {
      const db = makeDb();
      const result = getUsersInAlertCities(db, []);
      assert.equal(result.length, 0);
    });

    it('filters by neighbor_check_enabled and is_dm_active', () => {
      const db = makeDb();
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(201, 'ירושלים', 1, 1);
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(202, 'ירושלים', 0, 1); // DM inactive
      db.prepare('INSERT INTO users (chat_id, home_city, is_dm_active, neighbor_check_enabled) VALUES (?, ?, ?, ?)').run(203, 'ירושלים', 1, 0); // NC disabled

      const result = getUsersInAlertCities(db, ['ירושלים']);
      assert.equal(result.length, 1);
      assert.equal(result[0]!.chat_id, 201);
    });
  });
});
