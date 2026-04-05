import { Pencil, Trash2, RotateCcw } from 'lucide-react';

export interface SecretInfo {
  key: string;
  masked: string;
  source: 'db' | 'env' | 'none';
  updatedAt: string | null;
  requiresRestart: boolean;
}

interface SecretCardProps {
  secret: SecretInfo;
  onEdit: () => void;
  onDelete: () => void;
}

const KEY_LABELS: Record<string, string> = {
  telegram_bot_token: 'Telegram Bot Token',
  mapbox_access_token: 'Mapbox Access Token',
  github_pat: 'GitHub PAT',
  telegram_api_id: 'Telegram API ID',
  telegram_api_hash: 'Telegram API Hash',
};

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  db:   { label: 'DB',     cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
  env:  { label: 'ENV',    cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  none: { label: 'חסר',   cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function SecretCard({ secret, onEdit, onDelete }: SecretCardProps) {
  const label = KEY_LABELS[secret.key] ?? secret.key;
  const badge = SOURCE_BADGES[secret.source];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-glass)] p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{label}</span>
            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${badge.cls}`}>
              {badge.label}
            </span>
            {secret.requiresRestart && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-400">
                <RotateCcw size={10} />
                restart
              </span>
            )}
          </div>
          <code className="mt-1.5 block text-xs text-text-secondary" dir="ltr">
            {secret.masked}
          </code>
          {secret.updatedAt && (
            <span className="mt-1 block text-[11px] text-text-secondary/60">
              עודכן: {new Date(secret.updatedAt + 'Z').toLocaleString('he-IL')}
            </span>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onEdit}
            className="rounded-md p-1.5 text-text-secondary transition hover:bg-blue-500/10 hover:text-blue-400"
            title="ערוך"
          >
            <Pencil size={14} />
          </button>
          {secret.source === 'db' && (
            <button
              onClick={onDelete}
              className="rounded-md p-1.5 text-text-secondary transition hover:bg-red-500/10 hover:text-red-400"
              title="מחק (חזרה ל-ENV)"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
