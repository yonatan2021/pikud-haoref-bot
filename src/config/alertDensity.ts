/**
 * Compares today's alert count against the 90th percentile of this month's
 * daily counts. Returns 'חריג' if today is strictly above the p90 threshold,
 * 'רגיל' otherwise, or null when there are fewer than 5 data points.
 */
export function getDensityLabel(
  todayCount: number,
  monthlyCounts: number[],
): 'חריג' | 'רגיל' | null {
  if (monthlyCounts.length < 5) return null;
  const sorted = [...monthlyCounts].sort((a, b) => a - b);
  const p90Index = Math.floor(sorted.length * 0.9);
  const p90 = sorted[p90Index] ?? sorted[sorted.length - 1]!;
  return todayCount > p90 ? 'חריג' : 'רגיל';
}
