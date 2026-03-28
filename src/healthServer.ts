import http from 'node:http';
import { getMetrics } from './metrics.js';
import { getDb } from './db/schema.js';
import { log } from './logger.js';

// 'start of day' boundary is UTC midnight — alertsToday may be off by 2–3h
// vs. Israel local time (UTC+2/+3); acceptable for monitoring purposes.
function alertsToday(): { count: number; error: boolean } {
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM alert_history WHERE fired_at >= datetime('now','start of day')")
      .get() as { cnt: number };
    return { count: row.cnt, error: false };
  } catch (err) {
    log('error', 'Health', `כישלון בשאילתת alertsToday: ${err}`);
    return { count: 0, error: true };
  }
}

function resolvePort(override?: number): number {
  if (override !== undefined) return override;
  const parsed = parseInt(process.env.HEALTH_PORT ?? '', 10);
  if (isNaN(parsed)) {
    log('warn', 'Health', 'HEALTH_PORT אינו מספר תקין — חוזר לפורט 3000');
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
      log('error', 'Health', `שגיאה בטיפול בבקשה: ${err}`);
      if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    }
  });
  // Non-critical endpoint — log and continue rather than crashing the bot on any
  // listen error (EADDRINUSE, EACCES, etc.). The bot runs without health monitoring.
  server.on('error', (err: NodeJS.ErrnoException) => {
    log('error', 'Health', `כישלון בהפעלת שרת על פורט ${resolvedPort}: ${err.message}`);
  });
  server.listen(resolvedPort);
  return server;
}
