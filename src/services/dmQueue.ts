import { getBot } from '../telegramBot.js';
import { deleteUser } from '../db/userRepository.js';
import { log } from '../logger.js';

export interface DmTask {
  chatId: string;
  text: string;
  retries?: number; // tracks 429 retry attempts; incremented on each rate-limit re-queue
}

type SendFn = (task: DmTask) => Promise<void>;

interface DmQueueOptions {
  concurrency?: number;
}

export class DmQueue {
  private readonly queue: DmTask[] = [];
  private running = 0;
  private paused = false;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly concurrency: number;
  private readonly send: SendFn;

  constructor(send: SendFn, options: DmQueueOptions = {}) {
    this.send = send;
    const requested = options.concurrency ?? 10;
    if (requested <= 0) throw new Error(`DmQueue: concurrency must be positive, got ${requested}`);
    this.concurrency = requested;
  }

  enqueueAll(tasks: DmTask[]): void {
    this.queue.push(...tasks);
    // Issue 1: warn once here, not on every drain() call (which fires N+1 times per batch)
    if (this.queue.length > 100) {
      log('warn', 'DM', `⚠️  תור עמוק: ${this.queue.length} משימות ממתינות`);
    }
    this.drain();
  }

  // Issue 2: removed duplicate `paused` field — `rateLimited` is the canonical name
  getStats(): { pending: number; rateLimited: boolean } {
    return {
      pending: this.queue.length,
      rateLimited: this.paused,
    };
  }

  // In-flight sends (already past running++) complete even when paused; their
  // finally() re-calls drain() which is a no-op while paused is true.
  private drain(): void {
    while (!this.paused && this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      this.send(task)
        .catch((err: unknown) => this.handleError(err, task))
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  private handleError(err: unknown, task: DmTask): void {
    const msg = err instanceof Error ? err.message : String(err);
    const retryAfter = extractRetryAfter(err);

    if (retryAfter !== null) {
      const MAX_RETRIES = 5;
      const attempts = (task.retries ?? 0) + 1;
      if (attempts > MAX_RETRIES) {
        log('error', 'DM', `מוותר על ${task.chatId} אחרי ${MAX_RETRIES} ניסיונות — מוחק משימה`);
        return;
      }
      log('warn', 'DM', `⏳ Rate limit — מפסיק ${retryAfter}ש (ניסיון ${attempts}/${MAX_RETRIES}). תור: ${this.queue.length + 1}`);
      this.queue.unshift({ ...task, retries: attempts });
      this.paused = true;
      // Guard against concurrent 429s scheduling multiple timers — only one timer at a time.
      if (this.pauseTimer === null) {
        this.pauseTimer = setTimeout(() => {
          log('info', 'DM', '▶️  Rate limit הסתיים — ממשיך');
          this.pauseTimer = null;
          this.paused = false;
          this.drain();
        }, Math.max(1, retryAfter * 1000)); // Issue 10: guard against retry_after=0 (min 1ms)
      }
      return;
    }

    const isBlocked =
      msg.includes('bot was blocked') ||
      msg.includes('user is deactivated') ||
      msg.includes('chat not found');

    if (isBlocked) {
      const reason = msg.includes('bot was blocked')
        ? 'blocked'
        : msg.includes('user is deactivated')
          ? 'deactivated'
          : 'chat not found';
      log('info', 'DM', `משתמש ${task.chatId} לא נגיש (${reason}) — מסיר`);
      const chatIdNum = parseInt(task.chatId, 10);
      if (!isNaN(chatIdNum)) {
        try {
          deleteUser(chatIdNum);
        } catch (dbErr) {
          log('error', 'DM', `כישלון בהסרת משתמש חסום ${task.chatId}: ${dbErr}`);
        }
      }
    } else {
      log('error', 'DM', `שגיאה בשליחה ל-${task.chatId}: ${err}`);
    }
  }
}

const MAX_PAUSE_SECONDS = 300;

export function extractRetryAfter(err: unknown): number | null {
  if (err != null && typeof err === 'object') {
    const params = (err as any).parameters;
    if (typeof params?.retry_after === 'number') return Math.min(params.retry_after, MAX_PAUSE_SECONDS);
  }
  if (err instanceof Error) {
    const m = err.message.match(/retry after (\d+)/i);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (parsed > MAX_PAUSE_SECONDS) log('warn', 'DM', `retryAfter=${parsed}ש חורג מהמקסימום — מגביל ל-${MAX_PAUSE_SECONDS}ש`);
      return Math.min(parsed, MAX_PAUSE_SECONDS);
    }
  }
  return null;
}

// Issue 7: extracted from singleton closure so it can be tested independently.
// Two-phase parse: integer strings first (parseInt stops at '.', so "1.5" → 1 NOT NaN),
// then float fallback for strings like ".5" where parseInt returns NaN.
export function validateChatId(chatId: string): number | null {
  const intParsed = parseInt(chatId, 10);
  if (!isNaN(intParsed)) return intParsed;
  const floatParsed = Math.trunc(parseFloat(chatId));
  if (!isNaN(floatParsed)) return floatParsed;
  return null;
}

export const dmQueue = new DmQueue(async (task) => {
  const intParsed = parseInt(task.chatId, 10);
  if (!isNaN(intParsed)) {
    await getBot().api.sendMessage(intParsed, task.text, { parse_mode: 'HTML' });
    return;
  }
  // Float-format fallback (e.g. chatId ".5"): clean up DB entry, skip send
  const floatId = validateChatId(task.chatId);
  if (floatId !== null) {
    try { deleteUser(floatId); } catch (e) {
      log('error', 'DM', `כישלון בהסרת משתמש NaN-path ${task.chatId}: ${e}`);
    }
  } else {
    log('error', 'DM', `chatId לא תקין (NaN) — המנוי "${task.chatId}" חייב הסרה ידנית`);
  }
});

// Issue 2: return type updated to match getStats() — no `paused` field
export function getQueueStats(): { pending: number; rateLimited: boolean } {
  return dmQueue.getStats();
}
