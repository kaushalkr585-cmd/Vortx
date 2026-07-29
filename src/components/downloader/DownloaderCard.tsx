// ============================================================
// VORTX — DownloaderCard (Production)
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Film, Music, AlertCircle, RefreshCw, Cookie, Clock, ShieldOff, Globe, Lock } from 'lucide-react';

import { URLInput } from './URLInput';
import { MediaPreview } from './MediaPreview';
import { ResolutionSelector } from './ResolutionSelector';
import { AudioSelector } from './AudioSelector';
import { VideoDownloadPanel, AudioDownloadPanel } from './DownloadPanel';
import { MediaPreviewSkeleton, ResolutionSkeleton } from '../ui/LoadingSkeleton';
import { ProgressModal } from '../ui/ProgressModal';

import { useMediaInfo } from '../../hooks/useMediaInfo';
import type { VortxErrorCode } from '../../hooks/useMediaInfo';
import { useDownload } from '../../hooks/useDownload';

type Tab = 'video' | 'audio';

// ── Error icon map ────────────────────────────────────────────
function ErrorIcon({ code }: { code?: VortxErrorCode }) {
  const cls = 'flex-shrink-0';
  switch (code) {
    case 'BOT_DETECTED':     return <Cookie size={15} className={cls} />;
    case 'RATE_LIMITED':     return <Clock size={15} className={cls} />;
    case 'GEO_BLOCKED':      return <Globe size={15} className={cls} />;
    case 'PRIVATE_VIDEO':
    case 'MEMBERS_ONLY':     return <Lock size={15} className={cls} />;
    case 'AGE_RESTRICTED':   return <ShieldOff size={15} className={cls} />;
    default:                 return <AlertCircle size={15} className={cls} />;
  }
}

// ── Inline error banner with solution and retry ───────────────
function ErrorBanner({
  message,
  solution,
  code,
  onRetry,
}: {
  message: string;
  solution?: string;
  code?: VortxErrorCode;
  onRetry?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div
        style={{
          marginTop: '12px',
          padding: '14px 16px',
          borderRadius: '12px',
          background: 'rgba(255, 80, 80, 0.08)',
          border: '1px solid rgba(255, 80, 80, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ color: 'rgba(255, 120, 120, 0.9)', marginTop: '1px' }}>
            <ErrorIcon code={code} />
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
            {message}
          </span>
        </div>

        {/* Solution hint */}
        {solution && (
          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', paddingLeft: '25px', lineHeight: 1.5, margin: 0 }}>
            {solution}
          </p>
        )}

        {/* Retry button */}
        {onRetry && (
          <div style={{ paddingLeft: '25px' }}>
            <button
              onClick={onRetry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '7px',
                padding: '5px 12px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            >
              <RefreshCw size={11} />
              Try Again
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
export function DownloaderCard() {
  const [url, setUrl] = useState('');
  const [lastUrl, setLastUrl] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('video');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  const { state: mediaState, fetch: fetchMedia, reset: resetMedia } = useMediaInfo();
  const { state: dlState, start: startDownload, reset: resetDownload } = useDownload();

  const media = mediaState.status === 'success' ? mediaState.data : null;

  const handleSubmit = useCallback(
    async (inputUrl: string) => {
      setLastUrl(inputUrl);
      setSelectedVideoId(null);
      setSelectedAudioId(null);
      await fetchMedia(inputUrl);
    },
    [fetchMedia]
  );

  const handleRetry = useCallback(() => {
    if (lastUrl) {
      setSelectedVideoId(null);
      setSelectedAudioId(null);
      fetchMedia(lastUrl);
    }
  }, [lastUrl, fetchMedia]);

  useEffect(() => {
    if (mediaState.status === 'success') {
      const recV = mediaState.data.videoFormats.find((f) => f.recommended) ?? mediaState.data.videoFormats[0];
      if (recV) setSelectedVideoId(recV.id);
      const recA = mediaState.data.audioFormats.find((f) => f.recommended) ?? mediaState.data.audioFormats[0];
      if (recA) setSelectedAudioId(recA.id);
    }
  }, [mediaState]);

  const handleReset = () => {
    setUrl('');
    setLastUrl('');
    setSelectedVideoId(null);
    setSelectedAudioId(null);
    resetMedia();
    resetDownload();
  };

  const selectedVideo = media?.videoFormats.find((f) => f.id === selectedVideoId) ?? null;
  const selectedAudio = media?.audioFormats.find((f) => f.id === selectedAudioId) ?? null;

  const handleDownload = () => {
    if (!media) return;
    if (activeTab === 'video' && selectedVideo) {
      const safeTitle = media.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const filename = `VORTX_${safeTitle}_${selectedVideo.label.replace(/\s+/g, '')}.mp4`;
      startDownload(filename, selectedVideo.id, media.url, 'video');
    } else if (activeTab === 'audio' && selectedAudio) {
      const safeTitle = media.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const filename = `VORTX_Audio_${safeTitle}_${selectedAudio.bitrate.replace(/\s+/g, '')}.mp3`;
      startDownload(filename, selectedAudio.id, media.url, 'audio', selectedAudio.audioQuality);
    }
  };

  const isDownloading = dlState.status === 'preparing' || dlState.status === 'downloading';

  return (
    <>
      <div id="downloader" className="w-full max-w-3xl mx-auto">
        <div className="downloader-shell">

          {/* ── Label row ── */}
          <div className="flex items-center justify-between mb-6">
            <p className="downloader-eyebrow">Paste a link to get started</p>
            {mediaState.status !== 'idle' && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleReset}
                className="reset-btn"
                aria-label="Start over"
              >
                <RotateCcw size={12} />
                New
              </motion.button>
            )}
          </div>

          {/* ── URL Input ── */}
          <URLInput
            value={url}
            onChange={setUrl}
            onSubmit={handleSubmit}
            loading={mediaState.status === 'loading'}
          />

          {/* ── Error banner ── */}
          <AnimatePresence>
            {mediaState.status === 'error' && (
              <ErrorBanner
                message={mediaState.message}
                solution={mediaState.solution}
                code={mediaState.code}
                onRetry={lastUrl ? handleRetry : undefined}
              />
            )}
          </AnimatePresence>

          {/* ── Download error banner ── */}
          <AnimatePresence>
            {dlState.status === 'error' && (
              <ErrorBanner
                message={dlState.message}
                solution={dlState.solution}
                code={dlState.code}
                onRetry={handleDownload}
              />
            )}
          </AnimatePresence>

          {/* ── Loading skeleton ── */}
          <AnimatePresence>
            {mediaState.status === 'loading' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-8 flex flex-col gap-6"
              >
                <MediaPreviewSkeleton />
                <div className="divider" />
                <ResolutionSkeleton />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Results ── */}
          <AnimatePresence>
            {media && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 flex flex-col gap-8"
              >
                <MediaPreview media={media} />

                <div className="divider" />

                {/* Tab row */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="tab-group" role="tablist">
                    <button
                      role="tab"
                      aria-selected={activeTab === 'video'}
                      className={`tab-btn flex items-center gap-2 ${activeTab === 'video' ? 'active' : ''}`}
                      onClick={() => setActiveTab('video')}
                    >
                      <Film size={13} />
                      Video
                    </button>
                    <button
                      role="tab"
                      aria-selected={activeTab === 'audio'}
                      className={`tab-btn flex items-center gap-2 ${activeTab === 'audio' ? 'active' : ''}`}
                      onClick={() => setActiveTab('audio')}
                    >
                      <Music size={13} />
                      Audio MP3
                    </button>
                  </div>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No watermarks · No limits
                  </span>
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col gap-6"
                  >
                    {activeTab === 'video' ? (
                      <>
                        <ResolutionSelector
                          formats={media.videoFormats}
                          selected={selectedVideoId}
                          onSelect={setSelectedVideoId}
                        />
                        {selectedVideo && (
                          <VideoDownloadPanel
                            format={selectedVideo}
                            onDownload={handleDownload}
                            loading={isDownloading}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <AudioSelector
                          formats={media.audioFormats}
                          selected={selectedAudioId}
                          onSelect={setSelectedAudioId}
                        />
                        {selectedAudio && (
                          <AudioDownloadPanel
                            format={selectedAudio}
                            title={media.title}
                            onDownload={handleDownload}
                            loading={isDownloading}
                          />
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ProgressModal
        state={dlState}
        filename={
          media
            ? activeTab === 'video' && selectedVideo
              ? `VORTX_${media.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)}_${selectedVideo.label.replace(/\s+/g, '')}.mp4`
              : selectedAudio
              ? `VORTX_Audio_${selectedAudio.bitrate.replace(/\s+/g, '')}.mp3`
              : 'VORTX_download'
            : 'VORTX_download'
        }
        onClose={resetDownload}
      />
    </>
  );
}
