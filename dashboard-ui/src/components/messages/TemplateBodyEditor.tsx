import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { CharCountBar } from './CharCountBar';
import { api } from '../../api/client';
import type { TemplateEntry } from './TemplateRow';

interface TemplateBodyEditorProps {
  templates: TemplateEntry[];
}

const VARIABLE_CHIPS = [
  { label: '\u{1F550} שעה', placeholder: '{{זמן}}' },
  { label: '\u{1F3D8}\uFE0F רשימת ערים', placeholder: '{{ערים}}' },
  { label: '\u{1F522} מספר ערים', placeholder: '{{מספר_ערים}}' },
  { label: '\u{1F4CC} כותרת', placeholder: '{{כותרת}}' },
  { label: '\u{1F3AF} אמוג\u05F3י', placeholder: '{{אמוגי}}' },
] as const;

const DEFAULT_TEMPLATE = `{{אמוגי}} <b>{{כותרת}}</b>
\u23F0 {{זמן}}
{{מספר_ערים}} ערים

{{ערים}}`;

const DUMMY_VARS: Record<string, string> = {
  'זמן': '14:32',
  'ערים': '\u25B8 \u{1F332} \u{1F534} <b>גליל עליון</b> (3)  \u23F1 <b>15 שנ\u05F3</b>\nאביבים, כפר בלום, קריית שמונה',
  'מספר_ערים': '3',
  'כותרת': 'התרעת טילים',
  'אמוגי': '\u{1F534}',
};

function renderPreview(template: string): string {
  let result = template.replace(/\{\{\s+/g, '{{').replace(/\s+\}\}/g, '}}');
  for (const [key, value] of Object.entries(DUMMY_VARS)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export function TemplateBodyEditor({ templates }: TemplateBodyEditorProps) {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const [selectedType, setSelectedType] = useState<string>(templates[0]?.alertType ?? '');
  const [draft, setDraft] = useState<string | null>(null);

  const selected = templates.find((t) => t.alertType === selectedType);
  const currentTemplate = draft ?? selected?.bodyTemplate ?? '';
  const hasDraft = draft !== null;
  const missingCities = currentTemplate.trim() !== '' && !currentTemplate.replace(/\{\{\s+/g, '{{').replace(/\s+\}\}/g, '}}').includes('{{ערים}}');

  // Save cursor position on blur (before chip button steals focus)
  const handleBlur = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      cursorPosRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
    }
  }, []);

  // Insert placeholder at saved cursor position
  const insertChip = useCallback((placeholder: string) => {
    const { start, end } = cursorPosRef.current;
    const current = draft ?? selected?.bodyTemplate ?? '';
    const before = current.slice(0, start);
    const after = current.slice(end);
    const newValue = before + placeholder + after;
    setDraft(newValue);

    // Restore focus and cursor after React re-render
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const newPos = start + placeholder.length;
        ta.setSelectionRange(newPos, newPos);
        cursorPosRef.current = { start: newPos, end: newPos };
      }
    });
  }, [draft, selected?.bodyTemplate]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/messages/${selectedType}`, {
        bodyTemplate: draft === '' ? null : draft,
      }),
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('תבנית נשמרה');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה'),
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/messages/${selectedType}`, { bodyTemplate: null }),
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('תבנית אופסה לברירת מחדל');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'שגיאה באיפוס'),
  });

  const previewHtml = renderPreview(currentTemplate || DEFAULT_TEMPLATE);
  const safeHtml = DOMPurify.sanitize(previewHtml, {
    ALLOWED_TAGS: ['b', 'i', 'code', 's', 'u'],
    ALLOWED_ATTR: [],
  });

  return (
    <div className="space-y-4">
      {/* Alert type selector */}
      <div>
        <label className="block text-sm text-text-muted mb-1">סוג התראה</label>
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setDraft(null);
          }}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
          dir="rtl"
        >
          {templates.map((t) => (
            <option key={t.alertType} value={t.alertType}>
              {t.emoji} {t.titleHe}
            </option>
          ))}
        </select>
      </div>

      {/* Variable chips */}
      <div>
        <label className="block text-sm text-text-muted mb-1">הכנס משתנה</label>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLE_CHIPS.map((chip) => (
            <button
              key={chip.placeholder}
              type="button"
              onClick={() => insertChip(chip.placeholder)}
              className="px-2.5 py-1 text-xs rounded-full bg-surface-alt border border-border
                         text-text-secondary hover:bg-amber/10 hover:border-amber/30
                         hover:text-amber transition-colors"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template textarea */}
      <div>
        <label className="block text-sm text-text-muted mb-1">
          גוף התבנית
          {selected?.bodyTemplate && <span className="text-amber mr-1">(מותאם)</span>}
        </label>
        <textarea
          ref={textareaRef}
          dir="rtl"
          value={currentTemplate}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          placeholder={DEFAULT_TEMPLATE}
          rows={8}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm
                     text-text-primary font-mono leading-relaxed resize-y
                     focus:outline-none focus:border-amber/50 focus:ring-1 focus:ring-amber/20"
        />
        <CharCountBar charCount={currentTemplate.length} max={2000} />
        {missingCities && (
          <p className="text-xs text-red-400 mt-1">
            \u26A0 חסר משתנה {'{{ערים}}'} \u2014 רשימת הערים לא תופיע בהתראה
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!hasDraft || saveMutation.isPending || missingCities}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber text-base font-medium
                     hover:bg-amber-dark transition-colors disabled:opacity-40"
        >
          {saveMutation.isPending ? 'שומר...' : 'שמור תבנית'}
        </button>
        <button
          type="button"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending || !selected?.bodyTemplate}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-text-muted
                     hover:text-text-primary hover:border-border transition-colors
                     disabled:opacity-40"
        >
          איפוס לברירת מחדל
        </button>
        {hasDraft && (
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            בטל
          </button>
        )}
      </div>

      {/* Live preview */}
      <div>
        <label className="block text-sm text-text-muted mb-1">תצוגה מקדימה</label>
        <div className="bg-[#1a2332] rounded-xl p-4 border border-white/5">
          <div
            className="bg-[#1c3a2a] rounded-lg px-3 py-2 text-sm text-white/90 leading-relaxed
                       whitespace-pre-wrap break-words"
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>
      </div>
    </div>
  );
}
