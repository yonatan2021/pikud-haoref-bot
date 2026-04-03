import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';

interface User {
  chat_id: number;
  format: string;
  quiet_hours_enabled: number;
  created_at: string;
  city_count: number;
  display_name: string | null;
  home_city: string | null;
  locale: string;
  onboarding_completed: number;
  connection_code: string | null;
  contact_count: number;
}

interface ContactEntry {
  id: number;
  status: string;
  created_at: string;
  other_id: number;
  other_name: string | null;
}

interface UserDetail {
  chat_id: number;
  format: string;
  quiet_hours_enabled: number;
  created_at: string;
  cities: string[];
  display_name: string | null;
  home_city: string | null;
  locale: string;
  onboarding_completed: number;
  contacts: ContactEntry[];
}

interface SubscribersResponse {
  data: User[];
  total: number;
}

interface EditForm {
  format: string;
  quiet_hours_enabled: boolean;
  display_name: string;
  home_city: string;
}

function relDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL');
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const PAGE_SIZE = 50;

export function Subscribers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ format: 'short', quiet_hours_enabled: false, display_name: '', home_city: '' });

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery<SubscribersResponse>({
    queryKey: ['subscribers', debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      return api.get<SubscribersResponse>(`/api/subscribers?${params}`);
    },
  });

  const { data: expandedDetail, isLoading: isDetailLoading, isError: isDetailError } = useQuery<UserDetail>({
    queryKey: ['subscriber-detail', expandedId],
    queryFn: () => api.get<UserDetail>(`/api/subscribers/${expandedId}`),
    enabled: expandedId !== null,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/api/subscribers/${id}`, body),
    onSuccess: () => {
      toast.success('מנוי עודכן');
      qc.invalidateQueries({ queryKey: ['subscribers'] });
    },
    onError: () => toast.error('שגיאה בעדכון'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/subscribers/${id}`),
    onSuccess: () => {
      toast.success('המנוי נמחק');
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      setDeleteId(null);
      setExpandedId(null);
    },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const removeCityMutation = useMutation({
    mutationFn: ({ id, city }: { id: number; city: string }) =>
      api.delete(`/api/subscribers/${id}/cities/${encodeURIComponent(city)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber-detail', expandedId] });
    },
    onError: () => toast.error('שגיאה בהסרת עיר'),
  });

  const removeContactMutation = useMutation({
    mutationFn: ({ id, contactId }: { id: number; contactId: number }) =>
      api.delete(`/api/subscribers/${id}/contacts/${contactId}`),
    onSuccess: () => {
      toast.success('קשר הוסר');
      qc.invalidateQueries({ queryKey: ['subscriber-detail', expandedId] });
    },
    onError: () => toast.error('שגיאה בהסרת קשר'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map(id => api.delete(`/api/subscribers/${id}`)));
      const failed = results.filter(r => r.status === 'rejected').length;
      return { succeeded: ids.length - failed, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toast.error(`${succeeded} נמחקו, ${failed} כשלונות`);
      } else {
        toast.success(`${succeeded} מנויים נמחקו`);
      }
      setSelected(new Set());
      setBulkDeleteOpen(false);
    },
    onError: () => toast.error('שגיאה במחיקה מרובה'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscribers'] }),
  });

  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === users.length && users.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map(u => u.chat_id)));
    }
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    setEditForm({
      format: user.format,
      quiet_hours_enabled: !!user.quiet_hours_enabled,
      display_name: user.display_name ?? '',
      home_city: user.home_city ?? '',
    });
  };

  const saveEdit = () => {
    if (!editUser) return;
    const body: Record<string, unknown> = {
      format: editForm.format,
      quiet_hours_enabled: editForm.quiet_hours_enabled,
      display_name: editForm.display_name || null,
      home_city: editForm.home_city || null,
    };
    patchMutation.mutate(
      { id: editUser.chat_id, body },
      { onSuccess: () => setEditUser(null) },
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleCopy = (e: React.MouseEvent, text: string | number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(text));
    toast.success('הועתק');
  };

  const handleToggleQuietHours = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    patchMutation.mutate({
      id: user.chat_id,
      body: { quiet_hours_enabled: !user.quiet_hours_enabled },
    });
  };

  const handleRowClick = (chatId: number) => {
    setExpandedId(expandedId === chatId ? null : chatId);
  };

  const handleBulkDelete = () => {
    setBulkDeleteOpen(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">מנויים</h1>
          <div className="flex gap-3">
            <button
              onClick={() => {
                window.location.href = '/api/subscribers/export/csv';
              }}
              className="px-4 py-2 bg-[var(--color-glass)] backdrop-blur-md border border-[var(--color-border)] hover:bg-white/10 text-text-secondary text-sm rounded-lg transition-colors"
            >
              ⬇️ ייצוא CSV
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="חיפוש לפי מזהה, שם, או עיר..."
            className="flex-1 bg-[var(--color-glass)] backdrop-blur-md border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/40 transition-all"
          />
          <span className="flex items-center text-text-muted text-sm whitespace-nowrap">
            {total} מנויים
          </span>
        </div>

        {/* Table */}
        <GlassCard className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon="👥" message="לא נמצאו מנויים" />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-text-muted text-xs">
                    <th className="px-4 py-2 text-right">
                      <input
                        type="checkbox"
                        checked={selected.size === users.length && users.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-2 text-right font-medium">מזהה</th>
                    <th className="px-4 py-2 text-right font-medium">שם</th>
                    <th className="px-4 py-2 text-right font-medium">עיר</th>
                    <th className="px-4 py-2 text-right font-medium">ערים</th>
                    <th className="px-4 py-2 text-right font-medium">קוד חיבור</th>
                    <th className="px-4 py-2 text-right font-medium">קשרים</th>
                    <th className="px-4 py-2 text-right font-medium">פורמט</th>
                    <th className="px-4 py-2 text-right font-medium">Quiet Hours</th>
                    <th className="px-4 py-2 text-right font-medium">הצטרף</th>
                    <th className="px-4 py-2 text-right font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <React.Fragment key={user.chat_id}>
                      <tr
                        className="border-b border-[var(--color-border)]/50 hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => handleRowClick(user.chat_id)}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(user.chat_id)}
                            onChange={() => toggleSelect(user.chat_id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-text-secondary font-mono text-xs">
                              {user.chat_id}
                            </span>
                            <button
                              onClick={e => handleCopy(e, user.chat_id)}
                              className="text-text-muted hover:text-text-secondary text-xs"
                              title="העתק מזהה"
                            >
                              📋
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs max-w-[120px] truncate" title={user.display_name ?? ''}>
                          {user.display_name ? (
                            <span className="flex items-center gap-1">
                              {user.display_name}
                              {!user.onboarding_completed && (
                                <span className="text-amber-400" title="לא השלים onboarding">⏳</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs max-w-[120px] truncate" title={user.home_city ?? ''}>
                          {user.home_city ?? <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
                            {user.city_count}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {user.connection_code ? (
                            <button
                              onClick={e => handleCopy(e, user.connection_code!)}
                              className="font-mono text-xs text-text-secondary bg-[var(--color-glass)] border border-[var(--color-border)] rounded px-2 py-0.5 hover:border-amber-500/60 transition-colors"
                              title="העתק קוד חיבור"
                            >
                              {user.connection_code}
                            </button>
                          ) : (
                            <span className="text-text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {user.contact_count > 0 ? (
                            <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-0.5 rounded-full">
                              {user.contact_count}
                            </span>
                          ) : (
                            <span className="text-text-muted text-xs">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              user.format === 'short'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {user.format === 'short' ? 'קצר' : 'מפורט'}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={e => handleToggleQuietHours(e, user)}
                            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                              user.quiet_hours_enabled
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-[var(--color-glass)] border border-[var(--color-border)] text-text-muted'
                            }`}
                          >
                            {user.quiet_hours_enabled ? 'פעיל' : 'כבוי'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">
                          {relDate(user.created_at)}
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEdit(user)}
                              className="text-text-muted hover:text-text-primary text-xs"
                              title="ערוך מנוי"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setDeleteId(user.chat_id)}
                              className="text-text-muted hover:text-red-400 text-xs"
                              title="מחק מנוי"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded row rendered as a separate tr with animated inner div */}
                      <AnimatePresence key={`${user.chat_id}-presence`}>
                        {expandedId === user.chat_id && (
                          <tr key={`${user.chat_id}-exp`} className="bg-white/5">
                            <td colSpan={11} className="p-0 overflow-hidden">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-6 py-4">
                                  {expandedDetail && (
                                    <div className="flex flex-wrap gap-4 mb-3 text-xs text-text-muted">
                                      <span>👤 {expandedDetail.display_name ?? 'ללא שם'}</span>
                                      <span>🏠 {expandedDetail.home_city ?? 'ללא עיר'}</span>
                                      <span>🌐 {expandedDetail.locale === 'he' ? 'עברית' : expandedDetail.locale}</span>
                                      <span>{expandedDetail.onboarding_completed ? '✅ Onboarding הושלם' : '⏳ לא השלים onboarding'}</span>
                                    </div>
                                  )}
                                  <p className="text-text-muted text-xs mb-2">ערים מנויות:</p>
                                  {expandedDetail ? (
                                    <div className="flex flex-wrap gap-2">
                                      {expandedDetail.cities.length === 0 ? (
                                        <span className="text-text-muted text-xs">אין ערים מנויות</span>
                                      ) : (
                                        expandedDetail.cities.map(city => (
                                          <span
                                            key={city}
                                            className="flex items-center gap-1 bg-[var(--color-glass)] border border-[var(--color-border)] rounded-full px-3 py-1 text-xs text-text-secondary"
                                          >
                                            {city}
                                            <button
                                              onClick={() =>
                                                removeCityMutation.mutate({ id: user.chat_id, city })
                                              }
                                              className="text-text-muted hover:text-red-400 mr-1"
                                              title={`הסר ${city}`}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  ) : (
                                    <Skeleton className="h-8 w-48" />
                                  )}
                                  {/* Contacts section */}
                                  {isDetailLoading && (
                                    <p className="text-text-secondary text-xs mt-4">טוען קשרים...</p>
                                  )}
                                  {isDetailError && (
                                    <p className="text-red-400 text-xs mt-4">שגיאה בטעינת פרטי מנוי</p>
                                  )}
                                  {!isDetailLoading && !isDetailError && expandedDetail && (expandedDetail.contacts ?? []).length > 0 && (
                                    <>
                                      <p className="text-text-muted text-xs mb-2 mt-4">אנשי קשר:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(expandedDetail.contacts ?? []).map(c => (
                                          <div
                                            key={c.id}
                                            className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs group cursor-pointer transition-opacity hover:opacity-75 ${
                                              c.status === 'accepted'
                                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                : c.status === 'pending'
                                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                  : 'bg-[var(--color-glass)] border-[var(--color-border)] text-text-muted'
                                            }`}
                                          >
                                            {c.other_name ?? c.other_id}
                                            <span className="text-[10px] opacity-60">
                                              {c.status === 'accepted' ? '✓' : c.status === 'pending' ? '⏳' : '✗'}
                                            </span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeContactMutation.mutate({ id: expandedId ?? 0, contactId: c.id });
                                              }}
                                              disabled={removeContactMutation.isPending}
                                              className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 disabled:opacity-50"
                                              title="הסר קשר"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40"
                >
                  הקודם →
                </button>
                <span className="text-text-muted text-xs">
                  עמוד {page + 1} · {total} סה״כ
                </span>
                <button
                  disabled={users.length < PAGE_SIZE}
                  onClick={() => setPage(p => p + 1)}
                  className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40"
                >
                  ← הבא
                </button>
              </div>
            </>
          )}
        </GlassCard>

        {/* Floating bulk action bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--color-glass)] backdrop-blur-md border border-[var(--color-border)] rounded-full px-6 py-3 flex items-center gap-4 shadow-lg z-50"
            >
              <span className="text-sm text-text-secondary">{selected.size} נבחרו</span>
              <button
                onClick={handleBulkDelete}
                className="text-red-400 hover:text-red-300 text-sm font-medium"
              >
                מחק
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        {editUser && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--color-glass)] backdrop-blur-md border border-[var(--color-border)] rounded-xl p-6 max-w-sm w-full">
              <h3 className="font-bold text-lg text-text-primary mb-4">
                עריכת מנוי {editUser.chat_id}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-text-muted text-xs block mb-1">שם תצוגה</label>
                  <input
                    type="text"
                    value={editForm.display_name}
                    onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                    placeholder="ללא שם"
                    maxLength={50}
                    className="w-full bg-[var(--color-glass)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500/60"
                  />
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">עיר מגורים</label>
                  <input
                    type="text"
                    value={editForm.home_city}
                    onChange={e => setEditForm(f => ({ ...f, home_city: e.target.value }))}
                    placeholder="ללא עיר"
                    className="w-full bg-[var(--color-glass)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500/60"
                  />
                </div>
                <div>
                  <label className="text-text-muted text-xs block mb-1">פורמט הודעות</label>
                  <select
                    value={editForm.format}
                    onChange={e => setEditForm(f => ({ ...f, format: e.target.value }))}
                    className="w-full bg-[var(--color-glass)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    <option value="short">קצר</option>
                    <option value="detailed">מפורט</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-text-secondary text-sm">שעות שקט</label>
                  <button
                    onClick={() =>
                      setEditForm(f => ({ ...f, quiet_hours_enabled: !f.quiet_hours_enabled }))
                    }
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${
                      editForm.quiet_hours_enabled
                        ? 'bg-amber-500 text-black'
                        : 'bg-[var(--color-glass)] border border-[var(--color-border)] text-text-muted'
                    }`}
                  >
                    {editForm.quiet_hours_enabled ? 'פעיל' : 'כבוי'}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={saveEdit}
                  disabled={patchMutation.isPending}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-medium py-2 rounded-lg text-sm disabled:opacity-60"
                >
                  שמור
                </button>
                <button
                  onClick={() => setEditUser(null)}
                  className="flex-1 border border-[var(--color-border)] py-2 rounded-lg text-sm text-text-secondary hover:bg-white/5"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        <ConfirmModal
          open={deleteId !== null}
          title="מחיקת מנוי"
          description={`האם למחוק את המנוי ${deleteId}?`}
          onConfirm={() => {
            if (deleteId !== null) deleteMutation.mutate(deleteId);
          }}
          onCancel={() => setDeleteId(null)}
          danger
        />

        {/* Bulk delete confirm */}
        <ConfirmModal
          open={bulkDeleteOpen}
          title="מחיקה מרובה"
          description={`האם למחוק ${selected.size} מנויים?`}
          onConfirm={() => bulkDeleteMutation.mutate([...selected])}
          onCancel={() => setBulkDeleteOpen(false)}
          danger
        />
      </div>
    </PageTransition>
  );
}
