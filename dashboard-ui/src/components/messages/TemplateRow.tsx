import { useState } from 'react';
import { EmojiPicker } from './EmojiPicker';
import { VersionHistoryPanel } from './VersionHistoryPanel';

export interface TemplateEntry {
  alertType: string;
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
  isCustomized: boolean;
  defaults: { emoji: string; titleHe: string; instructionsPrefix: string };
}

export interface TemplateEdit {
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
}

interface TemplateRowProps {
  entry: TemplateEntry;
  localEdits: Partial<TemplateEdit>;
  onFieldChange: (alertType: string, field: keyof TemplateEdit, value: string) => void;
  onReset: (alertType: string) => void;
  onSimulate: (alertType: string) => void;
}

const FIELD_TOOLTIPS: Record<keyof TemplateEdit, string> = {
  emoji: 'האמוג׳י שמוצג בכותרת ההודעה',
  titleHe: 'שם ההתראה בעברית — מוצג כ-bold בכותרת',
  instructionsPrefix: 'תווית לפני הוראות ההתראה — "🛡" הופך ל- 🛡 היכנסו למרחב מוגן',
};

export function TemplateRow({
  entry,
  localEdits,
  onFieldChange,
  onReset,
  onSimulate,
}: TemplateRowProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const currentEmoji = localEdits.emoji ?? entry.emoji;
  const currentTitle = localEdits.titleHe ?? entry.titleHe;
  const currentPrefix = localEdits.instructionsPrefix ?? entry.instructionsPrefix;
  const hasEdits = Object.keys(localEdits).length > 0;
  const isModified = entry.isCustomized || hasEdits;

  return (
    <div className="py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-3">
        {/* Emoji picker */}
        <EmojiPicker
          value={currentEmoji}
          onChange={(v) => onFieldChange(entry.alertType, 'emoji', v)}
        />

        {/* Title input */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={currentTitle}
            onChange={(e) => onFieldChange(entry.alertType, 'titleHe', e.target.value)}
            title={FIELD_TOOLTIPS.titleHe}
            placeholder="כותרת בעברית"
            className="w-full bg-base border border-border rounded-lg px-3 py-1.5
                       text-sm text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-amber/50"
          />
        </div>

        {/* Instructions prefix input */}
        <div className="w-24 shrink-0">
          <input
            type="text"
            value={currentPrefix}
            onChange={(e) => onFieldChange(entry.alertType, 'instructionsPrefix', e.target.value)}
            title={FIELD_TOOLTIPS.instructionsPrefix}
            placeholder="קידומת"
            className="w-full bg-base border border-border rounded-lg px-3 py-1.5
                       text-sm text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-amber/50 text-center"
          />
        </div>

        {/* Customized badge */}
        {isModified && (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber/15 text-amber font-medium">
            מותאם
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSimulate(entry.alertType)}
            title="תצוגה מקדימה"
            className="w-7 h-7 rounded-md flex items-center justify-center
                       text-text-muted hover:text-blue hover:bg-blue/10 transition-colors text-sm"
          >
            👁
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            title="היסטוריית גרסאות"
            className="w-7 h-7 rounded-md flex items-center justify-center
                       text-text-muted hover:text-amber hover:bg-amber/10 transition-colors text-sm"
          >
            🕐
          </button>
          {entry.isCustomized && (
            <button
              type="button"
              onClick={() => onReset(entry.alertType)}
              title="אפס לברירת מחדל"
              className="w-7 h-7 rounded-md flex items-center justify-center
                         text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* Version history panel — inline, below the row */}
      <VersionHistoryPanel
        alertType={entry.alertType}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentValues={{
          emoji: currentEmoji,
          titleHe: currentTitle,
          instructionsPrefix: currentPrefix,
        }}
      />
    </div>
  );
}
