import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { RefreshCw, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { LiveDot } from '../components/ui/LiveDot';
import { ConfirmModal } from '../components/ConfirmModal';

interface WhatsAppStatus {
  status: 'disconnected' | 'qr' | 'connecting' | 'ready';
  qr?: string;
  phone?: string;
  groupCount: number;
}

interface WhatsAppGroup {
  groupId: string;
  name: string;
  enabled: boolean;
  alertTypes: string[];
  inClient: boolean;
}

const CATEGORIES = [
  {
    label: 'ביטחוני 🔴',
    types: [
      'missiles',
      'hostileAircraftIntrusion',
      'terroristInfiltration',
      'missilesDrill',
      'hostileAircraftIntrusionDrill',
      'terroristInfiltrationDrill',
    ],
  },
  {
    label: 'טבע 🌍',
    types: ['earthQuake', 'tsunami', 'earthQuakeDrill', 'tsunamiDrill'],
  },
  {
    label: 'סביבתי ☢️',
    types: [
      'hazardousMaterials',
      'radiologicalEvent',
      'hazardousMaterialsDrill',
      'radiologicalEventDrill',
    ],
  },
  {
    label: 'כללי 📢',
    types: ['newsFlash', 'general'],
  },
];

function isCategoryEnabled(alertTypes: string[], categoryTypes: string[]): boolean {
  return categoryTypes.length > 0 && categoryTypes.every(t => alertTypes.includes(t));
}

function toggleCategory(alertTypes: string[], categoryTypes: string[], enabled: boolean): string[] {
  if (enabled) {
    const merged = new Set([...alertTypes, ...categoryTypes]);
    return Array.from(merged);
  }
  const removed = new Set(categoryTypes);
  return alertTypes.filter(t => !removed.has(t));
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

function QrDisplay({ qrString }: { qrString: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!qrString) return;
    setQrError(false);
    QRCode.toDataURL(qrString, { width: 220, margin: 2 })
      .then(url => setDataUrl(url))
      .catch(() => {
        setDataUrl(null);
        setQrError(true);
      });
  }, [qrString]);

  if (qrError) {
    return <p className="text-red-400 text-sm">לא ניתן ליצור קוד QR</p>;
  }

  if (!dataUrl) {
    return (
      <div className="flex items-center justify-center w-[220px] h-[220px] bg-base rounded-xl border border-border">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR לחיבור WhatsApp"
      className="rounded-xl border border-border"
      width={220}
      height={220}
    />
  );
}

function StatusBadge({ status, phone }: { status: WhatsAppStatus['status']; phone?: string }) {
  if (status === 'ready') {
    return (
      <div className="flex items-center gap-2">
        <LiveDot color="green" />
        <span className="text-green text-sm font-medium">מחובר</span>
        {phone && <span className="text-text-muted text-sm">— {phone}</span>}
      </div>
    );
  }

  if (status === 'qr') {
    return (
      <div className="flex items-center gap-2">
        <LiveDot color="amber" />
        <span className="text-amber text-sm font-medium">ממתין לסריקה</span>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2">
        <LiveDot color="amber" />
        <span className="text-amber text-sm font-medium">מתחבר...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full bg-text-muted inline-block" />
      <span className="text-text-muted text-sm font-medium">מנותק</span>
    </div>
  );
}

function GroupRow({ group, onUpdate }: { group: WhatsAppGroup; onUpdate: (groupId: string, patch: Partial<WhatsAppGroup>) => void }) {
  const handleToggleEnabled = (enabled: boolean) => {
    onUpdate(group.groupId, { enabled });
  };

  const handleToggleCategory = (categoryTypes: string[], categoryEnabled: boolean) => {
    const nextTypes = toggleCategory(group.alertTypes, categoryTypes, categoryEnabled);
    onUpdate(group.groupId, { alertTypes: nextTypes });
  };

  return (
    <div className="flex flex-col gap-3 py-4 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm ${group.enabled ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
          {group.name}
          {!group.inClient && (
            <span className="mr-2 text-xs px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-border">
              לא בחשבון
            </span>
          )}
        </span>
        <ToggleSwitch value={group.enabled} onChange={handleToggleEnabled} />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const enabled = isCategoryEnabled(group.alertTypes, cat.types);
          return (
            <button
              key={cat.label}
              onClick={() => handleToggleCategory(cat.types, !enabled)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                enabled
                  ? 'bg-[var(--color-glow-amber)] border-amber/50 text-amber'
                  : 'bg-white/5 border-border text-text-muted hover:bg-white/10 hover:text-text-secondary'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WhatsApp() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showReconnectConfirm, setShowReconnectConfirm] = useState(false);

  const { data: statusData, isError: statusError } = useQuery<WhatsAppStatus>({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get('/api/whatsapp/status'),
    refetchInterval: (query) => {
      if (query.state.data?.status === 'ready') return false;
      if (query.state.errorUpdateCount >= 5) return false;
      return 3000;
    },
  });

  const { data: groups, isLoading: groupsLoading, isError: groupsError } = useQuery<WhatsAppGroup[]>({
    queryKey: ['whatsapp-groups'],
    queryFn: () => api.get('/api/whatsapp/groups'),
  });

  const reconnectMutation = useMutation({
    mutationFn: () => api.post('/api/whatsapp/reconnect', {}),
    onSuccess: () => {
      toast.success('בקשת חיבור נשלחה');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      setShowReconnectConfirm(false);
    },
    onError: () => {
      toast.error('שגיאה בחיבור מחדש');
    },
  });

  const handleGroupUpdate = useCallback((groupId: string, patch: Partial<WhatsAppGroup>) => {
    const current = queryClient.getQueryData<WhatsAppGroup[]>(['whatsapp-groups'])?.find(g => g.groupId === groupId);
    if (!current) return;

    const updated = { ...current, ...patch };

    queryClient.setQueryData<WhatsAppGroup[]>(['whatsapp-groups'], prev =>
      (prev ?? []).map(g => g.groupId === groupId ? updated : g)
    );

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await api.patch(`/api/whatsapp/groups/${encodeURIComponent(groupId)}`, {
          enabled: updated.enabled,
          alertTypes: updated.alertTypes,
        });
      } catch {
        queryClient.setQueryData<WhatsAppGroup[]>(['whatsapp-groups'], prev =>
          (prev ?? []).map(g => g.groupId === groupId ? current : g)
        );
        toast.error('שגיאה בעדכון הקבוצה');
      }
    }, 500);
  }, [queryClient]);

  const status = statusData?.status ?? 'disconnected';

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">WhatsApp</h1>

        {/* Connection Panel */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <h2 className="font-semibold text-text-primary">חיבור WhatsApp</h2>
            {statusError ? (
              <p className="text-red-400 text-sm">שגיאה בחיבור לשרת</p>
            ) : (
              <StatusBadge status={status} phone={statusData?.phone} />
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {status === 'qr' && statusData?.qr && (
              <div className="flex flex-col items-center gap-3">
                <QrDisplay qrString={statusData.qr} />
                <p className="text-text-muted text-xs text-center max-w-[220px]">
                  פתח את WhatsApp במכשירך ← מכשירים מקושרים ← קשר מכשיר
                </p>
              </div>
            )}

            <div className="flex flex-col gap-4 flex-1">
              {status === 'ready' && (
                <div className="text-text-secondary text-sm">
                  <p>WhatsApp מחובר ופעיל.</p>
                  {(statusData?.groupCount ?? 0) > 0 && (
                    <p className="text-text-muted text-xs mt-1">
                      {statusData?.groupCount} קבוצות מוגדרות
                    </p>
                  )}
                </div>
              )}

              {status === 'connecting' && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  מתחבר ל-WhatsApp...
                </div>
              )}

              {status === 'disconnected' && (
                <p className="text-text-muted text-sm">
                  WhatsApp מנותק. לחץ על "התחבר מחדש" כדי להפעיל חיבור חדש.
                </p>
              )}

              {status === 'qr' && !statusData?.qr && (
                <p className="text-text-muted text-sm">
                  ממתין לקוד QR...
                </p>
              )}

              <button
                onClick={() => status === 'ready' ? setShowReconnectConfirm(true) : reconnectMutation.mutate()}
                disabled={reconnectMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border hover:bg-base text-text-secondary text-sm rounded-lg transition-colors disabled:opacity-40 w-fit"
              >
                {reconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {status === 'ready' ? 'חבר מחדש' : 'התחבר'}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Groups Panel */}
        <GlassCard className="p-6">
          <div className="mb-4 pb-3 border-b border-border">
            <h2 className="font-semibold text-text-primary">קבוצות WhatsApp</h2>
            <p className="text-text-muted text-xs mt-1">בחר אילו קבוצות יקבלו התראות ואילו קטגוריות</p>
          </div>

          {groupsError ? (
            <p className="text-red-400 text-sm">שגיאה בטעינת הקבוצות</p>
          ) : groupsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm">
              אין קבוצות — סרוק את קוד ה-QR כדי להתחבר
            </div>
          ) : (
            <div>
              {groups.map(group => (
                <GroupRow
                  key={group.groupId}
                  group={group}
                  onUpdate={handleGroupUpdate}
                />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <ConfirmModal
        open={showReconnectConfirm}
        title="חיבור מחדש ל-WhatsApp"
        description="האם לחבר מחדש את הבוט ל-WhatsApp? החיבור הנוכחי יאופס."
        onConfirm={() => reconnectMutation.mutate()}
        onCancel={() => setShowReconnectConfirm(false)}
      />
    </PageTransition>
  );
}
