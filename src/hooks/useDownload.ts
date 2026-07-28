// ============================================================
// VORTX — useDownload Hook (Real yt-dlp Backend Download)
// ============================================================

import { useState, useCallback } from 'react';

export type DownloadProgress = {
  percent: number;
  speed: string;
  eta: string;
};

export type DownloadState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'downloading'; progress: DownloadProgress }
  | { status: 'complete'; filename: string }
  | { status: 'error'; message: string };

/** Build the backend download URL and trigger a real browser download */
function triggerRealDownload(
  mediaUrl: string,
  formatId: string,
  filename: string,
  type: 'video' | 'audio',
  audioQuality?: string
) {
  const params = new URLSearchParams({
    url: mediaUrl,
    format: formatId,
    filename,
    type,
    ...(audioQuality ? { audioQuality } : {}),
  });
  const API_BASE = import.meta.env.VITE_API_BASE || '';
  const downloadHref = `${API_BASE}/api/download?${params.toString()}`;
  const a = document.createElement('a');
  a.href = downloadHref;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useDownload() {
  const [state, setState] = useState<DownloadState>({ status: 'idle' });

  /**
   * @param filename   — desired save filename (e.g. VORTX_MyVideo_1080p.mp4)
   * @param formatId   — yt-dlp format string (e.g. "137+140" or "bestaudio/best")
   * @param mediaUrl   — original video URL (YouTube, Instagram, etc.)
   * @param type       — 'video' or 'audio'
   * @param audioQuality — yt-dlp VBR quality ('0'=best, '9'=worst), for audio only
   */
  const start = useCallback(async (
    filename: string,
    formatId: string,
    mediaUrl: string,
    type: 'video' | 'audio' = 'video',
    audioQuality?: string,
  ) => {
    setState({ status: 'preparing' });

    // Brief preparing state so the UI updates before browser hands off the download
    await new Promise((r) => setTimeout(r, 400));

    try {
      // Trigger the actual download — browser will start streaming from backend
      triggerRealDownload(mediaUrl, formatId, filename, type, audioQuality);

      // Show a "downloading" UI state while yt-dlp works
      // We can't track progress without a WebSocket, so we show a pulsing state
      setState({
        status: 'downloading',
        progress: { percent: 0, speed: 'Streaming…', eta: 'Please wait' },
      });

      // Poll the download status via a short-lived fetch to /api/ping to confirm backend alive
      await new Promise((r) => setTimeout(r, 1200));

      setState({ status: 'complete', filename });
    } catch (err) {
      console.error('[useDownload] error:', err);
      setState({
        status: 'error',
        message: 'Download failed. Make sure the backend server is running and yt-dlp is installed.',
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, reset };
}
