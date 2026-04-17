/**
 * Shared settings form hook. Extracts the duplicated form/save/dirty
 * pattern from the old Settings.tsx and Community.tsx. Consumers pass
 * the set of keys they manage + defaults; hook handles fetch, sync,
 * dirty tracking, validation aggregation, and save.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { getSettingDef } from './settingsSchema';
import { validateField } from './validateField';

export interface SettingMeta {
  value: string;
  source: 'env' | 'db';
  updatedAt?: string;
}

export interface UseSettingsFormReturn {
  /** All raw settings from the server (including _settingsMeta). */
  rawSettings: Record<string, string> | undefined;
  /** Current form values (only keys this form manages). */
  form: Record<string, string>;
  /** Unsaved changes present. */
  dirty: boolean;
  /** Any managed field has a validation error — disables save. */
  hasErrors: boolean;
  saveState: 'idle' | 'loading' | 'success';
  updateField: (key: string, value: string) => void;
  save: () => void;
  isLoading: boolean;
  isError: boolean;
  meta: Record<string, SettingMeta>;
}

/**
 * @param keys     Keys this form manages (PATCH body only contains these).
 * @param defaults Default values — used on first render and when a key is
 *                 missing from the server response.
 */
export function useSettingsForm(
  keys: readonly string[],
  defaults: Readonly<Record<string, string>>
): UseSettingsFormReturn {
  const queryClient = useQueryClient();

  const { data: rawSettings, isLoading, isError } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings'),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // Sync form with server data.
  // NOTE: Depends only on [rawSettings] intentionally — keys/defaults are
  // expected to be stable (module-level constants or useMemo'd). If a future
  // caller passes dynamic values, add them to the dep array.
  useEffect(() => {
    if (rawSettings) {
      const initial: Record<string, string> = {};
      for (const key of keys) {
        initial[key] = rawSettings[key] ?? defaults[key] ?? '';
      }
      setForm(initial);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSettings]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      for (const key of keys) {
        body[key] = form[key] ?? defaults[key] ?? '';
      }
      return api.patch('/api/settings', body);
    },
    onMutate: () => setSaveState('loading'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // RestartBanner queries /api/secrets/restart-needed — invalidate
      // so it picks up newly-changed RESTART_REQUIRED_KEYS immediately.
      queryClient.invalidateQueries({ queryKey: ['secrets-restart-needed'] });
      toast.success('הגדרות נשמרו');
      setDirty(false);
      setSaveState('success');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    },
    onError: () => {
      toast.error('שגיאה בשמירה');
      setSaveState('idle');
    },
  });

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const meta = ((rawSettings as Record<string, unknown>)?._settingsMeta as
    Record<string, SettingMeta>) ?? {};

  // Aggregate validation — disables save if any managed field is invalid.
  // Keys not in schema (e.g. Community's own keys before they're added) are
  // skipped — their validation is the caller's responsibility.
  const hasErrors = keys.some(key => {
    const def = getSettingDef(key);
    if (!def) return false;
    return validateField(def, form[key] ?? '') !== null;
  });

  return {
    rawSettings,
    form,
    dirty,
    hasErrors,
    saveState,
    updateField,
    save: () => saveMutation.mutate(),
    isLoading,
    isError,
    meta,
  };
}
