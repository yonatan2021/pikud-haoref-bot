import path from 'node:path'
import * as p from '@clack/prompts'
import { c, msg } from '../ui/theme.js'
import { writeEnvFile } from '../env.js'
import { promptRequired } from '../steps/required.js'
import { promptOptional } from '../steps/optional.js'
import { promptDeploymentMode, printDockerInstructions, printNodeInstructions } from '../steps/deployment.js'
import { promptPlatform } from '../steps/platform.js'
import type { Flags } from '../args.js'

/** Fresh setup flow: required → optional → deployment → write .env → outro. */
export async function runSetup(flags: Flags): Promise<void> {
  const outputPath = path.resolve(String(flags.output ?? '.env'))

  const platform = await promptPlatform(flags)
  if (!platform) { p.outro(msg.cancelled); return }

  const required = await promptRequired(platform, flags)
  if (!required) { p.outro(msg.cancelled); return }

  const optional = await promptOptional(flags, !!flags.full)
  if (!optional) { p.outro(msg.cancelled); return }

  const mode = await promptDeploymentMode()
  if (!mode) { p.outro(msg.cancelled); return }

  // Build env vars object (immutable construction)
  const vars: Record<string, string> = {
    ...(required.token  ? { TELEGRAM_BOT_TOKEN:  required.token }  : {}),
    ...(required.chatId ? { TELEGRAM_CHAT_ID:    required.chatId } : {}),
    ...(required.mapbox ? { MAPBOX_ACCESS_TOKEN: required.mapbox } : {}),
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
  p.log.success(msg.envWritten(outputPath))

  if (mode === 'docker') {
    printDockerInstructions(outputPath)
  } else {
    printNodeInstructions()
  }

  p.outro(msg.allDone)
}
