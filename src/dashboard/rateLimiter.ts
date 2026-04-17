import type { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  /** Hebrew-friendly error message returned in the JSON body */
  message: string;
}

export interface RateLimitHandler {
  (req: Request, res: Response, next: NextFunction): void;
  /** Clears all tracked counters — useful for test isolation */
  clearStore(): void;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function getClientIp(req: Request): string {
  return req.ip ?? (req.socket as { remoteAddress?: string })?.remoteAddress ?? 'unknown';
}

/**
 * Returns a per-IP rate-limit middleware.
 * Each call creates an independent in-memory store — safe to instantiate once per module
 * and reuse across requests.
 */
export function createRateLimitMiddleware(opts: RateLimitOptions): RateLimitHandler {
  const store = new Map<string, RateLimitEntry>();

  const handler: RateLimitHandler = (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    let entry = store.get(ip);

    // Lazy eviction: delete expired entries to prevent unbounded memory growth
    if (entry !== undefined && now >= entry.resetAt) {
      store.delete(ip);
      entry = undefined;
    }

    if (entry !== undefined) {
      if (entry.count >= opts.maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({ error: opts.message });
        return;
      }
      store.set(ip, { ...entry, count: entry.count + 1 });
    } else {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
    }

    next();
  };

  handler.clearStore = () => store.clear();

  return handler;
}

/**
 * Shared read limiter for sensitive GET endpoints.
 * 100 requests per minute per IP — generous enough for normal dashboard use,
 * but blocks brute-force enumeration / scraping of secrets metadata, CSV exports, etc.
 */
export const readLimiter = createRateLimitMiddleware({
  maxRequests: 100,
  windowMs: 60_000,
  message: 'יותר מדי בקשות — נסה שוב בעוד דקה',
});
