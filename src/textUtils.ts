export { escapeHtml } from './telegramBot.js';

/** Strip HTML tags from user input */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}
