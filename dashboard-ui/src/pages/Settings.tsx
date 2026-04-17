/**
 * Settings — schema-driven tabbed configuration page.
 *
 * All field rendering is delegated to SettingField via SettingsTabContent.
 * The registry (settingsSchema.ts) is the single source of truth — adding
 * a new setting means adding one entry there (+ backend ALLOWED_KEYS).
 *
 * Three non-schema sections are rendered inline per active tab:
 *   - Maps tab: Mapbox usage bar (reads live /api/stats/overview)
 *   - System tab: read-only ports / version / DB size + backup button
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { useSettingsForm } from './settings/useSettingsForm';
import { SettingsTabBar } from './settings/SettingsTabBar';
import { SettingsTabContent } from './settings/SettingsTabContent';
import {
  ALL_SETTING_KEYS,
  ALL_SETTING_DEFAULTS,
  SETTINGS_TABS,
} from './settings/settingsSchema';
import type { SettingTab } from './settings/settingsSchema';

const ACTIVE_TAB_STORAGE_KEY = 'settings_active_tab';

interface Overview {
  mapboxMonth: number;
}

function formatBytes(n: number): string {
  return n < 1024 * 1024
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isValidTab(v: string | null): v is SettingTab {
  return v !== null && SETTINGS_TABS.some(t => t.id === v);
}

export function Settings() {
  // Active tab persists in localStorage — user returning to Settings
  // lands on the same tab they left.
  const [activeTab, setActiveTab] = useState<SettingTab>(() => {
    const stored = typeof window !== 'undefined'
      ? localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
      : null;
    return isValidTab(stored) ? stored : 'bot';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab]);

  const {
    rawSettings,
    form,
    dirty,
    hasErrors,
    saveState,
    updateField,
    save,
    isLoading,
    isError,
    meta,
  } = useSettingsForm(ALL_SETTING_KEYS, ALL_SETTING_DEFAULTS);

  const { data: overview } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get('/api/stats/overview'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        שגיאה בטעינת הגדרות — רענן את הדף
      </div>
    );
  }

  // Mapbox usage numbers for the Maps tab
  const mapboxLimit = parseInt(form['mapbox_monthly_limit'] ?? '0', 10);
  const mapboxUsed = overview?.mapboxMonth ?? 0;
  const mapboxPct = mapboxLimit > 0 ? Math.min((mapboxUsed / mapboxLimit) * 100, 100) : 0;
  const mapboxColor = mapboxPct > 90 ? 'bg-red-500' : mapboxPct > 70 ? 'bg-amber' : 'bg-green';
  const dbSize = parseInt(rawSettings?.['db_size_bytes'] ?? '0', 10);

  const saveDisabled = !dirty || hasErrors || saveState === 'loading';

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <SlidersHorizontal size={22} className="text-[var(--color-tg)] flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-text-primary leading-tight truncate">הגדרות</h1>
              <p className="text-sm text-text-muted mt-0.5 truncate">
                ניהול מלא של הבוט, הערוצים, המפות והחברתי — הכל ממקום אחד
              </p>
            </div>
          </div>
          <button
            disabled={saveDisabled}
            onClick={save}
            title={hasErrors ? 'יש לתקן שגיאות ולידציה לפני שמירה' : undefined}
            className={`px-6 py-2 text-sm font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 min-w-[140px] justify-center flex-shrink-0 ${
              saveState === 'success'
                ? 'bg-green text-white'
                : 'bg-amber hover:bg-amber-dark text-black'
            }`}
          >
            <AnimatePresence mode="wait">
              {saveState === 'idle' && (
                <motion.span key="idle" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  שמור שינויים
                </motion.span>
              )}
              {saveState === 'loading' && (
                <motion.span key="loading" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  שומר...
                </motion.span>
              )}
              {saveState === 'success' && (
                <motion.span key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  נשמר!
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        <SettingsTabBar
          tabs={SETTINGS_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Mapbox usage bar sits above the Maps tab schema fields */}
        {activeTab === 'maps' && mapboxLimit > 0 && (
          <GlassCard className="p-4">
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>{mapboxUsed.toLocaleString()} / {mapboxLimit.toLocaleString()} בקשות החודש</span>
              <span>{mapboxPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-base rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${mapboxColor}`} style={{ width: `${mapboxPct}%` }} />
            </div>
          </GlassCard>
        )}

        <SettingsTabContent
          tab={activeTab}
          form={form}
          updateField={updateField}
          meta={meta}
        />

        {/* System tab: non-schema read-only info + DB backup button */}
        {activeTab === 'system' && (
          <>
            <GlassCard className="p-4 space-y-4">
              <h2 className="font-semibold text-text-primary border-b border-border pb-3">
                מידע מערכת (לקריאה בלבד)
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-text-muted text-xs block mb-1">Health Port</label>
                  <input
                    disabled
                    value={rawSettings?.['health_port'] ?? '3000'}
                    className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-muted w-full opacity-60"
                  />
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">Dashboard Port</label>
                  <input
                    disabled
                    value={rawSettings?.['dashboard_port'] ?? '4000'}
                    className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-muted w-full opacity-60"
                  />
                </div>
              </div>

              <p className="text-text-muted text-xs">
                שינוי פורטים זמין רק דרך משתני סביבה (HEALTH_PORT / DASHBOARD_PORT) ודורש הפעלה מחדש
              </p>

              <div className="flex gap-6 pt-1 flex-wrap">
                <div>
                  <span className="text-text-muted text-xs block mb-1">גרסת בוט</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber/10 border border-amber/30 text-amber font-mono">
                    v{rawSettings?.['bot_version'] ?? '—'}
                  </span>
                </div>
                {dbSize > 0 && (
                  <div>
                    <span className="text-text-muted text-xs block mb-1">גודל מסד נתונים</span>
                    <span className="text-text-secondary text-sm font-medium" style={{ direction: 'ltr', display: 'inline-block' }}>
                      {formatBytes(dbSize)}
                    </span>
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h2 className="font-semibold text-text-primary mb-2">גיבוי מסד נתונים</h2>
              <p className="text-text-muted text-sm mb-4">הורד עותק מלא של מסד הנתונים SQLite</p>
              <button
                onClick={() => { window.location.href = '/api/settings/backup'; }}
                className="px-6 py-2 bg-surface border border-border hover:bg-base text-text-secondary text-sm rounded-lg"
              >
                ⬇️ הורד גיבוי
              </button>
            </GlassCard>
          </>
        )}
      </div>
    </PageTransition>
  );
}
