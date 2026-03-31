import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { c, msg, printProgressBar, printCompletionCard, type CompletionSummary } from '../ui/theme.js'
import { writeFullEnvFile } from '../env.js'
import { promptProfile, promptProfileFields, fieldsForProfile } from '../steps/profile.js'
import { promptDeploymentMode, printDockerInstructions, printNodeInstructions, runNodeSetup, resolveTargetPath } from '../steps/deployment.js'
import { toVisualRtl } from '../ui/rtl.js'
import { promptPlatform, needsWhatsApp, needsTelegram, needsMapbox } from '../steps/platform.js'
import type { Flags } from '../args.js'

/** Fresh setup flow: platform → profile → fields → deployment → write .env → completion card. */
export async function runSetup(flags: Flags): Promise<void> {
  const outputPath = path.resolve(String(flags.output ?? '.env'))

  printProgressBar(1, 4, 'בחירת פלטפורמה')
  const platform = await promptPlatform(flags)
  if (!platform) { p.outro(msg.cancelled); return }

  printProgressBar(2, 4, 'בחירת פרופיל')
  const profile = await promptProfile(flags)
  if (!profile) { p.outro(msg.cancelled); return }

  printProgressBar(3, 4, 'הגדרת משתנים')
  const fields = fieldsForProfile(profile, platform)
  const vars = await promptProfileFields(fields, flags)
  if (!vars) { p.outro(msg.cancelled); return }

  // Auto-set WHATSAPP_ENABLED for WhatsApp platforms when not already set
  if (needsWhatsApp(platform) && !vars.WHATSAPP_ENABLED) {
    vars.WHATSAPP_ENABLED = 'true'
  }

  printProgressBar(4, 4, 'שיטת פריסה')
  const mode = await promptDeploymentMode()
  if (!mode) { p.outro(msg.cancelled); return }

  writeFullEnvFile(outputPath, vars)

  // For node mode, the .env's final resting place is inside the cloned repo,
  // not CWD. Compute that path now so the completion card shows the right location.
  let cardEnvPath = outputPath
  if (mode === 'node') {
    try {
      cardEnvPath = path.join(resolveTargetPath(flags['install-dir']), '.env')
    } catch { /* non-ASCII install path — keep CWD path in card */ }
  }

  // Print completion card with summary
  const summary: CompletionSummary = {
    telegram:   needsTelegram(platform) && !!vars.TELEGRAM_BOT_TOKEN,
    mapbox:     needsMapbox(platform)   && !!vars.MAPBOX_ACCESS_TOKEN,
    whatsapp:   needsWhatsApp(platform),
    dashboard:  !!vars.DASHBOARD_SECRET,
    inviteLink: !!vars.TELEGRAM_INVITE_LINK,
    proxy:      !!vars.PROXY_URL,
  }
  printCompletionCard(summary, cardEnvPath, mode)

  if (mode === 'docker') {
    printDockerInstructions(outputPath, platform)
  } else {
    try {
      await runNodeSetup(outputPath, platform, undefined, flags['install-dir'])
      // Remove the temporary CWD copy now that the .env lives inside the cloned repo.
      if (path.resolve(outputPath) !== path.resolve(cardEnvPath)) {
        try { fs.unlinkSync(outputPath) } catch { /* best-effort; leave it if deletion fails */ }
      }
    } catch (err) {
      p.log.error((err as Error).message)
      printNodeInstructions(platform, flags['install-dir'])
      p.outro(c.warning(toVisualRtl('ההגדרה הושלמה חלקית — קובץ ה-.env נכתב, אך ההתקנה האוטומטית נכשלה')))
      return
    }
  }

  p.outro(msg.allDone)
}
