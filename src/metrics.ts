interface BotMetrics {
  lastAlertAt: Date | null;
  lastPollAt: Date | null;
}

const metrics: BotMetrics = { lastAlertAt: null, lastPollAt: null };

export function updateLastAlertAt(): void {
  metrics.lastAlertAt = new Date();
}

export function updateLastPollAt(): void {
  metrics.lastPollAt = new Date();
}

export function getMetrics(): Readonly<BotMetrics> {
  return { ...metrics };
}
