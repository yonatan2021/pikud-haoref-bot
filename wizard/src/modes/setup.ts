import path from 'node:path'
import * as p from '@clack/prompts'
import { c, msg, printProgressBar, printCompletionCard, type CompletionSummary } from '../ui/theme.js'
import { writeEnvFile } from '../env.js'
import { promptRequired } from '../steps/required.js'
import { promptOptional } from '../steps/optional.js'
import { promptDeploymentMode, printDockerInstructions, printNodeInstructions, runNodeSetup } from '../steps/deployment.js'
import { toVisualRtl } from '../ui/rtl.js'
import { promptPlatform, needsWhatsApp, needsTelegram, needsMapbox } from '../steps/platform.js'
import type { Flags } from '../args.js'

/** Fresh setup flow: platform → required → optional → deployment → write .env → completion card. */
export async function runSetup(flags: Flags): Promise<void> {
  const outputPath = path.resolve(String(flags.output ?? '.env'))

  printProgressBar(1, 4, 'בחירת פלטפורמה')
  const platform = await promptPlatform(flags)
  if (!platform) { p.outro(msg.cancelled); return }

  printProgressBar(2, 4, 'הגדרות חובה')
  const required = await promptRequired(platform, flags)
  if (!required) { p.outro(msg.cancelled); return }

  printProgressBar(3, 4, 'הגדרות אופציונליות')
  const optional = await promptOptional(flags, !!flags.full, platform)
  if (!optional) { p.outro(msg.cancelled); return }

  printProgressBar(4, 4, 'שיטת פריסה')
  const mode = await promptDeploymentMode()
  if (!mode) { p.outro(msg.cancelled); return }

  // Build env vars object (immutable construction)
  const vars: Record<string, string> = {
    ...(required.token  ? { TELEGRAM_BOT_TOKEN:  required.token }  : {}),
    ...(required.chatId ? { TELEGRAM_CHAT_ID:    required.chatId } : {}),
    ...(required.mapbox ? { MAPBOX_ACCESS_TOKEN: required.mapbox } : {}),
    ...(needsWhatsApp(platform) ? { WHATSAPP_ENABLED: 'true' } : {}),
    ...(optional.DASHBOARD_SECRET      ? { DASHBOARD_SECRET:              optional.DASHBOARD_SECRET }      : {}),
    ...(optional.PROXY_URL             ? { PROXY_URL:                     optional.PROXY_URL }             : {}),
    ...(optional.TELEGRAM_INVITE_LINK  ? { TELEGRAM_INVITE_LINK:          optional.TELEGRAM_INVITE_LINK }  : {}),
    ...(optional.TELEGRAM_TOPIC_ID_SECURITY      ? { TELEGRAM_TOPIC_ID_SECURITY:      optional.TELEGRAM_TOPIC_ID_SECURITY }      : {}),
    ...(optional.TELEGRAM_TOPIC_ID_NATURE        ? { TELEGRAM_TOPIC_ID_NATURE:        optional.TELEGRAM_TOPIC_ID_NATURE }        : {}),
    ...(optional.TELEGRAM_TOPIC_ID_ENVIRONMENTAL ? { TELEGRAM_TOPIC_ID_ENVIRONMENTAL: optional.TELEGRAM_TOPIC_ID_ENVIRONMENTAL } : {}),
    ...(optional.TELEGRAM_TOPIC_ID_DRILLS        ? { TELEGRAM_TOPIC_ID_DRILLS:        optional.TELEGRAM_TOPIC_ID_DRILLS }        : {}),
    ...(optional.TELEGRAM_TOPIC_ID_GENERAL       ? { TELEGRAM_TOPIC_ID_GENERAL:       optional.TELEGRAM_TOPIC_ID_GENERAL }       : {}),
  }

  writeEnvFile(outputPath, vars)

  // Print completion card with summary
  const summary: CompletionSummary = {
    telegram:   needsTelegram(platform) && !!required.token,
    mapbox:     needsMapbox(platform)   && !!required.mapbox,
    whatsapp:   needsWhatsApp(platform),
    dashboard:  !!optional.DASHBOARD_SECRET,
    inviteLink: !!optional.TELEGRAM_INVITE_LINK,
    proxy:      !!optional.PROXY_URL,
  }
  printCompletionCard(summary, outputPath, mode)

  if (mode === 'docker') {
    printDockerInstructions(outputPath, platform)
  } else {
    try {
      await runNodeSetup(outputPath, platform, undefined, flags['install-dir'])
    } catch (err) {
      p.log.error((err as Error).message)
      printNodeInstructions(platform, flags['install-dir'])
      p.outro(c.warning(toVisualRtl('ההגדרה הושלמה חלקית — קובץ ה-.env נכתב, אך ההתקנה האוטומטית נכשלה')))
      return
    }
  }

  p.outro(msg.allDone)
}
