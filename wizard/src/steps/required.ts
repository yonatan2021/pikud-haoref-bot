import * as p from '@clack/prompts'
import { c, stepBadge, msg, printSectionCard } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
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

  printSectionCard('🔑', 'הגדרות חובה', '3 שדות נדרשים לחיבור Telegram — ללא הן הבוט לא יכול לשלוח הודעות')

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
      token = await promptWithRetry(async () => {
        const val = await p.password({
          message: `${stepBadge(1, 3)} ${c.primary(toVisualRtl('טוקן הבוט מ-@BotFather'))}\n  ${c.dim(toVisualRtl('צור בוט ב-https://t.me/BotFather וקבל את הטוקן'))}`,
          validate: validateToken,
        })
        if (p.isCancel(val)) return undefined
        return String(val)
      })
      if (token === undefined) { p.outro(msg.cancelled); return undefined }
    }
  }

  // Chat ID
  if (needsTelegram(platform)) {
    if (flags['chat-id'] !== undefined) {
      const err = validateChatId(flags['chat-id'])
      if (err) throw new Error(`--chat-id: ${err}`)
      chatId = flags['chat-id']
    } else {
      chatId = await promptWithRetry(async () => {
        const val = await p.text({
          message: `${stepBadge(2, 3)} ${c.primary(toVisualRtl('מזהה הערוץ/קבוצה'))}\n  ${c.dim(toVisualRtl('ערוץ: מספר שלילי כמו ‎-1001234567890 | DM: מספר חיובי'))}`,
          placeholder: '-1001234567890',
          validate: validateChatId,
        })
        if (p.isCancel(val)) return undefined
        return String(val)
      })
      if (chatId === undefined) { p.outro(msg.cancelled); return undefined }
    }
  }

  // Mapbox token
  if (needsMapbox(platform)) {
    if (flags.mapbox !== undefined) {
      const err = validateMapboxToken(flags.mapbox)
      if (err) throw new Error(`--mapbox: ${err}`)
      mapbox = flags.mapbox
    } else {
      mapbox = await promptWithRetry(async () => {
        const val = await p.text({
          message: `${stepBadge(3, 3)} ${c.primary(toVisualRtl('טוקן Mapbox'))}\n  ${c.dim(toVisualRtl('חשבון חינמי: https://account.mapbox.com/access-tokens'))}`,
          placeholder: 'pk.eyJ...',
          validate: validateMapboxToken,
        })
        if (p.isCancel(val)) return undefined
        return String(val)
      })
      if (mapbox === undefined) { p.outro(msg.cancelled); return undefined }
    }
  }

  return buildRequiredResult(platform, { token, chatId, mapbox })
}

/**
 * Runs a prompt function in a retry loop.
 * @clack already handles re-prompting on validation failure within the same
 * prompt call, so this loop mainly exists to recover from unexpected errors.
 * Returns undefined if the user cancels.
 */
async function promptWithRetry(prompt: () => Promise<string | undefined>): Promise<string | undefined> {
  for (;;) {
    try {
      return await prompt()
    } catch (err) {
      const shouldRetry = await p.confirm({
        message: c.warning(toVisualRtl(`שגיאה בלתי צפויה: ${(err as Error).message} — לנסות שוב?`)),
        initialValue: true,
      })
      if (p.isCancel(shouldRetry) || !shouldRetry) return undefined
    }
  }
}
