import { getBot } from '../telegramBot.js';
import { deleteUser } from '../db/userRepository.js';

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
    this.drain();
  }

  getStats(): { pending: number; rateLimited: boolean; paused: boolean } {
    return {
      pending: this.queue.length,
      rateLimited: this.paused,
      paused: this.paused,
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
    if (this.queue.length > 100) {
      console.warn(`[DM] Queue depth warning: ${this.queue.length} tasks pending`);
    }
  }

  private handleError(err: unknown, task: DmTask): void {
    const msg = err instanceof Error ? err.message : String(err);
    const retryAfter = extractRetryAfter(err);

    if (retryAfter !== null) {
      const MAX_RETRIES = 5;
      const attempts = (task.retries ?? 0) + 1;
      if (attempts > MAX_RETRIES) {
        console.error(`[DM] Giving up on ${task.chatId} after ${MAX_RETRIES} rate-limit retries — dropping task`);
        return;
      }
      console.warn(`[DM] Rate-limited — pausing ${retryAfter}s (attempt ${attempts}/${MAX_RETRIES}). Queue depth: ${this.queue.length + 1}`);
      this.queue.unshift({ ...task, retries: attempts });
      this.paused = true;
      // Guard against concurrent 429s scheduling multiple timers — only one timer at a time.
      if (this.pauseTimer === null) {
        this.pauseTimer = setTimeout(() => {
          console.log('[DM] Rate-limit pause ended — resuming drain');
          this.pauseTimer = null;
          this.paused = false;
          this.drain();
        }, retryAfter * 1000);
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
      console.log(`[DM] User ${task.chatId} unreachable (${reason}) — removing`);
      const chatIdNum = parseInt(task.chatId, 10);
      if (!isNaN(chatIdNum)) {
        try {
          deleteUser(chatIdNum);
        } catch (dbErr) {
          console.error(`[DM] Failed to remove blocked user ${task.chatId}:`, dbErr);
        }
      }
    } else {
      console.error(`[DM] Error sending to ${task.chatId}:`, err);
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
      if (parsed > MAX_PAUSE_SECONDS) console.warn(`[DM] retryAfter=${parsed}s exceeds cap — clamping to ${MAX_PAUSE_SECONDS}s`);
      return Math.min(parsed, MAX_PAUSE_SECONDS);
    }
  }
  return null;
}

export const dmQueue = new DmQueue(async (task) => {
  const chatIdNum = parseInt(task.chatId, 10);
  if (isNaN(chatIdNum)) {
    // Try float-parse fallback (e.g. chatId stored as "123.0") before giving up on DB cleanup
    const floatId = Math.trunc(parseFloat(task.chatId));
    if (!isNaN(floatId)) {
      try { deleteUser(floatId); } catch (e) {
        console.error(`[DM] Failed to remove NaN-path user ${task.chatId}:`, e);
      }
    } else {
      console.error(`[DM] Invalid chatId (NaN) — subscription "${task.chatId}" must be removed manually`);
    }
    return;
  }
  await getBot().api.sendMessage(chatIdNum, task.text, { parse_mode: 'HTML' });
});

export function getQueueStats(): { pending: number; rateLimited: boolean; paused: boolean } {
  return dmQueue.getStats();
}
