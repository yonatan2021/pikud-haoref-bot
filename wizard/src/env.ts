import fs from 'node:fs'

/** Read a .env file and return key→value pairs. Returns {} if file does not exist. */
export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message
    throw new Error(`לא ניתן לקרוא את ${filePath} (${code}) — בדוק הרשאות קריאה`)
  }
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const rawVal = trimmed.slice(eq + 1).trim()
    const isQuoted = rawVal.startsWith('"') && rawVal.endsWith('"')
    const stripped = isQuoted ? rawVal.slice(1, -1) : rawVal
    const val = isQuoted ? stripped.replace(/\\(.)/g, '$1') : stripped
    if (key) result[key] = val
  }
  return result
}

/** Write key→value pairs to a .env file. Skips null/undefined values. Quotes values with spaces. */
export function writeEnvFile(
  filePath: string,
  vars: Record<string, string | null | undefined>,
): void {
  const lines = [
    '# נוצר על ידי npx pikud-haoref-bot',
    `# ${new Date().toISOString()}`,
    '',
  ]
  for (const [key, value] of Object.entries(vars)) {
    if (value == null || value === '') continue
    const sv = String(value)
    const safe = /[ #$"\\`!]/.test(sv) ? `"${sv.replace(/[\\"$`]/g, c => `\\${c}`)}"` : sv
    lines.push(`${key}=${safe}`)
  }
  lines.push('')
  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message
    throw new Error(`לא ניתן לכתוב לקובץ ${filePath} (${code}) — נסה --output /tmp/.env`)
  }
}

/**
 * Immutable merge of existing env vars with updates.
 * Null/undefined values in updates are ignored (existing values are kept).
 */
export function mergeEnvVars(
  existing: Record<string, string>,
  updates: Record<string, string | null | undefined>,
): Record<string, string> {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(updates)) {
    if (value != null) merged[key] = value
  }
  return merged
}

// ─────────────────────────────────────────────────────────────────────────────
// Full .env template — single source of truth for all known env vars
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvEntry {
  key: string
  comment: string   // Hebrew description written as `# comment` above the line
  default?: string  // shown in commented line: `# KEY=default`
}

export interface EnvSection {
  title: string     // Hebrew section header: `# --- title ---`
  entries: EnvEntry[]
}

export const ENV_TEMPLATE: EnvSection[] = [
  {
    title: 'חובה',
    entries: [
      { key: 'TELEGRAM_BOT_TOKEN',  comment: 'טוקן הבוט מ-BotFather' },
      { key: 'TELEGRAM_CHAT_ID',    comment: "מזהה הצ'אט/ערוץ לשליחת ההתראות (מספר שלילי לערוץ, חיובי לפרטי)" },
      { key: 'MAPBOX_ACCESS_TOKEN', comment: 'טוקן Mapbox לגנרציית מפות' },
    ],
  },
  {
    title: 'בסיסי — אופציונלי',
    entries: [
      { key: 'PROXY_URL',            comment: 'פרוקסי ישראלי — נדרש כשרצים מחוץ לישראל (פורמט: http://user:pass@host:port/)' },
      { key: 'TELEGRAM_INVITE_LINK', comment: 'קישור הצטרפות לערוץ הראשי — מוצג בתפריט DM תחת "הצטרף לערוץ"' },
    ],
  },
  {
    title: 'נושאי פורום',
    entries: [
      { key: 'TELEGRAM_TOPIC_ID_SECURITY',      comment: '🔴 ביטחוני — טילים, כלי טיס, מחבלים' },
      { key: 'TELEGRAM_TOPIC_ID_NATURE',        comment: '🌍 אסונות טבע — רעידת אדמה, צונאמי' },
      { key: 'TELEGRAM_TOPIC_ID_ENVIRONMENTAL', comment: '☢️  סביבתי/כימי — חומרים מסוכנים, רדיולוגי' },
      { key: 'TELEGRAM_TOPIC_ID_DRILLS',        comment: '🔵 תרגילים — כל סוגי התרגיל' },
      { key: 'TELEGRAM_TOPIC_ID_WHATSAPP',      comment: '📲 העברות WhatsApp — ברירת מחדל ל-listener ללא נושא ספציפי' },
      { key: 'TELEGRAM_TOPIC_ID_GENERAL',       comment: '📢 הודעות כלליות — newsFlash, general, unknown. אל תשתמש ב-1 (שמור ב-Telegram)' },
    ],
  },
  {
    title: 'Mapbox מתקדם',
    entries: [
      { key: 'MAPBOX_MONTHLY_LIMIT',    comment: 'מגבלת בקשות חודשית ל-Mapbox Static API — כשמגיעים אליה נשלח טקסט ללא מפה', default: '40000' },
      { key: 'MAPBOX_IMAGE_CACHE_SIZE', comment: 'גודל cache תמונות בזיכרון (מספר fingerprints מקסימלי)',                    default: '20' },
      { key: 'MAPBOX_SKIP_DRILLS',      comment: 'דלג על יצירת מפות לתרגילים — שולח טקסט בלבד וחוסך בקשות Mapbox',         default: 'false' },
    ],
  },
  {
    title: 'חלון עדכון התראות',
    entries: [
      { key: 'ALERT_UPDATE_WINDOW_SECONDS', comment: 'שניות להמתנה לפני שהתראה חדשה מאותו סוג נשלחת כהודעה נפרדת', default: '120' },
    ],
  },
  {
    title: 'שרת Health',
    entries: [
      { key: 'HEALTH_PORT', comment: 'פורט שרת ה-health — GET /health מחזיר uptime, lastAlertAt, lastPollAt, alertsToday', default: '3000' },
    ],
  },
  {
    title: 'WhatsApp',
    entries: [
      { key: 'WHATSAPP_ENABLED',            comment: 'הפעל לקוח whatsapp-web.js — סריקת QR נדרשת בהפעלה הראשונה; session נשמר ב-.wwebjs_auth/', default: 'false' },
      { key: 'WHATSAPP_INVITE_LINK',        comment: 'קישור הזמנה לקבוצת WhatsApp — מוצג בדף הנחיתה לצד קישור הטלגרם' },
      { key: 'TELEGRAM_FORWARD_GROUP_ID',   comment: 'מזהה קבוצה/ערוץ טלגרם לקבלת הודעות מה-WhatsApp Listener — fallback ל-TELEGRAM_CHAT_ID' },
      { key: 'PUPPETEER_EXECUTABLE_PATH',   comment: 'נתיב Chromium בסביבות Docker (Puppeteer)' },
    ],
  },
  {
    title: 'לוח הבקרה',
    entries: [
      { key: 'DASHBOARD_SECRET', comment: 'סיסמת גישה ללוח הבקרה — מפעיל את לוח הבקרה על פורט DASHBOARD_PORT; השמט להשבתה' },
      { key: 'DASHBOARD_PORT',   comment: 'פורט שרת לוח הבקרה', default: '4000' },
    ],
  },
  {
    title: 'דף נחיתה ו-GitHub',
    entries: [
      { key: 'GA4_MEASUREMENT_ID', comment: 'מזהה Google Analytics 4 (G-XXXXXXXXXX) — מוזרק לדף הנחיתה בבנייה' },
      { key: 'GITHUB_PAT',         comment: 'GitHub Personal Access Token — נדרש ל-POST /api/landing/deploy' },
      { key: 'GITHUB_REPO',        comment: 'מאגר GitHub לפריסת דף נחיתה (פורמט: owner/repo-name)' },
    ],
  },
]

/**
 * Writes a COMPLETE .env file using ENV_TEMPLATE as the structure.
 * - Vars with non-empty values → active lines: `KEY=value`
 * - Vars with missing/empty values → commented lines: `# KEY=` or `# KEY=default`
 * - Each entry is preceded by a Hebrew comment line
 * - Sections are separated by a header comment
 */
export function writeFullEnvFile(
  filePath: string,
  vars: Record<string, string | null | undefined>,
): void {
  const quoteIfNeeded = (v: string): string => {
    if (/[ #$"\\`!]/.test(v)) {
      const escaped = v.replace(/[\\"$`]/g, c => `\\${c}`)
      return `"${escaped}"`
    }
    return v
  }

  const sectionLines = ENV_TEMPLATE.flatMap(section => [
    '',
    `# --- ${section.title} ---`,
    '',
    ...section.entries.flatMap(entry => {
      const value = vars[entry.key]
      const isActive = value != null && value !== ''
      const commentLine = `# ${entry.comment}`
      if (isActive) {
        return [commentLine, `${entry.key}=${quoteIfNeeded(String(value))}`]
      }
      const fallback = entry.default !== undefined ? entry.default : ''
      return [commentLine, `# ${entry.key}=${fallback}`]
    }),
  ])

  const lines = [
    '# נוצר על ידי npx pikud-haoref-bot',
    `# ${new Date().toISOString()}`,
    ...sectionLines,
    '',
  ]

  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message
    throw new Error(`לא ניתן לכתוב לקובץ ${filePath} (${code}) — נסה --output /tmp/.env`)
  }
}

/** Masks a value showing only the last 4 visible characters. */
export function maskValue(val: string): string {
  if (val.length <= 4) return '***'
  return '***' + val.slice(-4)
}
