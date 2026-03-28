import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';

interface QueueStats {
  pending: number;
  rateLimited: boolean;
  paused: boolean;
}

interface AlertWindowRow {
  id: number;
  alert_type: string;
  cities: string;
  sent_at: number;
  has_photo: number;
}

interface OverviewStats {
  totalSubscribers: number;
}

function relTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  return `לפני ${Math.round(s / 3600)} שע׳`;
}

export function Operations() {
  const qc = useQueryClient();
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastConfirm, setBroadcastConfirm] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearTypeConfirm, setClearTypeConfirm] = useState<string | null>(null);
  const [testChatId, setTestChatId] = useState('');
  const [testText, setTestText] = useState('');

  const { data: queue } = useQuery<QueueStats>({
    queryKey: ['queue'],
    queryFn: () => api.get('/api/operations/queue'),
    refetchInterval: 3000,
  });

  const { data: alertWindow = [] } = useQuery<AlertWindowRow[]>({
    queryKey: ['alert-window'],
    queryFn: () => api.get('/api/operations/alert-window'),
    refetchInterval: 10_000,
  });

  const { data: overview } = useQuery<OverviewStats>({
    queryKey: ['overview'],
    queryFn: () => api.get('/api/stats/overview'),
  });

  const broadcastMutation = useMutation({
    mutationFn: () => api.post('/api/operations/broadcast', { text: broadcastText }),
    onSuccess: (data: unknown) => {
      const result = data as { queued?: number; sent?: number; failed?: number };
      if (result.queued !== undefined) {
        toast.success(`הועבר לתור: ${result.queued} מנויים`);
      } else {
        const msg = result.failed ? `נשלח ל-${result.sent} מנויים, ${result.failed} כשלונות` : `נשלח ל-${result.sent} מנויים ✓`;
        toast.success(msg);
      }
      setBroadcastText('');
      setBroadcastConfirm(false);
    },
    onError: () => { toast.error('שגיאה בשליחת broadcast'); setBroadcastConfirm(false); },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => api.delete('/api/operations/alert-window'),
    onSuccess: () => { toast.success('חלון ההתראות נוקה'); qc.invalidateQueries({ queryKey: ['alert-window'] }); setClearAllConfirm(false); },
    onError: () => toast.error('שגיאה בניקוי'),
  });

  const clearTypeMutation = useMutation({
    mutationFn: (type: string) => api.delete(`/api/operations/alert-window/${type}`),
    onSuccess: () => { toast.success('סוג ההתראה נוקה'); qc.invalidateQueries({ queryKey: ['alert-window'] }); setClearTypeConfirm(null); },
    onError: () => toast.error('שגיאה בניקוי'),
  });

  const testAlertMutation = useMutation({
    mutationFn: () => api.post('/api/operations/test-alert', { chatId: parseInt(testChatId, 10), text: testText }),
    onSuccess: () => { toast.success('הודעת בדיקה נשלחה'); setTestText(''); },
    onError: () => toast.error('שגיאה בשליחת בדיקה'),
  });

  const parsedCities = (row: AlertWindowRow): string[] => {
    try { return JSON.parse(row.cities) as string[]; } catch { return []; }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">מרכז פיקוד</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            📢 שליחת Broadcast
          </h2>
          <div className="space-y-3">
            <textarea
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              placeholder="תוכן ההודעה בפורמט HTML..."
              rows={5}
              className="w-full bg-base border border-border rounded-lg px-4 py-3 text-sm text-text-primary outline-none focus:border-amber resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-xs">
                ישלח ל-<strong className="text-text-secondary">{overview?.totalSubscribers ?? '...'}</strong> מנויים
              </span>
              <button
                disabled={!broadcastText.trim()}
                onClick={() => setBroadcastConfirm(true)}
                className="px-4 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg disabled:opacity-40 transition-colors"
              >
                שלח Broadcast
              </button>
            </div>
          </div>
        </div>

        {/* DM Queue */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            📬 תור הודעות DM
          </h2>
          {queue ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-text-secondary text-sm">ממתין בתור</span>
                <span className="text-2xl font-bold text-text-primary">{queue.pending}</span>
              </div>
              <div className="flex gap-3">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${queue.rateLimited ? 'bg-red-500/20 text-red-400' : 'bg-green/20 text-green'}`}>
                  {queue.rateLimited ? '⚠️ Rate Limited' : '✓ תקין'}
                </span>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${queue.paused ? 'bg-amber/20 text-amber' : 'bg-surface border border-border text-text-muted'}`}>
                  {queue.paused ? '⏸ מושהה' : '▶ פעיל'}
                </span>
              </div>
              <p className="text-text-muted text-xs">מתעדכן כל 3 שניות</p>
            </div>
          ) : (
            <p className="text-text-muted text-sm">טוען...</p>
          )}
        </div>
      </div>

      {/* Alert Window */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            🪟 חלון ההתראות הפעיל
          </h2>
          {alertWindow.length > 0 && (
            <button
              onClick={() => setClearAllConfirm(true)}
              className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 px-3 py-1 rounded-lg"
            >
              נקה הכל
            </button>
          )}
        </div>
        {alertWindow.length === 0 ? (
          <EmptyState icon="🪟" message="חלון ההתראות ריק" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs border-b border-border">
                  <th className="py-2 px-3 text-right font-medium">סוג</th>
                  <th className="py-2 px-3 text-right font-medium">ערים</th>
                  <th className="py-2 px-3 text-right font-medium">נשלח</th>
                  <th className="py-2 px-3 text-right font-medium">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {alertWindow.map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-base/40">
                    <td className="py-3 px-3">
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{row.alert_type}</span>
                    </td>
                    <td className="py-3 px-3 text-text-secondary text-xs">
                      {parsedCities(row).slice(0, 3).join(', ')}
                      {parsedCities(row).length > 3 && ` +${parsedCities(row).length - 3}`}
                    </td>
                    <td className="py-3 px-3 text-text-muted text-xs">{relTime(row.sent_at)}</td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => setClearTypeConfirm(row.alert_type)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        נקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Alert */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="font-semibold text-text-primary mb-4">🧪 שליחת הודעת בדיקה</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-text-muted text-xs block mb-1">Chat ID</label>
            <input
              type="number"
              value={testChatId}
              onChange={e => setTestChatId(e.target.value)}
              placeholder="123456789"
              className="w-full bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
            />
          </div>
          <div>
            <label className="text-text-muted text-xs block mb-1">תוכן הבדיקה</label>
            <input
              type="text"
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder="טקסט הבדיקה..."
              className="w-full bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
            />
          </div>
        </div>
        <button
          disabled={!testChatId || !testText || testAlertMutation.isPending}
          onClick={() => testAlertMutation.mutate()}
          className="mt-4 px-6 py-2 bg-surface border border-border hover:bg-base text-text-secondary text-sm rounded-lg disabled:opacity-40"
        >
          {testAlertMutation.isPending ? 'שולח...' : 'שלח בדיקה'}
        </button>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={broadcastConfirm}
        title="אישור Broadcast"
        description={`תשלח ל-${overview?.totalSubscribers ?? '?'} מנויים. האם להמשיך?`}
        onConfirm={() => broadcastMutation.mutate()}
        onCancel={() => setBroadcastConfirm(false)}
        danger={false}
      />
      <ConfirmModal
        open={clearAllConfirm}
        title="ניקוי חלון ההתראות"
        description="האם לנקות את כל חלון ההתראות הפעיל?"
        onConfirm={() => clearAllMutation.mutate()}
        onCancel={() => setClearAllConfirm(false)}
        danger
      />
      <ConfirmModal
        open={clearTypeConfirm !== null}
        title="ניקוי סוג התראה"
        description={`האם לנקות את סוג "${clearTypeConfirm}" מחלון ההתראות?`}
        onConfirm={() => clearTypeConfirm !== null && clearTypeMutation.mutate(clearTypeConfirm)}
        onCancel={() => setClearTypeConfirm(null)}
        danger
      />
    </div>
  );
}
