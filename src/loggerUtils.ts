// ─── Logger utilities ─────────────────────────────────────────────────────────
// Helpers shared by logger.ts. Kept separate to keep logger.ts focused on
// output formatting.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bidiFactory = require('bidi-js') as () => {
  getEmbeddingLevels: (str: string, dir: 'ltr' | 'rtl') => { levels: Record<number, number>; paragraphs: unknown[] };
  getReorderedString: (str: string, levels: { levels: Record<number, number>; paragraphs: unknown[] }) => string;
};

const _bidi = bidiFactory();

/**
 * Convert a logical-order Hebrew string to visual order for sequential LTR rendering.
 *
 * The previous approach (\u202B RLE embedding) only works in terminals that implement
 * the Unicode BiDi Algorithm — notably NOT VS Code's integrated terminal, which ignores
 * \u202B and renders characters left-to-right, causing Hebrew to appear reversed.
 *
 * This function uses the Unicode BiDi Algorithm (via bidi-js) to reorder the string
 * to visual order BEFORE sending it to the terminal. The result renders correctly in
 * ALL terminals regardless of their BiDi support:
 *   - Non-BiDi terminal (VS Code): visual-order string rendered LTR → correct when read RTL
 *   - BiDi terminal (macOS Terminal.app): terminal reverses visual-order string back →
 *     correct Hebrew rendered in RTL position
 *
 * Examples (base direction: RTL paragraph):
 *   "שלום"         → "םולש"         (pure Hebrew word)
 *   "פורט 3000"    → "3000 טרופ"    (Hebrew + digits: runs reversed, digit run stays LTR)
 *   "שגיאה בשליחה" → "החילשב האיגש" (multi-word: chars and word-order both reversed)
 */
export function toVisualRtl(str: string): string {
  const levels = _bidi.getEmbeddingLevels(str, 'rtl');
  return _bidi.getReorderedString(str, levels);
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
