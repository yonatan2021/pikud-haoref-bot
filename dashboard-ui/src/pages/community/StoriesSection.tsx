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

interface StoriesSectionProps {
  form: CommunityForm;
  updateField: (key: keyof CommunityForm, value: string) => void;
}

export function StoriesSection({ form, updateField }: StoriesSectionProps) {
  return (
    <GlassCard className="p-4 space-y-5">
      <h2 className="font-semibold text-text-primary border-b border-border pb-3">
        סיפורים מהמקלט (Stories)
      </h2>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-text-secondary text-sm">סיפורים מהמקלט פעיל</label>
          <p className="text-text-muted text-xs">אפשר למנויים לשתף סיפורים מהמקלט</p>
        </div>
        <ToggleSwitch
          value={form.stories_enabled === 'true'}
          onChange={v => updateField('stories_enabled', v ? 'true' : 'false')}
        />
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          מזהה נושא לפרסום סיפורים
        </label>
        <input
          type="number"
          min={0}
          value={form.topic_id_stories}
          onChange={e => updateField('topic_id_stories', e.target.value)}
          placeholder="מזהה Topic בטלגרם"
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
          dir="ltr"
        />
        <p className="text-text-muted text-xs mt-1">
          מזהה הנושא (Topic ID) בערוץ לפרסום סיפורים מאושרים. ערך 1 אינו תקין.
        </p>
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          מרווח שליחה (דקות)
        </label>
        <input
          type="number"
          min={1}
          value={form.stories_rate_limit_minutes}
          onChange={e => updateField('stories_rate_limit_minutes', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          כמה דקות מינימום בין שליחת סיפורים מאותו משתמש
        </p>
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          אורך מקסימלי לסיפור (תווים)
        </label>
        <input
          type="number"
          min={1}
          value={form.stories_max_length}
          onChange={e => updateField('stories_max_length', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          מספר תווים מקסימלי לסיפור שיישלח למנחה
        </p>
      </div>
    </GlassCard>
  );
}
