import path from 'node:path'
import * as p from '@clack/prompts'
import { c, msg } from '../ui/theme.js'
import { readEnvFile, writeEnvFile, mergeEnvVars, maskValue } from '../env.js'
import { validateToken, validateChatId, validateMapboxToken, validateUrl } from '../validation.js'
import type { Flags } from '../args.js'

interface FieldDef {
  key: string
  label: string
  validate?: (s: string) => string | undefined
  secret?: boolean
}

export function buildUpdateFields(): FieldDef[] {
  return [
    { key: 'TELEGRAM_BOT_TOKEN',   label: 'טוקן הבוט',          validate: validateToken,       secret: true },
    { key: 'TELEGRAM_CHAT_ID',     label: 'מזהה הערוץ/קבוצה',   validate: validateChatId },
    { key: 'MAPBOX_ACCESS_TOKEN',  label: 'טוקן Mapbox',         validate: validateMapboxToken, secret: true },
    { key: 'DASHBOARD_SECRET',     label: 'סיסמת לוח הבקרה',    secret: true },
    { key: 'PROXY_URL',            label: 'כתובת Proxy',          validate: validateUrl },
    { key: 'TELEGRAM_INVITE_LINK', label: 'קישור הזמנה לערוץ' },
    { key: 'WHATSAPP_ENABLED',     label: 'WhatsApp מופעל (true / false)' },
  ]
}

/** Update mode: read .env, show multiselect of fields, re-prompt only selected, merge and write. */
export async function runUpdate(flags: Flags): Promise<void> {
  const outputPath = path.resolve(String(flags.output ?? '.env'))
  const existing = readEnvFile(outputPath)

  p.log.step(c.bold('עדכון הגדרות קיימות'))
  p.log.info(`${c.dim('קובץ:')} ${c.primary(outputPath)}`)

  // Build multiselect options — show masked current values
  const fields = buildUpdateFields()
  const options = fields.map((f) => {
    const current = existing[f.key]
    const currentLabel = current ? c.dim(`  ← ${maskValue(current)}`) : c.dim('  ← לא מוגדר')
    return {
      value: f.key,
      label: `${c.primary(f.label)} ${c.muted(`(${f.key})`)}${currentLabel}`,
    }
  })

  const selected = await p.multiselect<string>({
    message: c.primary('אילו הגדרות לעדכן?'),
    options,
    required: false,
  })
  if (p.isCancel(selected) || selected.length === 0) {
    p.outro(c.dim('לא בוצעו שינויים.'))
    return
  }

  // Re-prompt only selected fields
  const updates: Record<string, string> = {}
  for (const key of selected) {
    const field = fields.find((f) => f.key === key)!
    const value = field.secret
      ? await p.password({ message: c.primary(field.label), validate: field.validate })
      : await p.text({    message: c.primary(field.label), validate: field.validate })

    if (p.isCancel(value)) { p.outro(msg.cancelled); return }
    const trimmed = String(value ?? '').trim()
    if (trimmed) {
      updates[key] = trimmed
    } else {
      p.log.warn(`${c.warning('⚠️')} ערך ריק — ${c.primary(field.label)} לא שונה`)
    }
  }

  const merged = mergeEnvVars(existing, updates)
  writeEnvFile(outputPath, merged)
  p.outro(msg.envUpdated(outputPath))
}
