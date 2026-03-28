import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';

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

const DAYS_OPTIONS = [
  { value: '1', label: 'היום' },
  { value: '7', label: '7 ימים' },
  { value: '30', label: '30 ימים' },
  { value: '90', label: '90 ימים' },
];

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  return `לפני ${Math.round(s / 3600)} שע׳`;
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL');
}

const PAGE_SIZE = 50;

export function Alerts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const days = searchParams.get('days') ?? '7';
  const type = searchParams.get('type') ?? '';
  const city = searchParams.get('city') ?? '';
  const page = parseInt(searchParams.get('page') ?? '0', 10);

  const updateParam = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page'); // reset pagination on filter change
      return next;
    });
  };

  const queryString = new URLSearchParams({
    days,
    ...(type && { type }),
    ...(city && { city }),
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  }).toString();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts', days, type, city, page],
    queryFn: () => api.get(`/api/stats/alerts?${queryString}`),
  });

  const { data: byCategory = [] } = useQuery<CategoryDay[]>({
    queryKey: ['alerts-by-category', days],
    queryFn: () => api.get('/api/stats/alerts/by-category'),
  });

  // Aggregate for pie chart
  const pieData = Object.values(
    byCategory.reduce<Record<string, { name: string; value: number; fill: string }>>((acc, row) => {
      if (!acc[row.type]) {
        acc[row.type] = {
          name: CATEGORY_LABELS[row.type] ?? row.type,
          value: 0,
          fill: CATEGORY_COLORS[row.type] ?? '#64748b',
        };
      }
      acc[row.type].value += row.count;
      return acc;
    }, {})
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">היסטוריית התראות</h1>

      {/* Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-xs">תקופה</label>
          <select
            value={days}
            onChange={e => updateParam('days', e.target.value)}
            className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
          >
            {DAYS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-xs">סוג</label>
          <select
            value={type}
            onChange={e => updateParam('type', e.target.value)}
            className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
          >
            <option value="">הכל</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-text-muted text-xs">חיפוש עיר</label>
          <input
            type="text"
            value={city}
            onChange={e => updateParam('city', e.target.value)}
            placeholder="שם עיר..."
            className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts table - takes 2/3 width */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">התראות</h2>
            <span className="text-text-muted text-xs">{alerts.length} תוצאות</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState icon="🔔" message="אין התראות לתקופה זו" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-xs">
                      <th className="px-4 py-2 text-right font-medium">תאריך</th>
                      <th className="px-4 py-2 text-right font-medium">סוג</th>
                      <th className="px-4 py-2 text-right font-medium">ערים</th>
                      <th className="px-4 py-2 text-right font-medium">הוראות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(alert => (
                      <>
                        <tr
                          key={alert.id}
                          onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                          className="border-b border-border/50 hover:bg-base/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap" title={exactTime(alert.fired_at)}>
                            {relTime(alert.fired_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: `${CATEGORY_COLORS[alert.type] ?? '#64748b'}22`, color: CATEGORY_COLORS[alert.type] ?? '#94a3b8' }}
                            >
                              {CATEGORY_LABELS[alert.type] ?? alert.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-text-secondary text-xs">
                              {alert.cities.slice(0, 2).join(', ')}
                              {alert.cities.length > 2 && (
                                <span className="text-text-muted"> +{alert.cities.length - 2}</span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-muted text-xs max-w-xs truncate">
                            {alert.instructions?.slice(0, 60) ?? '—'}
                          </td>
                        </tr>
                        {expandedId === alert.id && (
                          <tr key={`${alert.id}-exp`} className="bg-base/30">
                            <td colSpan={4} className="px-4 py-3">
                              <p className="text-text-secondary text-xs mb-2">
                                <strong>כל הערים:</strong> {alert.cities.join(', ')}
                              </p>
                              {alert.instructions && (
                                <p className="text-text-muted text-xs">{alert.instructions}</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <button
                  disabled={page === 0}
                  onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page - 1)); return n; })}
                  className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40"
                >
                  ← הקודם
                </button>
                <span className="text-text-muted text-xs">עמוד {page + 1}</span>
                <button
                  disabled={alerts.length < PAGE_SIZE}
                  onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page + 1)); return n; })}
                  className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40"
                >
                  הבא →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Pie chart */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-semibold text-text-primary mb-4">התפלגות לפי סוג</h2>
          {pieData.length === 0 ? (
            <EmptyState icon="📊" message="אין נתונים" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" outerRadius={90} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                  formatter={(value) => [`${value} התראות`]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
