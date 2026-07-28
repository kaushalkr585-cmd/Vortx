// ============================================================
// VORTX — URLInput Component (Guaranteed Zero Overlap)
// ============================================================

import { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X, Clipboard, ArrowRight } from 'lucide-react';
import { detectPlatform } from '../../lib/utils';
import type { Platform } from '../../types';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (url: string) => void;
  loading: boolean;
};

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === 'youtube' || platform === 'youtube-shorts') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
        <rect width="24" height="24" rx="6" fill="#FF0000" />
        <path d="M9.5 15.5V8.5l6.5 3.5-6.5 3.5z" fill="white" />
      </svg>
    );
  }
  if (platform === 'instagram' || platform === 'instagram-reels') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
        <rect width="24" height="24" rx="6" fill="url(#ig-grad-input)" />
        <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
        <defs>
          <radialGradient id="ig-grad-input" cx="30%" cy="107%" r="120%">
            <stop offset="0%" stopColor="#ffd879" />
            <stop offset="25%" stopColor="#f56040" />
            <stop offset="57%" stopColor="#e1306c" />
            <stop offset="100%" stopColor="#833ab4" />
          </radialGradient>
        </defs>
      </svg>
    );
  }
  return <Link2 size={18} style={{ color: 'rgba(255,255,255,0.4)' }} className="flex-shrink-0" />;
}

export function URLInput({ value, onChange, onSubmit, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const platform = value ? detectPlatform(value) : 'unknown';

  const handlePasteClick = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text);
        onSubmit(text);
      }
    } catch {
      inputRef.current?.focus();
    }
  }, [onChange, onSubmit]);

  const handlePasteEvent = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (pasted) {
        onChange(pasted);
        setTimeout(() => onSubmit(pasted), 50);
      }
    },
    [onChange, onSubmit]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value) {
        onSubmit(value);
      }
    }
  };

  return (
    <div className="relative flex flex-col gap-3 w-full my-1">
      {/* Search Input Bar */}
      <div className="relative flex items-center w-full group">
        {/* Left icon badge — clear 16px inset */}
        <div className="absolute left-4 flex items-center justify-center pointer-events-none z-10">
          <PlatformIcon platform={platform} />
        </div>

        {/* Input element — padding defined in index.css (.url-input) as pl-18 pr-56 */}
        <input
          ref={inputRef}
          id="url-input"
          type="text"
          className="url-input tracking-tight"
          placeholder="Paste YouTube or Instagram link..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePasteEvent}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
          aria-label="Video URL input"
        />

        {/* Right actions: Paste / Clear + Analyse button */}
        <div className="absolute right-3 flex items-center gap-2 z-10">
          {!value && (
            <button
              type="button"
              onClick={handlePasteClick}
              className="btn-cut-border btn-cut-sm !hidden sm:!inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white"
              title="Paste from clipboard"
            >
              <Clipboard size={13} />
              Paste
            </button>
          )}

          <AnimatePresence>
            {value && !loading && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors"
                aria-label="Clear URL"
                type="button"
              >
                <X size={14} />
              </motion.button>
            )}
          </AnimatePresence>

          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn-cut btn-cut-sm py-2 px-4 flex items-center gap-1.5 text-xs sm:text-sm font-semibold tracking-tight shadow-lg"
            onClick={() => value && onSubmit(value)}
            disabled={!value || loading}
            type="button"
            aria-label="Analyse URL"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Fetching
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                Analyse
                <ArrowRight size={14} />
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* Helper Line — clean single line with no text collision */}
      <div className="flex items-center justify-between px-1 text-xs text-white/40 gap-2 mt-1">
        <span className="truncate">Supports YouTube, Shorts, Instagram Reels &amp; Posts</span>
      </div>
    </div>
  );
}
