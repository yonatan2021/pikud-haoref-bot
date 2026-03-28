import http from 'node:http';
import { getMetrics } from './metrics.js';
import { getDb } from './db/schema.js';

function alertsToday(): number {
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM alert_history WHERE fired_at >= datetime('now','start of day')")
      .get() as { cnt: number };
    return row.cnt;
  } catch {
    return 0;
  }
}

export function startHealthServer(port?: number): http.Server {
  const resolvedPort = port ?? parseInt(process.env.HEALTH_PORT ?? '3000', 10);
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end('Not Found');
      return;
    }
    const { lastAlertAt, lastPollAt } = getMetrics();
    const body = JSON.stringify({
      uptime: process.uptime(),
      lastAlertAt: lastAlertAt?.toISOString() ?? null,
      lastPollAt: lastPollAt?.toISOString() ?? null,
      alertsToday: alertsToday(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  });
  server.listen(resolvedPort);
  return server;
}
