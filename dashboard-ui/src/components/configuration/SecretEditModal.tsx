import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretEditModalProps {
  secretKey: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  saving: boolean;
}

const KEY_LABELS: Record<string, string> = {
  telegram_bot_token: 'Telegram Bot Token',
  mapbox_access_token: 'Mapbox Access Token',
  github_pat: 'GitHub PAT',
  telegram_api_id: 'Telegram API ID',
  telegram_api_hash: 'Telegram API Hash',
};

export function SecretEditModal({ secretKey, onSave, onCancel, saving }: SecretEditModalProps) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);

  const label = KEY_LABELS[secretKey] ?? secretKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-text-primary">
          {label}
        </h3>

        <div className="relative">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="הזן ערך חדש..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-glass)] px-4 py-2.5 pl-10 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
            dir="ltr"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => onSave(value.trim())}
            disabled={saving || !value.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
