import { useId } from 'react';
import FocusLock from 'react-focus-lock';
import { motion, AnimatePresence } from 'framer-motion';

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
  const titleId = useId();
  const descId = useId();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <FocusLock returnFocus>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <h3 id={titleId} className="font-bold text-lg text-text-primary">{title}</h3>
              <p id={descId} className="text-text-secondary text-sm mt-2">{description}</p>
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
            </motion.div>
          </FocusLock>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
