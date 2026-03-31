import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { ConfirmModal } from '../ConfirmModal';
import type { TemplateEntry, TemplateEdit } from './TemplateRow';

interface StatusOverviewBarProps {
  templates: TemplateEntry[];
  edits: Record<string, Partial<TemplateEdit>>;
  onResetAll: () => void;
}

export function StatusOverviewBar({ templates, edits, onResetAll }: StatusOverviewBarProps) {
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const customizedCount = templates.filter(
    (t) => t.isCustomized || Object.keys(edits[t.alertType] ?? {}).length > 0,
  ).length;

  const hasCustomized = templates.some((t) => t.isCustomized);

  return (
    <>
      <GlassCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-primary text-sm font-medium">
              {customizedCount} מתוך {templates.length} סוגים מותאמים
            </span>
            {customizedCount > 0 && (
              <div className="h-2 w-24 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber rounded-full transition-all duration-300"
                  style={{ width: `${(customizedCount / templates.length) * 100}%` }}
                />
              </div>
            )}
          </div>
          {hasCustomized && (
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="text-xs text-text-muted hover:text-red-400 transition-colors
                         px-3 py-1.5 rounded-lg border border-border hover:border-red-400/30"
            >
              אפס הכל
            </button>
          )}
        </div>
      </GlassCard>

      <ConfirmModal
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onConfirm={() => { onResetAll(); setResetModalOpen(false); }}
        title="אפס את כל התבניות?"
        description="פעולה זו תחזיר את כל סוגי ההתראות לברירת המחדל. אי אפשר לבטל."
        danger
      />
    </>
  );
}
