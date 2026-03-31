import path from 'node:path'
import os from 'node:os'
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { copyFile, access, rm } from 'node:fs/promises'
import * as p from '@clack/prompts'
import { c, printResultBox, printSectionCard } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import type { Platform } from './platform.js'
import { needsWhatsApp } from './platform.js'

export type DeploymentMode = 'docker' | 'node'

/** Prompts the user to choose a deployment mode. Returns undefined on cancel. */
export async function promptDeploymentMode(): Promise<DeploymentMode | undefined> {
  printSectionCard('🚀', 'שיטת פריסה', 'בחר איך להריץ את הבוט — ניתן להחליף בעתיד')
  const choice = await p.select<DeploymentMode>({
    message: c.primary(toVisualRtl('איך תרצה להריץ את הבוט?')),
    options: [
      {
        value: 'docker' as DeploymentMode,
        label: `${c.bold('Docker')} ${c.muted('(' + toVisualRtl('מומלץ') + ')')}`,
        hint: toVisualRtl('תמונה מוכנה — ללא התקנה נוספת'),
      },
      {
        value: 'node' as DeploymentMode,
        label: `${c.bold('Node.js')} ${c.muted('(' + toVisualRtl('מקור') + ')')}`,
        hint: 'git clone + npm install ' + toVisualRtl('(דורש)'),
      },
    ],
  })
  if (p.isCancel(choice)) return undefined
  return choice
}

/** Returns lines describing the WhatsApp QR setup, or [] for Telegram-only. */
export function buildWhatsAppNote(platform: Platform): string[] {
  if (!needsWhatsApp(platform)) return []
  return [
    '',
    `  ${c.bold(toVisualRtl('הגדרת WhatsApp:'))}`,
    `  ${c.dim(toVisualRtl('בהפעלה הראשונה יוצג קוד QR ישירות בטרמינל — סרוק עם אפליקציית WhatsApp.'))}`,
    `  ${c.dim(toVisualRtl('הסשן יישמר ב-data/whatsapp-session/ לשימוש חוזר.'))}`,
    `  ${c.dim(toVisualRtl('ניהול קבוצות — דרך לוח הבקרה בלבד (לא ב-.env).'))}`,
  ]
}

/** Prints the Docker run command in a styled box. */
export function printDockerInstructions(envPath: string, platform: Platform = 'telegram'): void {
  const rel = path.relative(process.cwd(), envPath)
  printResultBox('הפקודה להרצה עם Docker:', [
    `  ${c.primary('docker run')} -d \\`,
    `    --name pikud-haoref-bot \\`,
    `    --restart unless-stopped \\`,
    `    --env-file ${c.accent(rel)} \\`,
    `    -v ./data:/app/data \\`,
    `    ${c.dim('ghcr.io/yonatan2021/pikud-haoref-bot:latest')}`,
    '',
    `  ${c.dim('💡 ' + toVisualRtl('הסר את -d לצפייה בלוגים בזמן אמת.'))}`,
    ...buildWhatsAppNote(platform),
  ])
}

/** Prints Node.js setup instructions in a styled box. */
export function printNodeInstructions(platform: Platform = 'telegram', installDir?: string): void {
  const displayPath = installDir
    ? path.resolve(installDir)
    : path.join(os.homedir(), TARGET_DIR)
  printResultBox('הוראות הרצה עם Node.js:', [
    `  ${c.primary('git clone')} --depth 1 https://github.com/yonatan2021/pikud-haoref-bot.git ${c.accent(displayPath)}`,
    `  ${c.primary('cd')} ${displayPath}`,
    `  ${c.primary('git remote rename')} origin upstream`,
    `  ${c.primary('npm install')}`,
    `  ${c.dim('# ' + toVisualRtl('העבר את קובץ ה-.env שנוצר לתיקיית הפרויקט'))}`,
    `  ${c.primary('npm start')}`,
    '',
    `  ${c.dim(toVisualRtl('לעדכון מהמקור:'))} ${c.primary('git pull upstream main')}`,
    ...buildWhatsAppNote(platform),
  ])
}

const REPO_URL = 'https://github.com/yonatan2021/pikud-haoref-bot.git'
const TARGET_DIR = 'pikud-haoref-bot'

/** Returns true only if every character is printable ASCII (U+0020–U+007E). */
function isAsciiSafe(str: string): boolean {
  return /^[\x20-\x7E]*$/.test(str)
}

/**
 * Returns the absolute path where the bot will be installed.
 * Defaults to ~/pikud-haoref-bot (os.homedir() is always ASCII on macOS/Linux).
 * Throws if the resolved path contains non-ASCII characters that would break ESM module resolution.
 */
export function resolveTargetPath(installDir?: string): string {
  const base = installDir !== undefined
    ? path.resolve(installDir)
    : path.join(os.homedir(), TARGET_DIR)

  if (!isAsciiSafe(base)) {
    throw new Error(
      `נתיב ההתקנה מכיל תווים שאינם ASCII ועלול לגרום לכשלון ב-npm install:\n` +
      `  "${base}"\n` +
      `השתמש ב---install-dir עם נתיב שמכיל רק תווים לטיניים.\n` +
      `לדוגמה: --install-dir=/opt/bots/haoref`,
    )
  }
  return base
}

// Narrower type alias — selects the (cmd, args, opts) overload without overload complexity.
export type SpawnFn = (cmd: string, args: string[], opts?: SpawnOptions) => ChildProcess

export interface NodeSetupDeps {
  spawn:    SpawnFn
  copyFile: (src: string, dst: string) => Promise<void>
  access:   (filePath: string) => Promise<void>
  rm:       (filePath: string, opts: { recursive: boolean; force: boolean }) => Promise<void>
}

/** Checks if a directory exists. Propagates all errors except ENOENT. */
async function dirExists(accessFn: NodeSetupDeps['access'], targetPath: string): Promise<boolean> {
  try {
    await accessFn(targetPath)
    return true
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return false
    throw new Error(`שגיאת גישה לתיקייה ${targetPath}: ${e.message}`)
  }
}

/**
 * Clones the repo, sets up remotes, copies the generated .env, and runs npm install.
 * Used by setup mode (Node.js path) to make the bot immediately runnable.
 * Streams all subprocess output live via stdio: 'inherit'.
 */
// Thin wrapper — avoids a downcast by explicitly forwarding the three-argument form.
const defaultSpawn: SpawnFn = (cmd, args, opts) => spawn(cmd, args, opts ?? {})

export async function runNodeSetup(
  envPath: string,
  platform: Platform,
  deps: NodeSetupDeps = { spawn: defaultSpawn, copyFile, access, rm },
  installDir?: string,
): Promise<void> {
  const targetPath = resolveTargetPath(installDir)

  p.log.info(c.dim(`  ${toVisualRtl('נתיב התקנה:')} ${targetPath}`))

  const exists = await dirExists(deps.access, targetPath)
  if (exists) {
    p.log.warn(c.warning(toVisualRtl(`תיקיית pikud-haoref-bot כבר קיימת — מדלג על git clone`)))
  } else {
    p.log.step(c.primary(toVisualRtl('מוריד את קוד המקור...')))
    try {
      await spawnStep(deps.spawn, 'git', ['clone', '--depth', '1', REPO_URL, targetPath])
    } catch (err) {
      await deps.rm(targetPath, { recursive: true, force: true }).catch((rmErr: unknown) => {
        const e = rmErr as NodeJS.ErrnoException
        p.log.warn(c.warning(toVisualRtl(`אזהרה: לא ניתן למחוק תיקייה חלקית: ${e.message}`)))
        p.log.warn(toVisualRtl(`מחק ידנית: rm -rf "${targetPath}"`))
      })
      throw err
    }

    // Set up remotes: origin → upstream (for pulling updates from the source repo)
    await setupRemotes(deps, targetPath)
  }

  try {
    await deps.copyFile(envPath, path.join(targetPath, '.env'))
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    throw new Error(
      `${toVisualRtl('לא ניתן להעתיק את קובץ ה-.env:')} ${e.message}\n` +
      `${toVisualRtl('העתק ידנית:')} cp "${envPath}" "${path.join(targetPath, '.env')}"`,
    )
  }
  p.log.success(toVisualRtl('.env הועתק לתיקיית הפרויקט'))

  p.log.step(c.primary(toVisualRtl('מתקין תלויות npm...')))
  try {
    await spawnStep(deps.spawn, 'npm', ['install'], { cwd: targetPath })
  } catch (err) {
    throw new Error(
      `${(err as Error).message}\n` +
      toVisualRtl(`הקוד הורד והוגדר — הרץ ידנית: cd "${targetPath}" && npm install`)
    )
  }

  p.log.success(toVisualRtl('ההתקנה הושלמה!'))
  p.log.info(`  ${c.primary('npm start')}  ${c.dim('# ' + toVisualRtl(`הרץ מתוך תיקיית ${targetPath}/`))}`)
  p.log.info(`  ${c.dim(toVisualRtl('לעדכון מהמקור:'))} ${c.primary('git pull upstream main')}`)
  buildWhatsAppNote(platform)
    .filter(line => line.trim() !== '')
    .forEach(line => p.log.info(line))
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote setup: rename origin → upstream, optionally create gh fork
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renames origin to upstream and optionally creates a GitHub fork.
 * Non-fatal: failures warn but do not abort setup.
 */
async function setupRemotes(deps: NodeSetupDeps, targetPath: string): Promise<void> {
  // Rename origin → upstream so user can pull updates
  try {
    await spawnStep(deps.spawn, 'git', ['remote', 'rename', 'origin', 'upstream'], { cwd: targetPath })
  } catch {
    p.log.warn(c.warning(toVisualRtl('אזהרה: לא ניתן לשנות remote ל-upstream — ניתן לעשות זאת ידנית')))
    return
  }

  // Check if gh CLI is available and authenticated
  const ghReady = await isGhReady(deps.spawn)
  if (!ghReady) {
    printForkInstructions()
    return
  }

  // Offer to fork
  const wantFork = await p.confirm({
    message: c.primary(toVisualRtl('נמצא gh CLI מחובר — ליצור Fork אישי ב-GitHub?')),
    initialValue: true,
  })
  if (p.isCancel(wantFork) || !wantFork) {
    printForkInstructions()
    return
  }

  try {
    await spawnStep(deps.spawn, 'gh', [
      'repo', 'fork', 'yonatan2021/pikud-haoref-bot',
      '--remote-name', 'origin',
    ], { cwd: targetPath })
    p.log.success(toVisualRtl('Fork נוצר בהצלחה — origin מצביע ל-Fork שלך'))
  } catch {
    p.log.warn(c.warning(toVisualRtl('יצירת Fork נכשלה — ניתן ליצור ידנית מאוחר יותר')))
    printForkInstructions()
  }
}

/** Prints manual fork instructions for users without gh CLI. */
function printForkInstructions(): void {
  p.log.info(c.dim(toVisualRtl('ליצירת Fork ידנית:')))
  p.log.info(`  1. ${c.primary('gh repo fork yonatan2021/pikud-haoref-bot --remote-name origin')}`)
  p.log.info(c.dim(toVisualRtl('   או צור Fork ב-GitHub ואז:')))
  p.log.info(`  2. ${c.primary('git remote add origin https://github.com/<YOUR-USER>/pikud-haoref-bot.git')}`)
}

/**
 * Checks if gh CLI is installed AND authenticated.
 * Returns true only if both conditions are met.
 */
async function isGhReady(spawnFn: SpawnFn): Promise<boolean> {
  const ghInstalled = await spawnQuiet(spawnFn, 'gh', ['--version'])
  if (!ghInstalled) return false
  return spawnQuiet(spawnFn, 'gh', ['auth', 'status'])
}

/**
 * Spawns a command silently (no terminal output). Resolves to true on exit 0, false otherwise.
 * Used for detection (e.g. checking if gh CLI is installed).
 */
export function spawnQuiet(spawnFn: SpawnFn, cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawnFn(cmd, args, { stdio: 'ignore' })
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    } catch {
      resolve(false)
    }
  })
}

/** Spawns a command with live output (stdio: inherit). Rejects on non-zero exit or signal. */
function spawnStep(
  spawnFn: NodeSetupDeps['spawn'],
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    const child = spawnFn(cmd, args, { stdio: 'inherit', cwd: opts?.cwd })

    child.on('close', (code, signal) => {
      if (code === 0)        { done(resolve); return }
      if (signal)              done(() => reject(new Error(`${cmd} הופסק על ידי אות ${signal}`)))
      else if (code !== null)  done(() => reject(new Error(`${cmd} יצא עם קוד שגיאה ${code}`)))
      else                     done(() => reject(new Error(`${cmd} הסתיים באופן בלתי צפוי (ללא קוד יציאה)`)))
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT')
        done(() => reject(new Error(`'${cmd}' לא נמצא — ודא שהוא מותקן ונמצא ב-PATH`)))
      else
        done(() => reject(new Error(`לא ניתן להפעיל ${cmd}: ${err.message}`)))
    })
  })
}
