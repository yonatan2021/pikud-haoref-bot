import * as p from '@clack/prompts'
import { c, stepBadge, printSkipWarning } from '../ui/theme.js'
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

interface OptionalFieldConfig {
  key:          keyof OptionalVars
  label:        string
  envKey:       string
  hint:         string
  consequences: string[]
  critical?:    boolean
  secret?:      boolean
  validate?:    (s: string) => string | undefined
}

const OPTIONAL_FIELDS: OptionalFieldConfig[] = [
  {
    key:     'DASHBOARD_SECRET',
    label:   toVisualRtl('סיסמת לוח הבקרה'),
    envKey:  'DASHBOARD_SECRET',
    hint:    toVisualRtl('מפעיל את לוח הבקרה על פורט 4000 — דלג אם אינך צריך'),
    consequences: [
      toVisualRtl('לא ניתן לנהל מנויים מרחוק'),
      toVisualRtl('אין גישה לסטטיסטיקות ולהיסטוריית התראות'),
      toVisualRtl('שינוי הגדרות דורש עצירת הבוט'),
    ],
    secret: true,
  },
  {
    key:     'PROXY_URL',
    label:   toVisualRtl('כתובת Proxy'),
    envKey:  'PROXY_URL',
    hint:    toVisualRtl('נדרש אם הבוט רץ מחוץ לישראל — פורמט: http://user:pass@host:port'),
    consequences: [
      toVisualRtl('ה-API של פיקוד העורף חסום גיאוגרפית מחוץ לישראל'),
      toVisualRtl('הבוט לא יקבל התראות — אפס פונקציונליות!'),
    ],
    critical: true,
    validate: validateUrl,
  },
  {
    key:     'TELEGRAM_INVITE_LINK',
    label:   toVisualRtl('קישור הזמנה לערוץ'),
    envKey:  'TELEGRAM_INVITE_LINK',
    hint:    toVisualRtl('מוצג בכפתור "הצטרף לערוץ" בתפריט DM'),
    consequences: [
      toVisualRtl('כפתור "הצטרף לערוץ" לא יופיע בתפריט DM'),
    ],
  },
]

/**
 * Prompts for optional configuration fields.
 * Returns undefined if the user cancels (Ctrl+C).
 * Every field shows a skip warning (boxen box) if the user presses Enter without a value.
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

  // Standard optional fields with skip warning
  const flagMap: Partial<Record<keyof OptionalVars, string | boolean | undefined>> = {
    DASHBOARD_SECRET:   flags.dashboard,
    PROXY_URL:          flags.proxy,
    TELEGRAM_INVITE_LINK: flags['invite-link'],
  }

  for (const field of OPTIONAL_FIELDS) {
    const flagVal = flagMap[field.key]
    const val = await promptOptionalField(
      flagVal,
      field.label,
      field.envKey,
      field.hint,
      field.consequences,
      field.critical,
      field.secret,
      field.validate,
    )
    if (val === null) return undefined
    if (val) vars[field.key] = val
  }

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
        [toVisualRtl('ניתוב נושאים לא יעבוד עבור סוג זה')],
      )
      if (val === null) return undefined
      if (val) vars[key] = val
    }
  }

  return vars
}

/**
 * Prompts a single optional field.
 * If the user presses Enter without a value, shows a skip warning box and
 * asks for confirmation. If denied, re-prompts the field.
 * Returns value string, empty string for skip, or null on cancel.
 */
async function promptOptionalField(
  flagValue: string | boolean | undefined,
  label: string,
  envKey: string,
  hintText: string,
  consequences: string[],
  critical = false,
  secret = false,
  validate?: (s: string) => string | undefined,
): Promise<string | null> {
  if (flagValue !== undefined) return String(flagValue) || ''

  for (;;) {
    const promptOpts = {
      message: `${c.primary(label)} ${c.muted(`(${envKey})`)}\n  ${c.dim(hintText)}`,
      placeholder: c.dim(toVisualRtl('Enter לדילוג')),
      validate: validate ? (s: string) => (s.trim() ? validate(s) : undefined) : undefined,
    }

    const result = secret
      ? await p.password({ message: promptOpts.message, validate: promptOpts.validate })
      : await p.text(promptOpts)

    if (p.isCancel(result)) return null

    const trimmed = String(result ?? '').trim()
    if (trimmed) return trimmed

    // User pressed Enter — show skip warning and ask for confirmation
    printSkipWarning(label, consequences, critical)

    const confirmMsg = critical
      ? toVisualRtl('הבוט לא יעבוד מחוץ לישראל ללא Proxy — להמשיך בכל זאת?')
      : toVisualRtl('להמשיך בלי הגדרה זו?')

    const confirmed = await p.confirm({
      message: c.warning(confirmMsg),
      initialValue: !critical,
    })
    if (p.isCancel(confirmed)) return null
    if (confirmed) return ''
    // User chose to re-enter — loop
  }
}
