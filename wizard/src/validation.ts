/** Input validators — return undefined on success, error string on failure */

const TOKEN_RE = /^\d{7,12}:[A-Za-z0-9_-]{35,}$/
const CHAT_ID_RE = /^-?\d+$/

export function validateToken(s: string): string | undefined {
  if (!s.trim()) return 'טוקן חסר — הזן את הטוקן מ-@BotFather'
  if (!TOKEN_RE.test(s.trim())) return 'פורמט לא תקין — הטוקן חייב להיות בצורה: 123456789:AAF-xxx...'
  return undefined
}

export function validateChatId(s: string): string | undefined {
  if (!s.trim()) return 'מזהה ערוץ חסר'
  if (!CHAT_ID_RE.test(s.trim())) return 'מזהה לא תקין — חייב להיות מספר שלם (שלילי לערוץ, חיובי ל-DM)'
  return undefined
}

export function validateMapboxToken(s: string): string | undefined {
  if (!s.trim()) return 'טוקן Mapbox חסר'
  if (!s.trim().startsWith('pk.')) return 'פורמט לא תקין — טוקן Mapbox חייב להתחיל ב-pk.'
  return undefined
}

export function validateUrl(s: string): string | undefined {
  if (!s.trim()) return 'כתובת URL חסרה'
  try {
    const url = new URL(s.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'רק http:// או https:// נתמכים'
    }
    return undefined
  } catch {
    return 'כתובת URL לא תקינה — פורמט נדרש: http://host:port'
  }
}
