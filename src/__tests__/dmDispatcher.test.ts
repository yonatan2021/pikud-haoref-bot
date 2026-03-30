import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';
import { buildShortMessage, buildAlertDmMessage, buildNewsFlashDmMessage, buildDmText, shouldSkipForQuietHours, notifySubscribers } from '../services/dmDispatcher';
import type { DmTask } from '../services/dmQueue';

// Use in-memory DB for all notifySubscribers integration tests
process.env['DB_PATH'] = ':memory:';

describe('dmDispatcher short format', () => {
  it('formats missiles alert correctly', () => {
    const alert: Alert = { type: 'missiles', cities: ['תל אביב', 'רמת גן'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('🔴'));
    assert.ok(msg.includes('התרעת טילים'));
    assert.ok(msg.includes('תל אביב'));
    assert.ok(msg.includes('רמת גן'));
  });

  it('shows overflow count when more than 10 cities', () => {
    const cities = Array.from({ length: 15 }, (_, i) => `עיר ${i + 1}`);
    const alert: Alert = { type: 'missiles', cities };
    const msg = buildShortMessage(alert);
    assert.ok(msg.includes('ועוד 5'));
  });

  it('no overflow for exactly 10 cities', () => {
    const cities = Array.from({ length: 10 }, (_, i) => `עיר ${i + 1}`);
    const alert: Alert = { type: 'missiles', cities };
    const msg = buildShortMessage(alert);
    assert.ok(!msg.includes('ועוד'));
  });

  it('uses drill emoji for drill types', () => {
    const alert: Alert = { type: 'missilesDrill', cities: ['תל אביב'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('🔵'));
    assert.ok(msg.includes('תרגיל'));
  });

  it('falls back to ⚠️ for unknown type', () => {
    const alert: Alert = { type: 'unknownType', cities: ['תל אביב'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.startsWith('⚠️'));
  });
});

describe('buildShortMessage — countdown suffix', () => {
  it('appends countdown for a city with known countdown > 0', () => {
    // אבו גוש has countdown > 0 in cities.json
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildShortMessage(alert);
    assert.ok(msg.includes('⏱'), 'expected ⏱ countdown indicator');
    assert.ok(msg.includes("שנ׳"), "expected שנ׳ unit");
  });

  it('omits countdown suffix for empty city list', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const msg = buildShortMessage(alert);
    assert.ok(!msg.includes('⏱'), 'no countdown expected for empty city list');
  });

  it('omits countdown suffix for cities with no data', () => {
    const alert: Alert = { type: 'missiles', cities: ['עיר_לא_קיימת_בכלל'] };
    const msg = buildShortMessage(alert);
    assert.ok(!msg.includes('⏱'), 'no countdown for unknown city');
  });
});

describe('buildAlertDmMessage', () => {
  it('title line includes "באזורך" for non-empty city list', () => {
    const alert: Alert = { type: 'missiles', cities: ['תל אביב', 'רמת גן'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('באזורך'));
    assert.ok(msg.startsWith('🔴'));
  });

  it('shows 📍 line with city names', () => {
    const alert: Alert = { type: 'missiles', cities: ['תל אביב', 'רמת גן'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('📍'));
    assert.ok(msg.includes('תל אביב'));
    assert.ok(msg.includes('רמת גן'));
  });

  it('countdown line uses full "שניות" word (not "שנ׳") for city with countdown > 0', () => {
    // אבו גוש has countdown > 0 in cities.json
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('⏱'), 'expected ⏱ indicator');
    assert.ok(msg.includes('שניות'), 'expected full "שניות" word');
    assert.ok(!msg.includes("שנ׳"), 'must NOT use abbreviated "שנ׳"');
    assert.ok(msg.includes('להיכנס למרחב מוגן'), 'expected action text');
  });

  it('omits countdown line when countdown = 0 and no instructions', () => {
    const alert: Alert = { type: 'missiles', cities: ['עיר_לא_קיימת_בכלל'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(!msg.includes('⏱'), 'no countdown for unknown city');
    assert.ok(!msg.includes('להיכנס'), 'no action text without countdown');
  });

  it('shows instructions when countdown = 0 and instructions present', () => {
    const alert: Alert = { type: 'earthQuake', cities: ['עיר_לא_קיימת_בכלל'], instructions: 'נסו לצאת לשטח פתוח' };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('נסו לצאת לשטח פתוח'));
    assert.ok(!msg.includes('⏱'));
  });

  it('adds "(תרגיל)" suffix to countdown line for drill types', () => {
    const alert: Alert = { type: 'missilesDrill', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('(תרגיל)'), 'drill marker must appear');
    assert.ok(msg.includes('⏱'));
  });

  it('shows "ברחבי הארץ" and no "באזורך" for nationwide alert (empty cities)', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('ברחבי הארץ'));
    assert.ok(!msg.includes('באזורך'));
  });

  it('shows overflow count when more than 10 cities', () => {
    const cities = Array.from({ length: 15 }, (_, i) => `עיר ${i + 1}`);
    const alert: Alert = { type: 'missiles', cities };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('ועוד 5'));
  });
});

describe('buildNewsFlashDmMessage', () => {
  it('shows zone names instead of city names', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש', 'נהריה'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('📢'));
    assert.ok(msg.includes('בית שמש'), 'should include zone of אבו גוש');
    assert.ok(msg.includes('קו העימות'), 'should include zone of נהריה');
    assert.ok(!msg.includes('אבו גוש'), 'should NOT list individual cities');
    assert.ok(!msg.includes('נהריה'), 'should NOT list individual cities');
  });

  it('deduplicates zones — two different cities in same zone produce one zone label', () => {
    // אבו גוש (id=511) and אביעזר (id=359) are both in zone בית שמש
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש', 'אביעזר'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    const count = (msg.match(/בית שמש/g) ?? []).length;
    assert.equal(count, 1, 'zone should appear only once for two cities in the same zone');
  });

  it('preserves first-appearance zone order', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['נהריה', 'אבו גוש'], // קו העימות first, then בית שמש
    };
    const msg = buildNewsFlashDmMessage(alert);
    const posFirst = msg.indexOf('קו העימות');
    const posSecond = msg.indexOf('בית שמש');
    assert.ok(posFirst < posSecond, 'first-seen zone should appear before second-seen zone');
  });

  it('appends instructions on a new line when present', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
      instructions: 'ניתן לצאת מהמרחבים המוגנים',
    };
    const msg = buildNewsFlashDmMessage(alert);
    const lines = msg.split('\n');
    // New format: line 1=headline, line 2=📍 location, line 3=instructions
    assert.equal(lines.length, 3, 'should have three lines: headline, location, instructions');
    assert.equal(lines[2], 'ניתן לצאת מהמרחבים המוגנים', 'third line should be the instructions');
  });

  it('produces two lines when has cities but no instructions', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    // New format: headline + 📍 location = 2 lines
    assert.equal(msg.split('\n').length, 2, 'should have two lines: headline and location');
    assert.ok(msg.split('\n')[1].startsWith('📍'), 'second line must start with 📍');
  });

  it('handles empty city list gracefully', () => {
    const alert: Alert = { type: 'newsFlash', cities: [] };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('📢'));
    assert.ok(!msg.includes('|'));
  });

  it('falls back to city name when no zone data found', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['עיר_לא_קיימת_בכלל'],
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.includes('עיר_לא_קיימת_בכלל'), 'should fall back to city name');
  });
});

describe('buildNewsFlashDmMessage — preliminary alert detection', () => {
  it('regular newsFlash uses 📢 emoji and plain title', () => {
    const alert: Alert = { type: 'newsFlash', cities: ['אבו גוש'], instructions: 'האירוע הסתיים' };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.split('\n')[0].startsWith('📢'));
    assert.ok(!msg.split('\n')[0].includes('מקדימה'));
  });

  it('detects preliminary alert by "בדקות הקרובות" keyword — uses ⚠️ and "באזורך"', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
      instructions: 'בדקות הקרובות צפויות להתקבל התראות באזורך',
    };
    const msg = buildNewsFlashDmMessage(alert);
    const firstLine = msg.split('\n')[0];
    assert.ok(firstLine.startsWith('⚠️'), `expected ⚠️ but got: ${firstLine}`);
    assert.ok(firstLine.includes('באזורך'));
    assert.ok(firstLine.includes('התראה מקדימה'));
  });

  it('detects preliminary by "צפויות להתקבל" keyword', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
      instructions: 'צפויות להתקבל התראות בשעות הקרובות',
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('⚠️'));
  });

  it('detects preliminary by "התראה מקדימה" keyword', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אבו גוש'],
      instructions: 'התראה מקדימה לאזורכם',
    };
    const msg = buildNewsFlashDmMessage(alert);
    assert.ok(msg.startsWith('⚠️'));
  });

  it('preliminary alert passes instructions as-is on third line', () => {
    const instructions = 'בדקות הקרובות צפויות להתקבל התראות באזורך';
    const alert: Alert = { type: 'newsFlash', cities: ['אבו גוש'], instructions };
    const msg = buildNewsFlashDmMessage(alert);
    const lines = msg.split('\n');
    assert.equal(lines[2], instructions, 'instructions must appear verbatim on line 3');
  });
});

describe('buildDmText — unified format (no short/detailed distinction)', () => {
  it('missiles: short and detailed produce identical output', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    assert.equal(buildDmText(alert, 'short'), buildDmText(alert, 'detailed'));
  });

  it('missiles: output uses new personal format with "באזורך"', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(alert, 'short');
    assert.ok(msg.includes('באזורך'));
    assert.ok(msg.includes('📍'));
  });
});

describe('buildDmText — personalization integration', () => {
  it('short format shows only matchedCities, not all alert cities', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert, 'short');
    assert.ok(msg.includes('אבו גוש'), 'matched city must appear');
    assert.ok(!msg.includes('נהריה'), 'unmatched city must not appear');
    assert.ok(!msg.includes('חיפה'), 'unmatched city must not appear');
  });

  it('detailed format uses formatAlertMessage with matched cities only', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert, 'detailed');
    assert.ok(msg.includes('אבו גוש'));
    assert.ok(!msg.includes('נהריה'));
  });

  it('newsFlash uses buildNewsFlashDmMessage regardless of format', () => {
    const personalAlert: Alert = { type: 'newsFlash', cities: ['אבו גוש'], instructions: 'הנחיות' };
    const msg = buildDmText(personalAlert, 'short');
    assert.ok(msg.startsWith('📢'), 'newsFlash must use newsFlash formatter');
    assert.ok(msg.includes('הנחיות'));
  });
});

describe('shouldSkipForQuietHours', () => {
  // UTC 23:00 → Israel 01:00–02:00 — always in quiet window
  const NIGHT = new Date('2026-03-28T23:00:00.000Z');
  // UTC 08:00 → Israel 10:00–11:00 — always daytime
  const DAY   = new Date('2026-03-28T08:00:00.000Z');

  it('returns false when quiet hours disabled, even at night', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', false, NIGHT), false);
  });

  it('returns false during daytime when enabled', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', true, DAY), false);
  });

  it('blocks newsFlash at night when enabled', () => {
    assert.equal(shouldSkipForQuietHours('newsFlash', true, NIGHT), true);
  });

  it('blocks general type at night', () => {
    assert.equal(shouldSkipForQuietHours('general', true, NIGHT), true);
  });

  it('blocks unknown type at night', () => {
    assert.equal(shouldSkipForQuietHours('unknown', true, NIGHT), true);
  });

  it('blocks drill types at night', () => {
    assert.equal(shouldSkipForQuietHours('missilesDrill', true, NIGHT), true);
    assert.equal(shouldSkipForQuietHours('generalDrill', true, NIGHT), true);
  });

  it('never blocks missiles', () => {
    assert.equal(shouldSkipForQuietHours('missiles', true, NIGHT), false);
  });

  it('never blocks earthquake', () => {
    assert.equal(shouldSkipForQuietHours('earthQuake', true, NIGHT), false);
  });

  it('never blocks hazardous materials', () => {
    assert.equal(shouldSkipForQuietHours('hazardousMaterials', true, NIGHT), false);
  });

  it('blocks all drill subtypes at night when enabled', () => {
    const drills = [
      'missilesDrill', 'earthQuakeDrill', 'tsunamiDrill',
      'hostileAircraftIntrusionDrill', 'hazardousMaterialsDrill',
      'terroristInfiltrationDrill', 'radiologicalEventDrill', 'generalDrill',
    ];
    for (const type of drills) {
      assert.equal(shouldSkipForQuietHours(type, true, NIGHT), true, `${type} must be suppressed at night`);
    }
  });

  it('never blocks security/nature/environmental types regardless of time or setting', () => {
    const alwaysThrough = [
      'missiles', 'hostileAircraftIntrusion', 'terroristInfiltration',
      'earthQuake', 'tsunami',
      'hazardousMaterials', 'radiologicalEvent',
    ];
    for (const type of alwaysThrough) {
      assert.equal(shouldSkipForQuietHours(type, true, NIGHT), false, `${type} must never be suppressed`);
    }
  });
});

// notifySubscribers() integration tests — uses real DB with injected enqueueAll
describe('notifySubscribers', () => {
  // Lazy imports so DB modules load after the data dir is guaranteed to exist
  let initDb: () => void;
  let getDb: () => import('better-sqlite3').Database;
  let closeDb: () => void;
  let addSubscription: (chatId: number, cityName: string) => void;
  let upsertUser: (chatId: number) => void;
  let setQuietHours: (chatId: number, enabled: boolean) => void;
  let setMutedUntil: (chatId: number, until: Date | null) => void;

  const CHAT_A = 777001;
  // 'אבו גוש' (id=511) — reliable test fixture with zone data
  const TEST_CITY = 'אבו גוש';

  before(async () => {
    const schema = await import('../db/schema.js');
    const subRepo = await import('../db/subscriptionRepository.js');
    const userRepo = await import('../db/userRepository.js');
    initDb = schema.initDb;
    getDb = schema.getDb;
    closeDb = schema.closeDb;
    addSubscription = subRepo.addSubscription;
    upsertUser = userRepo.upsertUser;
    setQuietHours = userRepo.setQuietHours;
    setMutedUntil = userRepo.setMutedUntil;
    initDb();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  after(() => {
    closeDb();
  });

  it('enqueues tasks for subscribers with matching cities', () => {
    upsertUser(CHAT_A);
    addSubscription(CHAT_A, TEST_CITY);
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].chatId, String(CHAT_A));
    assert.ok(captured[0].text.length > 0);
  });

  it('sends nothing when no subscribers match', () => {
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    assert.equal(captured.length, 0);
  });

  it('does NOT skip security alert subscriber even when muted', () => {
    upsertUser(CHAT_A);
    addSubscription(CHAT_A, TEST_CITY);
    // Mute until far future
    setMutedUntil(CHAT_A, new Date(Date.now() + 3_600_000));
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    assert.equal(captured.length, 1, 'security alert must bypass mute');
  });

  it('skips muted subscriber for drill alert', () => {
    upsertUser(CHAT_A);
    addSubscription(CHAT_A, TEST_CITY);
    setMutedUntil(CHAT_A, new Date(Date.now() + 3_600_000));
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missilesDrill', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    assert.equal(captured.length, 0, 'drill alert must be skipped for muted subscriber');
  });

  it('sends only matched cities to each subscriber', () => {
    upsertUser(CHAT_A);
    addSubscription(CHAT_A, TEST_CITY); // subscribed to only one city
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY, 'עיר אחרת'] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    assert.equal(captured.length, 1);
    assert.ok(captured[0].text.includes(TEST_CITY));
  });

  it('handles errors from getUsersForCities without throwing', () => {
    // Temporarily close DB to force an error
    closeDb();
    let threw = false;
    try {
      notifySubscribers({ type: 'missiles', cities: [TEST_CITY] }, () => {});
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'notifySubscribers must not propagate errors');
    // Re-init for remaining tests
    initDb();
  });
});
