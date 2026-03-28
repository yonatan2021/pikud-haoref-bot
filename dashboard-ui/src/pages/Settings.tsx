import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { Skeleton } from '../components/Skeleton';

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
    onSuccess: () => { toast.success('הגדרות נשמרו'); setDirty(false); },
    onError: () => toast.error('שגיאה בשמירה'),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">הגדרות</h1>
        <button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="px-6 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg disabled:opacity-40 transition-colors"
        >
          {saveMutation.isPending ? 'שומר...' : 'שמור שינויים'}
        </button>
      </div>

      {/* Bot Settings */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
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
          <button
            onClick={() => updateField('mapbox_skip_drills', form.mapbox_skip_drills === 'true' ? 'false' : 'true')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${form.mapbox_skip_drills === 'true' ? 'bg-amber text-black' : 'bg-base border border-border text-text-muted'}`}
          >
            {form.mapbox_skip_drills === 'true' ? 'פעיל' : 'כבוי'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-text-secondary text-sm">שעות שקט גלובליות</label>
            <p className="text-text-muted text-xs">כבה התראות לכל המנויים בלילה</p>
          </div>
          <button
            onClick={() => updateField('quiet_hours_global', form.quiet_hours_global === 'true' ? 'false' : 'true')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${form.quiet_hours_global === 'true' ? 'bg-amber text-black' : 'bg-base border border-border text-text-muted'}`}
          >
            {form.quiet_hours_global === 'true' ? 'פעיל' : 'כבוי'}
          </button>
        </div>
      </div>

      {/* Read-only info */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
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
      </div>

      {/* DB Backup */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="font-semibold text-text-primary mb-3">גיבוי מסד נתונים</h2>
        <p className="text-text-muted text-sm mb-4">הורד עותק מלא של מסד הנתונים SQLite</p>
        <button
          onClick={() => { window.location.href = '/api/settings/backup'; }}
          className="px-6 py-2 bg-surface border border-border hover:bg-base text-text-secondary text-sm rounded-lg"
        >
          ⬇️ הורד גיבוי
        </button>
      </div>
    </div>
  );
}
