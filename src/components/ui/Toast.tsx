// ============================================================
// VORTX — Toast Notification Component
// ============================================================

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Toast as ToastType, ToastType as TType } from '../../types';

type ToastProps = {
  toasts: ToastType[];
  onRemove: (id: string) => void;
};

const icons: Record<TType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />,
  error:   <XCircle size={18} className="text-red-400 flex-shrink-0" />,
  info:    <Info size={18} className="text-blue-400 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />,
};

export function ToastContainer({ toasts, onRemove }: ToastProps) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            role="alert"
          >
            <div className="toast">
              {icons[toast.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white leading-tight">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => onRemove(toast.id)}
                className="flex-shrink-0 p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity pointer-events-auto"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
