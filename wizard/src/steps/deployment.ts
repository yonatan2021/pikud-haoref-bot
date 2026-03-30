import path from 'node:path'
import * as p from '@clack/prompts'
import { c, printResultBox } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import type { Platform } from './platform.js'
import { needsWhatsApp } from './platform.js'

export type DeploymentMode = 'docker' | 'node'

/** Prompts the user to choose a deployment mode. Returns undefined on cancel. */
export async function promptDeploymentMode(): Promise<DeploymentMode | undefined> {
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
  printResultBox(toVisualRtl('הפקודה להרצה עם Docker:'), [
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
  printResultBox(toVisualRtl('הוראות הרצה עם Node.js:'), [
    `  ${c.primary('git clone')} https://github.com/yonatan2021/pikud-haoref-bot.git`,
    `  ${c.primary('cd')} pikud-haoref-bot`,
    `  ${c.primary('npm install')}`,
    `  ${c.dim('# ' + toVisualRtl('העבר את קובץ ה-.env שנוצר לתיקיית הפרויקט'))}`,
    `  ${c.primary('npm start')}`,
    ...buildWhatsAppNote(platform),
  ])
}
