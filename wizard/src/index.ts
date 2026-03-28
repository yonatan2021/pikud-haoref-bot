#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { parseArgs } from './args.js'
import { c, printBanner, msg } from './ui/theme.js'
import { runSetup }  from './modes/setup.js'
import { runUpdate } from './modes/update.js'
import { runVerify } from './modes/verify.js'

const VERSION = '0.2.0'

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    printHelp()
    process.exit(0)
  }

  printBanner(VERSION)
  p.intro(c.dim('בוט התראות פיקוד העורף · הגדרה מהירה'))

  // ── Mode detection ──────────────────────────────────────────────────────────
  if (flags.verify) {
    await runVerify(flags)
    return
  }

  const outputPath = path.resolve(String(flags.output ?? '.env'))
  const envExists  = fs.existsSync(outputPath)

  if (flags.update || envExists) {
    if (flags.update) {
      await runUpdate(flags)
      return
    }
    // .env exists but --update not specified — ask user
    const choice = await p.confirm({
      message: `${c.warning('⚠️')}  זיהינו קובץ הגדרות קיים ב-${c.primary(path.relative(process.cwd(), outputPath))} — לעדכן?`,
      initialValue: false,
    })
    if (p.isCancel(choice)) { p.outro(msg.cancelled); return }
    if (choice) {
      await runUpdate(flags)
      return
    }
  }

  await runSetup(flags)
}

function printHelp(): void {
  console.log(`
  ${c.bold('npx pikud-haoref-bot')} ${c.dim('[options]')}

  ${c.primary('הגדרות:')}
    --token <val>        TELEGRAM_BOT_TOKEN  ${c.muted('(חובה)')}
    --chat-id <val>      TELEGRAM_CHAT_ID    ${c.muted('(חובה)')}
    --mapbox <val>       MAPBOX_ACCESS_TOKEN ${c.muted('(חובה)')}
    --dashboard <val>    DASHBOARD_SECRET    ${c.muted('(מפעיל לוח בקרה)')}
    --proxy <val>        PROXY_URL           ${c.muted('(נדרש מחוץ לישראל)')}
    --invite-link <val>  TELEGRAM_INVITE_LINK
    --full               ${c.muted('הצג את כל ההגדרות האופציונליות')}
    --output <path>      ${c.muted('נתיב לקובץ .env (ברירת מחדל: ./.env)')}
    --update             ${c.muted('עדכן .env קיים')}
    --verify             ${c.muted('בדוק תקינות הטוקנים ב-.env')}
    --help               ${c.muted('הצג הודעה זו')}

  ${c.primary('דוגמאות:')}
    npx pikud-haoref-bot
    npx pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=pk.yyy
    npx pikud-haoref-bot --full --output=/home/user/bot/.env
    npx pikud-haoref-bot --verify
    npx pikud-haoref-bot --update
  `)
}

main().catch((err: Error) => {
  p.outro(c.error(`שגיאה: ${err.message}`))
  process.exit(1)
})
