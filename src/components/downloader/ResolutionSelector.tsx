// ============================================================
// VORTX — ResolutionSelector Component
// ============================================================

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import type { VideoFormat } from '../../types';
import { cn } from '../../lib/utils';

type Props = {
  formats: VideoFormat[];
  selected: string | null;
  onSelect: (id: string) => void;
};

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
};

export function ResolutionSelector({ formats, selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Select Quality</h3>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {formats.length} options available
        </span>
      </div>

      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        role="listbox"
        aria-label="Video quality options"
      >
        {formats.map((fmt) => (
          <motion.div key={fmt.id} variants={ITEM}>
            <button
              role="option"
              aria-selected={selected === fmt.id}
              className={cn(
                'resolution-card w-full text-left relative',
                selected === fmt.id && 'selected'
              )}
              onClick={() => onSelect(fmt.id)}
            >
              {/* Badges */}
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                {fmt.recommended && (
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-white"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                    title="Recommended"
                    aria-label="Recommended"
                  >
                    <Star size={8} fill="currentColor" />
                  </span>
                )}
                {fmt.hdr && (
                  <span
                    className="px-1.5 py-0.5 rounded text-amber-400"
                    style={{
                      background: 'rgba(251,191,36,0.12)',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    HDR
                  </span>
                )}
              </div>

              {/* Label */}
              <p
                className="font-bold text-white"
                style={{ fontSize: '0.9375rem', lineHeight: 1 }}
              >
                {fmt.label}
              </p>

              {/* Resolution */}
              <p
                className="mt-1.5 text-xs"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {fmt.resolution}
              </p>

              {/* Codec + FPS */}
              <p
                className="mt-0.5 text-xs"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {fmt.codec} · {fmt.fps}fps
              </p>

              {/* Size + container */}
              <div className="mt-3 flex items-center justify-between">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  {fmt.estimatedSize}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.6875rem',
                  }}
                >
                  {fmt.container}
                </span>
              </div>
            </button>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
