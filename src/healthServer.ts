import http from 'node:http';
import { getMetrics } from './metrics.js';
import { getDb } from './db/schema.js';
import { log } from './logger.js';
import { israelMidnight } from './dashboard/israelDate.js';
import { getQueueStats } from './services/dmQueue.js';

// A poll cycle is considered "stuck" if more than 30 seconds have elapsed
// since the last successful poll. Both poll sources (library + direct fetch)
// must have failed for this to trigger — a single-source failure still updates
// lastPollAt via Promise.allSettled's anySucceeded check in alertPoller.ts.
const POLL_STUCK_THRESHOLD_MS = 30_000;

function alertsToday(): { count: number; error: boolean } {
  try {
    const row = getDb()
      .prepare('SELECT COUNT(*) as cnt FROM alert_history WHERE fired_at >= ?')
      .get(israelMidnight()) as { cnt: number };
    return { count: row.cnt, error: false };
  } catch (err) {
    log('error', 'Health', `כישלון בשאילתת alertsToday: ${err}`);
    return { count: 0, error: true };
  }
}

export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    try {
      if (req.url !== '/health') {
        res.writeHead(404).end('Not Found');
        return;
      }
      const { lastAlertAt, lastPollAt } = getMetrics();
      const today = alertsToday();
      const pollStuck = lastPollAt
        ? Date.now() - lastPollAt.getTime() > POLL_STUCK_THRESHOLD_MS
        : false;
      const memoryMb = Math.round(process.memoryUsage().rss / 1_048_576);
      const dmQueueDepth = getQueueStats().pending;
      const statusCode = pollStuck ? 503 : 200;
      const body = JSON.stringify({
        uptime: process.uptime(),
        lastAlertAt: lastAlertAt?.toISOString() ?? null,
        lastPollAt: lastPollAt?.toISOString() ?? null,
        alertsToday: today.count,
        pollStuck,
        memoryMb,
        dmQueueDepth,
        ...(today.error ? { alertsTodayError: true } : {}),
      });
      res.writeHead(statusCode, { 'Content-Type': 'application/json' }).end(body);
    } catch (err) {
      log('error', 'Health', `שגיאה בטיפול בבקשה: ${err}`);
      if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    }
  });
  // Non-critical endpoint — log and continue rather than crashing the bot on any
  // listen error (EADDRINUSE, EACCES, etc.). The bot runs without health monitoring.
  server.on('error', (err: NodeJS.ErrnoException) => {
    log('error', 'Health', `כישלון בהפעלת שרת על פורט ${port}: ${err.message}`);
  });
  server.listen(port);
  return server;
}
