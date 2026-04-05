import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Radio, Bell, WifiOff, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { AnimatedCounter, LiveDot } from '../components/ui';

interface Health {
  uptime: number;
  lastAlertAt: string | null;
  lastPollAt: string | null;
  alertsToday: number;
}

function rel(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  return `לפני ${Math.round(s / 3600)} שע׳`;
}

export function StatusStrip({ onUptime }: { onUptime: (u: number) => void }) {
  const { data, isError, isLoading } = useQuery<Health>({
    queryKey: ['health'],
    queryFn: () => api.get('/api/stats/health'),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (data?.uptime !== undefined) onUptime(data.uptime);
  }, [data?.uptime, onUptime]);

  if (isLoading) {
    return (
      <div className="bg-[var(--color-glass)] backdrop-blur-sm border-b border-border px-4 py-1.5 text-xs text-text-muted flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" />
        מתחבר...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-[var(--color-glass)] backdrop-blur-sm border-b border-red-700/50 px-4 py-1 text-xs text-red-300 flex items-center gap-1.5">
        <WifiOff size={12} />
        אין חיבור לשרת
      </div>
    );
  }

  return (
    <div
      className="bg-[var(--color-glass)] backdrop-blur-sm border-b border-border border-t-2 px-4 py-1.5 flex items-center gap-6 text-xs text-text-secondary"
      style={{ borderTopColor: 'color-mix(in srgb, var(--color-amber) 30%, transparent)' }}
    >
      <span className="flex items-center gap-1.5">
        <LiveDot color="green" size="sm" />
        מחובר
      </span>
      <span className="flex items-center gap-1.5">
        <Radio size={12} />
        {data?.lastPollAt ? rel(data.lastPollAt) : '—'}
      </span>
      <span className="flex items-center gap-1.5">
        <Bell size={12} />
        {data?.lastAlertAt ? rel(data.lastAlertAt) : 'אין היום'}
      </span>
      <span className="flex items-center gap-1">
        התראות היום:
        <AnimatedCounter value={data?.alertsToday ?? 0} className="text-amber font-bold mr-1" />
      </span>
    </div>
  );
}
