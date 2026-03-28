import path from 'node:path'
import * as p from '@clack/prompts'
import { c, printResultBox } from '../ui/theme.js'

export type DeploymentMode = 'docker' | 'node'

/** Prompts the user to choose a deployment mode. Returns undefined on cancel. */
export async function promptDeploymentMode(): Promise<DeploymentMode | undefined> {
  const choice = await p.select<DeploymentMode>({
    message: c.primary('איך תרצה להריץ את הבוט?'),
    options: [
      {
        value: 'docker' as DeploymentMode,
        label: `${c.bold('Docker')} ${c.muted('(מומלץ)')}`,
        hint: 'תמונה מוכנה — ללא התקנה נוספת',
      },
      {
        value: 'node' as DeploymentMode,
        label: `${c.bold('Node.js')} ${c.muted('(מקור)')}`,
        hint: 'דורש git clone + npm install',
      },
    ],
  })
  if (p.isCancel(choice)) return undefined
  return choice
}

/** Prints the Docker run command in a styled box. */
export function printDockerInstructions(envPath: string): void {
  const rel = path.relative(process.cwd(), envPath)
  printResultBox('הפקודה להרצה עם Docker:', [
    `  ${c.primary('docker run')} -d \\`,
    `    --name pikud-haoref-bot \\`,
    `    --restart unless-stopped \\`,
    `    --env-file ${c.accent(rel)} \\`,
    `    -v ./data:/app/data \\`,
    `    ${c.dim('ghcr.io/yonatan2021/pikud-haoref-bot:latest')}`,
    '',
    `  ${c.dim('💡 הסר את -d לצפייה בלוגים בזמן אמת.')}`,
  ])
}

/** Prints Node.js setup instructions in a styled box. */
export function printNodeInstructions(): void {
  printResultBox('הוראות הרצה עם Node.js:', [
    `  ${c.primary('git clone')} https://github.com/yonatan2021/pikud-haoref-bot.git`,
    `  ${c.primary('cd')} pikud-haoref-bot`,
    `  ${c.primary('npm install')}`,
    `  ${c.dim('# העבר את קובץ ה-.env שנוצר לתיקיית הפרויקט')}`,
    `  ${c.primary('npm start')}`,
  ])
}
