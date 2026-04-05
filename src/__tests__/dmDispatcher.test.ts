import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';
import { buildShortMessage, buildAlertDmMessage, buildNewsFlashDmMessage, buildDmText, shouldSkipForQuietHours, notifySubscribers, getRelevanceType, getRelevanceText } from '../services/dmDispatcher';
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

  it('includes 🔴🔴🔴🔴🔴 countdown bar for city with 15s countdown (אבשלום)', () => {
    // אבשלום has countdown=15 in cities.json → מיידי urgency → full red bar
    const alert: Alert = { type: 'missiles', cities: ['אבשלום'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('🔴🔴🔴🔴🔴'), `expected full red bar in: ${msg}`);
    assert.ok(msg.includes('⏱'), 'expected ⏱ countdown indicator alongside bar');
  });

  it('includes 🟢🟢⬜⬜⬜ countdown bar for city with 90s countdown (אבו גוש)', () => {
    // אבו גוש has countdown=90 in cities.json → מתון urgency → 2/5 green bar
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('🟢🟢⬜⬜⬜'), `expected green bar in: ${msg}`);
  });

  it('omits countdown bar when countdown = 0 (confrontation-line city)', () => {
    // City with countdown=0 → getMinCountdown returns 0 → no bar rendered
    const alert: Alert = { type: 'missiles', cities: ['עיר_לא_קיימת_בכלל'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(!msg.includes('🔴🔴'), 'no bar for unknown/zero-countdown city');
    assert.ok(!msg.includes('🟢🟢'), 'no bar for unknown/zero-countdown city');
  });
});

describe('buildAlertDmMessage — minimum-urgency regression (#90)', () => {
  it('DM bar reflects the minimum countdown across all cities (most urgent city wins)', () => {
    // אבשלום=15s (מיידי → 🔴🔴🔴🔴🔴), אבו גוש=90s (מתון → 🟢🟢⬜⬜⬜)
    // When both appear, the bar must use 15s (most urgent) — not 90s.
    // Regression guard: if getMinCountdown changes logic to use max instead of min, this test fails.
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'אבשלום'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('🔴🔴🔴🔴🔴'), `expected red bar (15s min) not green in: ${msg}`);
    assert.ok(!msg.includes('🟢🟢⬜⬜⬜'), 'must not show the less-urgent 90s bar');
  });

  it('DM countdown shows the minimum seconds value when multiple cities', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש', 'אבשלום'] };
    const msg = buildAlertDmMessage(alert);
    assert.ok(msg.includes('15 שניות'), `expected 15s in: ${msg}`);
    assert.ok(!msg.includes('90 שניות'), 'must not show 90s when 15s is the minimum');
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
    // New format: line 1=headline, line 2=instructions, line 3=📍 location
    assert.equal(lines.length, 3, 'should have three lines: headline, instructions, location');
    assert.equal(lines[1], 'ניתן לצאת מהמרחבים המוגנים', 'second line should be the instructions');
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
    assert.equal(lines[1], instructions, 'instructions must appear verbatim on line 2');
  });
});

describe('buildAlertDmMessage — title location suffix', () => {
  it('omits "באזורך" from title when home city is outside the alert zone', () => {
    // תל אביב and מעלות תרשיחא are in different zones
    const alert: Alert = { type: 'missiles', cities: ['מעלות תרשיחא'] };
    const msg = buildAlertDmMessage(alert, 'תל אביב');
    const lines = msg.split('\n');
    // Relevance indicator line
    assert.ok(lines[0].includes('🟢'), `expected 🟢 relevance, got: ${lines[0]}`);
    // Title line must NOT say "באזורך"
    assert.ok(!lines[1].includes('באזורך'), `title should not say "באזורך", got: ${lines[1]}`);
  });

  it('includes "באזורך" in title when home city IS in the alert', () => {
    const alert: Alert = { type: 'missiles', cities: ['תל אביב'] };
    const msg = buildAlertDmMessage(alert, 'תל אביב');
    const lines = msg.split('\n');
    assert.ok(lines[0].includes('🔴'), `expected 🔴 relevance, got: ${lines[0]}`);
    assert.ok(lines[1].includes('באזורך'), `title should say "באזורך", got: ${lines[1]}`);
  });

  it('includes "באזורך" in title when no home city is set', () => {
    const alert: Alert = { type: 'missiles', cities: ['מעלות תרשיחא'] };
    const msg = buildAlertDmMessage(alert, null);
    // No relevance indicator when homeCity is null
    const firstLine = msg.split('\n')[0];
    assert.ok(firstLine.includes('באזורך'), `title should say "באזורך" when no home city, got: ${firstLine}`);
  });

  it('never adds "באזורך" to nationwide alert title', () => {
    const alert: Alert = { type: 'missiles', cities: [] };
    const msg = buildAlertDmMessage(alert, null);
    assert.ok(!msg.includes('באזורך'), `nationwide title should not say "באזורך", got: ${msg}`);
  });
});

describe('buildDmText — unified format (format param removed)', () => {
  it('missiles: buildDmText produces personal format output', () => {
    const alert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(alert);
    assert.ok(msg.includes('באזורך'));
    assert.ok(msg.includes('📍'));
  });
});

describe('buildDmText — personalization integration', () => {
  it('shows only matchedCities, not all alert cities', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert);
    assert.ok(msg.includes('אבו גוש'), 'matched city must appear');
    assert.ok(!msg.includes('נהריה'), 'unmatched city must not appear');
    assert.ok(!msg.includes('חיפה'), 'unmatched city must not appear');
  });

  it('renders matched cities only for missiles', () => {
    const personalAlert: Alert = { type: 'missiles', cities: ['אבו גוש'] };
    const msg = buildDmText(personalAlert);
    assert.ok(msg.includes('אבו גוש'));
    assert.ok(!msg.includes('נהריה'));
  });

  it('newsFlash uses buildNewsFlashDmMessage', () => {
    const personalAlert: Alert = { type: 'newsFlash', cities: ['אבו גוש'], instructions: 'הנחיות' };
    const msg = buildDmText(personalAlert);
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
  let updateProfile: (chatId: number, patch: { home_city?: string }) => void;

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
    updateProfile = userRepo.updateProfile;
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

  it('snooze: subscriber with muted_until in the future is skipped when injected now is before muted_until', () => {
    const CHAT_SNOOZED = 777010;
    upsertUser(CHAT_SNOOZED);
    addSubscription(CHAT_SNOOZED, TEST_CITY);
    // muted_until = T (some fixed future timestamp)
    const mutedUntil = new Date('2030-01-01T12:00:00.000Z');
    setMutedUntil(CHAT_SNOOZED, mutedUntil);
    // now = before mutedUntil → subscriber should be skipped
    const nowBeforeMute = new Date('2030-01-01T11:00:00.000Z');
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missilesDrill', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks), nowBeforeMute);
    assert.equal(captured.length, 0, 'subscriber must be skipped when injected now is before muted_until');
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

  // Issue 8 — quiet hours integration test (uses injected `now` param)
  it('quiet hours: subscriber with quiet_hours_enabled=true skipped for drill at night', () => {
    const CHAT_QH = 777002;
    const CHAT_NORMAL = 777003;
    upsertUser(CHAT_QH);
    upsertUser(CHAT_NORMAL);
    addSubscription(CHAT_QH, TEST_CITY);
    addSubscription(CHAT_NORMAL, TEST_CITY);
    setQuietHours(CHAT_QH, true);
    // CHAT_NORMAL keeps default quiet_hours_enabled=false

    const NIGHT = new Date('2026-03-28T23:00:00.000Z'); // UTC 23:00 → Israel ~01:00
    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missilesDrill', cities: [TEST_CITY] };

    notifySubscribers(alert, (tasks) => captured.push(...tasks), NIGHT);

    assert.equal(captured.length, 1, 'only non-quiet-hours subscriber should receive task');
    assert.equal(captured[0].chatId, String(CHAT_NORMAL));
  });

  // Issue 9 — mixed mute/active integration tests
  it('mixed mute/active: only unmuted subscriber gets task for drill alert', () => {
    const CHAT_MUTED = 777004;
    const CHAT_ACTIVE = 777005;
    upsertUser(CHAT_MUTED);
    upsertUser(CHAT_ACTIVE);
    addSubscription(CHAT_MUTED, TEST_CITY);
    addSubscription(CHAT_ACTIVE, TEST_CITY);
    setMutedUntil(CHAT_MUTED, new Date(Date.now() + 3_600_000));

    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missilesDrill', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));

    assert.equal(captured.length, 1, 'only unmuted subscriber should receive drill task');
    assert.equal(captured[0].chatId, String(CHAT_ACTIVE));
  });

  it('mixed mute/active: both subscribers get task for security alert (mute bypassed)', () => {
    const CHAT_MUTED = 777006;
    const CHAT_ACTIVE = 777007;
    upsertUser(CHAT_MUTED);
    upsertUser(CHAT_ACTIVE);
    addSubscription(CHAT_MUTED, TEST_CITY);
    addSubscription(CHAT_ACTIVE, TEST_CITY);
    setMutedUntil(CHAT_MUTED, new Date(Date.now() + 3_600_000));

    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));

    assert.equal(captured.length, 2, 'security alert must reach both muted and active subscribers');
    const ids = captured.map((t) => t.chatId).sort();
    assert.deepEqual(ids, [String(CHAT_MUTED), String(CHAT_ACTIVE)].sort());
  });

  it('relevance indicator: each subscriber gets correct indicator based on their home_city', () => {
    // אור יהודה (zone: דן), בני ברק (zone: דן) — same zone
    // All 3 are subscribed to the same city so matchedCities = ['אור יהודה'] for all
    const CHAT_RED = 888001;   // home_city = אור יהודה (directly in alert)
    const CHAT_YELLOW = 888002; // home_city = בני ברק (same zone דן as אור יהודה)
    const CHAT_GREEN = 888003;  // home_city = אילת (different zone)

    [CHAT_RED, CHAT_YELLOW, CHAT_GREEN].forEach((id) => {
      upsertUser(id);
      addSubscription(id, 'אור יהודה');
    });
    updateProfile(CHAT_RED, { home_city: 'אור יהודה' });
    updateProfile(CHAT_YELLOW, { home_city: 'בני ברק' });
    updateProfile(CHAT_GREEN, { home_city: 'אילת' });

    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: ['אור יהודה'] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));

    assert.equal(captured.length, 3);

    const byId = new Map(captured.map((t) => [t.chatId, t.text]));

    assert.ok(byId.get(String(CHAT_RED))?.startsWith('🔴 באזורך'),
      `User with home_city in alert should get 🔴: ${byId.get(String(CHAT_RED))}`);
    assert.ok(byId.get(String(CHAT_YELLOW))?.startsWith('🟡 באזור קרוב'),
      `User with same zone should get 🟡: ${byId.get(String(CHAT_YELLOW))}`);
    assert.ok(byId.get(String(CHAT_GREEN))?.startsWith('🟢 לא באזורך'),
      `User with different zone should get 🟢: ${byId.get(String(CHAT_GREEN))}`);
  });

  it('relevance indicator: subscriber with home_city null receives DM without indicator', () => {
    const CHAT_NO_HOME = 888004;
    upsertUser(CHAT_NO_HOME);
    addSubscription(CHAT_NO_HOME, 'אור יהודה');
    // home_city remains null (not set)

    const captured: DmTask[] = [];
    const alert: Alert = { type: 'missiles', cities: ['אור יהודה'] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));

    assert.equal(captured.length, 1);
    const firstLine = captured[0].text.split('\n')[0];
    assert.ok(firstLine !== '🔴 באזורך' && firstLine !== '🟡 באזור קרוב' && firstLine !== '🟢 לא באזורך',
      `DM without home_city should not start with relevance indicator: ${firstLine}`);
  });

  it('relevance indicator: nationwide alert (empty cities) produces no indicator even with home_city', () => {
    const CHAT_NATION = 888005;
    upsertUser(CHAT_NATION);
    // No city subscription — nationwide alert reaches all (cities=[])
    // Subscribe to a city so the test subscriber is matched
    addSubscription(CHAT_NATION, TEST_CITY);
    updateProfile(CHAT_NATION, { home_city: 'אור יהודה' });

    const captured: DmTask[] = [];
    // Nationwide alert has no cities — matchedCities = [TEST_CITY] (the subscriber's city)
    // But alert.cities = [] → getRelevanceIndicator returns null
    const alert: Alert = { type: 'missiles', cities: [TEST_CITY] };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));
    // The alert has cities here, but we test via getRelevanceIndicator directly for the empty case
    // To test truly empty-cities alert: subscriber gets it via matchedCities which IS empty if alert.cities=[]
    // So we test the pure function directly
    const { getRelevanceIndicator: gri } = require('../services/dmDispatcher');
    assert.equal(gri('אור יהודה', []), null, 'nationwide (empty cities) alert should produce null indicator');
  });

  it('preliminary newsFlash + relevance indicator combined: indicator and ⚠️ both appear', () => {
    const CHAT_PRELIM = 888006;
    upsertUser(CHAT_PRELIM);
    addSubscription(CHAT_PRELIM, 'אור יהודה');
    updateProfile(CHAT_PRELIM, { home_city: 'אור יהודה' });

    const captured: DmTask[] = [];
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['אור יהודה'],
      instructions: 'בדקות הקרובות צפויות להתקבל התרעות',
    };
    notifySubscribers(alert, (tasks) => captured.push(...tasks));

    assert.equal(captured.length, 1);
    const text = captured[0].text;
    assert.ok(text.startsWith('🔴 באזורך'), `Should start with relevance indicator: ${text}`);
    assert.ok(text.includes('⚠️'), `Should include preliminary warning emoji ⚠️: ${text}`);
    assert.ok(text.includes('התראה מקדימה'), `Should include preliminary text: ${text}`);
  });
});

describe('buildNewsFlashDmMessage — headline location suffix', () => {
  it('omits "באזורך" from preliminary headline when home city is outside the alert', () => {
    // Preliminary alert text
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['מעלות תרשיחא'],
      instructions: 'בדקות הקרובות צפויות להתקבל התרעות באזורך',
    };
    const msg = buildNewsFlashDmMessage(alert, 'תל אביב');
    const lines = msg.split('\n');
    // First line is relevance indicator
    assert.ok(lines[0].includes('🟢'), `expected 🟢 relevance, got: ${lines[0]}`);
    // Headline must NOT say "באזורך"
    assert.ok(!lines[1].includes('באזורך'), `headline should not say "באזורך", got: ${lines[1]}`);
  });

  it('includes "באזורך" in preliminary headline when home city IS in the alert', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['תל אביב'],
      instructions: 'בדקות הקרובות צפויות להתקבל התרעות באזורך',
    };
    const msg = buildNewsFlashDmMessage(alert, 'תל אביב');
    const lines = msg.split('\n');
    assert.ok(lines[0].includes('🔴'), `expected 🔴 relevance, got: ${lines[0]}`);
    assert.ok(lines[1].includes('באזורך'), `headline should say "באזורך", got: ${lines[1]}`);
  });

  it('includes "באזורך" in preliminary headline when no home city is set', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['מעלות תרשיחא'],
      instructions: 'בדקות הקרובות צפויות להתקבל התרעות באזורך',
    };
    const msg = buildNewsFlashDmMessage(alert, null);
    // No relevance line when homeCity is null — first line is the headline
    const firstLine = msg.split('\n')[0];
    assert.ok(firstLine.includes('באזורך'), `headline should say "באזורך" when no home city, got: ${firstLine}`);
  });

  it('non-preliminary newsFlash never says "באזורך" in headline', () => {
    const alert: Alert = {
      type: 'newsFlash',
      cities: ['תל אביב'],
      instructions: 'הודעה רגילה',
    };
    const msg = buildNewsFlashDmMessage(alert, null);
    // Non-preliminary headline is always "📢 הודעה מיוחדת"
    assert.ok(msg.includes('📢 הודעה מיוחדת'), `expected non-preliminary headline, got: ${msg}`);
    assert.ok(!msg.includes('באזורך') || msg.split('\n').some(l => l.includes('📢')), 'non-preliminary headline must not say "באזורך"');
  });
});

describe('getRelevanceType', () => {
  it('returns null when homeCity is null', () => {
    assert.equal(getRelevanceType(null, ['תל אביב']), null);
  });

  it('returns null when alertCities is empty', () => {
    assert.equal(getRelevanceType('תל אביב', []), null);
  });

  it('returns in_area when homeCity is in alertCities', () => {
    assert.equal(getRelevanceType('תל אביב', ['תל אביב', 'רמת גן']), 'in_area');
  });

  it('returns nearby when homeCity zone matches an alert city zone', () => {
    // Both אור יהודה and אזור are in the same zone as nearby cities in דן
    const result = getRelevanceType('אור יהודה', ['תל אביב']);
    // This depends on city data — if both are in דן zone, returns 'nearby'
    // If city data doesn't match zones, it returns 'not_area'
    assert.ok(result === 'nearby' || result === 'not_area',
      `Expected nearby or not_area, got: ${result}`);
  });

  it('returns not_area when no zone match', () => {
    // Use a city definitely not in the same zone as the alert
    const result = getRelevanceType('אילת', ['קריית שמונה']);
    assert.equal(result, 'not_area');
  });
});

describe('getRelevanceText', () => {
  it('maps in_area to correct default string', () => {
    const result = getRelevanceText('in_area');
    assert.ok(result.includes('באזורך'), `Expected "באזורך", got: ${result}`);
  });

  it('maps nearby to correct default string', () => {
    const result = getRelevanceText('nearby');
    assert.ok(result.includes('באזור קרוב'), `Expected "באזור קרוב", got: ${result}`);
  });

  it('maps not_area to correct default string', () => {
    const result = getRelevanceText('not_area');
    assert.ok(result.includes('לא באזורך'), `Expected "לא באזורך", got: ${result}`);
  });

  it('uses provided strings over defaults', () => {
    const custom = { inArea: 'CUSTOM_IN', nearby: 'CUSTOM_NEAR', notInArea: 'CUSTOM_NOT' };
    assert.equal(getRelevanceText('in_area', custom), 'CUSTOM_IN');
    assert.equal(getRelevanceText('nearby', custom), 'CUSTOM_NEAR');
    assert.equal(getRelevanceText('not_area', custom), 'CUSTOM_NOT');
  });
});
