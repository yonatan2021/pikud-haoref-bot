import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Users, Bell, MapPin, Map } from 'lucide-react';
import { api } from '../api/client';
import { KpiCard } from '../components/KpiCard';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';

interface OverviewStats {
  totalSubscribers: number;
  totalSubscriptions: number;
  alertsToday: number;
  alertsLast7Days: number;
  mapboxMonth: number;
}

interface Alert {
  id: number;
  type: string;
  cities: string[];
  instructions: string;
  fired_at: string;
}

interface CategoryDay {
  type: string;
  count: number;
  day: string;
}

interface TopCity {
  city: string;
  count: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  missiles: '#ef4444',
  earthQuake: '#f97316',
  newsFlash: '#3b82f6',
  drills: '#8b5cf6',
  hazardousMaterials: '#22c55e',
};

const CATEGORY_LABELS: Record<string, string> = {
  missiles: 'טילים',
  earthQuake: 'רעידת אדמה',
  newsFlash: 'חדשות',
  drills: 'תרגיל',
  hazardousMaterials: 'חומרים מסוכנים',
};

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  return `לפני ${Math.round(s / 3600)} שע׳`;
}

export function Overview() {
  const { data: stats, isLoading: statsLoading } = useQuery<OverviewStats>({
    queryKey: ['overview'],
    queryFn: () => api.get('/api/stats/overview'),
    refetchInterval: 30_000,
  });

  const { data: liveAlerts = [] } = useQuery<Alert[]>({
    queryKey: ['alerts-live'],
    queryFn: () => api.get('/api/stats/alerts?days=1&limit=10'),
    refetchInterval: 5_000,
  });

  const { data: byCategory = [] } = useQuery<CategoryDay[]>({
    queryKey: ['alerts-by-category'],
    queryFn: () => api.get('/api/stats/alerts/by-category'),
    refetchInterval: 60_000,
  });

  const { data: topCities = [] } = useQuery<TopCity[]>({
    queryKey: ['top-cities'],
    queryFn: () => api.get('/api/stats/alerts/top-cities'),
    refetchInterval: 60_000,
  });

  // Aggregate by-category into chart-friendly format: { day, missiles: N, earthQuake: N, ... }
  const chartData = Object.values(
    byCategory.reduce<Record<string, Record<string, string | number>>>((acc, row) => {
      if (!acc[row.day]) acc[row.day] = { day: row.day };
      acc[row.day][row.type] = (acc[row.day][row.type] as number || 0) + row.count;
      return acc;
    }, {})
  );

  const categoryTypes = [...new Set(byCategory.map(r => r.type))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">לוח בקרה</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard icon={Users} label="מנויים פעילים" value={stats?.totalSubscribers ?? 0} />
            <KpiCard icon={Bell} label="התראות היום" value={stats?.alertsToday ?? 0} glow="amber" />
            <KpiCard icon={MapPin} label="מנויים לערים" value={stats?.totalSubscriptions ?? 0} />
            <KpiCard icon={Map} label="Mapbox החודש" value={stats?.mapboxMonth ?? 0} sub="בקשות" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Alert Feed */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            <span>🔴</span> התראות היום (עדכון חי)
          </h2>
          {liveAlerts.length === 0 ? (
            <EmptyState icon="🔔" message="אין התראות היום" />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {liveAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 p-3 bg-base rounded-lg">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5"
                    style={{ background: `${CATEGORY_COLORS[alert.type] ?? '#64748b'}22`, color: CATEGORY_COLORS[alert.type] ?? '#94a3b8' }}
                  >
                    {CATEGORY_LABELS[alert.type] ?? alert.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-secondary text-xs truncate">
                      {alert.cities.slice(0, 3).join(', ')}
                      {alert.cities.length > 3 && ` ו-${alert.cities.length - 3} נוספות`}
                    </p>
                  </div>
                  <span className="text-text-muted text-xs flex-shrink-0">{relTime(alert.fired_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Cities */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-semibold text-text-primary mb-4">🏙️ ערים מובילות (7 ימים)</h2>
          {topCities.length === 0 ? (
            <EmptyState icon="📍" message="אין נתונים" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topCities} layout="vertical" margin={{ right: 16, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <YAxis type="category" dataKey="city" tick={{ fill: '#8b949e', fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                  labelStyle={{ color: '#f0f6fc' }}
                  itemStyle={{ color: '#f59e0b' }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="התראות" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 7-day stacked bar chart */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="font-semibold text-text-primary mb-4">📊 התראות 7 ימים אחרונים</h2>
        {byCategory.length === 0 ? (
          <EmptyState icon="📊" message="אין נתונים לתקופה זו" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                labelStyle={{ color: '#f0f6fc' }}
              />
              {categoryTypes.map(type => (
                <Bar
                  key={type}
                  dataKey={type}
                  stackId="a"
                  fill={CATEGORY_COLORS[type] ?? '#64748b'}
                  name={CATEGORY_LABELS[type] ?? type}
                  radius={categoryTypes.indexOf(type) === categoryTypes.length - 1 ? [4, 4, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
