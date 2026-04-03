export interface UrgencyLevel {
  label: string;
  emoji: string;
  maxSeconds: number;
}

export const URGENCY_LEVELS: readonly UrgencyLevel[] = [
  { label: 'מיידי', emoji: '🔴', maxSeconds: 15 },
  { label: 'דחוף', emoji: '🟠', maxSeconds: 30 },
  { label: 'מהיר', emoji: '🟡', maxSeconds: 60 },
  { label: 'מתון', emoji: '🟢', maxSeconds: 180 },
  { label: 'רגיל', emoji: '⚪', maxSeconds: Infinity },
];

export function getUrgencyForCountdown(seconds: number): UrgencyLevel {
  return URGENCY_LEVELS.find(u => seconds <= u.maxSeconds) ?? URGENCY_LEVELS[URGENCY_LEVELS.length - 1];
}
