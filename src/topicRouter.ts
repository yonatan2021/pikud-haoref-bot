import { isRoutingCacheLoaded, getTopicIdCached } from './config/routingCache.js';
import { ALERT_TYPE_CATEGORY, CATEGORY_ENV_VAR } from './config/alertCategories.js';
import type { AlertCategory } from './config/alertCategories.js';

// Re-export for backward compatibility — consumers that import from topicRouter continue to work.
export { ALERT_TYPE_CATEGORY, CATEGORY_ENV_VAR };
export type { AlertCategory };

/**
 * Returns the Telegram message_thread_id for the given alert type,
 * or undefined if the env var for that category is not set or is invalid.
 * Topic ID 1 is rejected — it is reserved in Telegram forum groups and causes
 * "message thread not found" errors.
 *
 * When the routing cache has been loaded (after DB init), the cache is used
 * so that dashboard-configured topic IDs take effect without a restart.
 */
export function getTopicId(alertType: string): number | undefined {
  if (isRoutingCacheLoaded()) return getTopicIdCached(alertType);
  const category = ALERT_TYPE_CATEGORY[alertType] ?? 'general';
  const envVar = CATEGORY_ENV_VAR[category];
  const raw = process.env[envVar];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed === 1) return undefined;
  return parsed;
}
