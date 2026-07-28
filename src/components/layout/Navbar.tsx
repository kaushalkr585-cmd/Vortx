// ============================================================
// VORTX — Navbar (Large prominent logo + frosted glass blur)
// ============================================================

import { useState, useEffect } from 'react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 15);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(5, 5, 5, 0.88)' : 'rgba(5, 5, 5, 0.65)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: scrolled ? '0 12px 40px rgba(0,0,0,0.8)' : 'none',
      }}
    >
      <div className="h-16 sm:h-20 flex items-center justify-center px-4">
        <a
          href="#"
          className="flex items-center justify-center group py-1"
          aria-label="VORTX home"
        >
          <img
            src="/vortx-logo-transparent.png"
            alt="VORTX Logo"
            className="h-10 sm:h-12 lg:h-14 w-auto object-contain transition-transform group-hover:scale-105 filter drop-shadow-[0_2px_16px_rgba(255,255,255,0.25)]"
          />
        </a>
      </div>
    </header>
  );
}
