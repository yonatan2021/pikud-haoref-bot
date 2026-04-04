import { Pencil, Trash2, Hash } from 'lucide-react';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';

export interface TelegramListenerRule {
  id: number;
  chatId: string;
  chatName: string;
  chatType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  forwardToWhatsApp: boolean;
  isActive: boolean;
  sourceTopicId: number | null;
  createdAt: string;
}

interface RuleCardProps {
  rule: TelegramListenerRule;
  onEdit: (rule: TelegramListenerRule) => void;
  onDelete: (id: number) => void;
  onToggle: (rule: TelegramListenerRule) => void;
  disabled: boolean;
}

function chatTypeLabel(type: string): string {
  if (type === 'channel') return 'ערוץ';
  if (type === 'supergroup') return 'סופר-קבוצה';
  return 'קבוצה';
}

export function RuleCard({ rule, onEdit, onDelete, onToggle, disabled }: RuleCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-4 border-b border-border last:border-0">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-text-primary text-sm">{rule.chatName}</span>
          <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-glow-amber)] border border-amber/30 text-amber">
            {chatTypeLabel(rule.chatType)}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
            rule.isActive
              ? 'bg-green/10 border border-green/30 text-green'
              : 'bg-white/5 border border-border text-text-muted'
          }`}>
            {rule.isActive ? '● פעיל' : '○ כבוי'}
          </span>
          {rule.telegramTopicId != null && rule.telegramTopicName && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-white/5 border border-border text-text-muted">
              {rule.telegramTopicName}
            </span>
          )}
          {rule.sourceTopicId != null && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-white/5 border border-border text-text-muted">
              <Hash size={10} />
              נושא {rule.sourceTopicId}
            </span>
          )}
          {rule.forwardToWhatsApp && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-glow-amber)] border border-amber/30 text-amber">
              📲 WA
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rule.keywords.length === 0 ? (
            <span className="text-text-muted text-xs">כל הודעה</span>
          ) : (
            rule.keywords.map(kw => (
              <span
                key={kw}
                className="bg-[var(--color-glow-amber)] border border-amber/30 text-amber text-xs px-2 py-0.5 rounded-full"
              >
                {kw}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <ToggleSwitch
          value={rule.isActive}
          onChange={() => onToggle(rule)}
          disabled={disabled}
        />
        <button
          onClick={() => onEdit(rule)}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          title="ערוך"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors"
          title="מחק"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
