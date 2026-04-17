/**
 * Schema-driven field renderer. One component switches on SettingDef.type
 * to render number / toggle / select / url / text / template / json inputs.
 *
 * Validation runs on blur (not keystroke) and shows Hebrew error messages
 * inline. The save button in the parent is disabled when any field fails.
 */

import { useState } from 'react';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { validateField } from './validateField';
import type { SettingDef } from './settingsSchema';
import type { SettingMeta } from './useSettingsForm';

interface SettingFieldProps {
  def: SettingDef;
  value: string;
  onChange: (value: string) => void;
  meta?: SettingMeta;
}

function SettingSourceBadge({ meta }: { meta?: SettingMeta }) {
  if (!meta) return null;
  if (meta.source === 'env') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30"
        title="ערך מקובץ .env — דורש הפעלה מחדש לשינוי"
      >
        ENV
      </span>
    );
  }
  const date = meta.updatedAt
    ? new Date(meta.updatedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-500/15 text-green-400 border border-green-500/30"
      title={meta.updatedAt ? `נשמר ב-DB בתאריך ${meta.updatedAt}` : 'נשמר ב-DB'}
    >
      DB{date ? ` · ${date}` : ''}
    </span>
  );
}

function HotReloadBadge({ hotReload }: { hotReload: boolean }) {
  if (hotReload) return null;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30"
      title="שינוי לא ייכנס לתוקף עד הפעלה מחדש של השרת"
    >
      דורש הפעלה מחדש
    </span>
  );
}

interface LabelRowProps {
  label: string;
  meta?: SettingMeta;
  hotReload: boolean;
}

function LabelRow({ label, meta, hotReload }: LabelRowProps) {
  return (
    <label className="text-text-secondary text-sm flex items-center gap-2 mb-1 flex-wrap">
      {label}
      <SettingSourceBadge meta={meta} />
      <HotReloadBadge hotReload={hotReload} />
    </label>
  );
}

export function SettingField({ def, value, onChange, meta }: SettingFieldProps) {
  const { type, label, description, validation } = def;
  const [touched, setTouched] = useState(false);
  const error = touched ? validateField(def, value) : null;
  const borderClass = error ? 'border-red-500/60' : 'border-border';

  // Boolean — toggle row
  if (type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="text-text-secondary text-sm flex items-center gap-2 flex-wrap">
            {label}
            <SettingSourceBadge meta={meta} />
            <HotReloadBadge hotReload={def.hotReload} />
          </label>
          <p className="text-text-muted text-xs mt-0.5">{description}</p>
        </div>
        <ToggleSwitch
          value={value === 'true'}
          onChange={v => onChange(v ? 'true' : 'false')}
        />
      </div>
    );
  }

  // Select — dropdown
  if (type === 'select' && validation?.options) {
    return (
      <div>
        <LabelRow label={label} meta={meta} hotReload={def.hotReload} />
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
        >
          {validation.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="text-text-muted text-xs mt-1">{description}</p>
      </div>
    );
  }

  // Number — numeric input with validation
  if (type === 'number') {
    return (
      <div>
        <LabelRow label={label} meta={meta} hotReload={def.hotReload} />
        <input
          type="number"
          min={validation?.min}
          max={validation?.max}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={`bg-base border ${borderClass} rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber w-48`}
        />
        {error
          ? <p className="text-red-400 text-xs mt-1">{error}</p>
          : <p className="text-text-muted text-xs mt-1">{description}</p>
        }
      </div>
    );
  }

  // URL — full-width LTR input
  if (type === 'url') {
    return (
      <div>
        <LabelRow label={label} meta={meta} hotReload={def.hotReload} />
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="https://..."
          className={`w-full bg-base border ${borderClass} rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber`}
          dir="ltr"
        />
        {error
          ? <p className="text-red-400 text-xs mt-1">{error}</p>
          : <p className="text-text-muted text-xs mt-1">{description}</p>
        }
      </div>
    );
  }

  // Template / JSON — textarea with validation (JSON uses mono font, LTR)
  if (type === 'template' || type === 'json') {
    return (
      <div>
        <LabelRow label={label} meta={meta} hotReload={def.hotReload} />
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={type === 'json' ? 4 : 2}
          className={`w-full bg-base border ${borderClass} rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber resize-y ${type === 'json' ? 'font-mono text-xs' : ''}`}
          dir={type === 'json' ? 'ltr' : undefined}
        />
        {error
          ? <p className="text-red-400 text-xs mt-1">{error}</p>
          : <p className="text-text-muted text-xs mt-1">{description}</p>
        }
      </div>
    );
  }

  // String — default text input (full-width)
  return (
    <div>
      <LabelRow label={label} meta={meta} hotReload={def.hotReload} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full bg-base border ${borderClass} rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber`}
      />
      {error
        ? <p className="text-red-400 text-xs mt-1">{error}</p>
        : <p className="text-text-muted text-xs mt-1">{description}</p>
      }
    </div>
  );
}
