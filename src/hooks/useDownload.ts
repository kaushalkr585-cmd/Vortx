// ============================================================
// VORTX — useDownload Hook (Production)
//
// Download strategy:
//   PRIMARY: /api/stream (Vercel Edge Function — same domain, no CORS,
//            server-side Piped/Cobalt calls, no cold-start, different IPs)
//   FALLBACK: Render server proxy (/api/download)
//   LAST RESORT: window.open() the stream URL if blob fails
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { VortxErrorCode } from './useMediaInfo';

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
  | { status: 'error'; message: string; code?: VortxErrorCode; solution?: string };

// ── Helpers ───────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v');
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
  } catch { /* ignore */ }
  return null;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ─────────────────────────────────────────────────────────────────

export function useDownload() {
  const [state, setState] = useState<DownloadState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (
    filename: string,
    formatId: string,
    mediaUrl: string,
    type: 'video' | 'audio' = 'video',
    audioQuality?: string,
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'preparing' });
    const isAudio = type === 'audio';

    const targetHeight = (() => {
      const m = formatId?.match(/height<=?\??([\d]+)/);
      return m ? parseInt(m[1]) : 720;
    })();

    const videoId = extractVideoId(mediaUrl);

    setState({
      status: 'downloading',
      progress: { percent: 10, speed: 'Connecting…', eta: 'Please wait' },
    });

    await new Promise(r => setTimeout(r, 100));

    // ── PRIMARY: Vercel Edge Function /api/stream ───────────────────
    // Same domain → no CORS. Server-side → no browser CORS restrictions.
    // Vercel IPs → not blocked by YouTube. No cold-start.
    if (videoId) {
      try {
        setState({
          status: 'downloading',
          progress: { percent: 20, speed: 'Fetching stream…', eta: 'Please wait' },
        });

        const edgeParams = new URLSearchParams({
          videoId,
          isAudio: String(isAudio),
          height: String(targetHeight),
          filename,
        });

        const edgeResp = await window.fetch(`/api/stream?${edgeParams}`, {
          signal: controller.signal,
        });

        if (edgeResp.ok) {
          setState({
            status: 'downloading',
            progress: { percent: 50, speed: 'Downloading…', eta: 'Almost ready' },
          });
          const blob = await edgeResp.blob();
          if (controller.signal.aborted) return;
          triggerBlobDownload(blob, filename);
          setState({ status: 'complete', filename });
          return;
        }

        // Parse error from edge function
        let edgeCode: string = 'STREAM_UNAVAILABLE';
        try {
          const errBody = await edgeResp.json();
          edgeCode = errBody?.code || edgeCode;
        } catch { /* ignore */ }

        if (edgeCode !== 'STREAM_UNAVAILABLE') {
          setState({
            status: 'error',
            code: edgeCode as VortxErrorCode,
            message: 'Stream unavailable for this video.',
            solution: 'Try again or try a different format.',
          });
          return;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[useDownload] Edge function failed:', err);
        // Fall through to Render fallback
      }
    }

    // ── FALLBACK: Render server /api/download ────────────────────────
    // Handles non-YouTube URLs (Instagram, etc.) and as Render fallback.
    const API_BASE = import.meta.env.VITE_API_BASE || '';

    setState({
      status: 'downloading',
      progress: { percent: 30, speed: 'Trying server…', eta: 'Up to 30s' },
    });

    // Warm up Render server (handles cold-start 502/CORS issue)
    const pingStart = Date.now();
    let serverAwake = false;

    while (!controller.signal.aborted && Date.now() - pingStart < 30_000) {
      try {
        const pingRes = await window.fetch(`${API_BASE}/api/ping`, {
          signal: AbortSignal.timeout(6000),
        });
        if (pingRes.ok) { serverAwake = true; break; }
      } catch { /* sleeping */ }

      await new Promise(r => setTimeout(r, 2500));
      const remaining = Math.round((30_000 - (Date.now() - pingStart)) / 1000);
      setState({
        status: 'downloading',
        progress: { percent: 35, speed: 'Waking server…', eta: `~${remaining}s` },
      });
    }

    if (controller.signal.aborted) return;

    if (!serverAwake) {
      setState({
        status: 'error',
        code: 'STREAM_UNAVAILABLE',
        message: 'All download providers are currently unavailable.',
        solution: 'Try again in a few minutes.',
      });
      return;
    }

    try {
      const params = new URLSearchParams({
        url: mediaUrl, format: formatId, filename, type,
        ...(audioQuality ? { audioQuality } : {}),
      });

      const response = await window.fetch(`${API_BASE}/api/download?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorCode: VortxErrorCode = 'STREAM_UNAVAILABLE';
        let errorMessage = 'Download failed.';
        let errorSolution = 'Try again or try a different format.';
        try {
          const errBody = await response.json();
          if (errBody?.code) {
            errorCode = errBody.code as VortxErrorCode;
            errorMessage = errBody.message || errorMessage;
            errorSolution = errBody.solution || errorSolution;
          }
        } catch { /* ignore */ }
        setState({ status: 'error', code: errorCode, message: errorMessage, solution: errorSolution });
        return;
      }

      setState({
        status: 'downloading',
        progress: { percent: 60, speed: 'Streaming from server…', eta: 'Almost ready' },
      });

      const blob = await response.blob();
      if (controller.signal.aborted) return;
      triggerBlobDownload(blob, filename);
      setState({ status: 'complete', filename });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[useDownload] Render fallback error:', err);
      setState({
        status: 'error',
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the download server.',
        solution: 'Check your internet connection and try again.',
      });
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setState({ status: 'idle' });
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, cancel, reset };
}
