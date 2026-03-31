import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '../ui/GlassCard';
import { TemplateRow } from './TemplateRow';
import type { TemplateEntry, TemplateEdit } from './TemplateRow';
import type { AlertCategory } from '../../utils/categoryConfig';
import { CATEGORY_META } from '../../utils/categoryConfig';

interface CategorySectionProps {
  category: AlertCategory;
  entries: TemplateEntry[];
  edits: Record<string, Partial<TemplateEdit>>;
  onFieldChange: (alertType: string, field: keyof TemplateEdit, value: string) => void;
  onReset: (alertType: string) => void;
  onResetCategory: (category: AlertCategory) => void;
  onSimulate: (alertType: string) => void;
}

export function CategorySection({
  category,
  entries,
  edits,
  onFieldChange,
  onReset,
  onResetCategory,
  onSimulate,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = CATEGORY_META[category];

  const customizedCount = entries.filter(
    (e) => e.isCustomized || Object.keys(edits[e.alertType] ?? {}).length > 0,
  ).length;

  const hasCustomized = entries.some((e) => e.isCustomized);

  return (
    <GlassCard glow={meta.glowVariant !== 'none' ? meta.glowVariant : undefined}>
      {/* Category header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between py-1"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <h3 className="text-base font-medium text-text-primary">{meta.labelHe}</h3>
          <span className="text-xs text-text-muted">
            {customizedCount > 0
              ? `${customizedCount}/${entries.length} מותאמים`
              : `${entries.length} סוגים`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasCustomized && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onResetCategory(category); }}
              className="text-xs text-text-muted hover:text-red-400 transition-colors px-2 py-1"
            >
              אפס קטגוריה
            </button>
          )}
          <span
            className={`text-text-muted transition-transform ${collapsed ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </div>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              {entries.map((entry) => (
                <TemplateRow
                  key={entry.alertType}
                  entry={entry}
                  localEdits={edits[entry.alertType] ?? {}}
                  onFieldChange={onFieldChange}
                  onReset={onReset}
                  onSimulate={onSimulate}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
