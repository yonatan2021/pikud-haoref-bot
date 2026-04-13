import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb, initSchema } from '../db/schema';
import {
  upsertUser,
  getUser,
  getProfile,
  updateProfile,
  completeOnboarding,
  isOnboardingCompleted,
  setOnboardingStep,
  setConnectionCode,
  findUserByConnectionCode,
  getUsersWithHomeCity,
  setFormat,
  setQuietHours,
  setMutedUntil,
  deleteUser,
  setSocialPref,
} from '../db/userRepository';

describe('userRepository — v0.4.1 profile fields', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  describe('schema migration', () => {
    it('new columns exist with correct defaults', () => {
      const info = getDb()
        .prepare('PRAGMA table_info(users)')
        .all() as { name: string; dflt_value: string | null }[];

      const cols = new Map(info.map(c => [c.name, c.dflt_value]));

      assert.ok(cols.has('display_name'), 'display_name column should exist');
      assert.ok(cols.has('home_city'), 'home_city column should exist');
      assert.ok(cols.has('locale'), 'locale column should exist');
      assert.ok(cols.has('onboarding_completed'), 'onboarding_completed column should exist');
      assert.ok(cols.has('connection_code'), 'connection_code column should exist');
      assert.ok(cols.has('onboarding_step'), 'onboarding_step column should exist');

      assert.equal(cols.get('display_name'), null, 'display_name defaults to NULL');
      assert.equal(cols.get('home_city'), null, 'home_city defaults to NULL');
      assert.equal(cols.get('locale'), "'he'", "locale defaults to 'he'");
      assert.equal(cols.get('onboarding_completed'), '0', 'onboarding_completed defaults to 0');
      assert.equal(cols.get('connection_code'), null, 'connection_code defaults to NULL');
      assert.equal(cols.get('onboarding_step'), null, 'onboarding_step defaults to NULL');
    });

    it('initSchema() called twice does not throw', () => {
      const db = getDb();
      assert.doesNotThrow(() => initSchema(db));
    });

    it('connection_code index exists', () => {
      const indexes = getDb()
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'")
        .all() as { name: string }[];
      const names = indexes.map(i => i.name);
      assert.ok(names.includes('idx_users_connection_code'), 'connection_code index should exist');
    });
  });

  describe('v0.3.x user backward compatibility', () => {
    it('existing user gets correct defaults for new fields', () => {
      upsertUser(111);
      const user = getUser(111);
      assert.ok(user, 'user should exist');

      assert.equal(user.display_name, null);
      assert.equal(user.home_city, null);
      assert.equal(user.locale, 'he');
      assert.equal(user.onboarding_completed, false);
      assert.equal(user.connection_code, null);
      assert.equal(user.onboarding_step, null);
    });

    it('existing quiet_hours_enabled and muted_until survive migration', () => {
      upsertUser(222);
      setQuietHours(222, true);
      setMutedUntil(222, new Date('2030-01-01T00:00:00Z'));

      const user = getUser(222);
      assert.ok(user);
      assert.equal(user.quiet_hours_enabled, true);
      assert.equal(user.muted_until, '2030-01-01T00:00:00.000Z');
      assert.equal(user.format, 'short');
    });

    it('existing format survives profile update', () => {
      upsertUser(333);
      setFormat(333, 'detailed');

      updateProfile(333, { display_name: 'Test' });

      const user = getUser(333);
      assert.ok(user);
      assert.equal(user.format, 'detailed');
      assert.equal(user.display_name, 'Test');
    });
  });

  describe('getProfile()', () => {
    it('returns profile fields for existing user', () => {
      upsertUser(444);
      updateProfile(444, { display_name: 'דני', home_city: 'אבו גוש' });

      const profile = getProfile(444);
      assert.ok(profile);
      assert.equal(profile.display_name, 'דני');
      assert.equal(profile.home_city, 'אבו גוש');
      assert.equal(profile.locale, 'he');
      assert.equal(profile.onboarding_completed, false);
    });

    it('returns undefined for non-existent user', () => {
      assert.equal(getProfile(99999), undefined);
    });
  });

  describe('updateProfile()', () => {
    it('sets display_name without clobbering home_city', () => {
      upsertUser(555);
      updateProfile(555, { home_city: 'אבו גוש' });
      updateProfile(555, { display_name: 'שרה' });

      const user = getUser(555);
      assert.ok(user);
      assert.equal(user.display_name, 'שרה');
      assert.equal(user.home_city, 'אבו גוש');
    });

    it('sets home_city without clobbering display_name', () => {
      upsertUser(556);
      updateProfile(556, { display_name: 'יוסי' });
      updateProfile(556, { home_city: 'אביעזר' });

      const user = getUser(556);
      assert.ok(user);
      assert.equal(user.display_name, 'יוסי');
      assert.equal(user.home_city, 'אביעזר');
    });

    it('sets locale without clobbering other fields', () => {
      upsertUser(557);
      updateProfile(557, { display_name: 'Test', home_city: 'אבו גוש' });
      updateProfile(557, { locale: 'en' });

      const user = getUser(557);
      assert.ok(user);
      assert.equal(user.locale, 'en');
      assert.equal(user.display_name, 'Test');
      assert.equal(user.home_city, 'אבו גוש');
    });

    it('sets multiple fields at once', () => {
      upsertUser(558);
      updateProfile(558, { display_name: 'Full', home_city: 'אבו גוש', locale: 'en' });

      const user = getUser(558);
      assert.ok(user);
      assert.equal(user.display_name, 'Full');
      assert.equal(user.home_city, 'אבו גוש');
      assert.equal(user.locale, 'en');
    });

    it('no-ops when patch is empty', () => {
      upsertUser(559);
      updateProfile(559, {});
      const user = getUser(559);
      assert.ok(user);
      assert.equal(user.display_name, null);
    });
  });

  describe('onboarding', () => {
    it('completeOnboarding sets flag and clears step', () => {
      upsertUser(666);
      setOnboardingStep(666, 'city');
      assert.equal(isOnboardingCompleted(666), false);

      completeOnboarding(666);

      assert.equal(isOnboardingCompleted(666), true);
      const user = getUser(666);
      assert.ok(user);
      assert.equal(user.onboarding_step, null);
      assert.equal(user.onboarding_completed, true);
    });

    it('isOnboardingCompleted returns false for new user', () => {
      upsertUser(667);
      assert.equal(isOnboardingCompleted(667), false);
    });

    it('isOnboardingCompleted returns false for non-existent user', () => {
      assert.equal(isOnboardingCompleted(99998), false);
    });

    it('setOnboardingStep persists and survives getUser', () => {
      upsertUser(668);
      setOnboardingStep(668, 'name');
      assert.equal(getUser(668)!.onboarding_step, 'name');

      setOnboardingStep(668, 'city');
      assert.equal(getUser(668)!.onboarding_step, 'city');

      setOnboardingStep(668, null);
      assert.equal(getUser(668)!.onboarding_step, null);
    });
  });

  describe('connection code', () => {
    it('setConnectionCode + findUserByConnectionCode round-trip', () => {
      upsertUser(777);
      setConnectionCode(777, '123456');

      const found = findUserByConnectionCode('123456');
      assert.ok(found);
      assert.equal(found.chat_id, 777);
      assert.equal(found.connection_code, '123456');
    });

    it('findUserByConnectionCode returns undefined for unknown code', () => {
      assert.equal(findUserByConnectionCode('000000'), undefined);
    });

    it('connection code does not clobber other fields', () => {
      upsertUser(778);
      updateProfile(778, { display_name: 'Coded' });
      setConnectionCode(778, '654321');

      const user = getUser(778);
      assert.ok(user);
      assert.equal(user.display_name, 'Coded');
      assert.equal(user.connection_code, '654321');
    });

    // I8 — unique constraint enforcement. schema.ts:257 declares
    //   CREATE UNIQUE INDEX idx_users_connection_code ON users(connection_code)
    //   WHERE connection_code IS NOT NULL
    // so two distinct users cannot share a connection_code, BUT multiple users
    // CAN have a NULL connection_code (the partial WHERE clause). The
    // /connect flow's collision-retry logic in connectHandler.ts depends on
    // this constraint actually firing — these tests lock it down.

    it('setConnectionCode throws when another user already owns the same code', () => {
      upsertUser(801);
      upsertUser(802);
      setConnectionCode(801, '424242');

      assert.throws(
        () => setConnectionCode(802, '424242'),
        /UNIQUE|constraint/i,
        'second user must NOT be able to claim the same code'
      );

      // Postcondition: 801 still owns it, 802 has no code.
      assert.equal(getUser(801)?.connection_code, '424242');
      assert.equal(getUser(802)?.connection_code, null);
    });

    it('multiple users can simultaneously have a NULL connection_code', () => {
      // The partial index excludes NULL rows, so this must NOT throw.
      upsertUser(811);
      upsertUser(812);
      upsertUser(813);

      assert.equal(getUser(811)?.connection_code, null);
      assert.equal(getUser(812)?.connection_code, null);
      assert.equal(getUser(813)?.connection_code, null);
    });

    it('setConnectionCode allows the same user to update their own code', () => {
      upsertUser(821);
      setConnectionCode(821, '111222');
      // Same user, new code — must NOT collide with itself.
      assert.doesNotThrow(() => setConnectionCode(821, '333444'));
      assert.equal(getUser(821)?.connection_code, '333444');
    });
  });

  describe('deleteUser cascade', () => {
    it('deleting user clears all user data', () => {
      upsertUser(888);
      updateProfile(888, { display_name: 'ToDelete', home_city: 'אבו גוש' });
      completeOnboarding(888);
      setConnectionCode(888, '111111');

      deleteUser(888);
      assert.equal(getUser(888), undefined);
    });
  });
});

describe('getUsersWithHomeCity', () => {
  let db: InstanceType<typeof Database>;

  before(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  after(() => { db.close(); });

  beforeEach(() => {
    db.prepare('DELETE FROM users').run();
  });

  it('returns users with a non-null, non-empty home_city', () => {
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    db.prepare("UPDATE users SET home_city = 'תל אביב - יפו' WHERE chat_id = 1001").run();
    db.prepare('INSERT INTO users (chat_id) VALUES (1002)').run();         // NULL home_city
    db.prepare('INSERT INTO users (chat_id) VALUES (1003)').run();
    db.prepare("UPDATE users SET home_city = '' WHERE chat_id = 1003").run(); // empty string

    const result = getUsersWithHomeCity(db);
    assert.equal(result.length, 1);
    assert.equal(result[0].chat_id, 1001);
    assert.equal(result[0].home_city, 'תל אביב - יפו');
  });

  it('decodes boolean fields correctly', () => {
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    db.prepare(
      "UPDATE users SET home_city = 'חיפה', quiet_hours_enabled = 1, is_dm_active = 1 WHERE chat_id = 1001"
    ).run();

    const [user] = getUsersWithHomeCity(db);
    assert.equal(user.quiet_hours_enabled, true);
    assert.equal(user.is_dm_active, true);
  });

  it('returns empty array when no users have home_city set', () => {
    db.prepare('INSERT INTO users (chat_id) VALUES (1001)').run();
    assert.equal(getUsersWithHomeCity(db).length, 0);
  });
});

describe('social preferences (v0.5.2)', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => {
    getDb().prepare('DELETE FROM subscriptions').run();
    getDb().prepare('DELETE FROM users').run();
  });

  it('new user has all social prefs enabled by default', () => {
    upsertUser(9001);
    const user = getUser(9001);
    assert.equal(user?.social_prompt_enabled, true);
    assert.equal(user?.social_banner_enabled, true);
    assert.equal(user?.social_contact_count_enabled, true);
    assert.equal(user?.social_group_alerts_enabled, true);
    assert.equal(user?.social_quick_ok_enabled, true);
  });

  it('setSocialPref toggles a field off and on', () => {
    upsertUser(9002);
    setSocialPref(9002, 'social_prompt_enabled', false);
    assert.equal(getUser(9002)?.social_prompt_enabled, false);

    setSocialPref(9002, 'social_prompt_enabled', true);
    assert.equal(getUser(9002)?.social_prompt_enabled, true);
  });

  it('setSocialPref works for each field independently', () => {
    upsertUser(9003);
    setSocialPref(9003, 'social_banner_enabled', false);
    setSocialPref(9003, 'social_quick_ok_enabled', false);

    const user = getUser(9003)!;
    assert.equal(user.social_banner_enabled, false);
    assert.equal(user.social_quick_ok_enabled, false);
    assert.equal(user.social_prompt_enabled, true);
    assert.equal(user.social_contact_count_enabled, true);
    assert.equal(user.social_group_alerts_enabled, true);
  });

  it('setSocialPref throws on invalid field', () => {
    upsertUser(9004);
    assert.throws(
      () => setSocialPref(9004, 'bad_field' as any, false),
      /Invalid social pref/
    );
  });
});
