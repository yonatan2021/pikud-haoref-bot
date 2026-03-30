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
    const entry = store.get(ip);

    if (entry !== undefined && now < entry.resetAt) {
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
