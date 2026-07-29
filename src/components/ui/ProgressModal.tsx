// ============================================================
// VORTX — ProgressModal Component
// ============================================================

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, X, Zap } from 'lucide-react';
import type { DownloadState } from '../../hooks/useDownload';

type Props = {
  state: DownloadState;
  filename: string;
  onClose: () => void;
  onCancel?: () => void;
};

export function ProgressModal({ state, filename, onClose, onCancel: _onCancel }: Props) {
  // Error state is handled inline in DownloaderCard — modal only shows for active/complete states
  const isOpen =
    state.status === 'preparing' ||
    state.status === 'downloading' ||
    state.status === 'complete';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={state.status === 'complete' ? onClose : undefined}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Download progress"
          >
            <div
              className="glass-card w-full max-w-md p-8 relative"
              style={{ borderRadius: '20px' }}
            >
              {/* Close — only when complete */}
              {state.status === 'complete' && (
                <button
                  onClick={onClose}
                  className="absolute top-5 right-5 opacity-40 hover:opacity-80 transition-opacity"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              )}

              {/* Content */}
              <AnimatePresence mode="wait">
                {state.status === 'preparing' && (
                  <motion.div
                    key="preparing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-5 text-center"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                    <div>
                      <p className="font-semibold text-white">Preparing download…</p>
                      <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Fetching the best stream
                      </p>
                    </div>
                  </motion.div>
                )}

                {state.status === 'downloading' && (
                  <motion.div
                    key="downloading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                           style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <Download size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-white truncate">{filename}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          Downloading…
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {state.progress.percent}%
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${state.progress.percent}%` }}
                      />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap size={13} style={{ color: 'rgba(255,255,255,0.4)' }} />
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {state.progress.speed}
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        ETA: {state.progress.eta}
                      </span>
                    </div>
                  </motion.div>
                )}

                {state.status === 'complete' && (
                  <motion.div
                    key="complete"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center gap-5 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 18 }}
                    >
                      <CheckCircle2 size={48} className="text-white" strokeWidth={1.5} />
                    </motion.div>
                    <div>
                      <p className="font-semibold text-white text-lg">Download Complete</p>
                      <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {filename}
                      </p>
                    </div>
                    <button className="btn-cut btn-cut-sm" onClick={onClose}>
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
