import chalk from 'chalk'
import boxen from 'boxen'
import gradient from 'gradient-string'
import { toVisualRtl } from './rtl.js'

// ── Palette ────────────────────────────────────────────────────────────────────

export const c = {
  primary:  chalk.hex('#2AABEE'),   // Telegram blue
  success:  chalk.hex('#22C55E'),   // green
  warning:  chalk.hex('#F59E0B'),   // amber
  error:    chalk.hex('#EF4444'),   // red
  accent:   chalk.hex('#F59E0B'),   // amber (same as warning, for highlights)
  critical: chalk.hex('#EF4444'),   // red — for PROXY_URL critical warning
  muted:    chalk.dim,
  bold:     chalk.bold,
  dim:      chalk.dim,
}

// ── Banner ─────────────────────────────────────────────────────────────────────

/**
 * Prints the wizard header banner.
 * Title uses gradient-string (Telegram blue → amber), framed in a boxen 'round' box.
 * toVisualRtl() is applied BEFORE gradient coloring so bidi reordering
 * isn't confused by ANSI codes.
 */
export function printBanner(version: string): void {
  const titleHe = toVisualRtl('פיקוד העורף')
  const subtitleHe = toVisualRtl('בוט התראות בזמן אמת')
  const versionHe = toVisualRtl(`גרסה ${version}`)

  const titleGrad = gradient(['#2AABEE', '#F59E0B'])(titleHe)
  const title = `🚨  ${titleGrad} — ${chalk.dim(subtitleHe)}`
  const sub   = chalk.dim(`${versionHe}  ·  pikud-haoref-bot`)

  const content = `${title}\n${sub}`

  console.log()
  console.log(boxen(content, {
    borderStyle: 'round',
    borderColor: '#2AABEE',
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
  }))
  console.log()
}

// ── Progress bar ───────────────────────────────────────────────────────────────

/**
 * Prints a two-line progress bar.
 * Line 1: separator line with step counter and percent
 * Line 2: filled/empty bar blocks with label
 */
export function printProgressBar(current: number, total: number, label: string): void {
  const cols     = process.stdout.columns ?? 72
  const barWidth = Math.min(cols - 20, 36)
  const pct      = Math.round((current / total) * 100)
  const filled   = Math.round((current / total) * barWidth)
  const empty    = barWidth - filled

  const bar    = c.primary('█'.repeat(filled)) + chalk.dim('░'.repeat(empty))
  const stepHe = toVisualRtl(`שלב ${current} מתוך ${total}`)
  const pctStr = chalk.dim(`${pct}%`)
  const sep    = chalk.dim('─'.repeat(barWidth))

  console.log()
  console.log(`  ${sep}  ${chalk.dim(stepHe)}  ${pctStr}`)
  console.log(`  ${bar}  ${c.bold(toVisualRtl(label))}`)
  console.log()
}

// ── Section card ───────────────────────────────────────────────────────────────

/**
 * Prints a styled boxen card before a group of prompts.
 * icon:        emoji shown in the border title
 * title:       Hebrew section title (auto-converted via toVisualRtl)
 * description: Hebrew description line inside the box
 */
export function printSectionCard(icon: string, title: string, description: string): void {
  const titleVisual = toVisualRtl(title)
  const descVisual  = chalk.dim(toVisualRtl(description))

  console.log(boxen(descVisual, {
    borderStyle: 'round',
    borderColor: '#2AABEE',
    title:       `${icon} ${titleVisual}`,
    titleAlignment: 'right',
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
  }))
  console.log()
}

// ── Skip warning ───────────────────────────────────────────────────────────────

/**
 * Prints a warning box when the user skips an optional field.
 * isCritical: uses bold red border (e.g. PROXY_URL)
 * normal:     uses round amber border
 * Returns the rendered box string (caller decides whether to console.log it).
 */
export function printSkipWarning(label: string, consequences: string[], isCritical = false): void {
  const titleHe       = toVisualRtl(`דילוג על: ${label}`)
  const headerHe      = chalk.bold(toVisualRtl('ללא הגדרה זו לא תוכל:'))
  const bulletLines   = consequences
    .map(c => `  •  ${chalk.dim(toVisualRtl(c))}`)
    .join('\n')
  const footerHe      = chalk.dim(toVisualRtl('ניתן להוסיף בכל עת:')) + ' ' +
                        c.primary('npx pikud-haoref-bot --update')

  const content = `${headerHe}\n${bulletLines}\n\n  ✦  ${footerHe}`

  const borderColor = isCritical ? '#EF4444' : '#F59E0B'
  const titleIcon   = isCritical ? '🚨' : '⚠️ '
  const borderStyle = isCritical ? 'bold' : 'round'

  console.log(boxen(content, {
    borderStyle,
    borderColor,
    title:       `${titleIcon} ${titleHe}`,
    titleAlignment: 'right',
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
  }))
}

// ── Completion card ────────────────────────────────────────────────────────────

export interface CompletionSummary {
  telegram:    boolean
  mapbox:      boolean
  whatsapp:    boolean
  dashboard:   boolean
  inviteLink:  boolean
  proxy:       boolean
}

/**
 * Prints an impressive double-border completion card after .env is written.
 * Shows which fields were configured vs skipped, plus the deploy command.
 */
export function printCompletionCard(
  summary: CompletionSummary,
  envPath: string,
  mode: 'docker' | 'node',
): void {
  const ok  = (s: string) => c.success(s) + '  ' + c.success('✓')
  const no  = (s: string) => chalk.dim(s) + '  ' + chalk.dim('→ --update')
  const row = (icon: string, lbl: string, set: boolean) =>
    `  ${icon}  ${set ? ok(toVisualRtl(lbl)) : no(toVisualRtl(lbl))}`

  const deployCmd = mode === 'docker'
    ? `  ${c.primary('docker run')} --env-file ${chalk.dim(envPath)} \\\n    ${chalk.dim('ghcr.io/yonatan2021/pikud-haoref-bot:latest')}`
    : `  ${c.primary('npm start')}  ${chalk.dim('# ' + toVisualRtl('בתיקיית הפרויקט'))}`

  const headlineHe = toVisualRtl('הכל מוכן! הבוט מוכן להפעלה')
  const headline   = gradient(['#22C55E', '#2AABEE'])(`✅  ${headlineHe}`)

  const envLine = `  📁  ${chalk.dim(toVisualRtl('.env נוצר:'))}  ${c.primary(envPath)}`

  const rows = [
    row('🤖', 'Telegram Bot',    summary.telegram),
    row('🗺 ', 'Mapbox',         summary.mapbox),
    row('📲', 'WhatsApp',        summary.whatsapp),
    row('🎛 ', 'Dashboard',      summary.dashboard),
    row('🔗', 'Invite Link',     summary.inviteLink),
    row('🔒', 'Proxy',           summary.proxy),
  ]

  const content = [
    headline,
    '',
    envLine,
    '',
    ...rows,
    '',
    chalk.dim('─'.repeat(48)),
    '',
    toVisualRtl('פקודת הרצה:'),
    deployCmd,
  ].join('\n')

  console.log()
  console.log(boxen(content, {
    borderStyle: 'double',
    borderColor: '#22C55E',
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
  }))
  console.log()
}

// ── Step badge ─────────────────────────────────────────────────────────────────

/** Returns a dim "[current/total]" badge for use in @clack prompt messages */
export function stepBadge(current: number, total: number): string {
  return c.dim(`[${current}/${total}]`)
}

// ── Result box (legacy — used by deployment.ts) ────────────────────────────────

/**
 * Prints a styled result box. Hebrew title is converted to visual order.
 * Kept for compatibility with deployment.ts printDockerInstructions/printNodeInstructions.
 */
export function printResultBox(title: string, lines: string[]): void {
  const content = lines.join('\n')
  console.log()
  console.log(boxen(content, {
    borderStyle: 'round',
    borderColor: '#2AABEE',
    title:       toVisualRtl(title),
    titleAlignment: 'right',
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
  }))
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
