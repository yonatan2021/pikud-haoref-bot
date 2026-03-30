import chalk from 'chalk'
import { padToWidth, visibleWidth, toVisualRtl } from './rtl.js'

// ── Palette ────────────────────────────────────────────────────────────────────

export const c = {
  primary: chalk.hex('#3B82F6'),
  success: chalk.hex('#22C55E'),
  warning: chalk.hex('#F59E0B'),
  error:   chalk.hex('#EF4444'),
  accent:  chalk.hex('#F97316'),
  muted:   chalk.dim,
  bold:    chalk.bold,
  dim:     chalk.dim,
}

// ── Banner ─────────────────────────────────────────────────────────────────────

const BOX_INNER_WIDTH = 48  // inner content width (between │ borders)

/**
 * Prints the wizard header banner.
 * Hebrew text is converted to visual order via toVisualRtl() before chalk
 * is applied, so it renders correctly in all terminals including VS Code.
 */
export function printBanner(version: string): void {
  const line1 = `  🚨  ${c.bold(toVisualRtl('פיקוד העורף'))} ${c.muted('—')} ${c.primary(toVisualRtl('הגדרה ראשונית'))}`
  const line2 = `  ${c.dim(toVisualRtl(`גרסה ${version} · pikud-haoref-bot`))}`

  console.log()
  console.log(c.dim('  ┌' + '─'.repeat(BOX_INNER_WIDTH) + '┐'))
  console.log(boxLine(line1))
  console.log(boxLine(line2))
  console.log(c.dim('  └' + '─'.repeat(BOX_INNER_WIDTH) + '┘'))
  console.log()
}

/**
 * Pads `content` to fill the box interior (BOX_INNER_WIDTH − 2 content columns,
 * 1-space padding each side). padToWidth uses visibleWidth internally so ANSI
 * codes in `content` don't disturb the alignment.
 */
function boxLine(content: string): string {
  return c.dim('  │') + ' ' + padToWidth(content, BOX_INNER_WIDTH - 2) + ' ' + c.dim('│')
}

// ── Section header ─────────────────────────────────────────────────────────────

/**
 * Prints a visual section separator with a labelled header.
 * Hebrew is converted to visual order automatically.
 * Example:  ◆ הגדרות Telegram ────────────────────────────
 */
export function printSectionHeader(label: string): void {
  const cols = process.stdout.columns ?? 72
  const width = Math.min(cols, 72) - 6
  const visualLabel = toVisualRtl(label)
  const lineLen = Math.max(2, width - visibleWidth(visualLabel) - 3)
  console.log()
  console.log(`  ${c.primary('◆')} ${c.bold(visualLabel)} ${c.dim('─'.repeat(lineLen))}`)
  console.log()
}

// ── Step badge ─────────────────────────────────────────────────────────────────

/** Returns a dim "[current/total]" badge for use in @clack prompt messages */
export function stepBadge(current: number, total: number): string {
  return c.dim(`[${current}/${total}]`)
}

// ── Result box ─────────────────────────────────────────────────────────────────

/**
 * Prints a styled box with the Docker run command or Node.js instructions.
 * Hebrew title is converted to visual order before printing.
 *
 * Border:  ┌── width ──┐  (visual width = width + 4 with leading "  ")
 * Content: │ text      │  (1-space padding each side, text padded to width - 2)
 */
export function printResultBox(title: string, lines: string[]): void {
  const width = 62
  const visualTitle = toVisualRtl(title)
  console.log()
  console.log(c.dim('  ┌' + '─'.repeat(width) + '┐'))
  console.log(c.dim('  │') + ' ' + padToWidth(visualTitle, width - 2) + ' ' + c.dim('│'))
  console.log(c.dim('  └' + '─'.repeat(width) + '┘'))
  console.log()
  for (const line of lines) {
    console.log('  ' + line)
  }
  console.log()
}

// ── Feedback messages ──────────────────────────────────────────────────────────
//
// toVisualRtl() is applied to each Hebrew string literal BEFORE chalk wrapping.
// Chalk adds ANSI escape codes; bidi-js cannot reorder through those, so the
// order must always be: raw string → toVisualRtl → chalk color/style.

export const msg = {
  required:      c.muted(toVisualRtl('(חובה)')),
  optional:      c.muted(toVisualRtl('(Enter לדילוג)')),
  tokenValid:    `${c.success('✅')} ${c.bold(toVisualRtl('מצוין!'))} ${toVisualRtl('הבוט מחובר')}`,
  tokenInvalid:  `${c.error('❌')} ${toVisualRtl('טוקן לא תקין')}`,
  mapboxValid:   `${c.success('✅')} ${toVisualRtl('טוקן Mapbox תקין')}`,
  mapboxInvalid: `${c.error('❌')} ${toVisualRtl('טוקן Mapbox לא תקין')}`,
  networkError:  `${c.warning('⚠️')}  ${toVisualRtl('לא ניתן לאמת — בדוק חיבור לאינטרנט')}`,
  envWritten:    (path: string) => `${c.success('🎉')} ${toVisualRtl('קובץ ה-.env נוצר:')} ${c.primary(path)}`,
  envUpdated:    (path: string) => `${c.success('✨')} ${toVisualRtl('ההגדרות עודכנו:')} ${c.primary(path)}`,
  allDone:       `${c.accent('🚀')} ${c.bold(toVisualRtl('הכל מוכן'))} — ${toVisualRtl('הבוט מוכן להפעלה')}`,
  cancelled:     c.muted(toVisualRtl('ביטול — להתראות!')),
}
