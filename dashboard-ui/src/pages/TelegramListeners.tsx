import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Phone, Unplug, MessageCircle, Radio } from 'lucide-react';
import { api } from '../api/client';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { LiveDot } from '../components/ui/LiveDot';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { ListenersBanner } from './telegram-listeners/ListenersBanner';
import { KeywordHelp } from './telegram-listeners/KeywordHelp';
import { RuleCard, type TelegramListenerRule } from './telegram-listeners/RuleCard';
import { SourceSelector, type TelegramKnownChat, type TelegramKnownTopic } from './telegram-listeners/SourceSelector';

type TelegramStatus = 'connected' | 'connecting' | 'awaiting_code' | 'awaiting_password' | 'disconnected';

interface TelegramStatusResponse {
  status: TelegramStatus;
  phone: string | null;
}

interface TelegramTopic {
  id: number;
  name: string;
}

// ── Keyword Input ─────────────────────────────────────────────────────────────

interface KeywordInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
}

function KeywordInput({ keywords, onChange }: KeywordInputProps) {
  const [inputVal, setInputVal] = useState('');

  const addKeyword = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
    }
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(inputVal);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-base border border-border rounded-lg min-h-[42px]">
      {keywords.map(kw => (
        <span
          key={kw}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--color-glow-amber)] border border-amber/30 text-amber"
        >
          {kw}
          <button
            type="button"
            onClick={() => onChange(keywords.filter(k => k !== kw))}
            className="hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={keywords.length === 0 ? 'הקלד מילת מפתח ואשר עם Enter (ריק = כל הודעה)' : 'הוסף מילה...'}
        className="flex-1 min-w-[180px] bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
    </div>
  );
}

// ── Connection Section ────────────────────────────────────────────────────────

interface ConnectionSectionProps {
  statusData: TelegramStatusResponse | undefined;
  onRefreshStatus: () => void;
}

function ConnectionSection({ statusData, onRefreshStatus }: ConnectionSectionProps) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  const status = statusData?.status ?? 'disconnected';
  const connectedPhone = statusData?.phone ?? null;

  const connectMutation = useMutation({
    mutationFn: (phoneNum: string) => api.post('/api/telegram/connect', { phone: phoneNum }) as Promise<{ phoneCodeHash: string }>,
    onSuccess: (data: { phoneCodeHash: string }) => {
      setPendingHash(data.phoneCodeHash);
      queryClient.invalidateQueries({ queryKey: ['telegram-listener-status'] });
      toast.success('קוד נשלח לטלפון');
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'שגיאה בשליחת הקוד';
      toast.error(msg);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (otp: string) => api.post('/api/telegram/verify', { code: otp, phoneCodeHash: pendingHash }),
    onSuccess: () => {
      setCode('');
      setPendingHash(null);
      queryClient.invalidateQueries({ queryKey: ['telegram-listener-status'] });
      queryClient.invalidateQueries({ queryKey: ['tg-chats'] });
      onRefreshStatus();
      toast.success('חיבור הצליח');
    },
    onError: (err: unknown) => {
      const apiErr = err as { message?: string };
      if (apiErr?.message?.includes('SESSION_PASSWORD_NEEDED')) {
        queryClient.invalidateQueries({ queryKey: ['telegram-listener-status'] });
        toast('נדרשת סיסמת 2FA', { icon: '🔐' });
      } else {
        toast.error('קוד שגוי — נסה שוב');
      }
    },
  });

  const verifyPasswordMutation = useMutation({
    mutationFn: (pw: string) => api.post('/api/telegram/verify-password', { password: pw }),
    onSuccess: () => {
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['telegram-listener-status'] });
      queryClient.invalidateQueries({ queryKey: ['tg-chats'] });
      onRefreshStatus();
      toast.success('חיבור הצליח');
    },
    onError: () => toast.error('סיסמה שגויה — נסה שוב'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/telegram/disconnect', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-listener-status'] });
      toast.success('מנותק');
    },
    onError: () => toast.error('שגיאה בניתוק'),
  });

  const statusBadge = {
    connected:         { label: 'מחובר', color: 'text-green' },
    connecting:        { label: 'מתחבר...', color: 'text-amber' },
    awaiting_code:     { label: 'ממתין לקוד', color: 'text-amber' },
    awaiting_password: { label: 'ממתין לסיסמה', color: 'text-amber' },
    disconnected:      { label: 'מנותק', color: 'text-text-muted' },
  }[status];

  return (
    <GlassCard className="p-6">
      <div className="mb-4 pb-3 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-text-primary">חיבור חשבון טלגרם</h2>
        <div className="flex items-center gap-2">
          <LiveDot color={status === 'connected' ? 'green' : status === 'disconnected' ? 'red' : 'amber'} />
          <span className={`text-xs font-medium ${statusBadge.color}`}>{statusBadge.label}</span>
        </div>
      </div>

      {status === 'connected' && connectedPhone && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-text-muted" />
            <span className="text-sm text-text-primary font-mono">{connectedPhone}</span>
          </div>
          <button
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Unplug size={14} />
            התנתק
          </button>
        </div>
      )}

      {status === 'connecting' && (
        <div className="flex items-center gap-3 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" />
          <span>מתחבר...</span>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            הזן את מספר הטלפון המשויך לחשבון הטלגרם שלך. תקבל קוד אימות ב-Telegram.
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+972501234567"
              dir="ltr"
              className="flex-1 bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 placeholder:text-text-muted"
            />
            <button
              onClick={() => phone && connectMutation.mutate(phone)}
              disabled={!phone || connectMutation.isPending}
              className="px-4 py-2 bg-[var(--color-amber)] text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              שלח קוד
            </button>
          </div>
        </div>
      )}

      {status === 'awaiting_code' && (
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            קוד אימות נשלח לחשבון הטלגרם שלך. הזן אותו כאן.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="12345"
              dir="ltr"
              maxLength={6}
              className="flex-1 bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 placeholder:text-text-muted"
            />
            <button
              onClick={() => code && verifyMutation.mutate(code)}
              disabled={!code || verifyMutation.isPending}
              className="px-4 py-2 bg-[var(--color-amber)] text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {verifyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              אמת
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setPendingHash(null); disconnectMutation.mutate(); }}
            className="text-text-muted text-xs hover:text-text-secondary underline"
          >
            ← ביטול
          </button>
        </div>
      )}

      {status === 'awaiting_password' && (
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            🔐 חשבון זה מוגן ב-2FA. הזן את סיסמת הטלגרם שלך.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="סיסמת 2FA"
              dir="ltr"
              className="flex-1 bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 placeholder:text-text-muted"
            />
            <button
              onClick={() => password && verifyPasswordMutation.mutate(password)}
              disabled={!password || verifyPasswordMutation.isPending}
              className="px-4 py-2 bg-[var(--color-amber)] text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {verifyPasswordMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              אשר
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  chatId: '',
  chatName: '',
  keywords: [] as string[],
  telegramTopicId: null as number | null,
  sourceTopicId: null as number | null,
  forwardToWhatsApp: false,
  isActive: true,
};

export function TelegramListeners() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: statusData, refetch: refetchStatus } = useQuery<TelegramStatusResponse>({
    queryKey: ['telegram-listener-status'],
    queryFn: () => api.get('/api/telegram/status'),
    refetchInterval: (query) => {
      const s = (query.state.data as TelegramStatusResponse | undefined)?.status;
      if (s === 'connecting' || s === 'awaiting_code' || s === 'awaiting_password') return 2000;
      return 10000;
    },
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<TelegramListenerRule[]>({
    queryKey: ['tg-listeners'],
    queryFn: () => api.get('/api/telegram/listeners'),
  });

  const { data: chats } = useQuery<TelegramKnownChat[]>({
    queryKey: ['tg-chats'],
    queryFn: () => api.get('/api/telegram/chats'),
  });

  const refreshChatsMutation = useMutation({
    mutationFn: () => api.post('/api/telegram/refresh-chats', {}) as Promise<{ count: number }>,
    onSuccess: (data: { count: number }) => {
      queryClient.invalidateQueries({ queryKey: ['tg-chats'] });
      toast.success(data.count > 0 ? `נמצאו ${data.count} קבוצות` : 'לא נמצאו קבוצות — נסה שוב');
    },
    onError: () => toast.error('שגיאה ברענון הקבוצות'),
  });

  const selectedChat = chats?.find(c => c.chatId === form.chatId);
  const isForum = selectedChat?.isForum ?? false;

  const { data: sourceTopics } = useQuery<TelegramKnownTopic[]>({
    queryKey: ['tg-chat-topics', form.chatId],
    queryFn: () => api.get(`/api/telegram/chats/${encodeURIComponent(form.chatId)}/topics`),
    enabled: !!form.chatId && isForum,
  });

  const { data: topics } = useQuery<TelegramTopic[]>({
    queryKey: ['tg-listener-topics'],
    queryFn: () => api.get('/api/telegram/listeners/telegram-topics'),
  });

  // Auto-fill chatName when chatId changes
  useEffect(() => {
    if (!form.chatId) return;
    const chat = chats?.find(c => c.chatId === form.chatId);
    if (chat) setForm(prev => ({ ...prev, chatName: chat.chatName }));
  }, [form.chatId, chats]);

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      api.post('/api/telegram/listeners', {
        ...data,
        chatType: chats?.find(c => c.chatId === data.chatId)?.chatType ?? 'group',
        telegramTopicName: topics?.find(t => t.id === data.telegramTopicId)?.name ?? null,
        sourceTopicId: data.sourceTopicId,
      }),
    onSuccess: () => {
      toast.success('כלל נוסף');
      queryClient.invalidateQueries({ queryKey: ['tg-listeners'] });
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 409) toast.error('קיים כבר כלל עבור צ\'אט זה');
      else toast.error('שגיאה בהוספת הכלל');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_FORM> & { telegramTopicName?: string | null; sourceTopicId?: number | null } }) =>
      api.patch(`/api/telegram/listeners/${id}`, data),
    onSuccess: () => {
      toast.success('כלל עודכן');
      queryClient.invalidateQueries({ queryKey: ['tg-listeners'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: () => toast.error('שגיאה בעדכון הכלל'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/telegram/listeners/${id}`),
    onSuccess: () => {
      toast.success('כלל נמחק');
      queryClient.invalidateQueries({ queryKey: ['tg-listeners'] });
      setDeleteConfirmId(null);
    },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleToggleActive = (rule: TelegramListenerRule) => {
    updateMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
  };

  const handleEdit = (rule: TelegramListenerRule) => {
    setEditingId(rule.id);
    setForm({
      chatId: rule.chatId,
      chatName: rule.chatName,
      keywords: rule.keywords,
      telegramTopicId: rule.telegramTopicId,
      sourceTopicId: rule.sourceTopicId ?? null,
      forwardToWhatsApp: rule.forwardToWhatsApp,
      isActive: rule.isActive,
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chatId || !form.chatName) {
      toast.error('יש לבחור מקור ולהזין שם');
      return;
    }
    if (editingId != null) {
      updateMutation.mutate({
        id: editingId,
        data: {
          chatName: form.chatName,
          keywords: form.keywords,
          telegramTopicId: form.telegramTopicId,
          telegramTopicName: topics?.find(t => t.id === form.telegramTopicId)?.name ?? null,
          sourceTopicId: form.sourceTopicId,
          forwardToWhatsApp: form.forwardToWhatsApp,
          isActive: form.isActive,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const deleteTarget = deleteConfirmId != null ? rules?.find(r => r.id === deleteConfirmId) : null;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isConnected = statusData?.status === 'connected';

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <MessageCircle size={22} className="text-[var(--color-tg)] flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary leading-tight">מאזיני Telegram</h1>
            <p className="text-sm text-text-muted mt-0.5">כללי העברת הודעות מקבוצות Telegram לערוץ</p>
          </div>
        </div>

        {/* Connection section */}
        <ConnectionSection
          statusData={statusData}
          onRefreshStatus={() => void refetchStatus()}
        />

        <ListenersBanner />

        {/* Rules List */}
        <GlassCard className="p-6">
          <div className="mb-4 pb-3 border-b border-border">
            <h2 className="font-semibold text-text-primary">כללי האזנה</h2>
            <p className="text-text-muted text-xs mt-1">כל הודעה מטלגרם שתתאים לכלל תועבר לנושא הייעודי</p>
          </div>

          {rulesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !rules || rules.length === 0 ? (
            <div className="py-6">
              <EmptyState icon={<Radio size={36} />} message="אין כללי האזנה עדיין" />
              <p className="text-center text-text-muted text-xs -mt-2">מלא את הטופס למטה כדי להוסיף כלל ראשון</p>
            </div>
          ) : (
            <div>
              {rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={handleEdit}
                  onDelete={setDeleteConfirmId}
                  onToggle={handleToggleActive}
                  disabled={updateMutation.isPending}
                />
              ))}
            </div>
          )}
        </GlassCard>

        {/* Add / Edit Form */}
        <div ref={formRef}>
          <GlassCard className="p-6">
            <div className="mb-4 pb-3 border-b border-border">
              <h2 className="font-semibold text-text-primary">
                {editingId != null ? 'עריכת כלל' : 'הוסף כלל האזנה'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <SourceSelector
                chats={chats}
                topics={sourceTopics}
                value={form.chatId}
                sourceTopicId={form.sourceTopicId}
                onChangeChatId={chatId => setForm(prev => ({ ...prev, chatId, sourceTopicId: null }))}
                onChangeTopicId={sourceTopicId => setForm(prev => ({ ...prev, sourceTopicId }))}
                disabled={editingId != null}
                telegramConnected={isConnected}
                onRefresh={() => refreshChatsMutation.mutate()}
                refreshing={refreshChatsMutation.isPending}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-text-secondary">שם תצוגה</label>
                <input
                  type="text"
                  value={form.chatName}
                  onChange={e => setForm(prev => ({ ...prev, chatName: e.target.value }))}
                  placeholder="שם קבוצה או ערוץ..."
                  className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 transition-colors placeholder:text-text-muted"
                />
                <p className="text-text-muted text-xs">ממולא אוטומטית מבחירת המקור — ניתן לשנות</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-text-secondary">מילות מפתח</label>
                <KeywordInput
                  keywords={form.keywords}
                  onChange={keywords => setForm(prev => ({ ...prev, keywords }))}
                />
                <KeywordHelp />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-text-secondary">נושא יעד בטלגרם</label>
                <select
                  value={form.telegramTopicId ?? ''}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(prev => ({ ...prev, telegramTopicId: val ? Number(val) : null }));
                  }}
                  className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 transition-colors"
                >
                  <option value="">נושא ברירת מחדל (עדכונים וחדשות)</option>
                  {topics?.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {(!topics || topics.length === 0) && (
                  <p className="text-text-muted text-xs">אין נושאי פורום — הקבוצה אינה פורום</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <ToggleSwitch
                  value={form.forwardToWhatsApp}
                  onChange={forwardToWhatsApp => setForm(prev => ({ ...prev, forwardToWhatsApp }))}
                />
                <label className="text-sm text-text-secondary">העבר גם לקבוצות WhatsApp</label>
              </div>

              <div className="flex items-center gap-3">
                <ToggleSwitch
                  value={form.isActive}
                  onChange={isActive => setForm(prev => ({ ...prev, isActive }))}
                />
                <label className="text-sm text-text-secondary">פעיל</label>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[var(--color-amber)] text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSaving ? 'שומר...' : editingId != null ? 'שמור שינויים' : 'הוסף כלל'}
                </button>
                {editingId != null && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-surface border border-border text-text-secondary text-sm rounded-lg hover:bg-base transition-colors"
                  >
                    ביטול
                  </button>
                )}
              </div>
            </form>
          </GlassCard>
        </div>
      </div>

      <ConfirmModal
        open={deleteConfirmId != null}
        title="מחיקת כלל האזנה"
        description={deleteTarget ? `האם למחוק את הכלל עבור "${deleteTarget.chatName}"?` : 'האם למחוק את הכלל?'}
        onConfirm={() => deleteConfirmId != null && deleteMutation.mutate(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </PageTransition>
  );
}
