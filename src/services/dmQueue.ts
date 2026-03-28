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
    this.concurrency = options.concurrency ?? 10;
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
      this.queue.unshift(task);
      this.paused = true;
      setTimeout(() => {
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
      deleteUser(parseInt(task.chatId, 10));
    } else {
      console.error(`[DM] Error sending to ${task.chatId}:`, err);
    }
  }
}

function extractRetryAfter(err: unknown): number | null {
  if (err != null && typeof err === 'object') {
    const params = (err as any).parameters;
    if (typeof params?.retry_after === 'number') return params.retry_after;
  }
  if (err instanceof Error) {
    const m = err.message.match(/retry after (\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export const dmQueue = new DmQueue(async (task) => {
  await getBot().api.sendMessage(parseInt(task.chatId, 10), task.text, { parse_mode: 'HTML' });
});
