import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import {
  deleteUnrespondedPromptsByAlertType,
} from '../db/safetyPromptRepository.js';
import { clearStalePromptMessages } from '../services/safetyPromptService.js';
import type { Bot } from 'grammy';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

function insertUser(db: Database.Database, chatId: number): void {
  db.prepare(
    `INSERT INTO users (chat_id, format, locale, is_dm_active, quiet_hours_enabled, onboarding_completed)
     VALUES (?, 'text', 'he', 1, 0, 0)`
  ).run(chatId);
}

function insertPrompt(
  db: Database.Database,
  opts: {
    chatId: number;
    fingerprint: string;
    alertType: string;
    messageId?: number | null;
    responded?: number;
  }
): void {
  db.prepare(
    `INSERT INTO safety_prompts (chat_id, fingerprint, alert_type, message_id, responded)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    opts.chatId,
    opts.fingerprint,
    opts.alertType,
    opts.messageId ?? null,
    opts.responded ?? 0
  );
}

function countPrompts(db: Database.Database, alertType: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM safety_prompts WHERE alert_type = ?')
    .get(alertType) as { cnt: number };
  return row.cnt;
}

function makeSilentBot(): Bot {
  return {
    api: {
      editMessageText: async (..._args: unknown[]): Promise<unknown> => ({}),
    },
  } as unknown as Bot;
}

// ─── Group A: deleteUnrespondedPromptsByAlertType ────────────────────────────

describe('deleteUnrespondedPromptsByAlertType', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  beforeEach(() => { db.prepare('DELETE FROM safety_prompts').run(); db.prepare('DELETE FROM users').run(); });

  it('deletes all unresponded prompts for the matching alertType', () => {
    insertUser(db, 1001);
    insertPrompt(db, { chatId: 1001, fingerprint: 'fp1', alertType: 'missiles' });
    deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(countPrompts(db, 'missiles'), 0);
  });

  it('does NOT delete responded prompts for the same alertType', () => {
    insertUser(db, 1002);
    insertPrompt(db, { chatId: 1002, fingerprint: 'fp2', alertType: 'missiles', responded: 1 });
    deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(countPrompts(db, 'missiles'), 1);
  });

  it('does NOT delete prompts for a different alertType', () => {
    insertUser(db, 1003);
    insertPrompt(db, { chatId: 1003, fingerprint: 'fp3', alertType: 'earthquakes' });
    deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(countPrompts(db, 'earthquakes'), 1);
  });

  it('returns the correct deleted-row count', () => {
    insertUser(db, 2001);
    insertUser(db, 2002);
    insertUser(db, 2003);
    insertPrompt(db, { chatId: 2001, fingerprint: 'a', alertType: 'missiles' });
    insertPrompt(db, { chatId: 2002, fingerprint: 'b', alertType: 'missiles' });
    insertPrompt(db, { chatId: 2003, fingerprint: 'c', alertType: 'missiles' });
    const count = deleteUnrespondedPromptsByAlertType(db, 'missiles');
    assert.equal(count, 3);
  });
});

// ─── Group B: clearStalePromptMessages + all-clear integration ───────────────

describe('clearStalePromptMessages', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  beforeEach(() => { db.prepare('DELETE FROM safety_prompts').run(); db.prepare('DELETE FROM users').run(); });

  it('all-clear flow removes unresponded prompts for the target alertType from DB', async () => {
    insertUser(db, 3001);
    insertPrompt(db, { chatId: 3001, fingerprint: 'fp10', alertType: 'missiles' });

    // Edit-then-delete order (prompt has no message_id → no edit attempt)
    await clearStalePromptMessages(db, makeSilentBot(), 'missiles');
    deleteUnrespondedPromptsByAlertType(db, 'missiles');

    assert.equal(countPrompts(db, 'missiles'), 0);
  });

  it('calls bot.api.editMessageText once for each prompt that has a message_id', async () => {
    insertUser(db, 4001);
    insertPrompt(db, { chatId: 4001, fingerprint: 'fp20', alertType: 'missiles', messageId: 9001 });

    let editCount = 0;
    const mockBot = {
      api: {
        editMessageText: async (..._args: unknown[]): Promise<unknown> => {
          editCount++;
          return {};
        },
      },
    } as unknown as Bot;

    await clearStalePromptMessages(db, mockBot, 'missiles');

    assert.equal(editCount, 1);
  });

  it('does NOT propagate when editMessageText throws', async () => {
    insertUser(db, 5001);
    insertPrompt(db, { chatId: 5001, fingerprint: 'fp30', alertType: 'missiles', messageId: 9002 });

    const throwingBot = {
      api: {
        editMessageText: async (..._args: unknown[]): Promise<never> => {
          throw new Error('Telegram API error');
        },
      },
    } as unknown as Bot;

    // Must not throw
    await assert.doesNotReject(() => clearStalePromptMessages(db, throwingBot, 'missiles'));
  });
});
