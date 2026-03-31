export const DEFAULT_ALERT_TYPE_HE: Readonly<Record<string, string>> = {
  missiles: 'התרעת טילים',
  earthQuake: 'רעידת אדמה',
  tsunami: 'צונאמי',
  hostileAircraftIntrusion: 'חדירת כלי טיס עוין',
  hazardousMaterials: 'חומרים מסוכנים',
  terroristInfiltration: 'חדירת מחבלים',
  radiologicalEvent: 'אירוע רדיולוגי',
  newsFlash: 'הודעה מיוחדת',
  general: 'התרעה כללית',
  missilesDrill: 'תרגיל — התרעת טילים',
  earthQuakeDrill: 'תרגיל — רעידת אדמה',
  tsunamiDrill: 'תרגיל — צונאמי',
  hostileAircraftIntrusionDrill: 'תרגיל — חדירת כלי טיס',
  hazardousMaterialsDrill: 'תרגיל — חומרים מסוכנים',
  terroristInfiltrationDrill: 'תרגיל — חדירת מחבלים',
  radiologicalEventDrill: 'תרגיל — אירוע רדיולוגי',
  generalDrill: 'תרגיל כללי',
  unknown: 'התרעה',
  whatsappForward: 'הודעה מ-WhatsApp',
};

export const DEFAULT_ALERT_TYPE_EMOJI: Readonly<Record<string, string>> = {
  missiles: '🔴',
  earthQuake: '🟠',
  tsunami: '🌊',
  hostileAircraftIntrusion: '✈️',
  hazardousMaterials: '☢️',
  terroristInfiltration: '⚠️',
  radiologicalEvent: '☢️',
  newsFlash: '📢',
  general: '⚠️',
  unknown: '⚠️',
  missilesDrill: '🔵',
  earthQuakeDrill: '🔵',
  tsunamiDrill: '🔵',
  hostileAircraftIntrusionDrill: '🔵',
  hazardousMaterialsDrill: '🔵',
  terroristInfiltrationDrill: '🔵',
  radiologicalEventDrill: '🔵',
  generalDrill: '🔵',
  whatsappForward: '📲',
};

export const DEFAULT_INSTRUCTIONS_PREFIX: Readonly<Record<string, string>> = {
  newsFlash: '',
  _default: '🛡',
};

export const ALL_ALERT_TYPES: ReadonlyArray<string> = Object.keys(DEFAULT_ALERT_TYPE_HE);
