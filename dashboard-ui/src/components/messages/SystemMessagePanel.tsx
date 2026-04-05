import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { GlassCard } from '../ui/GlassCard';
import { TelegramBubblePreview } from './TelegramBubblePreview';
import { ConfirmModal } from '../ConfirmModal';
import { api } from '../../api/client';

interface TopicEntry {
  key: string;
  label: string;
  topicId: number | null;
}

interface TopicsResponse {
  topics: TopicEntry[];
}

export function SystemMessagePanel() {
  const [text, setText] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: topicsData } = useQuery<TopicsResponse>({
    queryKey: ['telegram-topics'],
    queryFn: () => api.get<TopicsResponse>('/api/messages/topics'),
    staleTime: 60_000,
  });

  // Filter to only configured topics
  const availableTopics = useMemo(
    () => (topicsData?.topics ?? []).filter((t) => t.topicId !== null),
    [topicsData],
  );

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; messageId: number }>('/api/messages/system-message', {
        text,
        topicId: selectedTopicId,
      }),
    onSuccess: () => {
      setText('');
      setConfirmOpen(false);
    },
    onError: (err) => toast.error(`שגיאה בשליחה: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  const handleTopicChange = (value: string) => {
    const parsed = parseInt(value, 10);
    setSelectedTopicId(isNaN(parsed) ? null : parsed);
  };

  const canSend = text.trim().length > 0 && selectedTopicId !== null && text.length <= 4096;

  const selectedTopicLabel = availableTopics.find((t) => t.topicId === selectedTopicId)?.label ?? '';

  return (
    <GlassCard glow="blue">
      <h3 className="text-base font-medium text-text-primary mb-3">📢 הודעת מערכת</h3>

      {/* Topic selector */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-1">נושא (Topic)</label>
        <select
          value={selectedTopicId ?? ''}
          onChange={(e) => handleTopicChange(e.target.value)}
          className="w-full bg-base border border-border rounded-lg px-3 py-2
                     text-sm text-text-primary
                     focus:outline-none focus:border-blue/50"
        >
          <option value="">בחר נושא...</option>
          {availableTopics.map((topic) => (
            <option key={topic.key} value={topic.topicId!}>
              {topic.label}
            </option>
          ))}
        </select>
        {availableTopics.length === 0 && (
          <p className="text-xs text-text-muted mt-1">
            אין נושאים מוגדרים — הגדר Topic IDs בהגדרות
          </p>
        )}
      </div>

      {/* Message textarea */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-1">טקסט ההודעה</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"עדכון מערכת\n\nהבוט עודכן לגרסה חדשה..."}
          rows={5}
          className="w-full bg-base border border-border rounded-lg px-3 py-2
                     text-sm text-text-primary placeholder:text-text-muted
                     focus:outline-none focus:border-blue/50 resize-y
                     leading-relaxed"
        />
        <p className={`text-xs mt-1 ${text.length > 4096 ? 'text-red-500' : 'text-text-muted'}`}>
          {text.length} / 4096 תווים
        </p>
      </div>

      {/* Preview */}
      <div className="mb-3">
        <TelegramBubblePreview
          html={text}
          charCount={text.length}
        />
      </div>

      {/* Send button */}
      <div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend || sendMutation.isPending}
          className="w-full py-2 rounded-lg text-sm font-medium
                     bg-blue/20 text-blue hover:bg-blue/30
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {sendMutation.isPending ? 'שולח...' : '📢 שלח הודעה לנושא'}
        </button>
        <p className="text-[10px] text-text-muted mt-1 text-center">
          ההודעה תישלח ישירות לנושא שנבחר בערוץ הטלגרם
        </p>

        {/* Result feedback */}
        <AnimatePresence>
          {sendMutation.isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 p-2 bg-green/10 border border-green/20 rounded-lg text-xs text-green text-center"
            >
              נשלח בהצלחה — message #{sendMutation.data?.messageId}
            </motion.div>
          )}
          {sendMutation.isError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 text-center"
            >
              שגיאה: {String(sendMutation.error)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmOpen}
        title="שליחת הודעת מערכת"
        description={`האם לשלוח את ההודעה לנושא ${selectedTopicLabel}?`}
        onConfirm={() => sendMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </GlassCard>
  );
}
