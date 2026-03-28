import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useEffect, useState } from 'react';

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
  const { data, isError } = useQuery<Health>({
    queryKey: ['health'],
    queryFn: () => api.get('/api/stats/health'),
    refetchInterval: 5000,
  });
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c <= 1 ? 5 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.uptime !== undefined) onUptime(data.uptime);
  }, [data?.uptime, onUptime]);

  if (isError) {
    return (
      <div className="bg-red-900/40 border-b border-red-700/50 px-4 py-1 text-xs text-red-300">
        ⚠️ אין חיבור לשרת
      </div>
    );
  }

  return (
    <div className="bg-surface border-b border-border px-4 py-1.5 flex items-center gap-6 text-xs text-text-secondary">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        מחובר
      </span>
      <span>📡 {data?.lastPollAt ? rel(data.lastPollAt) : '—'}</span>
      <span>🔴 {data?.lastAlertAt ? rel(data.lastAlertAt) : 'אין היום'}</span>
      <span>
        התראות היום:{' '}
        <strong className="text-amber">{data?.alertsToday ?? 0}</strong>
      </span>
      <span className="mr-auto text-text-muted">מתרענן בעוד {countdown}שנ׳</span>
    </div>
  );
}
