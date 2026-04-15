import { GlassCard } from '../../components/ui/GlassCard';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';

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

interface PulseSectionProps {
  form: CommunityForm;
  updateField: (key: keyof CommunityForm, value: string) => void;
}

export function PulseSection({ form, updateField }: PulseSectionProps) {
  return (
    <GlassCard className="p-4 space-y-5">
      <h2 className="font-semibold text-text-primary border-b border-border pb-3">
        דופק קהילתי (Pulse)
      </h2>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-text-secondary text-sm">דופק קהילתי פעיל</label>
          <p className="text-text-muted text-xs">הפעל/כבה שליחת סקר דופק לאחר התראה</p>
        </div>
        <ToggleSwitch
          value={form.pulse_enabled === 'true'}
          onChange={v => updateField('pulse_enabled', v ? 'true' : 'false')}
        />
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          מרווח שליחה (שעות)
        </label>
        <input
          type="number"
          min={1}
          value={form.pulse_cooldown_hours}
          onChange={e => updateField('pulse_cooldown_hours', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          כמה שעות מינימום בין שליחת סקרי דופק לאותו משתמש
        </p>
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          סף צבירה לדשבורד
        </label>
        <input
          type="number"
          min={1}
          value={form.pulse_aggregate_threshold}
          onChange={e => updateField('pulse_aggregate_threshold', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          מינימום תגובות להצגת סיכום בדשבורד
        </p>
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          טקסט שאלת הסקר
        </label>
        <textarea
          rows={3}
          value={form.pulse_prompt_text}
          onChange={e => updateField('pulse_prompt_text', e.target.value)}
          placeholder="איך אתה מרגיש אחרי ההתראה?"
          className="w-full bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber resize-y"
        />
      </div>
    </GlassCard>
  );
}
