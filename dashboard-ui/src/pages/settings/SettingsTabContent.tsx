/**
 * Renders all schema fields for a tab. Thin wrapper over getTabSettings +
 * SettingField. Settings.tsx composes this with tab-specific extras
 * (Mapbox usage bar, System read-only info block) as sibling sections.
 */

import { GlassCard } from '../../components/ui/GlassCard';
import { SettingField } from './SettingField';
import { getTabSettings } from './settingsSchema';
import type { SettingTab } from './settingsSchema';
import type { SettingMeta } from './useSettingsForm';

interface SettingsTabContentProps {
  tab: SettingTab;
  form: Record<string, string>;
  updateField: (key: string, value: string) => void;
  meta: Record<string, SettingMeta>;
}

export function SettingsTabContent({ tab, form, updateField, meta }: SettingsTabContentProps) {
  const fields = getTabSettings(tab);

  if (fields.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-text-muted text-sm">
        אין הגדרות בקטגוריה זו
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4 space-y-5">
      {fields.map(def => (
        <SettingField
          key={def.key}
          def={def}
          value={form[def.key] ?? def.defaultValue}
          onChange={v => updateField(def.key, v)}
          meta={meta[def.key]}
        />
      ))}
    </GlassCard>
  );
}
