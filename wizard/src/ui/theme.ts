import chalk from 'chalk'
import { padToWidth, visibleWidth } from './rtl.js'

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

const BOX_INNER_WIDTH = 46  // inner content width (between │ borders)

/**
 * Prints the wizard header banner.
 * Lines are padded using Unicode-aware visibleWidth so Hebrew + emoji fit correctly.
 */
export function printBanner(version: string): void {
  const line1 = `  🚨  ${c.bold('פיקוד העורף')} ${c.muted('—')} ${c.primary('הגדרה ראשונית')}`
  const line2 = `  ${c.dim(`גרסה ${version} · pikud-haoref-bot`)}`

  console.log(c.muted('┌' + '─'.repeat(BOX_INNER_WIDTH) + '┐'))
  console.log(boxLine(line1))
  console.log(boxLine(line2))
  console.log(c.muted('└' + '─'.repeat(BOX_INNER_WIDTH) + '┘'))
  console.log()
}

function boxLine(content: string): string {
  const prefix = c.muted('│') + ' '
  const suffix = ' ' + c.muted('│')
  const contentWidth = BOX_INNER_WIDTH - 2  // 1 space padding each side
  const padded = padToWidth(content, contentWidth + visibleWidth(prefix) - 1)
  return prefix + padded + suffix
}

// ── Step badge ─────────────────────────────────────────────────────────────────

/** Returns a dim "[current/total]" badge for use in @clack prompt messages */
export function stepBadge(current: number, total: number): string {
  return c.dim(`[${current}/${total}]`)
}

// ── Result box ─────────────────────────────────────────────────────────────────

/**
 * Prints a styled box with the Docker run command or Node.js instructions.
 * Keeps the Hebrew title on its own line (monodirectional RTL).
 */
export function printResultBox(title: string, lines: string[]): void {
  const width = 62
  console.log()
  console.log(c.muted('  ┌' + '─'.repeat(width) + '┐'))
  console.log(c.muted('  │') + '  ' + padToWidth(title, width - 2) + c.muted('  │'))
  console.log(c.muted('  └' + '─'.repeat(width) + '┘'))
  console.log()
  for (const line of lines) {
    console.log('  ' + line)
  }
  console.log()
}

// ── Feedback messages ──────────────────────────────────────────────────────────

export const msg = {
  required:      c.muted('(חובה)'),
  optional:      c.muted('(Enter לדילוג)'),
  tokenValid:    `${c.success('✅')} ${c.bold('מצוין!')} הבוט מחובר`,
  tokenInvalid:  `${c.error('❌')} טוקן לא תקין`,
  mapboxValid:   `${c.success('✅')} טוקן Mapbox תקין`,
  mapboxInvalid: `${c.error('❌')} טוקן Mapbox לא תקין`,
  networkError:  `${c.warning('⚠️')}  לא ניתן לאמת — בדוק חיבור לאינטרנט`,
  envWritten:    (path: string) => `${c.success('🎉')} קובץ ה-.env נוצר: ${c.primary(path)}`,
  envUpdated:    (path: string) => `${c.success('✨')} ההגדרות עודכנו: ${c.primary(path)}`,
  allDone:       `${c.accent('🚀')} ${c.bold('הכל מוכן')} — הבוט מוכן להפעלה`,
  cancelled:     `${c.muted('ביטול — להתראות!')}`,
}
