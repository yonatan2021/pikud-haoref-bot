import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';

interface Settings {
  alert_window_seconds?: string;
  mapbox_monthly_limit?: string;
  mapbox_skip_drills?: string;
  quiet_hours_global?: string;
  health_port?: string;
  dashboard_port?: string;
}

interface Overview {
  mapboxMonth: number;
}

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleSwitch({ value, onChange }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-amber' : 'bg-white/10'}`}
      role="switch"
      aria-checked={value}
    >
      <motion.span
        layout
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
        animate={{ x: value ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

export function Settings() {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings'),
  });

  const { data: overview } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get('/api/stats/overview'),
  });

  const [form, setForm] = useState<Settings>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle');

  useEffect(() => {
    if (settings) {
      setForm({
        alert_window_seconds: settings.alert_window_seconds ?? '120',
        mapbox_monthly_limit: settings.mapbox_monthly_limit ?? '',
        mapbox_skip_drills: settings.mapbox_skip_drills ?? 'false',
        quiet_hours_global: settings.quiet_hours_global ?? 'false',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (form.alert_window_seconds) body.alert_window_seconds = form.alert_window_seconds;
      if (form.mapbox_monthly_limit !== undefined) body.mapbox_monthly_limit = form.mapbox_monthly_limit;
      if (form.mapbox_skip_drills) body.mapbox_skip_drills = form.mapbox_skip_drills;
      if (form.quiet_hours_global) body.quiet_hours_global = form.quiet_hours_global;
      return api.patch('/api/settings', body);
    },
    onMutate: () => setSaveState('loading'),
    onSuccess: () => {
      toast.success('הגדרות נשמרו');
      setDirty(false);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    },
    onError: () => {
      toast.error('שגיאה בשמירה');
      setSaveState('idle');
    },
  });

  const updateField = (key: keyof Settings, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const mapboxLimit = parseInt(form.mapbox_monthly_limit ?? '0', 10);
  const mapboxUsed = overview?.mapboxMonth ?? 0;
  const mapboxPct = mapboxLimit > 0 ? Math.min((mapboxUsed / mapboxLimit) * 100, 100) : 0;
  const mapboxColor = mapboxPct > 90 ? 'bg-red-500' : mapboxPct > 70 ? 'bg-amber' : 'bg-green';

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">הגדרות</h1>
          <button
            disabled={!dirty || saveState === 'loading'}
            onClick={() => saveMutation.mutate()}
            className={`px-6 py-2 text-sm font-bold rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2 min-w-[140px] justify-center ${
              saveState === 'success'
                ? 'bg-green text-white'
                : 'bg-amber hover:bg-amber-dark text-black'
            }`}
          >
            <AnimatePresence mode="wait">
              {saveState === 'idle' && (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  שמור שינויים
                </motion.span>
              )}
              {saveState === 'loading' && (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  שומר...
                </motion.span>
              )}
              {saveState === 'success' && (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  נשמר!
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Bot Settings */}
        <GlassCard className="p-4 space-y-5">
          <h2 className="font-semibold text-text-primary border-b border-border pb-3">הגדרות בוט</h2>

          <div>
            <label className="text-text-secondary text-sm block mb-1">חלון עדכון התראה (שניות)</label>
            <input
              type="number"
              min={30}
              max={600}
              value={form.alert_window_seconds ?? '120'}
              onChange={e => updateField('alert_window_seconds', e.target.value)}
              className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
            />
            <p className="text-text-muted text-xs mt-1">כמה שניות לאפשר עדכון לאותה התראה (30–600)</p>
          </div>

          <div>
            <label className="text-text-secondary text-sm block mb-1">מכסת Mapbox חודשית</label>
            <input
              type="number"
              min={0}
              value={form.mapbox_monthly_limit ?? ''}
              onChange={e => updateField('mapbox_monthly_limit', e.target.value)}
              placeholder="ללא מגבלה"
              className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
            />
            {mapboxLimit > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>{mapboxUsed.toLocaleString()} / {mapboxLimit.toLocaleString()} בקשות</span>
                  <span>{mapboxPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-base rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${mapboxColor}`} style={{ width: `${mapboxPct}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-text-secondary text-sm">דלג על מפות לתרגילים</label>
              <p className="text-text-muted text-xs">לא להציג מפת Mapbox בהתראות תרגיל</p>
            </div>
            <ToggleSwitch
              value={form.mapbox_skip_drills === 'true'}
              onChange={v => updateField('mapbox_skip_drills', v ? 'true' : 'false')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-text-secondary text-sm">שעות שקט גלובליות</label>
              <p className="text-text-muted text-xs">כבה התראות לכל המנויים בלילה</p>
            </div>
            <ToggleSwitch
              value={form.quiet_hours_global === 'true'}
              onChange={v => updateField('quiet_hours_global', v ? 'true' : 'false')}
            />
          </div>
        </GlassCard>

        {/* Read-only info */}
        <GlassCard className="p-4 space-y-3">
          <h2 className="font-semibold text-text-primary border-b border-border pb-3">מידע מערכת</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-text-muted text-xs block mb-1">Health Port</label>
              <input
                disabled
                value={settings?.health_port ?? '3000'}
                className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-muted w-full opacity-60"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs block mb-1">Dashboard Port</label>
              <input
                disabled
                value={settings?.dashboard_port ?? '4000'}
                className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-muted w-full opacity-60"
              />
            </div>
          </div>
        </GlassCard>

        {/* DB Backup */}
        <GlassCard className="p-4">
          <h2 className="font-semibold text-text-primary mb-3">גיבוי מסד נתונים</h2>
          <p className="text-text-muted text-sm mb-4">הורד עותק מלא של מסד הנתונים SQLite</p>
          <button
            onClick={() => { window.location.href = '/api/settings/backup'; }}
            className="px-6 py-2 bg-surface border border-border hover:bg-base text-text-secondary text-sm rounded-lg"
          >
            ⬇️ הורד גיבוי
          </button>
        </GlassCard>
      </div>
    </PageTransition>
  );
}
