import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '../ui/GlassCard';
import { api } from '../../api/client';
import { ORDERED_CATEGORIES, CATEGORY_META } from '../../utils/categoryConfig';
import type { AlertCategory } from '../../utils/categoryConfig';

const ROUTING_KEYS: Record<AlertCategory, string> = {
  security: 'topic_id_security',
  nature: 'topic_id_nature',
  environmental: 'topic_id_environmental',
  drills: 'topic_id_drills',
  general: 'topic_id_general',
};

export function RoutingSection() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<AlertCategory, string>>({
    security: '',
    nature: '',
    environmental: '',
    drills: '',
    general: '',
  });
  const [dirty, setDirty] = useState(false);

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/api/settings'),
  });

  // Populate form from settings
  useEffect(() => {
    if (!settings) return;
    const next = { ...values };
    for (const cat of ORDERED_CATEGORIES) {
      const key = ROUTING_KEYS[cat];
      next[cat] = settings[key] ?? '';
    }
    setValues(next);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const patch: Record<string, string> = {};
      for (const cat of ORDERED_CATEGORIES) {
        const key = ROUTING_KEYS[cat];
        const val = values[cat].trim();
        patch[key] = val;
      }
      return api.patch('/api/settings', patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setDirty(false);
    },
  });

  const updateValue = (cat: AlertCategory, val: string) => {
    setValues({ ...values, [cat]: val });
    setDirty(true);
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-medium text-text-primary">📡 ניתוב לTopics</h3>
        {dirty && (
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber/15 text-amber
                       hover:bg-amber/25 transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'שומר...' : 'שמור'}
          </button>
        )}
      </div>

      <p className="text-xs text-text-muted mb-3">
        מספר ה-Topic Thread שאליו יישלחו התראות מכל קטגוריה. השאר ריק לשימוש ב-env var.
      </p>

      <div className="space-y-2">
        {ORDERED_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-sm w-6 text-center">{meta.emoji}</span>
              <span className="text-sm text-text-primary w-20">{meta.labelHe}</span>
              <input
                type="text"
                inputMode="numeric"
                value={values[cat]}
                onChange={(e) => updateValue(cat, e.target.value)}
                placeholder={`TELEGRAM_TOPIC_ID_${cat.toUpperCase()}`}
                className="flex-1 bg-base border border-border rounded-lg px-3 py-1.5
                           text-sm text-text-primary placeholder:text-text-muted text-center
                           focus:outline-none focus:border-amber/50"
              />
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted mt-2">
        ⚠️ ערך 1 שמור ל-Telegram ולא יתקבל. שינוי נכנס לתוקף מיידי.
      </p>

      {/* Save success indicator */}
      <AnimatePresence>
        {saveMutation.isSuccess && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-green mt-2"
          >
            ✓ ניתוב עודכן
          </motion.p>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
