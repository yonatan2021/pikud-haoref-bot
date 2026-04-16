import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { api } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { AlertCategoryStats } from '../components/AlertCategoryStats';
import { Pagination } from '../components/Pagination';

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

// Maps alert type → display color for pie chart and badges.
const CATEGORY_COLORS: Record<string, string> = {
  missiles:                      '#ef4444',
  earthQuake:                    '#f97316',
  tsunami:                       '#0ea5e9',
  hazardousMaterials:            '#22c55e',
  terroristInfiltration:         '#f43f5e',
  radiologicalEvent:             '#a855f7',
  hostileAircraftIntrusion:      '#fb923c',
  newsFlash:                     '#3b82f6',
  general:                       '#64748b',
  missilesDrill:                 '#818cf8',
  earthQuakeDrill:               '#818cf8',
  tsunamiDrill:                  '#818cf8',
  hostileAircraftIntrusionDrill: '#818cf8',
  hazardousMaterialsDrill:       '#818cf8',
  terroristInfiltrationDrill:    '#818cf8',
  radiologicalEventDrill:        '#818cf8',
  generalDrill:                  '#818cf8',
  unknown:                       '#64748b',
};

// Hebrew labels for badge display in the table.
const CATEGORY_LABELS: Record<string, string> = {
  missiles:                      'טילים',
  earthQuake:                    'רעידת אדמה',
  tsunami:                       'צונאמי',
  hazardousMaterials:            'חומרים מסוכנים',
  terroristInfiltration:         'חדירת מחבלים',
  radiologicalEvent:             'אירוע רדיולוגי',
  hostileAircraftIntrusion:      'כלי טיס עוין',
  newsFlash:                     'חדשות',
  general:                       'כללי',
  missilesDrill:                 'תרגיל — טילים',
  earthQuakeDrill:               'תרגיל — רעידת אדמה',
  tsunamiDrill:                  'תרגיל — צונאמי',
  hostileAircraftIntrusionDrill: 'תרגיל — כלי טיס עוין',
  hazardousMaterialsDrill:       'תרגיל — חומרים מסוכנים',
  terroristInfiltrationDrill:    'תרגיל — חדירת מחבלים',
  radiologicalEventDrill:        'תרגיל — אירוע רדיולוגי',
  generalDrill:                  'תרגיל — כללי',
  unknown:                       'לא ידוע',
};

// Broad categories for the filter bar — each maps to multiple DB alert types on the backend.
const FILTER_CATEGORIES: Record<string, string> = {
  security:     '🔴 ביטחוני',
  nature:       '🌍 טבע',
  environmental: '☢️ סביבתי',
  drills:       '🔵 תרגיל',
  general:      '📢 כללי',
};

const DAYS_OPTIONS = [1, 7, 30, 90] as const;

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
  const category = searchParams.get('category') ?? '';
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
    ...(category && { category }),
    ...(city && { city }),
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  }).toString();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts', days, category, city, page],
    queryFn: () => api.get(`/api/stats/alerts?${queryString}`),
  });

  const { data: byCategory = [] } = useQuery<CategoryDay[]>({
    queryKey: ['alerts-by-category', days],
    queryFn: () => api.get('/api/stats/alerts/by-category'),
  });

  // Aggregate by-category into sorted stat rows with percentage
  const aggregated = Object.values(
    byCategory.reduce<Record<string, { type: string; name: string; count: number; color: string }>>((acc, row) => {
      if (!acc[row.type]) {
        acc[row.type] = {
          type: row.type,
          name: CATEGORY_LABELS[row.type] ?? row.type,
          count: 0,
          color: CATEGORY_COLORS[row.type] ?? '#64748b',
        };
      }
      acc[row.type].count += row.count;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);

  const statsTotal = aggregated.reduce((sum, r) => sum + r.count, 0);
  const statsData = aggregated.map(r => ({
    ...r,
    pct: statsTotal > 0 ? Math.round((r.count / statsTotal) * 100) : 0,
  }));

  const isFiltered = category !== '' || city !== '';

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-[var(--color-tg)] flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary leading-tight">היסטוריית התראות</h1>
            <p className="text-sm text-text-muted mt-0.5">רשומות התראות פיקוד העורף לפי תקופה וקטגוריה</p>
          </div>
        </div>

        {/* Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap gap-4 items-start">
            {/* Days filter pills */}
            <div className="flex flex-col gap-2">
              <span className="text-text-muted text-xs">תקופה</span>
              <div className="flex gap-2 flex-wrap">
                {DAYS_OPTIONS.map(d => (
                  <motion.button
                    key={d}
                    onClick={() => updateParam('days', String(d))}
                    whileTap={{ scale: 0.95 }}
                    aria-pressed={days === String(d)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                      days === String(d)
                        ? 'bg-amber-500 text-black border-amber-500 font-medium'
                        : 'bg-[var(--color-glass)] border-[var(--color-border)] text-text-secondary hover:text-text-primary hover:border-amber-500/50'
                    }`}
                  >
                    {d === 1 ? 'היום' : `${d} ימים`}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Category filter pills */}
            <div className="flex flex-col gap-2">
              <span className="text-text-muted text-xs">קטגוריה</span>
              <div className="flex gap-2 flex-wrap">
                <motion.button
                  onClick={() => updateParam('category', '')}
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={category === ''}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                    category === ''
                      ? 'bg-amber-500 text-black border-amber-500 font-medium'
                      : 'bg-[var(--color-glass)] border-[var(--color-border)] text-text-secondary hover:text-text-primary hover:border-amber-500/50'
                  }`}
                >
                  הכל
                </motion.button>
                {Object.entries(FILTER_CATEGORIES).map(([val, label]) => (
                  <motion.button
                    key={val}
                    onClick={() => updateParam('category', val)}
                    whileTap={{ scale: 0.95 }}
                    aria-pressed={category === val}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                      category === val
                        ? 'bg-amber-500 text-black border-amber-500 font-medium'
                        : 'bg-[var(--color-glass)] border-[var(--color-border)] text-text-secondary hover:text-text-primary hover:border-amber-500/50'
                    }`}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* City search */}
            <div className="flex flex-col gap-2 flex-1 min-w-40">
              <span className="text-text-muted text-xs">חיפוש עיר</span>
              <input
                type="text"
                value={city}
                onChange={e => updateParam('city', e.target.value)}
                placeholder="שם עיר..."
                className="bg-[var(--color-glass)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 transition-all"
              />
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts table - takes 2/3 width */}
          <GlassCard className="lg:col-span-2 overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">התראות</h2>
              <span className="text-text-muted text-xs">{alerts.length} תוצאות</span>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : alerts.length === 0 ? (
              <EmptyState
                icon={<BellOff size={36} />}
                message={isFiltered ? 'אין תוצאות עבור הסינון הנוכחי' : 'אין התראות לתקופה זו'}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-text-muted text-xs">
                        <th className="px-4 py-2 text-right font-medium">תאריך</th>
                        <th className="px-4 py-2 text-right font-medium">סוג</th>
                        <th className="px-4 py-2 text-right font-medium">ערים</th>
                        <th className="px-4 py-2 text-right font-medium">הוראות</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {alerts.map(alert => (
                          <motion.tr
                            key={alert.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                            className="border-b border-[var(--color-border)]/50 hover:bg-white/5 cursor-pointer transition-colors"
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
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>

                  {/* Expanded row rendered outside table to allow height animation */}
                  <AnimatePresence>
                    {expandedId !== null && (() => {
                      const alert = alerts.find(a => a.id === expandedId);
                      if (!alert) return null;
                      return (
                        <motion.div
                          key={`${expandedId}-exp`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-white/5 border-b border-[var(--color-border)]/50"
                        >
                          <div className="px-4 py-3">
                            <p className="text-text-secondary text-xs mb-2">
                              <strong>כל הערים:</strong> {alert.cities.join(', ')}
                            </p>
                            {alert.instructions && (
                              <p className="text-text-muted text-xs">{alert.instructions}</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })()}
                  </AnimatePresence>
                </div>

                <Pagination
                  page={page}
                  hasNext={alerts.length >= PAGE_SIZE}
                  onPrev={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page - 1)); return n; })}
                  onNext={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page + 1)); return n; })}
                />
              </>
            )}
          </GlassCard>

          {/* Category stats panel */}
          <AlertCategoryStats data={statsData} total={statsTotal} />
        </div>
      </div>
    </PageTransition>
  );
}
