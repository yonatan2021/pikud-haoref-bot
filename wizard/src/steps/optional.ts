import * as p from '@clack/prompts'
import { c, stepBadge } from '../ui/theme.js'
import { validateUrl } from '../validation.js'
import type { Flags } from '../args.js'

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
 */
export async function promptOptional(
  flags: Flags,
  forceFull: boolean,
): Promise<OptionalVars | undefined> {
  const vars: OptionalVars = {}

  // Determine whether to show optional section at all
  const hasOptionalFlags = flags.dashboard !== undefined ||
    flags.proxy !== undefined || flags['invite-link'] !== undefined

  let doFull: boolean | undefined
  if (forceFull || hasOptionalFlags) {
    doFull = true
    if (forceFull) p.log.step(c.bold('הגדרות אופציונליות'))
  } else {
    p.log.step(c.bold('הגדרות אופציונליות'))
    const ans = await p.confirm({
      message: `${stepBadge(4, 4)} ${c.primary('רוצה להגדיר הגדרות אופציונליות?')}`,
      initialValue: false,
    })
    if (p.isCancel(ans)) return undefined
    doFull = ans
  }

  if (!doFull) return vars

  // Dashboard
  const dashboard = await promptOptionalField(
    flags.dashboard,
    'סיסמת לוח הבקרה',
    'DASHBOARD_SECRET',
    'מפעיל את לוח הבקרה על פורט 4000 — דלג אם אינך צריך',
  )
  if (dashboard === null) return undefined
  if (dashboard) vars.DASHBOARD_SECRET = dashboard

  // Proxy
  const proxy = await promptOptionalField(
    flags.proxy,
    'כתובת Proxy',
    'PROXY_URL',
    'נדרש אם הבוט רץ מחוץ לישראל — פורמט: http://user:pass@host:port',
    validateUrl,
  )
  if (proxy === null) return undefined
  if (proxy) vars.PROXY_URL = proxy

  // Invite link
  const inviteLink = await promptOptionalField(
    flags['invite-link'],
    'קישור הזמנה לערוץ',
    'TELEGRAM_INVITE_LINK',
    'מוצג בכפתור "הצטרף לערוץ" בתפריט DM',
  )
  if (inviteLink === null) return undefined
  if (inviteLink) vars.TELEGRAM_INVITE_LINK = inviteLink

  // Forum topic IDs (only when --full flag)
  if (forceFull) {
    p.log.info(c.dim('ניתוב נושאים — רלוונטי לקבוצות פורום בלבד'))
    const topicFields: Array<[keyof OptionalVars, string]> = [
      ['TELEGRAM_TOPIC_ID_SECURITY',      '🔴 Thread ID לביטחוני'],
      ['TELEGRAM_TOPIC_ID_NATURE',        '🌍 Thread ID לאסונות טבע'],
      ['TELEGRAM_TOPIC_ID_ENVIRONMENTAL', '☢️  Thread ID לסביבתי'],
      ['TELEGRAM_TOPIC_ID_DRILLS',        '🔵 Thread ID לתרגילים'],
      ['TELEGRAM_TOPIC_ID_GENERAL',       '📢 Thread ID להודעות כלליות'],
    ]
    for (const [key, label] of topicFields) {
      const val = await promptOptionalField(
        undefined, label, key,
        'דלג אם אינך משתמש בקבוצת פורום',
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
    placeholder: c.dim('Enter לדילוג'),
    validate: validate ? (s) => (s.trim() ? validate(s) : undefined) : undefined,
  })
  if (p.isCancel(result)) return null
  return String(result ?? '').trim()
}
