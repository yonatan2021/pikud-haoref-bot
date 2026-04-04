import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../api/client';

interface HistoryRow {
  id: number;
  alert_type: string;
  emoji: string;
  title_he: string;
  instructions_prefix: string;
  saved_at: string;
}

interface VersionHistoryPanelProps {
  alertType: string;
  open: boolean;
  onClose: () => void;
  currentValues: { emoji: string; titleHe: string; instructionsPrefix: string };
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'Z'); // SQLite stores UTC without Z suffix
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isSameAsVersion(
  current: { emoji: string; titleHe: string; instructionsPrefix: string },
  row: HistoryRow,
): boolean {
  return (
    current.emoji === row.emoji &&
    current.titleHe === row.title_he &&
    current.instructionsPrefix === row.instructions_prefix
  );
}

export function VersionHistoryPanel({
  alertType,
  open,
  onClose,
  currentValues,
}: VersionHistoryPanelProps) {
  const queryClient = useQueryClient();

  const { data: history = [], isLoading } = useQuery<HistoryRow[]>({
    queryKey: ['template-history', alertType],
    queryFn: () => api.get<HistoryRow[]>(`/api/messages/${alertType}/history`),
    enabled: open,
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: number) =>
      api.post<{ ok: boolean }>(`/api/messages/${alertType}/rollback`, { versionId }),
    onSuccess: () => {
      toast.success('גרסה שוחזרה');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['template-history', alertType] });
      onClose();
    },
    onError: (err) => toast.error(`שגיאה בשחזור: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="bg-base/50 border border-border rounded-lg p-3 mt-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-primary">היסטוריית גרסאות</h4>
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            {isLoading ? (
              <p className="text-text-muted text-xs">טוען...</p>
            ) : history.length === 0 ? (
              <p className="text-text-muted text-xs">אין היסטוריה לסוג זה</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {history.map((row) => {
                  const isCurrent = isSameAsVersion(currentValues, row);
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-2 p-2
                                 bg-surface/50 rounded-lg text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-text-muted">{formatDate(row.saved_at)}</span>
                        <span className="mx-2 text-text-primary">
                          {row.emoji} {row.title_he}
                        </span>
                        {row.instructions_prefix && (
                          <span className="text-text-muted">({row.instructions_prefix})</span>
                        )}
                        {isCurrent && (
                          <span className="ms-2 text-green text-[10px] font-medium">נוכחי</span>
                        )}
                      </div>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => rollbackMutation.mutate(row.id)}
                          disabled={rollbackMutation.isPending}
                          className="shrink-0 px-2 py-1 rounded bg-amber/10 text-amber
                                     hover:bg-amber/20 transition-colors text-[10px] font-medium
                                     disabled:opacity-50"
                        >
                          שחזר
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
