#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { parseArgs } from './args.js'
import { c, printBanner, msg } from './ui/theme.js'
import { runSetup }  from './modes/setup.js'
import { runUpdate } from './modes/update.js'
import { runVerify } from './modes/verify.js'

const VERSION = '0.2.1'

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

  ${c.primary('פלטפורמה:')}
    --whatsapp           ${c.muted('הפעל WhatsApp (ניתן לשלב עם Telegram) — חל על setup/update בלבד')}

  ${c.primary('הגדרות Telegram:')}
    --token <val>        TELEGRAM_BOT_TOKEN  ${c.muted('(חובה ל-Telegram)')}
    --chat-id <val>      TELEGRAM_CHAT_ID    ${c.muted('(חובה ל-Telegram)')}
    --mapbox <val>       MAPBOX_ACCESS_TOKEN ${c.muted('(חובה ל-Telegram)')}

  ${c.primary('הגדרות כלליות:')}
    --dashboard <val>    DASHBOARD_SECRET    ${c.muted('(מפעיל לוח בקרה)')}
    --proxy <val>        PROXY_URL           ${c.muted('(נדרש מחוץ לישראל)')}
    --invite-link <val>  TELEGRAM_INVITE_LINK
    --full               ${c.muted('הצג את כל ההגדרות האופציונליות')}
    --output <path>      ${c.muted('נתיב לקובץ .env (ברירת מחדל: ./.env)')}
    --update             ${c.muted('עדכן .env קיים')}
    --verify             ${c.muted('בדוק תקינות הטוקנים ב-.env')}
    --help               ${c.muted('הצג הודעה זו')}

  ${c.primary('מצבים:')}
    ${c.dim('Telegram בלבד:')}  npx pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=pk.yyy
    ${c.dim('WhatsApp בלבד:')}  npx pikud-haoref-bot --whatsapp
    ${c.dim('שתי הפלטפורמות:')} npx pikud-haoref-bot --whatsapp --token=xxx --chat-id=-123456 --mapbox=pk.yyy

  ${c.primary('דוגמאות נוספות:')}
    npx pikud-haoref-bot --full --output=/home/user/bot/.env
    npx pikud-haoref-bot --verify
    npx pikud-haoref-bot --update
  `)
}

main().catch((err: Error) => {
  p.outro(c.error(`שגיאה: ${err.message}`))
  process.exit(1)
})
