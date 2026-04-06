import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../db/schema.js';
import { dispatchSafetyPrompts } from '../services/safetyPromptService.js';
import { getSafetyStatus } from '../db/safetyStatusRepository.js';
import {
  getSafetyPrompt,
  deleteUnrespondedPromptsByAlertType,
} from '../db/safetyPromptRepository.js';
import { computeAlertFingerprint } from '../alertHelpers.js';
import {
  setSafetyStatusHandlerDeps,
  registerSafetyStatusHandler,
} from '../bot/safetyStatusHandler.js';
import {
  createContactWithPermissions,
  acceptContact,
} from '../db/contactRepository.js';
import { dmQueue } from '../services/dmQueue.js';
import type { Bot } from 'grammy';
import type { Alert } from '../types.js';

// ─── constants ───────────────────────────────────────────────────────────────

const USER_A_ID = 3001;
const USER_B_ID = 3002;
const USER_C_ID = 3003;

const alertTelAviv: Alert = {
  type: 'missiles',
  cities: ['תל אביב'],
  instructions: 'היכנסו למרחב מוגן',
};

// ─── helper: build mock bot + fireCb dispatcher ──────────────────────────────

/**
 * Creates a mock grammY bot that captures registered handlers.
 * `sendMessage` is the mock used by dispatchSafetyPrompts (bot.api.sendMessage).
 * Returns `fireCb(data, chatId)` which dispatches a callback with a fresh
 * mock ctx and returns the ctx's editMessageText mock so callers can assert on it.
 */
function buildBot(sendMessage: ReturnType<typeof mock.fn>) {
  const commands: Record<string, (ctx: unknown) => Promise<void>> = {};
  const callbacks: Array<[string | RegExp, (ctx: unknown) => Promise<void>]> = [];
  const bot: any = {
    api: { sendMessage },
    command:       (name: string, h: (ctx: unknown) => Promise<void>) => { commands[name] = h; },
    callbackQuery: (pat:  string | RegExp, h: (ctx: unknown) => Promise<void>) => { callbacks.push([pat, h]); },
    catch: () => {},
  };
  return {
    bot: bot as unknown as Bot,
    async fireCb(data: string, chatId: number) {
      const editMsg = mock.fn(async () => {});
      const ctx = {
        from: { id: chatId },
        callbackQuery: { data },
        editMessageText:     editMsg,
        answerCallbackQuery: mock.fn(async () => {}),
      };
      for (const [pat, h] of callbacks) {
        if (typeof pat === 'string' && pat === data) { await h(ctx); return editMsg; }
        if (pat instanceof RegExp && pat.test(data)) { await h(ctx); return editMsg; }
      }
      return editMsg; // no matching handler — subsequent assertions will fail explicitly
    },
  };
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('Safety Status Integration', () => {

  // Uses initDb() singleton because listContacts/getUser/getPermissions inside
  // notifyContactsOfStatusChange call getDb() internally (not injectable).
  before(() => {
    process.env['DB_PATH'] = ':memory:';
    initDb();
  });

  beforeEach(() => {
    const db = getDb();
    setSafetyStatusHandlerDeps(db);
    db.prepare('DELETE FROM safety_status').run();
    db.prepare('DELETE FROM safety_prompts').run();
    db.prepare('DELETE FROM contact_permissions').run();
    db.prepare('DELETE FROM contacts').run();
    db.prepare('DELETE FROM users').run();
  });

  // ── Scenario 1: Full happy path ──────────────────────────────────────────
  it('Scenario 1 — full happy path: prompt sent, ok tap, contact notified, no unresponded left', async () => {
    const db = getDb();

    // Setup: user A with home_city matching the alert
    db.prepare('INSERT INTO users (chat_id, home_city) VALUES (?, ?)').run(USER_A_ID, 'תל אביב');
    // Setup: user B as accepted contact of A with safety_status permission
    db.prepare('INSERT INTO users (chat_id) VALUES (?)').run(USER_B_ID);
    const contact = createContactWithPermissions(USER_A_ID, USER_B_ID, { safety_status: true });
    acceptContact(contact.id);

    // Step 1: dispatch safety prompts — expect one sendMessage for user A
    const mockSendMessage = mock.fn(() => Promise.resolve({ message_id: 42 }));
    const { bot, fireCb } = buildBot(mockSendMessage);
    registerSafetyStatusHandler(bot);

    await dispatchSafetyPrompts(db, alertTelAviv, bot);

    assert.equal(
      mockSendMessage.mock.calls.length,
      1,
      'sendMessage should be called exactly once — for user A'
    );
    assert.equal(
      (mockSendMessage.mock.calls[0].arguments as unknown[])[0],
      USER_A_ID,
      'sendMessage recipient must be user A'
    );

    // Step 2: safety_prompts row exists with correct fingerprint and stored message_id
    const fingerprint = computeAlertFingerprint('missiles', ['תל אביב']);
    const promptRow = getSafetyPrompt(db, USER_A_ID, fingerprint);
    assert.ok(promptRow !== null, 'safety_prompts row must exist for user A');
    assert.equal(promptRow!.fingerprint, fingerprint, 'fingerprint must match');
    assert.equal(promptRow!.message_id, 42, 'message_id must be stored after send');

    // Step 3: simulate user A tapping ✅ (ok) — spy on dmQueue for contact notification
    const enqueuedTasks: Array<{ chatId: string; text: string }> = [];
    const enqueueSpy = mock.method(
      dmQueue,
      'enqueueAll',
      (tasks: Array<{ chatId: string; text: string }>) => { enqueuedTasks.push(...tasks); }
    );

    try {
      const editMsg = await fireCb(`safety:ok:${promptRow!.id}`, USER_A_ID);

      // Step 4: safety_status upserted as 'ok'
      const status = getSafetyStatus(db, USER_A_ID);
      assert.ok(status !== null, 'safety_status row must exist after ok tap');
      assert.equal(status!.status, 'ok');

      // Step 5: prompt message edited in-place (ctx.editMessageText, not bot.api.editMessageText)
      assert.equal(editMsg.mock.calls.length, 1, 'ctx.editMessageText must be called once');

      // Step 6: dmQueue received exactly one notification task for user B
      assert.equal(enqueuedTasks.length, 1, 'exactly one contact notification task expected');
      assert.equal(enqueuedTasks[0].chatId, String(USER_B_ID), 'notification must target user B');
      assert.ok(
        enqueuedTasks[0].text.includes('בסדר'),
        `notification text must mention בסדר. Got: ${enqueuedTasks[0].text}`
      );
    } finally {
      enqueueSpy.mock.restore();
    }

    // Step 7: A already responded — deleteUnrespondedPromptsByAlertType returns 0
    const deletedCount = deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(deletedCount, 0, 'no unresponded prompts should remain after user A responded');
  });

  // ── Scenario 2: Dismiss + no contacts ───────────────────────────────────
  it('Scenario 2 — dismiss: status stored as "dismissed", no contact notification sent', async () => {
    const db = getDb();

    // User C has home_city but no contacts
    db.prepare('INSERT INTO users (chat_id, home_city) VALUES (?, ?)').run(USER_C_ID, 'תל אביב');

    const mockSendMessage = mock.fn(() => Promise.resolve({ message_id: 99 }));
    const { bot, fireCb } = buildBot(mockSendMessage);
    registerSafetyStatusHandler(bot);

    await dispatchSafetyPrompts(db, alertTelAviv, bot);
    assert.equal(mockSendMessage.mock.calls.length, 1, 'one prompt should be sent for user C');

    const fingerprint = computeAlertFingerprint('missiles', ['תל אביב']);
    const promptRow   = getSafetyPrompt(db, USER_C_ID, fingerprint);
    assert.ok(promptRow !== null, 'safety_prompts row must exist for user C');

    // Simulate 🔇 tap (dismiss) — note: callback uses "dismiss" not "dismissed"
    const enqueuedTasks: Array<{ chatId: string; text: string }> = [];
    const enqueueSpy = mock.method(
      dmQueue,
      'enqueueAll',
      (tasks: Array<{ chatId: string; text: string }>) => { enqueuedTasks.push(...tasks); }
    );

    try {
      await fireCb(`safety:dismiss:${promptRow!.id}`, USER_C_ID);

      const status = getSafetyStatus(db, USER_C_ID);
      assert.ok(status !== null, 'safety_status row must exist after dismiss');
      assert.equal(status!.status, 'dismissed', 'status must be "dismissed"');

      // dismissed → notifyContactsOfStatusChange returns early, no dmQueue call
      assert.equal(
        enqueuedTasks.length,
        0,
        'dismissed status must not trigger any contact notification'
      );
    } finally {
      enqueueSpy.mock.restore();
    }
  });

  // ── Scenario 3: Dedup (fingerprint prevents double-prompt) ──────────────
  it('Scenario 3 — dedup: second dispatchSafetyPrompts for same alert is a no-op', async () => {
    const db = getDb();

    db.prepare('INSERT INTO users (chat_id, home_city) VALUES (?, ?)').run(USER_A_ID, 'תל אביב');

    const mockSendMessage = mock.fn(() => Promise.resolve({ message_id: 42 }));
    const { bot } = buildBot(mockSendMessage);

    await dispatchSafetyPrompts(db, alertTelAviv, bot);
    await dispatchSafetyPrompts(db, alertTelAviv, bot); // same alert — must be deduped

    assert.equal(
      mockSendMessage.mock.calls.length,
      1,
      'sendMessage must be called exactly once despite two dispatch calls (INSERT OR IGNORE dedup)'
    );
  });
});
