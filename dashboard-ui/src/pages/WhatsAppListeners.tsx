import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../api/client';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { ConfirmModal } from '../components/ConfirmModal';

interface WhatsAppChat {
  id: string;
  name: string;
  type: 'group' | 'newsletter';
}

interface TelegramTopic {
  id: number;
  name: string;
}

interface ListenerRule {
  id: number;
  channelId: string;
  channelName: string;
  channelType: string;
  keywords: string[];
  telegramTopicId: number | null;
  telegramTopicName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ value, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${value ? 'bg-[var(--color-amber)]' : 'bg-white/10'}`}
      role="switch"
      aria-checked={value}
    >
      <motion.span
        className="absolute h-4 w-4 rounded-full bg-white shadow"
        style={{ top: 4, left: 0 }}
        animate={{ x: value ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

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

const EMPTY_FORM = {
  channelId: '',
  channelName: '',
  keywords: [] as string[],
  telegramTopicId: null as number | null,
  isActive: true,
};

export function WhatsAppListeners() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: rules, isLoading: rulesLoading } = useQuery<ListenerRule[]>({
    queryKey: ['listeners'],
    queryFn: () => api.get('/api/whatsapp/listeners'),
  });

  const { data: chats } = useQuery<WhatsAppChat[]>({
    queryKey: ['whatsapp-chats'],
    queryFn: () => api.get('/api/whatsapp/chats'),
  });

  const { data: topics } = useQuery<TelegramTopic[]>({
    queryKey: ['telegram-topics'],
    queryFn: () => api.get('/api/whatsapp/listeners/telegram-topics'),
  });

  useEffect(() => {
    if (!form.channelId) return;
    const chat = chats?.find(c => c.id === form.channelId);
    if (chat) setForm(prev => ({ ...prev, channelName: chat.name }));
  }, [form.channelId, chats]);

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      api.post('/api/whatsapp/listeners', {
        ...data,
        channelType: chats?.find(c => c.id === data.channelId)?.type ?? 'group',
        telegramTopicName: topics?.find(t => t.id === data.telegramTopicId)?.name ?? null,
      }),
    onSuccess: () => {
      toast.success('כלל נוסף');
      queryClient.invalidateQueries({ queryKey: ['listeners'] });
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 409) toast.error('קיים כבר כלל עבור ערוץ זה');
      else toast.error('שגיאה בהוספת הכלל');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_FORM> & { telegramTopicName?: string | null } }) =>
      api.patch(`/api/whatsapp/listeners/${id}`, data),
    onSuccess: () => {
      toast.success('כלל עודכן');
      queryClient.invalidateQueries({ queryKey: ['listeners'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: () => toast.error('שגיאה בעדכון הכלל'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/whatsapp/listeners/${id}`),
    onSuccess: () => {
      toast.success('כלל נמחק');
      queryClient.invalidateQueries({ queryKey: ['listeners'] });
      setDeleteConfirmId(null);
    },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleToggleActive = (rule: ListenerRule) => {
    updateMutation.mutate({
      id: rule.id,
      data: { isActive: !rule.isActive },
    });
  };

  const handleEdit = (rule: ListenerRule) => {
    setEditingId(rule.id);
    setForm({
      channelId: rule.channelId,
      channelName: rule.channelName,
      keywords: rule.keywords,
      telegramTopicId: rule.telegramTopicId,
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
    if (!form.channelId || !form.channelName) {
      toast.error('יש לבחור מקור ולהזין שם ערוץ');
      return;
    }
    if (editingId != null) {
      updateMutation.mutate({
        id: editingId,
        data: {
          channelName: form.channelName,
          keywords: form.keywords,
          telegramTopicId: form.telegramTopicId,
          telegramTopicName: topics?.find(t => t.id === form.telegramTopicId)?.name ?? null,
          isActive: form.isActive,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const deleteTarget = deleteConfirmId != null ? rules?.find(r => r.id === deleteConfirmId) : null;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const chatsEmpty = !chats || chats.length === 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">כללי האזנה — WhatsApp</h1>

        {/* Rules List */}
        <GlassCard className="p-6">
          <div className="mb-4 pb-3 border-b border-border">
            <h2 className="font-semibold text-text-primary">כללי האזנה</h2>
            <p className="text-text-muted text-xs mt-1">כל הודעה מוואטסאפ שתתאים לכלל תועבר לטלגרם</p>
          </div>

          {rulesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !rules || rules.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm">
              אין כללי האזנה — הוסף כלל למטה
            </div>
          ) : (
            <div>
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between gap-3 py-4 border-b border-border last:border-0">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary text-sm">{rule.channelName}</span>
                      <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-glow-amber)] border border-amber/30 text-amber">
                        {rule.channelType === 'newsletter' ? 'ערוץ' : 'קבוצה'}
                      </span>
                      {rule.telegramTopicId != null && rule.telegramTopicName && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-white/5 border border-border text-text-muted">
                          {rule.telegramTopicName}
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
                      onChange={() => handleToggleActive(rule)}
                      disabled={updateMutation.isPending}
                    />
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                      title="ערוך"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(rule.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-white/5 transition-colors"
                      title="מחק"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
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
            {/* Source chat */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">מקור (צ'אט WhatsApp)</label>
              <select
                value={form.channelId}
                onChange={e => setForm(prev => ({ ...prev, channelId: e.target.value }))}
                disabled={editingId != null}
                className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary disabled:opacity-50 outline-none focus:border-amber/50 transition-colors"
              >
                <option value="">בחר מקור...</option>
                {chats?.map(chat => (
                  <option key={chat.id} value={chat.id}>
                    {chat.name} ({chat.type === 'group' ? 'קבוצה' : 'ערוץ'})
                  </option>
                ))}
              </select>
              {chatsEmpty && (
                <p className="text-text-muted text-xs">
                  אין צ'אטים זמינים —{' '}
                  <a href="/whatsapp" className="text-amber hover:underline">חבר תחילה את WhatsApp</a>
                </p>
              )}
            </div>

            {/* Channel name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">שם ערוץ</label>
              <input
                type="text"
                value={form.channelName}
                onChange={e => setForm(prev => ({ ...prev, channelName: e.target.value }))}
                placeholder="שם ערוץ..."
                className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 transition-colors placeholder:text-text-muted"
              />
            </div>

            {/* Keywords */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">מילות מפתח</label>
              <KeywordInput
                keywords={form.keywords}
                onChange={keywords => setForm(prev => ({ ...prev, keywords }))}
              />
            </div>

            {/* Telegram topic */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">נושא טלגרם</label>
              <select
                value={form.telegramTopicId ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setForm(prev => ({ ...prev, telegramTopicId: val ? Number(val) : null }));
                }}
                className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 transition-colors"
              >
                <option value="">ללא נושא ספציפי (שלח לקבוצה)</option>
                {topics?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {(!topics || topics.length === 0) && (
                <p className="text-text-muted text-xs">אין נושאי פורום — הקבוצה אינה פורום</p>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <ToggleSwitch
                value={form.isActive}
                onChange={isActive => setForm(prev => ({ ...prev, isActive }))}
              />
              <label className="text-sm text-text-secondary">פעיל</label>
            </div>

            {/* Buttons */}
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
        description={deleteTarget ? `האם למחוק את הכלל עבור "${deleteTarget.channelName}"?` : 'האם למחוק את הכלל?'}
        onConfirm={() => deleteConfirmId != null && deleteMutation.mutate(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </PageTransition>
  );
}
