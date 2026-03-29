export interface Flags {
  help?: boolean
  full?: boolean
  verify?: boolean
  update?: boolean
  whatsapp?: boolean
  token?: string
  'chat-id'?: string
  mapbox?: string
  output?: string
  dashboard?: string
  proxy?: string
  'invite-link'?: string
  whatsapp?: boolean
  [key: string]: string | boolean | undefined
}

/** Parse process.argv-style array into a Flags object. */
export function parseArgs(argv: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { flags.help = true; continue }
    if (arg === '--full')   { flags.full   = true; continue }
    if (arg === '--verify') { flags.verify = true; continue }
    if (arg === '--update') { flags.update = true; continue }
    if (arg === '--whatsapp') { flags.whatsapp = true; continue }
    const match = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.+))?$/)
    if (match) {
      const key = match[1]
      const val = match[2] !== undefined
        ? match[2]
        : (i + 1 < argv.length && !argv[i + 1].startsWith('-') ? argv[++i] : undefined)
      if (val !== undefined) flags[key] = val
    }
  }
  return flags
}
