import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { PageTransition } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { SecretCard, type SecretInfo } from '../components/configuration/SecretCard';
import { SecretEditModal } from '../components/configuration/SecretEditModal';
import { ConfirmModal } from '../components/ConfirmModal';

interface SecretsResponse {
  secrets: SecretInfo[];
}

export function Configuration() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['secrets'],
    queryFn: () => api.get<SecretsResponse>('/api/secrets'),
  });

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<{ ok: boolean }>(`/api/secrets/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      queryClient.invalidateQueries({ queryKey: ['secrets-restart-needed'] });
      setEditingKey(null);
      toast.success('הסוד נשמר בהצלחה');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'שמירה נכשלה');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete<{ ok: boolean }>(`/api/secrets/${key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      queryClient.invalidateQueries({ queryKey: ['secrets-restart-needed'] });
      setDeletingKey(null);
      toast.success('הסוד נמחק — חזרה ל-ENV אם קיים');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'מחיקה נכשלה');
    },
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Shield size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">הגדרות ואבטחה</h1>
            <p className="text-sm text-text-secondary">ניהול מפתחות API וסודות מוצפנים</p>
          </div>
        </div>

        {/* Secrets Section */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={16} className="text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              סודות מוצפנים
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {data?.secrets.map(secret => (
                <SecretCard
                  key={secret.key}
                  secret={secret}
                  onEdit={() => setEditingKey(secret.key)}
                  onDelete={() => setDeletingKey(secret.key)}
                />
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-text-secondary/50">
            כל הסודות מוצפנים ב-AES-256-GCM ומאוחסנים בבסיס הנתונים. ערכים מ-ENV משמשים כ-fallback.
          </p>
        </section>
      </div>

      {/* Edit Modal */}
      {editingKey && (
        <SecretEditModal
          secretKey={editingKey}
          onSave={value => saveMutation.mutate({ key: editingKey, value })}
          onCancel={() => setEditingKey(null)}
          saving={saveMutation.isPending}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={deletingKey !== null}
        title="מחיקת סוד"
        description={`למחוק את ${deletingKey ?? ''} מהמסד? אם קיים ערך ב-.env, הוא ישמש כ-fallback.`}
        onConfirm={() => { if (deletingKey) deleteMutation.mutate(deletingKey); }}
        onCancel={() => setDeletingKey(null)}
        danger
      />
    </PageTransition>
  );
}

export default Configuration;
