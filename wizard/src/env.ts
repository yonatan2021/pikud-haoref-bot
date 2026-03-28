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
    const val = rawVal.startsWith('"') && rawVal.endsWith('"') ? rawVal.slice(1, -1) : rawVal
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
    const safe = String(value).includes(' ') ? `"${value}"` : String(value)
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

/** Masks a value showing only the last 4 visible characters. */
export function maskValue(val: string): string {
  if (val.length <= 4) return '***'
  return '***' + val.slice(-4)
}
