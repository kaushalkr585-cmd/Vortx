// ============================================================
// VORTX — FeatureGrid Section
// ============================================================

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Zap,
  Monitor,
  Music2,
  ListVideo,
  ShieldCheck,
  Stamp,
  Infinity,
  Layers,
} from 'lucide-react';

const FEATURES = [
  {
    icon: <Zap size={20} />,
    title: 'Lightning Fast',
    description: 'Downloads processed at maximum available speed with no throttling or queue.',
  },
  {
    icon: <Monitor size={20} />,
    title: '4K Support',
    description: 'Download in full 4K Ultra HD, 2K, 1080p and all available resolutions.',
  },
  {
    icon: <Music2 size={20} />,
    title: 'High Quality Audio',
    description: 'Extract crystal-clear MP3 audio up to 320 kbps from any video.',
  },
  {
    icon: <ListVideo size={20} />,
    title: 'Playlist Support',
    description: 'Download entire YouTube playlists in a single click. Batch downloads included.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Secure Downloads',
    description: 'No data stored. No tracking. Your privacy is our default setting.',
  },
  {
    icon: <Stamp size={20} />,
    title: 'No Watermarks',
    description: 'Get the original, clean file without any added watermarks or overlays.',
  },
  {
    icon: <Infinity size={20} />,
    title: 'Unlimited Downloads',
    description: 'No daily limits, no sign-up required. Download as many files as you need.',
  },
  {
    icon: <Layers size={20} />,
    title: 'Cross Platform',
    description: 'Works perfectly on Windows, macOS, Linux, iOS and Android browsers.',
  },
];

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function FeatureGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="features"
      className="relative z-10 px-4 sm:px-6 py-24"
      aria-label="Features"
    >
      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-14"
        >
          <h2
            className="font-bold text-white"
            style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', letterSpacing: '-0.03em' }}
          >
            Everything you need
          </h2>
          <p className="mt-3 text-base max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Designed to be the most complete and reliable video downloader available.
          </p>
        </motion.div>

        {/* Grid */}
        <div
          ref={ref}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              variants={CARD_VARIANTS}
              initial="hidden"
              animate={inView ? 'show' : 'hidden'}
              className="feature-card flex flex-col gap-4"
            >
              <div
                className="w-10 h-10 flex items-center justify-center rounded-xl"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
                aria-hidden="true"
              >
                {f.icon}
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {f.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
