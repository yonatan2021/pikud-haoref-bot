import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { api } from '../../api/client';

interface SettingsMap {
  [key: string]: string | undefined;
}

const DM_FIELDS = [
  {
    key: 'dm_all_clear_text',
    label: 'הודעת "נשמו"',
    description: 'טקסט שנשלח כשההתראה מסתיימת. {{עיר}} מוחלף בעיר המגורים.',
    defaultValue: '\u{1F54A}\uFE0F נשמו! ההתראה ב{{עיר}} הסתיימה. אתם בטוחים.',
  },
  {
    key: 'dm_relevance_in_area',
    label: 'מחוון — באזורך',
    description: 'מוצג כשההתראה בעיר המגורים של המשתמש.',
    defaultValue: '\u{1F534} באזורך',
  },
  {
    key: 'dm_relevance_nearby',
    label: 'מחוון — באזור קרוב',
    description: 'מוצג כשההתראה באזור סמוך לעיר המגורים.',
    defaultValue: '\u{1F7E1} באזור קרוב',
  },
  {
    key: 'dm_relevance_not_area',
    label: 'מחוון — לא באזורך',
    description: 'מוצג כשההתראה לא באזור עיר המגורים.',
    defaultValue: '\u{1F7E2} לא באזורך',
  },
] as const;

export function DmTemplatesPanel() {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data: settings, isLoading, isError } = useQuery<SettingsMap>({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsMap>('/api/settings'),
  });

  // Reset edits when settings reload
  useEffect(() => { setEdits({}); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      api.patch('/api/settings', updates),
    onSuccess: () => {
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('הגדרות DM נשמרו');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה'),
  });

  const hasEdits = Object.keys(edits).length > 0;

  if (isLoading) return <div className="text-text-muted text-sm">טוען הגדרות...</div>;
  if (isError) return <div className="text-red-400 text-sm">שגיאה בטעינת הגדרות</div>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">הודעות DM</h3>
        <p className="text-sm text-text-muted">עריכת טקסטים שנשלחים בהודעות פרטיות למנויים</p>
      </div>

      {DM_FIELDS.map((field) => {
        const currentValue = edits[field.key] ?? settings?.[field.key] ?? '';
        const isEdited = field.key in edits;

        return (
          <div key={field.key} className="space-y-1">
            <label className="block text-sm font-medium text-text-primary">
              {field.label}
              {isEdited && <span className="text-amber mr-1 text-xs">(שונה)</span>}
            </label>
            <p className="text-xs text-text-muted">{field.description}</p>
            <input
              type="text"
              dir="rtl"
              value={currentValue}
              placeholder={field.defaultValue}
              onChange={(e) =>
                setEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm
                         text-text-primary focus:outline-none focus:border-amber/50 focus:ring-1
                         focus:ring-amber/20"
            />
            {isEdited && (
              <button
                type="button"
                onClick={() =>
                  setEdits((prev) => {
                    const { [field.key]: _, ...rest } = prev;
                    return rest;
                  })
                }
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                בטל שינוי
              </button>
            )}
          </div>
        );
      })}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate(edits)}
          disabled={!hasEdits || saveMutation.isPending}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber text-base font-medium
                     hover:bg-amber-dark transition-colors disabled:opacity-40"
        >
          {saveMutation.isPending ? 'שומר...' : 'שמור שינויים'}
        </button>
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          disabled={saveMutation.isPending}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-text-muted
                     hover:text-text-primary transition-colors disabled:opacity-40"
        >
          איפוס לברירת מחדל
        </button>
      </div>

      <ConfirmModal
        open={showResetConfirm}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setShowResetConfirm(false);
          const resets: Record<string, string> = {};
          for (const f of DM_FIELDS) resets[f.key] = '';
          saveMutation.mutate(resets);
        }}
        title="איפוס הגדרות DM"
        description="כל הטקסטים יחזרו לברירת המחדל. פעולה זו לא ניתנת לביטול."
        danger
      />
    </div>
  );
}
