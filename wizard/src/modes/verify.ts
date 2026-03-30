import https from 'node:https'
import * as p from '@clack/prompts'
import { c, msg, printResultBox } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import { readEnvFile } from '../env.js'
import type { Flags } from '../args.js'

export interface CheckResult { valid: boolean; detail?: string }
export interface WhatsAppCheckResult { configured: boolean }

/** Injectable HTTP getter — defaults to Node.js https, overridable in tests. */
type HttpGetter = (url: string) => Promise<unknown>

const TIMEOUT_MS = 10_000

const defaultGet: HttpGetter = (url) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = ''
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { reject(new Error(toVisualRtl('תגובה לא תקינה מהשרת'))) }
      })
    }).on('error', reject)
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(toVisualRtl(`הבקשה לקחה יותר מ-${TIMEOUT_MS / 1000} שניות — בדוק את חיבור הרשת`)))
    })
  })

/** Calls Telegram getMe — returns bot username on success. */
export async function checkTelegramToken(
  token: string,
  get: HttpGetter = defaultGet,
): Promise<CheckResult> {
  try {
    const data = await get(`https://api.telegram.org/bot${token}/getMe`) as Record<string, unknown>
    if (data.ok) {
      const result = data.result as Record<string, unknown>
      return { valid: true, detail: `@${result.username} (id: ${result.id})` }
    }
    return { valid: false, detail: String(data.description ?? toVisualRtl('שגיאה לא ידועה')) }
  } catch (err) {
    const raw = (err as Error).message
    const detail = token ? raw.replaceAll(token, '***') : raw
    return { valid: false, detail }
  }
}

/** Calls Mapbox token validation endpoint. */
export async function checkMapboxToken(
  token: string,
  get: HttpGetter = defaultGet,
): Promise<CheckResult> {
  try {
    const data = await get(`https://api.mapbox.com/tokens/v2?access_token=${token}`) as Record<string, unknown>
    if (String(data.code ?? '') === 'TokenValid') {
      return { valid: true }
    }
    return { valid: false, detail: String(data.code ?? 'Mapbox ' + toVisualRtl('דחה את הטוקן')) }
  } catch (err) {
    const raw = (err as Error).message
    const detail = token ? raw.replaceAll(token, '***') : raw
    return { valid: false, detail }
  }
}

/** Checks if WhatsApp is enabled. */
export function checkWhatsAppEnabled(value: string | undefined): WhatsAppCheckResult {
  return { configured: value === 'true' }
}

/** Verify mode: reads .env (or flags) and validates each token with a spinner. */
export async function runVerify(flags: Flags): Promise<void> {
  const outputPath = String(flags.output ?? '.env')
  const env = readEnvFile(outputPath)

  const token  = String(flags.token  ?? env.TELEGRAM_BOT_TOKEN  ?? '')
  const mapbox = String(flags.mapbox ?? env.MAPBOX_ACCESS_TOKEN ?? '')
  const whatsappEnabled = env.WHATSAPP_ENABLED === 'true'

  if (!token && !mapbox && env.WHATSAPP_ENABLED !== 'true') {
    p.log.error(toVisualRtl(`לא נמצאו הגדרות ב-${outputPath} — הפעל `) + c.primary('npx pikud-haoref-bot') + toVisualRtl(' תחילה'))
    return
  }

  let passed = 0
  const total = (token ? 1 : 0) + (mapbox ? 1 : 0) + (whatsappEnabled ? 1 : 0)

  if (token) {
    const spin = p.spinner()
    spin.start('Telegram ' + toVisualRtl('— בודק טוקן...'))
    const res = await checkTelegramToken(token)
    if (res.valid) {
      spin.stop(`${c.success('✅')} Telegram: ${res.detail}`)
      passed++
    } else {
      spin.stop(`${c.error('❌')} Telegram: ${res.detail}`)
    }
  }

  if (mapbox) {
    const spin = p.spinner()
    spin.start('Mapbox ' + toVisualRtl('— בודק טוקן...'))
    const res = await checkMapboxToken(mapbox)
    if (res.valid) {
      spin.stop(`${c.success('✅')} Mapbox: ${toVisualRtl('טוקן תקין')}`)
      passed++
    } else {
      spin.stop(`${c.error('❌')} Mapbox: ${res.detail}`)
    }
  }

  if (whatsappEnabled) {
    const res = checkWhatsAppEnabled(env.WHATSAPP_ENABLED)
    if (res.configured) {
      p.log.success(`${c.success('✅')} WhatsApp: ${toVisualRtl('מוגדר — סריקת QR נדרשת בהפעלה ראשונה')}`)
      passed++
    }
  }

  const allOk = passed === total

  if (allOk) {
    p.outro(`${c.success('✅')} ${passed}/${total} ${toVisualRtl('הגדרות תקינות')}`)
    return
  }

  // Some checks failed — show boxen warning card, then offer to fix
  printResultBox(toVisualRtl(`⚠️  ${passed}/${total} הגדרות תקינות`), [
    `  ${c.warning(toVisualRtl('אחד או יותר מהטוקנים אינם תקינים.'))}`,
    `  ${c.dim(toVisualRtl('בדוק את הערכים ב-.env ונסה שוב.'))}`,
  ])

  const wantFix = await p.confirm({
    message: c.primary(toVisualRtl('לעדכן את ההגדרות הבעייתיות עכשיו?')),
    initialValue: true,
  })

  if (!p.isCancel(wantFix) && wantFix) {
    p.outro(c.dim(toVisualRtl('מפעיל עדכון הגדרות... הפעל:')))
    console.log()
    console.log(`  ${c.primary('npx pikud-haoref-bot --update')}`)
    console.log()
  } else {
    p.outro(
      `${c.warning('⚠️')}  ${toVisualRtl('לתיקון הפעל:')} ${c.primary('npx pikud-haoref-bot --update')}`,
    )
  }

  process.exit(1)
}
