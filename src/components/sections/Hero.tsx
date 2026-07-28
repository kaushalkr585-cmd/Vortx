// ============================================================
// VORTX — Hero Section (Premium Redesign)
// ============================================================

import { motion } from 'framer-motion';
import { DownloaderCard } from '../downloader/DownloaderCard';

const FADE = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function Hero() {
  return (
    <section
      className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6"
      style={{ paddingTop: '9rem', paddingBottom: '8rem' }}
      aria-label="Hero"
    >
      {/* ── Eyebrow ── */}
      <motion.p
        custom={0}
        variants={FADE}
        initial="hidden"
        animate="show"
        className="hero-eyebrow"
      >
        YouTube &amp; Instagram Downloader
      </motion.p>

      {/* ── Heading ── */}
      <motion.h1
        custom={1}
        variants={FADE}
        initial="hidden"
        animate="show"
        className="hero-heading"
      >
        Download anything.
        <br />
        <span className="hero-heading-accent">No limits.</span>
      </motion.h1>

      {/* ── Subheading ── */}
      <motion.p
        custom={2}
        variants={FADE}
        initial="hidden"
        animate="show"
        className="hero-sub"
      >
        Videos, reels, shorts and audio in every quality —<br className="hidden sm:block" />
        from 144p to 4K 60fps HDR. Free forever.
      </motion.p>

      {/* ── Downloader card ── */}
      <motion.div
        custom={3}
        variants={FADE}
        initial="hidden"
        animate="show"
        className="w-full mt-12"
        style={{ maxWidth: '780px' }}
      >
        <DownloaderCard />
      </motion.div>

      {/* ── Trust row ── */}
      <motion.div
        custom={4}
        variants={FADE}
        initial="hidden"
        animate="show"
        className="trust-row"
      >
        <span className="trust-dot trust-dot--green" />
        No sign-up required
        <span className="trust-sep" />
        No watermarks
        <span className="trust-sep" />
        No storage or logs
        <span className="trust-sep" />
        Up to 4K 60fps HDR
      </motion.div>
    </section>
  );
}
