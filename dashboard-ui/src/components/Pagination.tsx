interface PaginationProps {
  page: number;
  onPrev: () => void;
  onNext: () => void;
  hasNext: boolean;
  total?: number;
}

export function Pagination({ page, onPrev, onNext, hasNext, total }: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
      <button
        disabled={page === 0}
        onClick={onPrev}
        className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40 cursor-pointer disabled:cursor-default"
      >
        הקודם →
      </button>
      <span className="text-text-muted text-xs">
        עמוד {page + 1}
        {total !== undefined && ` · ${total} סה״כ`}
      </span>
      <button
        disabled={!hasNext}
        onClick={onNext}
        className="text-text-muted text-xs hover:text-text-primary disabled:opacity-40 cursor-pointer disabled:cursor-default"
      >
        ← הבא
      </button>
    </div>
  );
}
