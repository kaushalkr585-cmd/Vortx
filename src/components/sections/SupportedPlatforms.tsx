// ============================================================
// VORTX — SupportedPlatforms Section
// ============================================================

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const PLATFORMS = [
  {
    name: 'YouTube',
    description: 'Videos, playlists, channels',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#FF0000" />
        <path d="M9.5 15.5V8.5l6.5 3.5-6.5 3.5z" fill="white" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    description: 'Posts, photos, carousels',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" aria-hidden="true">
        <rect width="24" height="24" rx="5.5" fill="url(#ig1)" />
        <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
        <defs>
          <radialGradient id="ig1" cx="30%" cy="107%" r="120%">
            <stop offset="0%" stopColor="#ffd879" />
            <stop offset="25%" stopColor="#f56040" />
            <stop offset="57%" stopColor="#e1306c" />
            <stop offset="100%" stopColor="#833ab4" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
  {
    name: 'YouTube Shorts',
    description: 'Short-form vertical videos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#FF0000" />
        <path d="M15 12l-5-3v6l5-3z" fill="white" />
        <path d="M18 6h-1.5L14 8.5v2l2-2.5H18V6z" fill="white" />
      </svg>
    ),
  },
  {
    name: 'Instagram Reels',
    description: 'Short-form reels & stories',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" aria-hidden="true">
        <rect width="24" height="24" rx="5.5" fill="url(#ig2)" />
        <path d="M9.5 15.5V8.5l6.5 3.5-6.5 3.5z" fill="white" />
        <defs>
          <radialGradient id="ig2" cx="30%" cy="107%" r="120%">
            <stop offset="0%" stopColor="#ffd879" />
            <stop offset="25%" stopColor="#f56040" />
            <stop offset="57%" stopColor="#e1306c" />
            <stop offset="100%" stopColor="#833ab4" />
          </radialGradient>
        </defs>
      </svg>
    ),
  },
];

export function SupportedPlatforms() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="relative z-10 px-4 sm:px-6 pb-16"
      style={{ paddingTop: '5rem' }}
      aria-label="Supported platforms"
    >
      <div className="max-w-5xl mx-auto">
        {/* Label */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center text-xs font-medium tracking-widest uppercase mb-12"
          style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em' }}
        >
          Supported Platforms
        </motion.p>

        {/* Platform cards */}
        <div
          ref={ref}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {PLATFORMS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl text-center cursor-default"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 250ms cubic-bezier(0.16,1,0.3,1)',
              }}
              aria-label={p.name}
            >
              {p.icon}
              <div>
                <p className="font-semibold text-white text-sm">{p.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {p.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
