import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Users, Bell, MapPin, Map, BarChart2 } from 'lucide-react';
import { api } from '../api/client';
import { KpiCard } from '../components/KpiCard';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';

interface OverviewStats {
  totalSubscribers: number;
  totalSubscriptions: number;
  alertsToday: number;
  alertsYesterday: number;
  alertsLast7Days: number;
  alertsPrev7Days: number;
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

// Maps alert type → display color. Covers all types stored in alert_history.
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

// Human-readable Hebrew labels for each alert type.
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

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  return `לפני ${Math.round(s / 3600)} שע׳`;
}

const kpiContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; fill?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-glass)] backdrop-blur-md border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs">
      {label && <div className="text-text-primary mb-1 font-medium">{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color ?? p.fill ?? '#94a3b8' }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

// Custom Y-axis tick for Hebrew city names. SVG <text> needs the `direction` attribute
// explicitly — CSS `direction: rtl` is not inherited by SVG presentation attributes.
function HebrewYAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="start"
        fill="#8b949e"
        fontSize={11}
        direction="rtl"
      >
        {payload?.value ?? ''}
      </text>
    </g>
  );
}

export function Overview() {
  const reducedMotion = useReducedMotion();

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

  const { data: byCategory = [], isLoading: byCategoryLoading } = useQuery<CategoryDay[]>({
    queryKey: ['alerts-by-category'],
    queryFn: () => api.get('/api/stats/alerts/by-category'),
    refetchInterval: 60_000,
  });

  const { data: topCities = [], isLoading: topCitiesLoading } = useQuery<TopCity[]>({
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

  const alertsToday = stats?.alertsToday ?? 0;
  const alertsYesterday = stats?.alertsYesterday ?? 0;
  const alertsLast7Days = stats?.alertsLast7Days ?? 0;
  const alertsPrev7Days = stats?.alertsPrev7Days ?? 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">לוח בקרה</h1>

        {/* KPI Cards */}
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            variants={reducedMotion ? undefined : kpiContainerVariants}
            initial={reducedMotion ? undefined : 'hidden'}
            animate={reducedMotion ? undefined : 'show'}
          >
            <motion.div variants={reducedMotion ? undefined : kpiItemVariants}>
              <KpiCard icon={Users} label="מנויים פעילים" value={stats?.totalSubscribers ?? 0} />
            </motion.div>
            <motion.div variants={reducedMotion ? undefined : kpiItemVariants}>
              <KpiCard
                icon={Bell}
                label="התראות היום"
                value={alertsToday}
                glow="amber"
                trend={{ delta: alertsToday - alertsYesterday, label: 'מאתמול', positiveIsGood: false }}
              />
            </motion.div>
            <motion.div variants={reducedMotion ? undefined : kpiItemVariants}>
              <KpiCard
                icon={Bell}
                label="התראות 7 ימים"
                value={alertsLast7Days}
                trend={{ delta: alertsLast7Days - alertsPrev7Days, label: 'משבוע קודם', positiveIsGood: false }}
              />
            </motion.div>
            <motion.div variants={reducedMotion ? undefined : kpiItemVariants}>
              <KpiCard icon={Map} label="Mapbox החודש" value={stats?.mapboxMonth ?? 0} sub="בקשות" />
            </motion.div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Alert Feed */}
          <GlassCard className="p-5">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Bell size={14} className="text-amber-400 flex-shrink-0" />
              <span>התראות היום (עדכון חי)</span>
            </h2>
            {liveAlerts.length === 0 ? (
              <EmptyState icon="🔔" message="אין התראות היום" />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {liveAlerts.map(alert => {
                    const alertColor = CATEGORY_COLORS[alert.type] ?? '#64748b';
                    return (
                      <motion.div
                        key={alert.id}
                        initial={reducedMotion ? undefined : { opacity: 0, x: 20 }}
                        animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                        exit={reducedMotion ? undefined : { opacity: 0, x: -20 }}
                        transition={reducedMotion ? undefined : { duration: 0.2 }}
                        className="flex items-start gap-3 p-3 bg-[var(--color-glass)] rounded-lg"
                      >
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5"
                          style={{
                            background: `var(--color-glass)`,
                            border: `1px solid ${alertColor}30`,
                            color: alertColor,
                          }}
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
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </GlassCard>

          {/* Top Cities */}
          <GlassCard className="p-5">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MapPin size={14} className="text-amber-400 flex-shrink-0" />
              <span>ערים מובילות (7 ימים)</span>
            </h2>
            {topCitiesLoading ? (
              <Skeleton className="h-[220px]" />
            ) : topCities.length === 0 ? (
              <EmptyState icon="📍" message="אין נתונים" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topCities} layout="vertical" margin={{ right: 8, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8b949e', fontSize: 11 }} />
                  <YAxis
                    orientation="right"
                    type="category"
                    dataKey="city"
                    tick={<HebrewYAxisTick />}
                    width={160}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="התראות" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>
        </div>

        {/* 7-day stacked bar chart */}
        <GlassCard className="p-5">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            <BarChart2 size={14} className="text-blue-400 flex-shrink-0" />
            <span>פילוח לפי סוג — 7 ימים אחרונים</span>
          </h2>
          {byCategoryLoading ? (
            <Skeleton className="h-[260px]" />
          ) : byCategory.length === 0 ? (
            <EmptyState icon="📊" message="אין נתונים לתקופה זו" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ right: 16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e', direction: 'rtl', paddingTop: 8 }} />
                {categoryTypes.map(type => (
                  <Bar
                    key={type}
                    dataKey={type}
                    stackId="a"
                    fill={CATEGORY_COLORS[type] ?? '#64748b'}
                    name={CATEGORY_LABELS[type] ?? type}
                    radius={type === categoryTypes[categoryTypes.length - 1] ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  );
}
