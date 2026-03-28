import http from 'node:http';
import { getMetrics } from './metrics.js';
import { getDb } from './db/schema.js';

// 'start of day' boundary is UTC midnight — alertsToday may be off by 2–3h
// vs. Israel local time (UTC+2/+3); acceptable for monitoring purposes.
function alertsToday(): { count: number; error: boolean } {
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM alert_history WHERE fired_at >= datetime('now','start of day')")
      .get() as { cnt: number };
    return { count: row.cnt, error: false };
  } catch (err) {
    console.error('[Health] Failed to query alertsToday:', err);
    return { count: 0, error: true };
  }
}

function resolvePort(override?: number): number {
  if (override !== undefined) return override;
  const parsed = parseInt(process.env.HEALTH_PORT ?? '', 10);
  if (isNaN(parsed)) {
    console.warn('[Health] HEALTH_PORT is not a valid number — falling back to 3000');
    return 3000;
  }
  return parsed;
}

export function startHealthServer(port?: number): http.Server {
  const resolvedPort = resolvePort(port);
  const server = http.createServer((req, res) => {
    try {
      if (req.url !== '/health') {
        res.writeHead(404).end('Not Found');
        return;
      }
      const { lastAlertAt, lastPollAt } = getMetrics();
      const today = alertsToday();
      const body = JSON.stringify({
        uptime: process.uptime(),
        lastAlertAt: lastAlertAt?.toISOString() ?? null,
        lastPollAt: lastPollAt?.toISOString() ?? null,
        alertsToday: today.count,
        ...(today.error ? { alertsTodayError: true } : {}),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
    } catch (err) {
      console.error('[Health] Request handler error:', err);
      if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    }
  });
  // Non-critical endpoint — log and continue rather than crashing the bot on any
  // listen error (EADDRINUSE, EACCES, etc.). The bot runs without health monitoring.
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[Health] Server failed to start on port ${resolvedPort}:`, err.message);
  });
  server.listen(resolvedPort, () => {
    console.log(`[Health] Listening on port ${resolvedPort}`);
  });
  return server;
}
