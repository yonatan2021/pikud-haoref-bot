import { type LucideIcon } from 'lucide-react';
import { GlassCard, AnimatedCounter } from './ui';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  glow?: 'amber' | 'blue' | 'green' | 'none';
}

export function KpiCard({ icon: Icon, label, value, sub, glow = 'none' }: KpiCardProps) {
  return (
    <GlassCard glow={glow} hoverable className="p-5">
      <p className="text-text-secondary text-sm flex items-center gap-2">
        <Icon size={18} className="text-text-secondary" />
        {label}
      </p>
      <AnimatedCounter
        value={value}
        className={`text-3xl font-bold mt-2 ${glow === 'amber' ? 'text-amber' : 'text-text-primary'}`}
      />
      {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
    </GlassCard>
  );
}
