import chalk from 'chalk';
import type { AlertCategory } from './topicRouter.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const BOX_WIDTH = 56;
const MAX_DISPLAYED_CITIES = 20;

function hr(width = BOX_WIDTH): string {
  return '─'.repeat(width);
}

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

export function log(level: LogLevel, tag: string, message: string): void {
  const color = LEVEL_COLOR[level];
  process.stdout.write(
    `${chalk.gray(nowIL())}  ${color(LEVEL_ICON[level])}  ${chalk.dim(tag.padEnd(14))} ${message}\n`
  );
}

// ─── Startup header ───────────────────────────────────────────────────────────
// Right borders are omitted on content lines — Hebrew bidi text causes
// unreliable terminal display-width calculations, making right-alignment
// of box borders inconsistent across terminals.

export interface ServiceStatus {
  name: string;
  detail: string;
  ok: boolean;
}

export function logStartupHeader(version: string, services: ServiceStatus[]): void {
  const g = chalk.gray;

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
    return `${g('│')}  ${icon}  ${chalk.bold.white(svc.name)}${namePad}${detail}`;
  });

  const lines = [
    '',
    g('┌' + hr()),
    `${g('│')}  ${chalk.bold('🤖  Pikud HaOref Bot')}  ${chalk.gray('v' + version)}`,
    g('├' + hr()),
    ...serviceLines,
    g('├' + hr()),
    `${g('│')}  ${chalk.dim('הופעל: ' + startedAt)}`,
    g('└' + hr()),
    '',
  ];

  lines.forEach((l) => process.stdout.write(l + '\n'));
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
    ? chalk.red('✗ שגיאה בשליחה')
    : isEdit
      ? chalk.yellow('✏️  עודכן')
      : chalk.green('📤 נשלח לקבוצה');

  const cityList = cities.slice(0, MAX_DISPLAYED_CITIES).join(', ');
  const cityExtra = cities.length > MAX_DISPLAYED_CITIES
    ? chalk.dim(` (+${cities.length - MAX_DISPLAYED_CITIES} נוספות)`)
    : '';

  process.stdout.write('\n');
  process.stdout.write(
    `${color('┌── ')}${chalk.bold(color(`${emoji} ${titleHe}`))}${color(' ─── ')}${ts}\n`
  );
  process.stdout.write(`${color('│')}  ערים: ${chalk.white(cityList)}${cityExtra}\n`);
  process.stdout.write(`${color('│')}  ${action}\n`);
  process.stdout.write(`${color('└' + hr())}\n`);
  process.stdout.write('\n');
}
