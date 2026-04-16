import React, { useState } from 'react';
import { UsersRound, Trash2, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';

// ─── API types — mirror src/dashboard/routes/groups.ts response shape ────────

interface GroupRow {
  id: number;
  name: string;
  inviteCode: string;
  ownerId: number;
  ownerDisplayName: string | null;
  createdAt: string;
  memberCount: number;
}

interface GroupsResponse {
  ok: true;
  groups: GroupRow[];
}

interface GroupStats {
  ok: true;
  total: number;
  avgMembers: number;
  top10: Array<{ id: number; name: string; memberCount: number }>;
}

interface GroupMemberDetail {
  userId: number;
  role: 'owner' | 'member';
  joinedAt: string;
  notifyGroup: boolean;
  displayName: string | null;
  homeCity: string | null;
}

interface GroupDetailResponse {
  ok: true;
  group: {
    id: number;
    name: string;
    inviteCode: string;
    ownerId: number;
    createdAt: string;
  };
  members: GroupMemberDetail[];
}

function relDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL');
}

function Groups(): React.ReactElement {
  const qc = useQueryClient();
  const [drillId, setDrillId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: list, isLoading } = useQuery<GroupsResponse>({
    queryKey: ['dashboard-groups', 'list'],
    queryFn: () => api.get<GroupsResponse>('/api/groups'),
  });

  const { data: stats } = useQuery<GroupStats>({
    queryKey: ['dashboard-groups', 'stats'],
    queryFn: () => api.get<GroupStats>('/api/groups/stats'),
  });

  const { data: detail } = useQuery<GroupDetailResponse>({
    queryKey: ['dashboard-groups', 'detail', drillId],
    queryFn: () => api.get<GroupDetailResponse>(`/api/groups/${drillId}`),
    enabled: drillId !== null,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/groups/${id}`),
    onSuccess: () => {
      toast.success('הקבוצה נמחקה');
      qc.invalidateQueries({ queryKey: ['dashboard-groups'] });
      setDeleteId(null);
      setDrillId(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'מחיקה נכשלה';
      toast.error(msg);
    },
  });

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        <header className="flex items-center gap-3">
          <UsersRound className="text-blue-400" size={28} />
          <h1 className="text-2xl font-bold">קבוצות חוסן</h1>
        </header>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassCard className="p-4">
            <div className="text-sm text-text-secondary">סה״כ קבוצות</div>
            <div className="text-3xl font-bold mt-1">{stats?.total ?? '—'}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-text-secondary">חברים בממוצע</div>
            <div className="text-3xl font-bold mt-1">{stats?.avgMembers ?? '—'}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-text-secondary">קבוצה עם הכי הרבה חברים</div>
            <div className="text-xl font-semibold mt-1 truncate">
              {stats?.top10[0]?.name ?? '—'}
              {stats?.top10[0] !== undefined && (
                <span className="text-sm text-text-muted mr-2">
                  ({stats.top10[0].memberCount})
                </span>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Groups table */}
        <GlassCard className="p-4">
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : !list?.groups || list.groups.length === 0 ? (
            <EmptyState
              icon="👥"
              message="אין קבוצות עדיין. קבוצות נוצרות מהבוט עם /group create."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-sm text-text-secondary">
                    <th className="p-2 text-right">שם</th>
                    <th className="p-2 text-right">בעלים</th>
                    <th className="p-2 text-right">חברים</th>
                    <th className="p-2 text-right">קוד הזמנה</th>
                    <th className="p-2 text-right">נוצרה</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.groups.map((g) => (
                    <tr
                      key={g.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() => setDrillId(g.id)}
                    >
                      <td className="p-2 font-medium">{g.name}</td>
                      <td className="p-2 text-sm">
                        {g.ownerDisplayName ?? <span className="text-text-muted">—</span>}
                      </td>
                      <td className="p-2">{g.memberCount}</td>
                      <td className="p-2 font-mono text-xs">{g.inviteCode}</td>
                      <td className="p-2 text-sm text-text-muted">{relDate(g.createdAt)}</td>
                      <td className="p-2 text-left">
                        <button
                          aria-label={`מחק קבוצה ${g.name}`}
                          className="text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(g.id);
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {drillId !== null && detail !== undefined && (
          <motion.div
            className="fixed inset-y-0 left-0 w-full md:w-[480px] bg-zinc-900 border-l border-white/10 shadow-2xl z-40 overflow-y-auto"
            initial={{ x: -480 }}
            animate={{ x: 0 }}
            exit={{ x: -480 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{detail.group.name}</h2>
                <button
                  aria-label="סגור"
                  className="text-text-secondary hover:text-text-primary"
                  onClick={() => setDrillId(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="text-sm text-text-secondary space-y-1">
                <div>
                  קוד הזמנה: <span className="font-mono text-white">{detail.group.inviteCode}</span>
                </div>
                <div>נוצרה: {relDate(detail.group.createdAt)}</div>
                <div>חברים: {detail.members.length}</div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-semibold mb-2 text-text-primary">חברים</h3>
                <ul className="space-y-2">
                  {detail.members.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between p-2 rounded bg-white/5">
                      <div>
                        <div className="font-medium">
                          {m.displayName ?? `משתמש #${m.userId}`}
                          {m.role === 'owner' && <span className="mr-2 text-xs text-blue-400">בעלים</span>}
                        </div>
                        {m.homeCity !== null && m.homeCity !== '' && (
                          <div className="text-xs text-text-muted">{m.homeCity}</div>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">
                        {m.notifyGroup ? '🔔' : '🔕'}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                className="w-full py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                onClick={() => setDeleteId(detail.group.id)}
              >
                מחק קבוצה
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={deleteId !== null}
        title="מחיקת קבוצה"
        description="האם אתה בטוח שברצונך למחוק את הקבוצה? כל החברים יסולקו ולא ניתן לבטל פעולה זו."
        danger
        onConfirm={() => {
          if (deleteId !== null) deleteMut.mutate(deleteId);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </PageTransition>
  );
}

export default Groups;
