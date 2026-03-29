import { type LucideIcon } from 'lucide-react';
import { type GlowVariant, GlassCard } from './ui/GlassCard';
import { AnimatedCounter } from './ui';

const glowCounterColor: Record<GlowVariant, string> = {
  amber: 'text-amber',
  blue:  'text-blue',
  green: 'text-green',
  none:  'text-text-primary',
};

interface TrendProps {
  /** Absolute change (positive = increase, negative = decrease). */
  delta: number;
  /** Short label shown after the arrow, e.g. "מאתמול". */
  label: string;
  /**
   * Whether an increase is visually good (green) or bad (red).
   * Defaults to true. Pass false for metrics where growth is undesirable
   * (e.g. alert counts — more alerts = worse situation).
   */
  positiveIsGood?: boolean;
}

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  glow?: GlowVariant;
  trend?: TrendProps;
}

export function KpiCard({ icon: Icon, label, value, sub, glow = 'none', trend }: KpiCardProps) {
  const counterColor = glowCounterColor[glow];

  let trendColor = 'text-text-muted';
  if (trend && trend.delta !== 0) {
    const isPositive = trend.delta > 0;
    const isGood = (trend.positiveIsGood ?? true) ? isPositive : !isPositive;
    trendColor = isGood ? 'text-green-400' : 'text-red-400';
  }

  const trendArrow = !trend || trend.delta === 0 ? '—' : trend.delta > 0 ? '▲' : '▼';

  return (
    <GlassCard glow={glow} hoverable className="p-5">
      <p className="text-text-secondary text-sm flex items-center gap-2">
        <Icon size={18} className="text-text-secondary" />
        {label}
      </p>
      <AnimatedCounter
        value={value}
        className={`text-3xl font-bold mt-2 ${counterColor}`}
        aria-label={`${label}: ${value.toLocaleString()}`}
      />
      {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
      {trend && (
        <p className={`text-xs mt-1 ${trendColor}`}>
          {trendArrow} {Math.abs(trend.delta)} {trend.label}
        </p>
      )}
    </GlassCard>
  );
}
