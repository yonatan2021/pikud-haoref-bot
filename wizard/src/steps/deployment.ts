import path from 'node:path'
import { spawn } from 'node:child_process'
import { copyFile, access } from 'node:fs/promises'
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
    `  ${c.dim(toVisualRtl('בהפעלה הראשונה סרוק את קוד ה-QR עם אפליקציית WhatsApp.'))}`,
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
export function printNodeInstructions(platform: Platform = 'telegram'): void {
  printResultBox('הוראות הרצה עם Node.js:', [
    `  ${c.primary('git clone')} https://github.com/yonatan2021/pikud-haoref-bot.git`,
    `  ${c.primary('cd')} pikud-haoref-bot`,
    `  ${c.primary('npm install')}`,
    `  ${c.dim('# ' + toVisualRtl('העבר את קובץ ה-.env שנוצר לתיקיית הפרויקט'))}`,
    `  ${c.primary('npm start')}`,
    ...buildWhatsAppNote(platform),
  ])
}

const REPO_URL = 'https://github.com/yonatan2021/pikud-haoref-bot.git'
const TARGET_DIR = 'pikud-haoref-bot'

/**
 * Clones the repo, copies the generated .env, and runs npm install.
 * Used by setup mode (Node.js path) to make the bot immediately runnable.
 * Streams all subprocess output live via stdio: 'inherit'.
 */
export async function runNodeSetup(envPath: string, platform: Platform): Promise<void> {
  const targetPath = path.join(process.cwd(), TARGET_DIR)

  const exists = await access(targetPath).then(() => true).catch(() => false)
  if (exists) {
    p.log.warn(c.warning(toVisualRtl(`תיקיית ${TARGET_DIR} כבר קיימת — מדלג על git clone`)))
  } else {
    p.log.step(c.primary(toVisualRtl('מוריד את קוד המקור...')))
    await spawnStep('git', ['clone', REPO_URL, TARGET_DIR])
  }

  await copyFile(envPath, path.join(targetPath, '.env'))
  p.log.success(toVisualRtl('.env הועתק לתיקיית הפרויקט'))

  p.log.step(c.primary(toVisualRtl('מתקין תלויות npm...')))
  await spawnStep('npm', ['install'], { cwd: targetPath })

  p.log.success(toVisualRtl('ההתקנה הושלמה!'))
  console.log(`\n  ${c.primary('npm start')}  ${c.dim('# ' + toVisualRtl(`הרץ מתוך תיקיית ${TARGET_DIR}/`))}`)
  buildWhatsAppNote(platform).forEach(line => console.log(line))
}

/** Spawns a command with live output (stdio: inherit). Rejects on non-zero exit code. */
function spawnStep(cmd: string, args: string[], opts?: { cwd?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: opts?.cwd })
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} יצא עם קוד שגיאה ${code}`))
    )
    child.on('error', err => reject(new Error(`לא ניתן להפעיל ${cmd}: ${err.message}`)))
  })
}
