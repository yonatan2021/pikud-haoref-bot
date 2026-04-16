/**
 * Community — Pulse / Stories / Skills / NeighborCheck settings.
 *
 * Uses the shared useSettingsForm hook (same as Settings.tsx). Community
 * keeps its own subsection JSX — these fields belong to a distinct domain
 * (community engagement) and don't move to Settings tabs.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, Users2 } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { PageTransition } from '../components/ui/PageTransition';
import { useSettingsForm } from './settings/useSettingsForm';
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

// Module-level constants so the hook's [rawSettings] dep array stays sound.
const COMMUNITY_KEYS: readonly (keyof CommunityForm)[] = [
  'pulse_enabled',
  'pulse_cooldown_hours',
  'pulse_aggregate_threshold',
  'pulse_prompt_text',
  'topic_id_stories',
  'stories_enabled',
  'stories_rate_limit_minutes',
  'stories_max_length',
  'skills_public_enabled',
  'skills_need_radius_zones',
  'neighbor_check_enabled_default',
  'neighbor_check_delay_minutes',
  'neighbor_check_text',
];

const DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  pulse_enabled: 'false',
  pulse_cooldown_hours: '6',
  pulse_aggregate_threshold: '10',
  pulse_prompt_text: '',
  topic_id_stories: '0',
  stories_enabled: 'false',
  stories_rate_limit_minutes: '60',
  stories_max_length: '200',
  skills_public_enabled: 'false',
  skills_need_radius_zones: '3',
  neighbor_check_enabled_default: 'false',
  neighbor_check_delay_minutes: '7',
  neighbor_check_text: '',
});

export function Community() {
  const {
    form,
    dirty,
    hasErrors,
    saveState,
    updateField,
    save,
    isLoading,
    isError,
  } = useSettingsForm(COMMUNITY_KEYS as readonly string[], DEFAULTS);

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

  // Hook returns Record<string,string>; sub-sections expect the stricter
  // CommunityForm shape. Keys come from the same source (module constants)
  // so structural compatibility is guaranteed — cast is safe.
  const typedForm = form as unknown as CommunityForm;
  const typedUpdateField = updateField as (key: keyof CommunityForm, value: string) => void;

  const saveDisabled = !dirty || hasErrors || saveState === 'loading';

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users2 size={22} className="text-[var(--color-tg)] flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary leading-tight">קהילה</h1>
              <p className="text-sm text-text-muted mt-0.5">
                הגדרות תכונות קהילה — דופק, סיפורים, מיומנויות ובדיקת שכנים
              </p>
            </div>
          </div>
          <button
            disabled={saveDisabled}
            onClick={save}
            title={hasErrors ? 'יש לתקן שגיאות ולידציה לפני שמירה' : undefined}
            className={`px-6 py-2 text-sm font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 min-w-[140px] justify-center ${
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

        <PulseSection form={typedForm} updateField={typedUpdateField} />
        <StoriesSection form={typedForm} updateField={typedUpdateField} />
        <SkillsSection form={typedForm} updateField={typedUpdateField} />
        <NeighborCheckSection form={typedForm} updateField={typedUpdateField} />
      </div>
    </PageTransition>
  );
}
