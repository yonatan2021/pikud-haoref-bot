import React from 'react';

export interface StoryCardProps {
  id: number;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  createdAt: string;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  loading?: boolean;
}

export function StoryCard({
  id,
  body,
  status,
  createdAt,
  onApprove,
  onReject,
  loading = false,
}: StoryCardProps): React.ReactElement {
  const date = new Date(createdAt).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusLabel: Record<typeof status, string> = {
    pending: 'ממתין',
    approved: 'אושר',
    rejected: 'נדחה',
    published: 'פורסם',
  };

  const statusColor: Record<typeof status, string> = {
    pending: 'text-yellow-400',
    approved: 'text-green-400',
    rejected: 'text-red-400',
    published: 'text-blue-400',
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3 text-right">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${statusColor[status]}`}>
          {statusLabel[status]}
        </span>
        <span className="text-xs text-white/40">{date}</span>
      </div>

      <p className="text-sm text-white/90 whitespace-pre-wrap break-words leading-relaxed">
        {body}
      </p>

      {status === 'pending' && (
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onApprove?.(id)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            אשר ופרסם
          </button>
          <button
            onClick={() => onReject?.(id)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            דחה
          </button>
        </div>
      )}
    </div>
  );
}
