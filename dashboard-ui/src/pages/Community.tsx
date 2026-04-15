import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, Users2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { Skeleton } from '../components/Skeleton';
import { PageTransition } from '../components/ui/PageTransition';
import { PulseSection } from './community/PulseSection';
import { StoriesSection } from './community/StoriesSection';
import { SkillsSection } from './community/SkillsSection';
import { NeighborCheckSection } from './community/NeighborCheckSection';

interface CommunityForm {
  pulse_enabled: string;
  pulse_cooldown_hours: string;
  pulse_aggregate_threshold: string;
  pulse_prompt_text: string;
  topic_id_stories: string;
  stories_enabled: string;
  stories_rate_limit_minutes: string;
  stories_max_length: string;
  skills_public_enabled: string;
  skills_need_radius_zones: string;
  neighbor_check_enabled_default: string;
  neighbor_check_delay_minutes: string;
  neighbor_check_text: string;
}

const DEFAULTS: CommunityForm = {
  pulse_enabled: 'false',
  pulse_cooldown_hours: '24',
  pulse_aggregate_threshold: '10',
  pulse_prompt_text: '',
  topic_id_stories: '0',
  stories_enabled: 'false',
  stories_rate_limit_minutes: '60',
  stories_max_length: '500',
  skills_public_enabled: 'false',
  skills_need_radius_zones: '3',
  neighbor_check_enabled_default: 'false',
  neighbor_check_delay_minutes: '10',
  neighbor_check_text: '',
};

export function Community() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, isError } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings'),
  });

  const [form, setForm] = useState<CommunityForm>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  useEffect(() => {
    if (settings) {
      setForm({
        pulse_enabled:                settings['pulse_enabled'] ?? DEFAULTS.pulse_enabled,
        pulse_cooldown_hours:         settings['pulse_cooldown_hours'] ?? DEFAULTS.pulse_cooldown_hours,
        pulse_aggregate_threshold:    settings['pulse_aggregate_threshold'] ?? DEFAULTS.pulse_aggregate_threshold,
        pulse_prompt_text:            settings['pulse_prompt_text'] ?? DEFAULTS.pulse_prompt_text,
        topic_id_stories:             settings['topic_id_stories'] ?? DEFAULTS.topic_id_stories,
        stories_enabled:              settings['stories_enabled'] ?? DEFAULTS.stories_enabled,
        stories_rate_limit_minutes:   settings['stories_rate_limit_minutes'] ?? DEFAULTS.stories_rate_limit_minutes,
        stories_max_length:           settings['stories_max_length'] ?? DEFAULTS.stories_max_length,
        skills_public_enabled:        settings['skills_public_enabled'] ?? DEFAULTS.skills_public_enabled,
        skills_need_radius_zones:     settings['skills_need_radius_zones'] ?? DEFAULTS.skills_need_radius_zones,
        neighbor_check_enabled_default: settings['neighbor_check_enabled_default'] ?? DEFAULTS.neighbor_check_enabled_default,
        neighbor_check_delay_minutes: settings['neighbor_check_delay_minutes'] ?? DEFAULTS.neighbor_check_delay_minutes,
        neighbor_check_text:          settings['neighbor_check_text'] ?? DEFAULTS.neighbor_check_text,
      });
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/api/settings', form as unknown as Record<string, string>),
    onMutate: () => setSaveState('loading'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('הגדרות קהילה נשמרו');
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

  const updateField = (key: keyof CommunityForm, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

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

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users2 size={22} className="text-[var(--color-tg)] flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary leading-tight">קהילה</h1>
              <p className="text-sm text-text-muted mt-0.5">הגדרות תכונות קהילה — דופק, סיפורים, מיומנויות ובדיקת שכנים</p>
            </div>
          </div>
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

        <PulseSection form={form} updateField={updateField} />
        <StoriesSection form={form} updateField={updateField} />
        <SkillsSection form={form} updateField={updateField} />
        <NeighborCheckSection form={form} updateField={updateField} />
      </div>
    </PageTransition>
  );
}
