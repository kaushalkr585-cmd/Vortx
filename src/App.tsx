// ============================================================
// VORTX — App Root
// ============================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { ToastContainer } from './components/ui/Toast';
import { useToast } from './hooks/useToast';

// Looping background video URL
const BG_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260717_120352_eb988725-1351-43b3-8095-16e4a1005e3d.mp4';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function AppContent() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="relative min-h-screen" style={{ background: '#050505' }}>
      {/* ── Background video ── */}
      <div className="bg-video-wrapper" aria-hidden="true">
        <video
          autoPlay
          loop
          muted
          playsInline
          src={BG_VIDEO}
          aria-hidden="true"
        />
        <div className="bg-video-overlay" />
      </div>

      {/* ── Main Layout ── */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <main id="main" className="flex-1">
          <Hero />
        </main>

        <Footer />
      </div>

      {/* ── Toast Notifications ── */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
