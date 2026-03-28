interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-lg text-text-primary">{title}</h3>
        <p className="text-text-secondary text-sm mt-2">{description}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber hover:bg-amber-dark text-black'
            }`}
          >
            אישור
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-border py-2 rounded-lg text-sm text-text-secondary hover:bg-white/5"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
