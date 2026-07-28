// ============================================================
// VORTX — DownloaderCard (Premium Redesign)
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Film, Music } from 'lucide-react';

import { URLInput } from './URLInput';
import { MediaPreview } from './MediaPreview';
import { ResolutionSelector } from './ResolutionSelector';
import { AudioSelector } from './AudioSelector';
import { VideoDownloadPanel, AudioDownloadPanel } from './DownloadPanel';
import { MediaPreviewSkeleton, ResolutionSkeleton } from '../ui/LoadingSkeleton';
import { ProgressModal } from '../ui/ProgressModal';

import { useMediaInfo } from '../../hooks/useMediaInfo';
import { useDownload } from '../../hooks/useDownload';

type Tab = 'video' | 'audio';

export function DownloaderCard() {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('video');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  const { state: mediaState, fetch: fetchMedia, reset: resetMedia } = useMediaInfo();
  const { state: dlState, start: startDownload, reset: resetDownload } = useDownload();

  const media = mediaState.status === 'success' ? mediaState.data : null;

  const handleSubmit = useCallback(
    async (inputUrl: string) => {
      setSelectedVideoId(null);
      setSelectedAudioId(null);
      await fetchMedia(inputUrl);
    },
    [fetchMedia]
  );

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

          {/* ── Error ── */}
          <AnimatePresence>
            {mediaState.status === 'error' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="error-banner">
                  <span className="error-dot" />
                  {mediaState.message}
                </div>
              </motion.div>
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
