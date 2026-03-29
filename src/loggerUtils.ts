// ─── Logger utilities ─────────────────────────────────────────────────────────
// Helpers shared by logger.ts. Kept separate to keep logger.ts focused on
// output formatting.

/** Unicode Right-to-Left Embedding — forces BiDi algorithm to treat the
 *  embedded span as RTL. Needed for mixed Hebrew+number strings (e.g. "כל 2 שניות")
 *  because most terminals default to LTR base direction. */
export const RLE = '\u202B';

/** Unicode Pop Directional Formatting — closes the nearest directional embedding. */
export const PDF = '\u202C';

/** Wrap a string in an RTL directional embedding so Hebrew+number mixes
 *  render correctly in LTR-defaulting terminals. */
export function wrapRtl(str: string): string {
  return `${RLE}${str}${PDF}`;
}

/** OSC 8 hyperlink escape — renders as a clickable link in VS Code terminal,
 *  iTerm2, Kitty, and most modern terminals. Falls back to plain text elsewhere. */
export function osc8Link(url: string, label: string): string {
  return `\x1B]8;;${url}\x07${label}\x1B]8;;\x07`;
}

/** Dynamic box width clamped to terminal width.
 *  Min 58 (fits all service lines), max 72 (readable on narrow windows). */
export function boxWidth(): number {
  const cols = process.stdout.columns ?? 80;
  return Math.max(58, Math.min(72, cols - 4));
}

/** Horizontal rule string of the given length. */
export function hr(width: number): string {
  return '─'.repeat(width);
}

/** Returns true if the string contains any Hebrew Unicode character (U+0590–U+05FF). */
export function containsHebrew(str: string): boolean {
  return /[\u0590-\u05FF]/.test(str);
}
