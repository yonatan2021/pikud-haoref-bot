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
  { label: 'רגיל', emoji: '🔵', maxSeconds: Infinity },
];

export function getUrgencyForCountdown(seconds: number): UrgencyLevel {
  return URGENCY_LEVELS.find(u => seconds <= u.maxSeconds) ?? URGENCY_LEVELS[URGENCY_LEVELS.length - 1];
}

/**
 * Renders a 5-square emoji bar representing urgency level.
 * Most urgent (index 1) = 5 filled; least urgent (index 5) = 1 filled.
 * Returns empty string when countdown is unknown (≤0 or non-finite).
 */
export function renderCountdownBar(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '';
  const levelIndex = URGENCY_LEVELS.findIndex(u => seconds <= u.maxSeconds) + 1;
  const urgency = URGENCY_LEVELS[levelIndex - 1];
  const filled = 6 - levelIndex;
  return urgency.emoji.repeat(filled) + '⬜'.repeat(5 - filled);
}
