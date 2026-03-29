import chalk from 'chalk';
import type { AlertCategory } from './topicRouter.js';
import { toVisualRtl, osc8Link, boxWidth, hr, containsHebrew } from './loggerUtils.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MAX_DISPLAYED_CITIES = 20;

function nowIL(): string {
  return new Date().toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ─── Log levels ───────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

const LEVEL_ICON: Record<LogLevel, string> = {
  info:    '·',
  success: '✓',
  warn:    '⚠',
  error:   '✗',
};

const LEVEL_COLOR: Record<LogLevel, chalk.Chalk> = {
  info:    chalk.cyan,
  success: chalk.green,
  warn:    chalk.yellow,
  error:   chalk.red,
};

// Tag badges — distinct background per known tag for quick visual scanning
const TAG_BADGE: Record<string, chalk.Chalk> = {
  Poller:       chalk.bgCyan.black,
  AlertHandler: chalk.bgMagenta.white,
  Health:       chalk.bgBlue.white,
  DM:           chalk.bgYellow.black,
  Init:         chalk.bgGray.white,
  Bot:          chalk.bgGreen.black,
};

function tagBadge(tag: string): string {
  const paint = TAG_BADGE[tag];
  return paint ? paint(` ${tag} `) : chalk.dim(`[${tag}]`);
}

export function log(level: LogLevel, tag: string, message: string): void {
  const color = LEVEL_COLOR[level];
  // Convert Hebrew-containing messages to visual order so they render correctly
  // in all terminals regardless of BiDi support (including VS Code).
  const safeMsg = containsHebrew(message) ? toVisualRtl(message) : message;
  process.stdout.write(
    `${chalk.gray(nowIL())}  ${color(LEVEL_ICON[level])}  ${tagBadge(tag)}  ${safeMsg}\n`
  );
}

// ─── Startup header ───────────────────────────────────────────────────────────

export interface ServiceStatus {
  name: string;
  /** Display detail — use toVisualRtl() when mixing Hebrew + numbers (e.g. "פורט 3000") */
  detail: string;
  ok: boolean;
  /** When set, an OSC 8 clickable hyperlink is appended after the detail */
  url?: string;
}

export function logStartupHeader(
  version: string,
  services: ServiceStatus[],
  alertsToday = 0,
): void {
  const g = chalk.gray;
  const w = boxWidth();

  const startedAt = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const serviceLines = services.map((svc) => {
    const icon = svc.ok ? chalk.green('✅') : chalk.yellow('⚠️ ');
    const namePad = ' '.repeat(Math.max(1, 16 - svc.name.length));
    const detail = svc.ok ? chalk.green(svc.detail) : chalk.yellow(svc.detail);
    const link = svc.url
      ? '  ' + chalk.dim(osc8Link(svc.url, `→ ${svc.url.replace(/https?:\/\//, '')}`))
      : '';
    return `${g('│')}  ${icon}  ${chalk.bold.white(svc.name)}${namePad}${detail}${link}`;
  });

  const footerTs = chalk.dim(toVisualRtl('הופעל: ' + startedAt));
  const footerAlerts = alertsToday > 0
    ? `  ${chalk.dim('│')}  ${chalk.cyan(String(alertsToday))} ${chalk.dim(toVisualRtl('התראות היום'))}`
    : '';

  const lines = [
    '',
    g('╭' + hr(w) + '╮'),
    `${g('│')}  ${chalk.bold('🤖  Pikud HaOref Bot')}  ${chalk.gray('v' + version)}`,
    g('├' + hr(w) + '┤'),
    ...serviceLines,
    g('├' + hr(w) + '┤'),
    `${g('│')}  ⏰  ${footerTs}${footerAlerts}`,
    g('╰' + hr(w) + '╯'),
    '',
  ];

  lines.forEach((l) => process.stdout.write(l + '\n'));
}

// ─── Section divider ──────────────────────────────────────────────────────────

/** Prints a dated separator line between the startup box and rolling log output. */
export function logSectionDivider(): void {
  const w = boxWidth();
  const date = new Date().toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const label = ` ${date} `;
  const left = Math.floor((w - label.length) / 2);
  const right = w - left - label.length;
  process.stdout.write(
    chalk.dim('─'.repeat(left) + label + '─'.repeat(Math.max(0, right))) + '\n\n',
  );
}

// ─── Alert box ────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<AlertCategory, chalk.Chalk> = {
  security:      chalk.red,
  nature:        chalk.blue,
  environmental: chalk.yellow,
  drills:        chalk.gray,
  general:       chalk.cyan,
};

export function logAlert(params: {
  emoji: string;
  titleHe: string;
  category: AlertCategory;
  cities: string[];
  sentToGroup: boolean;
  isEdit: boolean;
}): void {
  const { emoji, titleHe, category, cities, sentToGroup, isEdit } = params;
  const color = CATEGORY_COLOR[category] ?? chalk.white;
  const ts = chalk.gray(nowIL());

  const action = !sentToGroup
    ? chalk.red(`✗ ${toVisualRtl('שגיאה בשליחה')}`)
    : isEdit
      ? chalk.yellow(`✏️  ${toVisualRtl('עודכן')}`)
      : chalk.green(`📤 ${toVisualRtl('נשלח לקבוצה')}`);

  const cityList = cities.slice(0, MAX_DISPLAYED_CITIES).map(toVisualRtl).join(', ');
  const cityExtra = cities.length > MAX_DISPLAYED_CITIES
    ? chalk.dim(toVisualRtl(` (+${cities.length - MAX_DISPLAYED_CITIES} נוספות)`))
    : '';

  const w = boxWidth();
  process.stdout.write('\n');
  process.stdout.write(
    `${color('┌── ')}${chalk.bold(color(`${emoji} ${toVisualRtl(titleHe)}`))}${color(' ─── ')}${ts}\n`
  );
  process.stdout.write(`${color('│')}  ${toVisualRtl('ערים')}: ${chalk.white(cityList)}${cityExtra}\n`);
  process.stdout.write(`${color('│')}  ${action}\n`);
  process.stdout.write(`${color('└' + hr(w))}\n`);
  process.stdout.write('\n');
}
