import * as p from '@clack/prompts'
import { c, stepBadge } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import { validateUrl } from '../validation.js'
import type { Flags } from '../args.js'
import { type Platform, needsTelegram } from './platform.js'

export interface OptionalVars {
  DASHBOARD_SECRET?:                string
  PROXY_URL?:                       string
  TELEGRAM_INVITE_LINK?:            string
  TELEGRAM_TOPIC_ID_SECURITY?:      string
  TELEGRAM_TOPIC_ID_NATURE?:        string
  TELEGRAM_TOPIC_ID_ENVIRONMENTAL?: string
  TELEGRAM_TOPIC_ID_DRILLS?:        string
  TELEGRAM_TOPIC_ID_GENERAL?:       string
}

/**
 * Prompts for optional configuration fields.
 * Returns undefined if the user cancels (Ctrl+C).
 * Every field can be skipped by pressing Enter — the placeholder makes this explicit.
 */
export async function promptOptional(
  flags: Flags,
  forceFull: boolean,
  platform?: Platform,
): Promise<OptionalVars | undefined> {
  const vars: OptionalVars = {}

  // Determine whether to show optional section at all
  const hasOptionalFlags = flags.dashboard !== undefined ||
    flags.proxy !== undefined || flags['invite-link'] !== undefined

  let doFull: boolean | undefined
  if (forceFull || hasOptionalFlags) {
    doFull = true
    if (forceFull) p.log.step(c.bold(toVisualRtl('הגדרות אופציונליות')))
  } else {
    p.log.step(c.bold(toVisualRtl('הגדרות אופציונליות')))
    const ans = await p.confirm({
      message: `${stepBadge(4, 4)} ${c.primary(toVisualRtl('רוצה להגדיר הגדרות אופציונליות?'))}`,
      initialValue: false,
    })
    if (p.isCancel(ans)) return undefined
    doFull = ans
  }

  if (!doFull) return vars

  // Dashboard secret
  const dashboard = await promptOptionalField(
    flags.dashboard,
    toVisualRtl('סיסמת לוח הבקרה'),
    'DASHBOARD_SECRET',
    toVisualRtl('מפעיל את לוח הבקרה על פורט 4000 — דלג אם אינך צריך'),
  )
  if (dashboard === null) return undefined
  if (dashboard) vars.DASHBOARD_SECRET = dashboard

  // Proxy URL
  const proxy = await promptOptionalField(
    flags.proxy,
    toVisualRtl('כתובת Proxy'),
    'PROXY_URL',
    toVisualRtl('נדרש אם הבוט רץ מחוץ לישראל — פורמט: http://user:pass@host:port'),
    validateUrl,
  )
  if (proxy === null) return undefined
  if (proxy) vars.PROXY_URL = proxy

  // Telegram invite link
  const inviteLink = await promptOptionalField(
    flags['invite-link'],
    toVisualRtl('קישור הזמנה לערוץ'),
    'TELEGRAM_INVITE_LINK',
    toVisualRtl('מוצג בכפתור "הצטרף לערוץ" בתפריט DM'),
  )
  if (inviteLink === null) return undefined
  if (inviteLink) vars.TELEGRAM_INVITE_LINK = inviteLink

  // Forum topic IDs — only with --full flag AND platform includes Telegram
  if (forceFull && (!platform || needsTelegram(platform))) {
    p.log.info(c.dim(toVisualRtl('ניתוב נושאים — רלוונטי לקבוצות פורום בלבד')))
    const topicFields: Array<[keyof OptionalVars, string]> = [
      ['TELEGRAM_TOPIC_ID_SECURITY',      toVisualRtl('🔴 Thread ID לביטחוני')],
      ['TELEGRAM_TOPIC_ID_NATURE',        toVisualRtl('🌍 Thread ID לאסונות טבע')],
      ['TELEGRAM_TOPIC_ID_ENVIRONMENTAL', '☢️  Thread ID ' + toVisualRtl('לסביבתי')],
      ['TELEGRAM_TOPIC_ID_DRILLS',        toVisualRtl('🔵 Thread ID לתרגילים')],
      ['TELEGRAM_TOPIC_ID_GENERAL',       toVisualRtl('📢 Thread ID להודעות כלליות')],
    ]
    for (const [key, label] of topicFields) {
      const val = await promptOptionalField(
        undefined, label, key,
        toVisualRtl('דלג אם אינך משתמש בקבוצת פורום'),
      )
      if (val === null) return undefined
      if (val) vars[key] = val
    }
  }

  return vars
}

/** Returns value string, empty string for skip, or null on cancel. */
async function promptOptionalField(
  flagValue: string | boolean | undefined,
  label: string,
  envKey: string,
  hintText: string,
  validate?: (s: string) => string | undefined,
): Promise<string | null> {
  if (flagValue !== undefined) return String(flagValue) || ''
  const result = await p.text({
    message: `${c.primary(label)} ${c.muted(`(${envKey})`)}\n  ${c.dim(hintText)}`,
    placeholder: c.dim(toVisualRtl('Enter לדילוג')),
    validate: validate ? (s: string) => (s.trim() ? validate(s) : undefined) : undefined,
  })
  if (p.isCancel(result)) return null
  return String(result ?? '').trim()
}
