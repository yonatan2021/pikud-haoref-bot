import { getBot } from '../telegramBot.js';
import { deleteUser } from '../db/userRepository.js';

export interface DmTask {
  chatId: string;
  text: string;
}

type SendFn = (task: DmTask) => Promise<void>;

interface DmQueueOptions {
  concurrency?: number;
}

export class DmQueue {
  private readonly queue: DmTask[] = [];
  private running = 0;
  private paused = false;
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
      console.warn(`[DM] Rate-limited by Telegram — pausing ${retryAfter}s. Queue depth: ${this.queue.length + 1}`);
      this.queue.unshift(task);
      this.paused = true;
      setTimeout(() => {
        console.log('[DM] Rate-limit pause ended — resuming drain');
        this.paused = false;
        this.drain();
      }, retryAfter * 1000);
      return;
    }

    const isBlocked =
      msg.includes('bot was blocked') ||
      msg.includes('user is deactivated') ||
      msg.includes('chat not found');

    if (isBlocked) {
      console.log(`[DM] User ${task.chatId} blocked bot — removing`);
      try {
        deleteUser(parseInt(task.chatId, 10));
      } catch (dbErr) {
        console.error(`[DM] Failed to remove blocked user ${task.chatId}:`, dbErr);
      }
    } else {
      console.error(`[DM] Error sending to ${task.chatId}:`, err);
    }
  }
}

function extractRetryAfter(err: unknown): number | null {
  if (err != null && typeof err === 'object') {
    const params = (err as any).parameters;
    if (typeof params?.retry_after === 'number') return Math.min(params.retry_after, 300);
  }
  if (err instanceof Error) {
    const m = err.message.match(/retry after (\d+)/i);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (parsed > 300) console.warn(`[DM] retryAfter=${parsed}s exceeds cap — clamping to 300s`);
      return Math.min(parsed, 300);
    }
  }
  return null;
}

export const dmQueue = new DmQueue(async (task) => {
  await getBot().api.sendMessage(parseInt(task.chatId, 10), task.text, { parse_mode: 'HTML' });
});
