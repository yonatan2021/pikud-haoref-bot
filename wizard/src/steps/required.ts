import * as p from '@clack/prompts'
import { c, stepBadge } from '../ui/theme.js'
import { validateToken, validateChatId, validateMapboxToken } from '../validation.js'
import type { Flags } from '../args.js'

/**
 * Prompts for all three required environment variables.
 * If values are already provided via flags, skips the interactive prompt.
 * Returns undefined if the user cancels (Ctrl+C).
 */
export async function promptRequired(
  flags: Flags,
): Promise<{ token: string; chatId: string; mapbox: string } | undefined> {
  p.log.step(c.bold('הגדרות חובה'))

  // Token
  let token: string
  if (flags.token !== undefined) {
    const err = validateToken(flags.token)
    if (err) throw new Error(`--token: ${err}`)
    token = flags.token
  } else {
    const val = await p.password({
      message: `${stepBadge(1, 4)} ${c.primary('טוקן הבוט מ-@BotFather')}\n  ${c.dim('צור בוט ב-https://t.me/BotFather וקבל את הטוקן')}`,
      validate: validateToken,
    })
    if (p.isCancel(val)) return undefined
    token = String(val)
  }

  // Chat ID
  let chatId: string
  if (flags['chat-id'] !== undefined) {
    const err = validateChatId(flags['chat-id'])
    if (err) throw new Error(`--chat-id: ${err}`)
    chatId = flags['chat-id']
  } else {
    const val = await p.text({
      message: `${stepBadge(2, 4)} ${c.primary('מזהה הערוץ/קבוצה')}\n  ${c.dim('ערוץ: מספר שלילי כמו ‎-1001234567890 | DM: מספר חיובי')}`,
      placeholder: '-1001234567890',
      validate: validateChatId,
    })
    if (p.isCancel(val)) return undefined
    chatId = String(val)
  }

  // Mapbox
  let mapbox: string
  if (flags.mapbox !== undefined) {
    const err = validateMapboxToken(flags.mapbox)
    if (err) throw new Error(`--mapbox: ${err}`)
    mapbox = flags.mapbox
  } else {
    const val = await p.text({
      message: `${stepBadge(3, 4)} ${c.primary('טוקן Mapbox')}\n  ${c.dim('חשבון חינמי: https://account.mapbox.com/access-tokens')}`,
      placeholder: 'pk.eyJ...',
      validate: validateMapboxToken,
    })
    if (p.isCancel(val)) return undefined
    mapbox = String(val)
  }

  return { token, chatId, mapbox }
}
