import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted">
      <span className="mb-3 opacity-60">
        {icon ?? <Inbox size={36} />}
      </span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
