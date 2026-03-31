#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { parseArgs } from './args.js'
import { c, printBanner, msg } from './ui/theme.js'
import { toVisualRtl } from './ui/rtl.js'
import { runSetup }  from './modes/setup.js'
import { runUpdate } from './modes/update.js'
import { runVerify } from './modes/verify.js'

const VERSION = '0.3.3'

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    printHelp()
    process.exit(0)
  }

  printBanner(VERSION)
  p.intro(c.dim(toVisualRtl('בוט התראות פיקוד העורף · הגדרה מהירה')))

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
    const relPath = path.relative(process.cwd(), outputPath)
    const choice = await p.confirm({
      message: `${c.warning('⚠️')}  ${toVisualRtl('זיהינו קובץ הגדרות קיים ב-')}${c.primary(relPath)} — ${toVisualRtl('לעדכן?')}`,
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
  const h = (s: string) => toVisualRtl(s)
  console.log(`
  ${c.bold('npx pikud-haoref-bot')} ${c.dim('[options]')}

  ${c.primary(h('פלטפורמה:'))}
    --whatsapp           ${c.muted(h('הפעל WhatsApp (ניתן לשלב עם Telegram) — חל על setup/update בלבד'))}

  ${c.primary(h('הגדרות Telegram:'))}
    --token <val>        TELEGRAM_BOT_TOKEN  ${c.muted(`(${h('חובה ל-Telegram')})`)}
    --chat-id <val>      TELEGRAM_CHAT_ID    ${c.muted(`(${h('חובה ל-Telegram')})`)}
    --mapbox <val>       MAPBOX_ACCESS_TOKEN ${c.muted(`(${h('חובה ל-Telegram')})`)}

  ${c.primary(h('הגדרות כלליות:'))}
    --dashboard <val>    DASHBOARD_SECRET    ${c.muted(`(${h('מפעיל לוח בקרה')})`)}
    --proxy <val>        PROXY_URL           ${c.muted(`(${h('נדרש מחוץ לישראל')})`)}
    --invite-link <val>  TELEGRAM_INVITE_LINK
    --full               ${c.muted(h('הצג את כל ההגדרות האופציונליות'))}
    --output <path>      ${c.muted(h('נתיב לקובץ .env (ברירת מחדל: ./.env)'))}
    --install-dir <path> ${c.muted(h('תיקיית התקנה עבור git clone (ברירת מחדל: ~/pikud-haoref-bot)'))}
    --update             ${c.muted(h('עדכן .env קיים'))}
    --verify             ${c.muted(h('בדוק תקינות הטוקנים ב-.env'))}
    --help               ${c.muted(h('הצג הודעה זו'))}

  ${c.primary(h('מצבים:'))}
    ${c.dim('Telegram ' + h('בלבד:'))}  npx pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=pk.yyy
    ${c.dim('WhatsApp ' + h('בלבד:'))}  npx pikud-haoref-bot --whatsapp
    ${c.dim(h('שתי הפלטפורמות:'))} npx pikud-haoref-bot --whatsapp --token=xxx --chat-id=-123456 --mapbox=pk.yyy

  ${c.primary(h('דוגמאות נוספות:'))}
    npx pikud-haoref-bot --full --output=/home/user/bot/.env
    npx pikud-haoref-bot --verify
    npx pikud-haoref-bot --update
  `)
}

main().catch((err: Error) => {
  p.outro(c.error(toVisualRtl(`שגיאה: ${err.message}`)))
  process.exit(1)
})
