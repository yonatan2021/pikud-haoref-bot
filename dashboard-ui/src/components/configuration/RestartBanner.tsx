import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { AlertTriangle } from 'lucide-react';

interface RestartNeeded {
  needed: boolean;
  changedKeys: string[];
}

const KEY_LABELS: Record<string, string> = {
  telegram_bot_token: 'Telegram Bot Token',
  telegram_api_id: 'Telegram API ID',
  telegram_api_hash: 'Telegram API Hash',
  health_port: 'Health Port',
  dashboard_port: 'Dashboard Port',
  telegram_listener_enabled: 'Telegram Listener',
};

export function RestartBanner() {
  const { data } = useQuery({
    queryKey: ['secrets-restart-needed'],
    queryFn: () => api.get<RestartNeeded>('/api/secrets/restart-needed'),
    refetchInterval: 30_000,
  });

  if (!data?.needed) return null;

  const labels = data.changedKeys.map(k => KEY_LABELS[k] ?? k).join(', ');

  return (
    <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
      <AlertTriangle size={18} className="shrink-0 text-amber-400" />
      <span className="text-sm">
        <strong>הפעלה מחדש נדרשת</strong> — שינויים ב: {labels}
      </span>
    </div>
  );
}
