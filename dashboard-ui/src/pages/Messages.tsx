import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Save, RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { Skeleton } from '../components/Skeleton';

interface TemplateDefaults {
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
}

interface TemplateEntry {
  alertType: string;
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
  isCustomized: boolean;
  defaults: TemplateDefaults;
}

interface TemplateRowProps {
  entry: TemplateEntry;
  localEdits: Partial<TemplateEntry>;
  onFieldChange: (alertType: string, field: keyof TemplateEntry, value: string) => void;
  onReset: (alertType: string) => void;
}

function TemplateRow({ entry, localEdits, onFieldChange, onReset }: TemplateRowProps) {
  const merged = { ...entry, ...localEdits };
  const inputClass =
    'bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber transition-colors';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-[180px]">
        <span className="text-sm font-medium text-text-primary">{merged.titleHe}</span>
        {entry.isCustomized && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-glow-amber)] text-amber border border-amber/30">
            מותאם
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-2 flex-wrap">
        <input
          type="text"
          value={merged.emoji}
          onChange={e => onFieldChange(entry.alertType, 'emoji', e.target.value)}
          placeholder="אמוג'י"
          className={`${inputClass} w-16 text-center`}
          maxLength={4}
        />
        <input
          type="text"
          value={merged.titleHe}
          onChange={e => onFieldChange(entry.alertType, 'titleHe', e.target.value)}
          placeholder="כותרת בעברית"
          className={`${inputClass} flex-1 min-w-[140px]`}
        />
        <input
          type="text"
          value={merged.instructionsPrefix}
          onChange={e => onFieldChange(entry.alertType, 'instructionsPrefix', e.target.value)}
          placeholder="קידומת הוראות"
          className={`${inputClass} flex-1 min-w-[200px]`}
        />
      </div>

      {entry.isCustomized && (
        <button
          onClick={() => onReset(entry.alertType)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors whitespace-nowrap px-2 py-1 rounded hover:bg-white/5"
          title="אפס לברירת מחדל"
        >
          <RotateCcw size={12} />
          אפס
        </button>
      )}
    </div>
  );
}

export function Messages() {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Partial<TemplateEntry>>>({});
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const { data: templates, isLoading, isError } = useQuery<TemplateEntry[]>({
    queryKey: ['messages'],
    queryFn: () => api.get('/api/messages'),
  });

  const dirty = Object.keys(edits).length > 0;

  const updateField = (alertType: string, field: keyof TemplateEntry, value: string) => {
    setEdits(prev => ({
      ...prev,
      [alertType]: { ...prev[alertType], [field]: value },
    }));
  };

  const handleSave = async () => {
    setSaveState('loading');
    try {
      await Promise.all(
        Object.entries(edits).map(([alertType, changes]) =>
          api.patch(`/api/messages/${alertType}`, changes)
        )
      );
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      setEdits({});
      setSaveState('success');
      toast.success('תבניות נשמרו');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      toast.error('שגיאה בשמירה');
      setSaveState('idle');
    }
  };

  const handleReset = async (alertType: string) => {
    try {
      await api.delete(`/api/messages/${alertType}`);
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      setEdits(prev => {
        const next = { ...prev };
        delete next[alertType];
        return next;
      });
      toast.success('תבנית אופסה');
    } catch {
      toast.error('שגיאה באיפוס');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        שגיאה בטעינת התבניות — רענן את הדף
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">תבניות הודעות</h1>
          <button
            disabled={!dirty || saveState === 'loading'}
            onClick={handleSave}
            className={`px-6 py-2 text-sm font-bold rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2 min-w-[140px] justify-center ${
              saveState === 'success'
                ? 'bg-green text-white'
                : 'bg-amber hover:bg-amber-dark text-black'
            }`}
          >
            <AnimatePresence mode="wait">
              {saveState === 'idle' && (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <Save size={14} />
                  שמור שינויים
                </motion.span>
              )}
              {saveState === 'loading' && (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  שומר...
                </motion.span>
              )}
              {saveState === 'success' && (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  נשמר!
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        <GlassCard className="overflow-hidden p-4">
          <div className="mb-3 pb-3 border-b border-border">
            <h2 className="font-semibold text-text-primary">סוגי התראות</h2>
            <p className="text-text-muted text-xs mt-1">עריכת אמוג'י, כותרת וקידומת הוראות לכל סוג התראה</p>
          </div>
          <div>
            {(templates ?? []).map(entry => (
              <TemplateRow
                key={entry.alertType}
                entry={entry}
                localEdits={edits[entry.alertType] ?? {}}
                onFieldChange={updateField}
                onReset={handleReset}
              />
            ))}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}
