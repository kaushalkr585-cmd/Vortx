// ============================================================
// VORTX — Footer (Copyright only)
// ============================================================

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative z-10 border-t"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      aria-label="Site footer"
    >
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <img
          src="/vortx-logo-transparent.png"
          alt="VORTX Logo"
          className="h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
        />
        <p
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.28)' }}
        >
          © {year} VORTX. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
