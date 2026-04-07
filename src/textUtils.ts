export { escapeHtml } from './telegramBot.js';

/** Strip HTML tags from user input */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Returns a Hebrew relative-time string for a past SQLite datetime string.
 * SQLite stores UTC without 'Z' — we normalise before parsing.
 */
export function formatRelativeTime(isoDateStr: string): string {
  const normalized = isoDateStr.endsWith('Z') ? isoDateStr : `${isoDateStr}Z`;
  const diffMs = Date.now() - new Date(normalized).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60)    return 'עכשיו';
  if (s < 3600)  return `לפני ${Math.floor(s / 60)} דקות`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שעות`;
  if (s < 172800) return 'לפני יום';
  return `לפני ${Math.floor(s / 86400)} ימים`;
}

/**
 * Returns a Hebrew string for how long until a future SQLite datetime string.
 */
export function formatTimeUntil(isoDateStr: string): string {
  const normalized = isoDateStr.endsWith('Z') ? isoDateStr : `${isoDateStr}Z`;
  const diffMs = new Date(normalized).getTime() - Date.now();
  const s = Math.ceil(diffMs / 1000);
  if (s <= 0)   return 'פג תוקף';
  if (s < 60)   return 'עוד פחות מדקה';
  if (s < 3600) return `עוד ${Math.ceil(s / 60)} דקות`;
  return `עוד ${Math.ceil(s / 3600)} שעות`;
}
