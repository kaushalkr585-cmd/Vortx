// ============================================================
// VORTX — AudioSelector Component
// ============================================================

import { motion } from 'framer-motion';
import { Music, Star } from 'lucide-react';
import type { AudioFormat } from '../../types';
import { cn } from '../../lib/utils';

type Props = {
  formats: AudioFormat[];
  selected: string | null;
  onSelect: (id: string) => void;
};

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
};

export function AudioSelector({ formats, selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Music size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
        <h3 className="text-sm font-semibold text-white">Audio Quality</h3>
      </div>

      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        role="listbox"
        aria-label="Audio quality options"
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
              {fmt.recommended && (
                <div className="absolute top-2.5 right-2.5">
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                    aria-label="Recommended"
                  >
                    <Star size={8} fill="currentColor" />
                  </span>
                </div>
              )}

              {/* Bitrate */}
              <p className="font-bold text-white" style={{ fontSize: '0.9375rem', lineHeight: 1 }}>
                {fmt.bitrate}
              </p>

              {/* Codec */}
              <p className="mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {fmt.codec}
              </p>

              {/* Size */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
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
                  MP3
                </span>
              </div>
            </button>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
