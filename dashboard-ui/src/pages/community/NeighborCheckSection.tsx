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

interface NeighborCheckSectionProps {
  form: CommunityForm;
  updateField: (key: keyof CommunityForm, value: string) => void;
}

export function NeighborCheckSection({ form, updateField }: NeighborCheckSectionProps) {
  return (
    <GlassCard className="p-4 space-y-5">
      <h2 className="font-semibold text-text-primary border-b border-border pb-3">
        בדיקת שכנים (Neighbor Check)
      </h2>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-text-secondary text-sm">בדיקת שכנים — ברירת מחדל פעילה</label>
          <p className="text-text-muted text-xs">האם בדיקת שכנים מופעלת כברירת מחדל למנויים חדשים</p>
        </div>
        <ToggleSwitch
          value={form.neighbor_check_enabled_default === 'true'}
          onChange={v => updateField('neighbor_check_enabled_default', v ? 'true' : 'false')}
        />
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          עיכוב לפני שליחת בדיקה (דקות)
        </label>
        <input
          type="number"
          min={1}
          value={form.neighbor_check_delay_minutes}
          onChange={e => updateField('neighbor_check_delay_minutes', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          כמה דקות לאחר ההתראה לשלוח בקשת בדיקת שלומות לשכנים
        </p>
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          טקסט בקשת הבדיקה
        </label>
        <textarea
          rows={3}
          value={form.neighbor_check_text}
          onChange={e => updateField('neighbor_check_text', e.target.value)}
          placeholder="האם אתה בסדר? שכניך שואלים לשלומך."
          className="w-full bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber resize-y"
        />
      </div>
    </GlassCard>
  );
}
