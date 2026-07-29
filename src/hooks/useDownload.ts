// ============================================================
// VORTX — useDownload Hook (Production)
// Uses fetch() instead of an <a> tag so HTTP errors from
// /api/download are caught and surfaced as structured errors.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { VortxErrorCode } from './useMediaInfo';
import { ERROR_MESSAGES } from './useMediaInfo';

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
    // Cancel any in-progress download
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'preparing' });

    const params = new URLSearchParams({
      url: mediaUrl,
      format: formatId,
      filename,
      type,
      ...(audioQuality ? { audioQuality } : {}),
    });

    const API_BASE = import.meta.env.VITE_API_BASE || '';
    const downloadUrl = `${API_BASE}/api/download?${params.toString()}`;

    // Brief pause so the preparing state renders before the request blocks
    await new Promise((r) => setTimeout(r, 350));

    try {
      setState({
        status: 'downloading',
        progress: { percent: 0, speed: 'Contacting server…', eta: 'Please wait' },
      });

      const response = await window.fetch(downloadUrl, { signal: controller.signal });

      if (!response.ok) {
        // Try to parse structured error JSON from backend
        let errorCode: VortxErrorCode = 'YTDLP_ERROR';
        let errorMessage = 'Download failed. Please try again.';
        let errorSolution = 'Check that the video is publicly available and try again.';

        try {
          const errBody = await response.json();
          if (errBody && errBody.code) {
            errorCode = errBody.code as VortxErrorCode;
            errorMessage = errBody.message || errorMessage;
            errorSolution = errBody.solution || errorSolution;
          }
        } catch { /* JSON parse failed — use defaults */ }

        setState({ status: 'error', code: errorCode, message: errorMessage, solution: errorSolution });
        return;
      }

      // ── Check for Invidious CDN redirect (JSON with directUrl) ──────────
      // When yt-dlp is bot-blocked, the backend returns the direct YouTube
      // CDN URL as JSON. We must use an <a> tag (not fetch) to open it,
      // because fetch() follows the redirect but gets CORS-blocked by
      // googlevideo.com, while anchor navigation is never CORS-restricted.
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          if (json.redirect === true && json.directUrl) {
            setState({
              status: 'downloading',
              progress: { percent: 50, speed: 'Opening CDN link…', eta: 'Starting' },
            });
            const a = document.createElement('a');
            a.href = json.directUrl;
            a.download = json.filename || filename;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setState({ status: 'complete', filename: json.filename || filename });
            return;
          }
        } catch { /* not a redirect JSON — fall through to blob */ }
      }

      // ── Normal path: stream blob from server and save ───────────────────
      setState({
        status: 'downloading',
        progress: { percent: 30, speed: 'Streaming from server…', eta: 'Almost ready' },
      });

      const blob = await response.blob();

      if (controller.signal.aborted) return;

      // Create an object URL and click it — this triggers the browser Save dialog
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay to ensure the download starts
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

      setState({ status: 'complete', filename });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // User cancelled
      console.error('[useDownload] error:', err);

      const knownError = ERROR_MESSAGES['NETWORK_ERROR'];
      setState({
        status: 'error',
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the download server.',
        solution: knownError.solution,
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
