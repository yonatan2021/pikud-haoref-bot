import * as p from '@clack/prompts'
import { c, printSectionCard, printSkipWarning } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import { validateToken, validateChatId, validateMapboxToken, validateUrl } from '../validation.js'
import { type Platform, needsTelegram, needsWhatsApp, needsMapbox } from './platform.js'
import type { Flags } from '../args.js'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Profile = 'minimal' | 'recommended' | 'full'

export interface ProfileFieldConfig {
  readonly key: string
  readonly label: string          // raw Hebrew — call toVisualRtl() at display time only
  readonly hint: string           // raw Hebrew
  readonly minProfile: Profile
  readonly default?: string       // pre-fill value; shown as initialValue in prompt
  readonly secret?: boolean       // use p.password instead of p.text
  readonly critical?: boolean     // red skip-warning, default confirm = false
  readonly consequences?: string[]
  readonly validate?: (s: string) => string | undefined
  readonly platformGuard?: (platform: Platform) => boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile ranking — used to filter fields by selected profile
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_RANK: Record<Profile, number> = { minimal: 0, recommended: 1, full: 2 }

const VALID_PROFILES = new Set<string>(['minimal', 'recommended', 'full'])

// ─────────────────────────────────────────────────────────────────────────────
// Field registry — single source of truth for all wizard fields
// ─────────────────────────────────────────────────────────────────────────────

/** CLI flag name → env var key mapping for fields that have dedicated flags. */
const FLAG_MAP: Record<string, string> = {
  token:         'TELEGRAM_BOT_TOKEN',
  'chat-id':     'TELEGRAM_CHAT_ID',
  mapbox:        'MAPBOX_ACCESS_TOKEN',
  dashboard:     'DASHBOARD_SECRET',
  proxy:         'PROXY_URL',
  'invite-link': 'TELEGRAM_INVITE_LINK',
}

export const PROFILE_FIELDS: readonly ProfileFieldConfig[] = [
  // ── minimal ──
  {
    key: 'TELEGRAM_BOT_TOKEN',
    label: 'טוקן הבוט מ-@BotFather',
    hint: 'צור בוט ב-https://t.me/BotFather וקבל את הטוקן',
    minProfile: 'minimal',
    secret: true,
    validate: validateToken,
    platformGuard: needsTelegram,
  },
  {
    key: 'TELEGRAM_CHAT_ID',
    label: 'מזהה הערוץ/קבוצה',
    hint: 'ערוץ: מספר שלילי כמו ‎-1001234567890 | DM: מספר חיובי',
    minProfile: 'minimal',
    validate: validateChatId,
    platformGuard: needsTelegram,
  },
  {
    key: 'MAPBOX_ACCESS_TOKEN',
    label: 'טוקן Mapbox',
    hint: 'חשבון חינמי: https://account.mapbox.com/access-tokens',
    minProfile: 'minimal',
    validate: validateMapboxToken,
    platformGuard: needsMapbox,
  },

  // ── recommended ──
  {
    key: 'DASHBOARD_SECRET',
    label: 'סיסמת לוח הבקרה',
    hint: 'מפעיל את לוח הבקרה על פורט 4000 — דלג אם אינך צריך',
    minProfile: 'recommended',
    secret: true,
    consequences: [
      'לא ניתן לנהל מנויים מרחוק',
      'אין גישה לסטטיסטיקות ולהיסטוריית התראות',
      'שינוי הגדרות דורש עצירת הבוט',
    ],
  },
  {
    key: 'DASHBOARD_PORT',
    label: 'פורט לוח הבקרה',
    hint: 'פורט שבו לוח הבקרה יאזין',
    minProfile: 'recommended',
    default: '4000',
  },
  {
    key: 'PROXY_URL',
    label: 'כתובת Proxy',
    hint: 'נדרש אם הבוט רץ מחוץ לישראל — פורמט: http://user:pass@host:port',
    minProfile: 'recommended',
    critical: true,
    validate: validateUrl,
    consequences: [
      'ה-API של פיקוד העורף חסום גיאוגרפית מחוץ לישראל',
      'הבוט לא יקבל התראות — אפס פונקציונליות!',
    ],
  },
  {
    key: 'TELEGRAM_INVITE_LINK',
    label: 'קישור הזמנה לערוץ',
    hint: 'מוצג בכפתור "הצטרף לערוץ" בתפריט DM',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: [
      'כפתור "הצטרף לערוץ" לא יופיע בתפריט DM',
    ],
  },
  {
    key: 'MAPBOX_MONTHLY_LIMIT',
    label: 'מגבלת בקשות Mapbox חודשית',
    hint: 'כשמגיעים למגבלה נשלח טקסט ללא מפה',
    minProfile: 'recommended',
    default: '40000',
    platformGuard: needsMapbox,
  },
  {
    key: 'MAPBOX_IMAGE_CACHE_SIZE',
    label: 'גודל cache תמונות Mapbox',
    hint: 'מספר fingerprints מקסימלי בזיכרון',
    minProfile: 'recommended',
    default: '20',
    platformGuard: needsMapbox,
  },
  {
    key: 'MAPBOX_SKIP_DRILLS',
    label: 'דלג על מפות לתרגילים',
    hint: 'שולח טקסט בלבד לתרגילים — חוסך בקשות Mapbox',
    minProfile: 'recommended',
    default: 'false',
    platformGuard: needsMapbox,
  },
  {
    key: 'ALERT_UPDATE_WINDOW_SECONDS',
    label: 'חלון עדכון התראות (שניות)',
    hint: 'התראות מאותו סוג בחלון הזה עורכות את ההודעה הקיימת',
    minProfile: 'recommended',
    default: '120',
  },
  {
    key: 'HEALTH_PORT',
    label: 'פורט שרת Health',
    hint: 'GET /health — uptime, lastAlertAt, alertsToday',
    minProfile: 'recommended',
    default: '3000',
  },
  {
    key: 'TELEGRAM_TOPIC_ID_SECURITY',
    label: '🔴 Thread ID לביטחוני',
    hint: 'טילים, כלי טיס, מחבלים — רלוונטי לקבוצות פורום בלבד',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: ['ניתוב נושאים לא יעבוד עבור סוג זה'],
  },
  {
    key: 'TELEGRAM_TOPIC_ID_NATURE',
    label: '🌍 Thread ID לאסונות טבע',
    hint: 'רעידת אדמה, צונאמי — רלוונטי לקבוצות פורום בלבד',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: ['ניתוב נושאים לא יעבוד עבור סוג זה'],
  },
  {
    key: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL',
    label: '☢️  Thread ID לסביבתי',
    hint: 'חומרים מסוכנים, רדיולוגי — רלוונטי לקבוצות פורום בלבד',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: ['ניתוב נושאים לא יעבוד עבור סוג זה'],
  },
  {
    key: 'TELEGRAM_TOPIC_ID_DRILLS',
    label: '🔵 Thread ID לתרגילים',
    hint: 'כל סוגי התרגיל — רלוונטי לקבוצות פורום בלבד',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: ['ניתוב נושאים לא יעבוד עבור סוג זה'],
  },
  {
    key: 'TELEGRAM_TOPIC_ID_GENERAL',
    label: '📢 Thread ID להודעות כלליות',
    hint: 'newsFlash, general, unknown — אל תשתמש ב-1 (שמור ב-Telegram)',
    minProfile: 'recommended',
    platformGuard: needsTelegram,
    consequences: ['ניתוב נושאים לא יעבוד עבור סוג זה'],
  },

  // ── full ──
  {
    key: 'WHATSAPP_ENABLED',
    label: 'הפעלת WhatsApp',
    hint: 'סריקת QR נדרשת בהפעלה הראשונה; session נשמר ב-.wwebjs_auth/',
    minProfile: 'full',
    default: 'true',
    platformGuard: needsWhatsApp,
  },
  {
    key: 'WHATSAPP_INVITE_LINK',
    label: 'קישור הזמנה לקבוצת WhatsApp',
    hint: 'מוצג בדף הנחיתה לצד קישור הטלגרם',
    minProfile: 'full',
    platformGuard: needsWhatsApp,
    consequences: ['קישור WhatsApp לא יופיע בדף הנחיתה'],
  },
  {
    key: 'TELEGRAM_FORWARD_GROUP_ID',
    label: 'מזהה קבוצה להעברת WhatsApp',
    hint: 'מזהה קבוצה/ערוץ טלגרם לקבלת הודעות מ-WhatsApp Listener — fallback ל-TELEGRAM_CHAT_ID',
    minProfile: 'full',
    platformGuard: needsTelegram,
    consequences: ['הודעות WhatsApp Listener יועברו ל-TELEGRAM_CHAT_ID הראשי'],
  },
  {
    key: 'TELEGRAM_TOPIC_ID_WHATSAPP',
    label: '📲 Thread ID להעברות WhatsApp',
    hint: 'ברירת מחדל ל-listener ללא נושא ספציפי',
    minProfile: 'full',
    platformGuard: needsTelegram,
    consequences: ['הודעות WhatsApp Listener יועברו ל-General topic או לצ\'אט הראשי'],
  },
  {
    key: 'PUPPETEER_EXECUTABLE_PATH',
    label: 'נתיב Chromium (Docker)',
    hint: 'נדרש בסביבות Docker — בדרך כלל /usr/bin/chromium',
    minProfile: 'full',
    platformGuard: needsWhatsApp,
    consequences: ['WhatsApp לא יעבוד בסביבות Docker ללא Chromium'],
  },
  {
    key: 'GA4_MEASUREMENT_ID',
    label: 'מזהה Google Analytics 4',
    hint: 'פורמט: G-XXXXXXXXXX — מוזרק לדף הנחיתה בבנייה',
    minProfile: 'full',
    consequences: ['דף הנחיתה יעבוד ללא מעקב Analytics'],
  },
  {
    key: 'GITHUB_PAT',
    label: 'GitHub Personal Access Token',
    hint: 'נדרש לפריסת דף נחיתה מלוח הבקרה (POST /api/landing/deploy)',
    minProfile: 'full',
    secret: true,
    consequences: ['פריסת דף הנחיתה מלוח הבקרה לא תעבוד — רק דרך CI'],
  },
  {
    key: 'GITHUB_REPO',
    label: 'מאגר GitHub לפריסת Landing',
    hint: 'פורמט: owner/repo-name',
    minProfile: 'full',
    consequences: ['פריסת דף הנחיתה מלוח הבקרה לא תעבוד — רק דרך CI'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns fields applicable to the given profile and platform. */
export function fieldsForProfile(
  profile: Profile,
  platform: Platform,
): readonly ProfileFieldConfig[] {
  const rank = PROFILE_RANK[profile]
  return PROFILE_FIELDS.filter(f =>
    PROFILE_RANK[f.minProfile] <= rank &&
    (!f.platformGuard || f.platformGuard(platform)),
  )
}

/** Returns true if the given string is a valid profile name. */
export function isValidProfile(s: string): s is Profile {
  return VALID_PROFILES.has(s)
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive prompts
// ─────────────────────────────────────────────────────────────────────────────

/** Prompts the user to select a profile. Returns undefined on cancel. */
export async function promptProfile(flags: Flags): Promise<Profile | undefined> {
  // CLI flag shortcut: --profile=recommended
  if (flags.profile !== undefined && isValidProfile(flags.profile)) {
    return flags.profile
  }
  // Backward compat: --full → full profile
  if (flags.full) return 'full'

  printSectionCard('📦', 'פרופיל הגדרות', 'בחר כמה הגדרות להפעיל — ניתן תמיד להרחיב עם --update')

  const choice = await p.select<Profile>({
    message: c.primary(toVisualRtl('בחר פרופיל הגדרות')),
    initialValue: 'recommended' as Profile,
    options: [
      {
        value: 'minimal' as Profile,
        label: c.bold(toVisualRtl('מינימלי')),
        hint: toVisualRtl('3 שדות חובה בלבד — הבוט שולח התראות עם מפות'),
      },
      {
        value: 'recommended' as Profile,
        label: `${c.bold(toVisualRtl('מומלץ'))} ${c.accent('⭐')}`,
        hint: toVisualRtl('דשבורד, Proxy, נושאי פורום, הגבלות Mapbox ועוד'),
      },
      {
        value: 'full' as Profile,
        label: c.bold(toVisualRtl('מלא')),
        hint: toVisualRtl('כל ההגדרות כולל WhatsApp, GitHub ו-Analytics'),
      },
    ],
  })
  if (p.isCancel(choice)) return undefined
  return choice
}

/**
 * Prompts the user for each field in the given list.
 * - Minimal-profile fields are required (validated non-empty).
 * - Recommended/full fields use the skip-warning pattern.
 * Returns Record<string, string> of collected values, or undefined on cancel.
 */
export async function promptProfileFields(
  fields: readonly ProfileFieldConfig[],
  flags: Flags,
): Promise<Record<string, string> | undefined> {
  const vars: Record<string, string> = {}

  // Build reverse map: env key → flag value (for non-interactive mode)
  const flagValues: Record<string, string | undefined> = {}
  for (const [flagName, envKey] of Object.entries(FLAG_MAP)) {
    const raw = flags[flagName]
    if (raw !== undefined) flagValues[envKey] = String(raw)
  }

  for (const field of fields) {
    // Check if a CLI flag provides this value
    const flagVal = flagValues[field.key]
    if (flagVal !== undefined) {
      if (field.validate) {
        const err = field.validate(flagVal)
        if (err) throw new Error(`--${field.key}: ${err}`)
      }
      vars[field.key] = flagVal
      continue
    }

    const isRequired = field.minProfile === 'minimal'
    const result = isRequired
      ? await promptRequiredField(field)
      : await promptOptionalField(field)

    if (result === null) return undefined // cancelled
    if (result) vars[field.key] = result
  }

  return vars
}

// ─────────────────────────────────────────────────────────────────────────────
// Field prompting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prompts a required field (minimal profile). Validates non-empty + custom validator.
 * Returns the trimmed value, or null on cancel.
 */
async function promptRequiredField(field: ProfileFieldConfig): Promise<string | null> {
  const messageText = `${c.primary(toVisualRtl(field.label))} ${c.muted(`(${field.key})`)}\n  ${c.dim(toVisualRtl(field.hint))}`

  for (;;) {
    try {
      const result = field.secret
        ? await p.password({ message: messageText, validate: field.validate })
        : await p.text({
            message: messageText,
            placeholder: field.default ? c.dim(field.default) : undefined,
            initialValue: field.default,
            validate: field.validate,
          })

      if (p.isCancel(result)) return null
      const trimmed = String(result ?? '').trim()
      if (trimmed) return trimmed
    } catch (err) {
      const shouldRetry = await p.confirm({
        message: c.warning(toVisualRtl(`שגיאה בלתי צפויה: ${(err as Error).message} — לנסות שוב?`)),
        initialValue: true,
      })
      if (p.isCancel(shouldRetry) || !shouldRetry) return null
    }
  }
}

/**
 * Prompts an optional field (recommended/full profile).
 * Shows skip-warning with consequences if user leaves empty.
 * Returns value string, empty string for skip, or null on cancel.
 */
async function promptOptionalField(field: ProfileFieldConfig): Promise<string | null> {
  for (;;) {
    const promptOpts = {
      message: `${c.primary(toVisualRtl(field.label))} ${c.muted(`(${field.key})`)}\n  ${c.dim(toVisualRtl(field.hint))}`,
      placeholder: field.default
        ? c.dim(toVisualRtl(`ברירת מחדל: ${field.default} | Enter לאישור`))
        : c.dim(toVisualRtl('Enter לדילוג')),
      initialValue: field.default,
      validate: field.validate
        ? (s: string) => (s.trim() ? field.validate!(s) : undefined)
        : undefined,
    }

    const result = field.secret
      ? await p.password({ message: promptOpts.message, validate: promptOpts.validate })
      : await p.text(promptOpts)

    if (p.isCancel(result)) return null

    const trimmed = String(result ?? '').trim()
    if (trimmed) return trimmed

    // User pressed Enter with no value — if field has default, use it
    if (field.default) return field.default

    // No default and no value — show skip warning if consequences exist
    if (field.consequences && field.consequences.length > 0) {
      printSkipWarning(field.label, field.consequences, field.critical)

      const confirmMsg = field.critical
        ? toVisualRtl('הבוט לא יעבוד מחוץ לישראל ללא Proxy — להמשיך בכל זאת?')
        : toVisualRtl('להמשיך בלי הגדרה זו?')

      const confirmed = await p.confirm({
        message: c.warning(confirmMsg),
        initialValue: !field.critical,
      })
      if (p.isCancel(confirmed)) return null
      if (confirmed) return ''
      // User chose to re-enter — loop
    } else {
      return ''
    }
  }
}
