import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { AnimatedCounter } from '../components/ui/AnimatedCounter';
import { LiveDot } from '../components/ui/LiveDot';

interface QueueStats {
  pending: number;
  rateLimited: boolean;
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
  const [sendState, setSendState] = useState<'idle' | 'loading' | 'success'>('idle');
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (sendTimerRef.current) clearTimeout(sendTimerRef.current); }, []);

  const { data: queue, isError: queueError } = useQuery<QueueStats>({
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
    onMutate: () => setSendState('loading'),
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
      setSendState('success');
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => setSendState('idle'), 2000);
    },
    onError: () => {
      toast.error('שגיאה בשליחת broadcast');
      setBroadcastConfirm(false);
      setSendState('idle');
    },
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
    try { return JSON.parse(row.cities) as string[]; }
    catch (e) { console.error(`Failed to parse cities for alert window row ${row.id}:`, e); return []; }
  };

  const pendingCount = queue?.pending ?? 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">מרכז פיקוד</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Broadcast */}
          <GlassCard className="p-4">
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
                  disabled={!broadcastText.trim() || broadcastMutation.isPending}
                  onClick={() => setBroadcastConfirm(true)}
                  className={`px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2 min-w-[120px] justify-center ${
                    sendState === 'success'
                      ? 'bg-green text-white'
                      : 'bg-amber hover:bg-amber-dark text-black'
                  }`}
                >
                  <AnimatePresence mode="wait">
                    {sendState === 'idle' && (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                      >
                        שלח Broadcast
                      </motion.span>
                    )}
                    {sendState === 'loading' && (
                      <motion.span
                        key="loading"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        שולח...
                      </motion.span>
                    )}
                    {sendState === 'success' && (
                      <motion.span
                        key="success"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        נשלח!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>
          </GlassCard>

          {/* DM Queue */}
          <GlassCard glow="amber" className="p-4">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              📬 תור הודעות DM
            </h2>
            {queueError ? (
              <p className="text-red-400 text-sm">שגיאה בטעינת תור — רענן</p>
            ) : queue ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-text-secondary text-sm">ממתין בתור</span>
                  <AnimatedCounter
                    value={pendingCount}
                    className="text-2xl font-bold text-text-primary"
                    aria-label={`${pendingCount} הודעות ממתינות`}
                  />
                </div>
                <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (pendingCount / 50) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex gap-3">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${queue.rateLimited ? 'bg-red-500/20 text-red-400' : 'bg-green/20 text-green'}`}>
                    {queue.rateLimited ? '⚠️ Rate Limited' : '✓ תקין'}
                  </span>
                </div>
                <p className="text-text-muted text-xs">מתעדכן כל 3 שניות</p>
              </div>
            ) : (
              <p className="text-text-muted text-sm">טוען...</p>
            )}
          </GlassCard>
        </div>

        {/* Alert Window */}
        <GlassCard className="p-4">
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
                  {alertWindow.map(row => {
                    const cities = parsedCities(row);
                    return (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-base/40">
                        <td className="py-3 px-3">
                          <span className="flex items-center gap-1.5">
                            <LiveDot color="amber" size="sm" aria-label="" />
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{row.alert_type}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-text-secondary text-xs">
                          {cities.slice(0, 3).join(', ')}
                          {cities.length > 3 && ` +${cities.length - 3}`}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Test Alert */}
        <GlassCard className="p-4">
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
        </GlassCard>

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
    </PageTransition>
  );
}
