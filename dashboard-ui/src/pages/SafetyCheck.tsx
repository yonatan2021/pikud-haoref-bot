import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Shield, Activity, Clock, CheckCircle, AlertTriangle, BellOff,
} from 'lucide-react';
import { api } from '../api/client';
import { KpiCard } from '../components/KpiCard';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { Skeleton } from '../components/Skeleton';

interface SafetyCheckData {
  kpis: {
    totalToday: number;
    totalWeek: number;
    totalMonth: number;
    responseRate: number;
    answers: { ok: number; help: number; dismissed: number };
    avgResponseTimeMs: number;
  };
  trend: Array<{ day: string; responseRate: number }>;
  recentPrompts: Array<{
    maskedUser: string;
    alertType: string;
    sentAt: string;
    answer: string;
    responseTimeSec: number | null;
  }>;
}

const ANSWER_BADGES: Record<string, { label: string; className: string }> = {
  ok: { label: '✅ בסדר', className: 'bg-green-500/20 text-green-400' },
  help: { label: '⚠️ עזרה', className: 'bg-amber-500/20 text-amber-400' },
  dismissed: { label: '🔇 נסגר', className: 'bg-zinc-500/20 text-zinc-400' },
  pending: { label: '⏳ ממתין', className: 'bg-blue-500/20 text-blue-400' },
  unknown: { label: '❓', className: 'bg-zinc-500/20 text-zinc-400' },
};

function formatResponseTime(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${Math.round(sec)} שנ׳`;
  if (sec < 3600) return `${Math.round(sec / 60)} דק׳`;
  return `${(sec / 3600).toFixed(1)} שע׳`;
}

function formatAvgMs(ms: number): string {
  if (ms === 0) return '—';
  const sec = ms / 1000;
  if (sec < 60) return `${Math.round(sec)} שנ׳`;
  if (sec < 3600) return `${Math.round(sec / 60)} דק׳`;
  return `${(sec / 3600).toFixed(1)} שע׳`;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-glass)] px-3 py-2 text-xs shadow-xl">
      <p className="text-[var(--color-text-secondary)]">{label}</p>
      <p className="font-bold text-[var(--color-text-primary)]">{payload[0].value}%</p>
    </div>
  );
}

export function SafetyCheck() {
  const prefersReducedMotion = useReducedMotion();
  const { data, isLoading } = useQuery<SafetyCheckData>({
    queryKey: ['safety-check'],
    queryFn: () => api.get<SafetyCheckData>('/api/stats/safety-check'),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-full min-h-[60vh]" />;
  }

  const { kpis, trend, recentPrompts } = data;

  const stagger = prefersReducedMotion ? {} : {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">בדיקת שלומות</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">סטטיסטיקות בטיחות ותגובות משתמשים</p>
          </div>
        </div>

        {/* KPI Grid — 6 cards, 3×2 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <motion.div {...stagger}>
            <KpiCard icon={Activity} label="שאלות השבוע" value={kpis.totalWeek} glow="blue"
              sub={`היום: ${kpis.totalToday} · החודש: ${kpis.totalMonth}`} />
          </motion.div>
          <motion.div {...stagger} transition={{ delay: 0.05 }}>
            <KpiCard icon={CheckCircle} label="אחוז תגובה" value={kpis.responseRate}
              sub="%" glow={kpis.responseRate >= 70 ? 'green' : 'amber'} />
          </motion.div>
          <motion.div {...stagger} transition={{ delay: 0.1 }}>
            <KpiCard icon={Clock} label="זמן תגובה ממוצע" value={0}
              sub={formatAvgMs(kpis.avgResponseTimeMs)} />
          </motion.div>
          <motion.div {...stagger} transition={{ delay: 0.15 }}>
            <KpiCard icon={CheckCircle} label="✅ בסדר" value={kpis.answers.ok} glow="green" />
          </motion.div>
          <motion.div {...stagger} transition={{ delay: 0.2 }}>
            <KpiCard icon={AlertTriangle} label="⚠️ זקוק לעזרה" value={kpis.answers.help} glow="amber" />
          </motion.div>
          <motion.div {...stagger} transition={{ delay: 0.25 }}>
            <KpiCard icon={BellOff} label="🔇 נסגר" value={kpis.answers.dismissed} />
          </motion.div>
        </div>

        {/* 7-day trend chart */}
        {trend.length > 0 && (
          <GlassCard>
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-text-secondary)]">אחוז תגובה — 7 ימים אחרונים</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ right: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                <YAxis orientation="right" width={40} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="responseRate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* Recent prompts table */}
        <GlassCard>
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text-secondary)]">שאלות אחרונות</h2>
          {recentPrompts.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-text-secondary)]">אין שאלות בטווח הנבחר</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                    <th className="px-3 py-2 text-start">משתמש</th>
                    <th className="px-3 py-2 text-start">סוג התראה</th>
                    <th className="px-3 py-2 text-start">תגובה</th>
                    <th className="px-3 py-2 text-start">זמן תגובה</th>
                    <th className="px-3 py-2 text-start">נשלח</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPrompts.map((p, i) => {
                    const badge = ANSWER_BADGES[p.answer] ?? ANSWER_BADGES.unknown;
                    return (
                      <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">{p.maskedUser}</td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">{p.alertType}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">{formatResponseTime(p.responseTimeSec)}</td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                          {new Date(p.sentAt + 'Z').toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  );
}
