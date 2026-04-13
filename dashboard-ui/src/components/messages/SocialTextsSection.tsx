import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { GlassCard } from '../ui/GlassCard';
import { ToggleSwitch } from '../ui/ToggleSwitch';

interface SettingsMap {
  [key: string]: string | undefined;
}

interface SocialTextField {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  variables?: string;
}

const TEXT_FIELDS: SocialTextField[] = [
  {
    key: 'social_banner_reminder_text',
    label: 'באנר תזכורת ב/start',
    placeholder: '⚠️ <b>לא עדכנת סטטוס</b> אחרי האזעקה{{city}} · לחץ לעדכון',
    helpText: 'מוצג למשתמשים שלא ענו על שאלת בטיחות',
    variables: '{{city}}',
  },
  {
    key: 'social_quick_ok_button_label',
    label: 'כפתור "הכל בסדר" בתפריט',
    placeholder: '✅ הכל בסדר — לכולם',
    helpText: 'טקסט הכפתור בתפריט הראשי',
  },
  {
    key: 'social_quick_ok_confirm_text',
    label: 'טקסט אישור שליחה',
    placeholder: 'לשלוח עדכון "הכל בסדר" ל-{{count}} אנשי קשר?',
    helpText: 'הודעת אישור לפני שליחה',
    variables: '{{count}}',
  },
  {
    key: 'social_quick_ok_broadcast_text',
    label: 'הודעת שידור לאנשי קשר',
    placeholder: '✅ {{name}} דיווח שהוא בסדר · {{time}}',
    helpText: 'ההודעה שנשלחת לאנשי הקשר',
    variables: '{{name}}, {{time}}',
  },
  {
    key: 'social_contact_count_line_template',
    label: 'שורת אנשי קשר בהתראה',
    placeholder: '👥 {{count}} אנשי קשר שלך נמצאים באזור',
    helpText: 'מוצג בהתראות DM כשיש אנשי קשר באזור',
    variables: '{{count}}',
  },
];

const TOGGLE_DEFAULTS: Array<{ key: string; label: string }> = [
  { key: 'social_default_prompt_enabled', label: 'שאלת בטיחות אחרי אזעקה' },
  { key: 'social_default_banner_enabled', label: 'באנר תזכורת ב/start' },
  { key: 'social_default_contact_count_enabled', label: 'מספר אנשי קשר בהתראה' },
  { key: 'social_default_group_alerts_enabled', label: 'התראות קבוצתיות' },
  { key: 'social_default_quick_ok_enabled', label: 'כפתור "הכל בסדר" מהיר' },
];

const DUMMY_PREVIEW: Record<string, string> = {
  '{{city}}': ' בתל אביב',
  '{{count}}': '3',
  '{{name}}': '<b>ישראל ישראלי</b>',
  '{{time}}': '14:30',
};

function previewText(template: string): string {
  let result = template;
  for (const [key, val] of Object.entries(DUMMY_PREVIEW)) {
    result = result.replaceAll(key, val);
  }
  return DOMPurify.sanitize(result);
}

export function SocialTextsSection() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsMap>('/api/settings'),
  });

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, string>) => api.patch('/api/settings', patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('נשמר');
    },
    onError: () => toast.error('שגיאה בשמירה'),
  });

  const handleSave = (key: string, value: string) => {
    saveMutation.mutate({ [key]: value });
  };

  const handleToggle = (key: string) => {
    const current = settings?.[key] ?? 'true';
    handleSave(key, current === 'true' ? 'false' : 'true');
  };

  const handleThreshold = (value: string) => {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0) {
      handleSave('social_banner_stale_prompt_minutes', String(n));
    }
  };

  const Chevron = open ? ChevronDown : ChevronLeft;

  return (
    <GlassCard>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-start"
      >
        <Chevron size={16} className="text-[var(--color-text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">👥 טקסטים חברתיים</h3>
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {/* Text template fields */}
          {TEXT_FIELDS.map(field => {
            const current = settings?.[field.key] ?? '';
            return (
              <div key={field.key} className="space-y-2">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                  {field.label}
                  {field.variables && (
                    <span className="mr-2 text-blue-400">משתנים: {field.variables}</span>
                  )}
                </label>
                <input
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-glass)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-blue-500"
                  dir="rtl"
                  defaultValue={current}
                  placeholder={field.placeholder}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (val && val !== current) handleSave(field.key, val);
                  }}
                />
                <p className="text-xs text-[var(--color-text-secondary)]">{field.helpText}</p>
                {/* Preview — sanitized via DOMPurify */}
                {current && (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                    <span className="text-xs text-[var(--color-text-secondary)]">תצוגה מקדימה: </span>
                    <span
                      className="text-[var(--color-text-primary)]"
                      dangerouslySetInnerHTML={{ __html: previewText(current) }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Default toggles for new users */}
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">ברירות מחדל למשתמשים חדשים</h4>
            {TOGGLE_DEFAULTS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                <ToggleSwitch
                  value={(settings?.[key] ?? 'true') === 'true'}
                  onChange={() => handleToggle(key)}
                />
              </div>
            ))}
          </div>

          {/* Stale threshold */}
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
              סף זמן לבאנר תזכורת (דקות)
            </label>
            <input
              type="number"
              min={0}
              className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-glass)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-blue-500"
              defaultValue={settings?.social_banner_stale_prompt_minutes ?? '1440'}
              onBlur={e => handleThreshold(e.target.value)}
            />
            <p className="text-xs text-[var(--color-text-secondary)]">
              1440 = 24 שעות. אחרי זמן זה הבאנר לא יוצג יותר.
            </p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
