/** RTL and Unicode-aware terminal utilities */

const ANSI_RE = /\x1b\[[0-9;]*m/g
const SEGMENTER = new Intl.Segmenter()

/**
 * Returns the visual column width of a string in a terminal,
 * stripping ANSI escape codes and counting wide characters (emoji, CJK) as 2.
 * Hebrew chars count as 1 each. Emoji count as 2.
 */
export function visibleWidth(str: string): number {
  const clean = str.replace(ANSI_RE, '')
  let width = 0
  for (const { segment } of SEGMENTER.segment(clean)) {
    const cp = segment.codePointAt(0) ?? 0
    width += isWideCodePoint(cp) ? 2 : 1
  }
  return width
}

/**
 * Prepends a Unicode RTL mark (U+200F) to force right-to-left rendering
 * in ambiguous terminal contexts.
 */
export function rtlMark(str: string): string {
  return '\u200F' + str
}

/**
 * Pads a string with trailing spaces until its visual width reaches `width`.
 * Respects ANSI codes and Unicode wide characters.
 * Never truncates — strings already at or beyond `width` are returned as-is.
 */
export function padToWidth(str: string, width: number): string {
  const current = visibleWidth(str)
  const pad = Math.max(0, width - current)
  return str + ' '.repeat(pad)
}

// ── Wide character detection ──────────────────────────────────────────────────

/**
 * Returns true for Unicode codepoints that occupy 2 terminal columns:
 * CJK ideographs, full-width forms, and emoji.
 * Hebrew, Arabic, Latin etc. are 1-column and return false.
 */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303E) ||   // CJK Radicals
    (cp >= 0x3040 && cp <= 0xA4CF) ||   // CJK + Kana
    (cp >= 0xAC00 && cp <= 0xD7A3) ||   // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility
    (cp >= 0xFE10 && cp <= 0xFE19) ||   // Vertical Forms
    (cp >= 0xFE30 && cp <= 0xFE6F) ||   // CJK Compatibility Forms
    (cp >= 0xFF01 && cp <= 0xFF60) ||   // Fullwidth ASCII
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Signs
    cp >= 0x1F004                        // Emoji and supplementary blocks
  )
}
