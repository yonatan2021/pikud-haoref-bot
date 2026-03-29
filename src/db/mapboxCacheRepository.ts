import { getDb } from './schema.js';

interface CacheRow {
  cache_key: string;
  image_data: Buffer;
}

export function loadCacheEntries(maxSize: number): Array<{ key: string; buffer: Buffer }> {
  const rows = getDb()
    .prepare(
      `SELECT cache_key, image_data FROM mapbox_image_cache
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(maxSize) as CacheRow[];

  return rows.map(r => ({ key: r.cache_key, buffer: r.image_data }));
}

export function saveCacheEntry(key: string, data: Buffer): void {
  getDb()
    .prepare(
      `INSERT INTO mapbox_image_cache (cache_key, image_data)
       VALUES (?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET image_data = excluded.image_data,
                                             created_at = datetime('now')`
    )
    .run(key, data);
}

export function deleteCacheEntry(key: string): void {
  getDb()
    .prepare(`DELETE FROM mapbox_image_cache WHERE cache_key = ?`)
    .run(key);
}

/** Removes rows beyond the newest `maxSize` entries. Called at startup to cap DB size. */
export function pruneCacheEntries(maxSize: number): void {
  getDb()
    .prepare(
      `DELETE FROM mapbox_image_cache
       WHERE cache_key NOT IN (
         SELECT cache_key FROM mapbox_image_cache
         ORDER BY created_at DESC
         LIMIT ?
       )`
    )
    .run(maxSize);
}
