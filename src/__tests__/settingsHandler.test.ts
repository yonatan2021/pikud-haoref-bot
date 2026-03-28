import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { initDb, getDb } from '../db/schema';
import { upsertUser } from '../db/userRepository';
import { addSubscription } from '../db/subscriptionRepository';
import { buildMyCitiesPage } from '../bot/settingsHandler';

const CHAT_ID = 99991;

function cleanup(): void {
  getDb().prepare('DELETE FROM subscriptions WHERE chat_id = ?').run(CHAT_ID);
  getDb().prepare('DELETE FROM users WHERE chat_id = ?').run(CHAT_ID);
}

describe('buildMyCitiesPage — zone label', () => {
  before(() => {
    initDb();
    cleanup();
    upsertUser(CHAT_ID);
  });

  it('shows zone name next to city name in button label', () => {
    // אבו גוש has zone בית שמש in cities.json
    addSubscription(CHAT_ID, 'אבו גוש');
    const { keyboard } = buildMyCitiesPage(CHAT_ID, 0);
    const buttons = keyboard.inline_keyboard.flat();
    const button = buttons.find((b) => 'text' in b && b.text.includes('אבו גוש'));
    assert.ok(button, 'button for אבו גוש not found');
    assert.ok(
      'text' in button && button.text.includes('·'),
      'button label should contain · separator between city and zone'
    );
    assert.ok(
      'text' in button && button.text.includes('בית שמש'),
      'button label should contain zone name בית שמש'
    );
  });

  it('shows city name without zone separator when city has no zone data', () => {
    addSubscription(CHAT_ID, 'עיר_ללא_נתונים');
    const { keyboard } = buildMyCitiesPage(CHAT_ID, 0);
    const buttons = keyboard.inline_keyboard.flat();
    const button = buttons.find((b) => 'text' in b && b.text.includes('עיר_ללא_נתונים'));
    // If city has no data, no · separator expected
    if (button && 'text' in button) {
      assert.ok(!button.text.includes('·'), 'no · separator when city has no zone');
    }
  });
});
