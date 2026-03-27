import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

import { initDb, getDb, closeDb } from '../db/schema';
import {
  insertAlert,
  getRecentAlerts,
  getAlertsForCity,
  getAlertsForCities,
} from '../db/alertHistoryRepository';
import type { Alert } from '../types';

describe('alert_history schema', () => {
  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => { getDb().prepare('DELETE FROM alert_history').run(); });

  it('alert_history table exists', () => {
    const row = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='alert_history'`)
      .get();
    assert.ok(row, 'alert_history table should exist');
  });

  it('users table has quiet_hours_enabled column with default 0', () => {
    const info = getDb()
      .prepare('PRAGMA table_info(users)')
      .all() as { name: string; dflt_value: string | null }[];
    const col = info.find((c) => c.name === 'quiet_hours_enabled');
    assert.ok(col, 'quiet_hours_enabled column should exist');
    assert.equal(col!.dflt_value, '0');
  });
});

describe('alertHistoryRepository', () => {
  const A_MISSILES: Alert = { type: 'missiles', cities: ['אבו גוש', 'אביעזר'] };
  const A_NEWS: Alert = { type: 'newsFlash', cities: ['נהריה'], instructions: 'הנחיות' };

  before(() => { initDb(); });
  after(() => { closeDb(); });
  beforeEach(() => { getDb().prepare('DELETE FROM alert_history').run(); });

  it('insertAlert + getRecentAlerts: stores and retrieves an alert', () => {
    insertAlert(A_MISSILES);
    const rows = getRecentAlerts(24);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'missiles');
    assert.deepEqual(rows[0].cities, ['אבו גוש', 'אביעזר']);
    assert.equal(rows[0].instructions, undefined);
  });

  it('getRecentAlerts: excludes alerts older than the window', () => {
    getDb()
      .prepare(`INSERT INTO alert_history (type, cities, fired_at) VALUES (?, ?, datetime('now', '-2 hours'))`)
      .run('missiles', '["אבו גוש"]');
    const rows = getRecentAlerts(1);
    assert.equal(rows.length, 0, 'alert from 2 hours ago must be outside 1-hour window');
  });

  it('getRecentAlerts: includes alerts within the window', () => {
    getDb()
      .prepare(`INSERT INTO alert_history (type, cities, fired_at) VALUES (?, ?, datetime('now', '-30 minutes'))`)
      .run('missiles', '["אבו גוש"]');
    const rows = getRecentAlerts(1);
    assert.equal(rows.length, 1);
  });

  it('stores and retrieves instructions', () => {
    insertAlert(A_NEWS);
    const rows = getRecentAlerts(24);
    assert.equal(rows[0].instructions, 'הנחיות');
  });

  it('getAlertsForCity: returns only alerts containing that city', () => {
    insertAlert(A_MISSILES); // contains אבו גוש
    insertAlert(A_NEWS);     // contains נהריה only
    const rows = getAlertsForCity('אבו גוש', 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'missiles');
  });

  it('getAlertsForCities: returns alerts containing any of the cities', () => {
    insertAlert(A_MISSILES);
    insertAlert(A_NEWS);
    const rows = getAlertsForCities(['אבו גוש', 'נהריה'], 10);
    assert.equal(rows.length, 2);
  });

  it('getAlertsForCities: respects limit', () => {
    for (let i = 0; i < 5; i++) insertAlert(A_MISSILES);
    const rows = getAlertsForCities(['אבו גוש'], 3);
    assert.equal(rows.length, 3);
  });

  it('getAlertsForCities: returns empty array for empty city list', () => {
    insertAlert(A_MISSILES);
    const rows = getAlertsForCities([], 10);
    assert.equal(rows.length, 0);
  });

  it('getAlertsForCities: no duplicate rows when alert has multiple matching cities', () => {
    insertAlert(A_MISSILES); // both אבו גוש and אביעזר
    const rows = getAlertsForCities(['אבו גוש', 'אביעזר'], 10);
    assert.equal(rows.length, 1, 'one alert with two matching cities must appear once');
  });
});
