import * as p from '@clack/prompts'
import { c, printSectionCard } from '../ui/theme.js'
import { toVisualRtl } from '../ui/rtl.js'
import type { Flags } from '../args.js'

export type Platform = 'telegram' | 'whatsapp' | 'both'

/**
 * Derives platform from CLI flags without any interactive prompt.
 * Returns undefined when interactive selection is required.
 */
export function derivePlatformFromFlags(flags: Flags): Platform | undefined {
  const hasTelegram = flags.token !== undefined || flags['chat-id'] !== undefined
  const hasWhatsapp = flags.whatsapp === true
  if (hasWhatsapp && hasTelegram) return 'both'
  if (hasWhatsapp) return 'whatsapp'
  if (hasTelegram) return 'telegram'
  return undefined
}

/**
 * Prompts the user to choose a messaging platform.
 * Returns undefined if the user cancels (Ctrl+C).
 */
export async function promptPlatform(flags: Flags): Promise<Platform | undefined> {
  const derived = derivePlatformFromFlags(flags)
  if (derived !== undefined) return derived

  printSectionCard('🌐', 'בחירת פלטפורמה', 'בחר את הפלטפורמה שדרכה הבוט ישלח התראות. ניתן לשנות בכל עת עם --update')
  const choice = await p.select<Platform>({
    message: c.primary(toVisualRtl('באיזו פלטפורמה הבוט ישתמש?')),
    options: [
      {
        value: 'telegram' as Platform,
        label: c.bold('Telegram ' + toVisualRtl('בלבד')),
        hint: toVisualRtl('בוט + ערוץ'),
      },
      {
        value: 'whatsapp' as Platform,
        label: c.bold('WhatsApp ' + toVisualRtl('בלבד')),
        hint: toVisualRtl('אימות QR — אין צורך בטוקן'),
      },
      {
        value: 'both' as Platform,
        label: c.bold(toVisualRtl('שתי הפלטפורמות')),
        hint: 'Telegram + WhatsApp ' + toVisualRtl('במקביל'),
      },
    ],
  })
  if (p.isCancel(choice)) return undefined
  return choice
}

/** Returns true when the platform requires Telegram credentials. */
export function needsTelegram(platform: Platform): boolean {
  return platform === 'telegram' || platform === 'both'
}

/** Returns true when the platform requires WhatsApp. */
export function needsWhatsApp(platform: Platform): boolean {
  return platform === 'whatsapp' || platform === 'both'
}

/** Returns true when the platform requires Mapbox (map images via Telegram).
 *  Mirrors needsTelegram today — kept separate for future extensibility
 *  (e.g. WhatsApp map image attachments) without requiring callers to change. */
export function needsMapbox(platform: Platform): boolean {
  return platform === 'telegram' || platform === 'both'
}
