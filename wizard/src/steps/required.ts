import * as p from '@clack/prompts'
import { c, stepBadge } from '../ui/theme.js'
import { validateToken, validateChatId, validateMapboxToken } from '../validation.js'
import type { Flags } from '../args.js'
import { type Platform, needsTelegram, needsMapbox } from './platform.js'

export interface RequiredResult {
  token?:  string
  chatId?: string
  mapbox?: string
}

/**
 * Pure helper: builds a RequiredResult from raw collected values,
 * omitting fields that are not needed for the given platform.
 */
export function buildRequiredResult(
  platform: Platform,
  collected: { token?: string; chatId?: string; mapbox?: string },
): RequiredResult {
  return {
    ...(needsTelegram(platform) && collected.token  ? { token:  collected.token }  : {}),
    ...(needsTelegram(platform) && collected.chatId ? { chatId: collected.chatId } : {}),
    ...(needsMapbox(platform)   && collected.mapbox ? { mapbox: collected.mapbox } : {}),
  }
}

/**
 * Prompts for the required environment variables based on the chosen platform.
 * If values are already provided via flags, skips the interactive prompt.
 * Returns undefined if the user cancels (Ctrl+C).
 * Returns {} (empty RequiredResult) for whatsapp-only (no credentials needed).
 */
export async function promptRequired(
  platform: Platform,
  flags: Flags,
): Promise<RequiredResult | undefined> {
  // WhatsApp-only: no credentials needed
  if (!needsTelegram(platform) && !needsMapbox(platform)) {
    return {}
  }

  p.log.step(c.bold('הגדרות חובה'))

  let token: string | undefined
  let chatId: string | undefined
  let mapbox: string | undefined

  // Token
  if (needsTelegram(platform)) {
    if (flags.token !== undefined) {
      const err = validateToken(flags.token)
      if (err) throw new Error(`--token: ${err}`)
      token = flags.token
    } else {
      const val = await p.password({
        message: `${stepBadge(1, 3)} ${c.primary('טוקן הבוט מ-@BotFather')}\n  ${c.dim('צור בוט ב-https://t.me/BotFather וקבל את הטוקן')}`,
        validate: validateToken,
      })
      if (p.isCancel(val)) return undefined
      token = String(val)
    }
  }

  // Chat ID
  if (needsTelegram(platform)) {
    if (flags['chat-id'] !== undefined) {
      const err = validateChatId(flags['chat-id'])
      if (err) throw new Error(`--chat-id: ${err}`)
      chatId = flags['chat-id']
    } else {
      const val = await p.text({
        message: `${stepBadge(2, 3)} ${c.primary('מזהה הערוץ/קבוצה')}\n  ${c.dim('ערוץ: מספר שלילי כמו ‎-1001234567890 | DM: מספר חיובי')}`,
        placeholder: '-1001234567890',
        validate: validateChatId,
      })
      if (p.isCancel(val)) return undefined
      chatId = String(val)
    }
  }

  // Mapbox
  if (needsMapbox(platform)) {
    if (flags.mapbox !== undefined) {
      const err = validateMapboxToken(flags.mapbox)
      if (err) throw new Error(`--mapbox: ${err}`)
      mapbox = flags.mapbox
    } else {
      const val = await p.text({
        message: `${stepBadge(3, 3)} ${c.primary('טוקן Mapbox')}\n  ${c.dim('חשבון חינמי: https://account.mapbox.com/access-tokens')}`,
        placeholder: 'pk.eyJ...',
        validate: validateMapboxToken,
      })
      if (p.isCancel(val)) return undefined
      mapbox = String(val)
    }
  }

  return buildRequiredResult(platform, { token, chatId, mapbox })
}
