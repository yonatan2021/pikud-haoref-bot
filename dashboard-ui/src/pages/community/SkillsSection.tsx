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

interface SkillsSectionProps {
  form: CommunityForm;
  updateField: (key: keyof CommunityForm, value: string) => void;
}

export function SkillsSection({ form, updateField }: SkillsSectionProps) {
  return (
    <GlassCard className="p-4 space-y-5">
      <h2 className="font-semibold text-text-primary border-b border-border pb-3">
        שיתוף מיומנויות (Skills)
      </h2>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-text-secondary text-sm">שיתוף מיומנויות ציבורי</label>
          <p className="text-text-muted text-xs">אפשר לחברי קהילה להציג מיומנויות לשכנים</p>
        </div>
        <ToggleSwitch
          value={form.skills_public_enabled === 'true'}
          onChange={v => updateField('skills_public_enabled', v ? 'true' : 'false')}
        />
      </div>

      <div>
        <label className="text-text-secondary text-sm block mb-1">
          רדיוס אזורים לצורך עזרה (מספר אזורים)
        </label>
        <input
          type="number"
          min={1}
          value={form.skills_need_radius_zones}
          onChange={e => updateField('skills_need_radius_zones', e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48"
        />
        <p className="text-text-muted text-xs mt-1">
          כמה אזורים סמוכים לחפש בהם בעלי מיומנויות רלוונטיות
        </p>
      </div>
    </GlassCard>
  );
}
