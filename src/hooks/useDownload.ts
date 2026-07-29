// ============================================================
// VORTX — useDownload Hook (Production)
// Includes server warm-up to handle Render free-tier cold starts.
// Cold start: Render sleeps after inactivity; first request returns
// a 502 from Render's gateway (no CORS headers). Pinging /api/ping
// first ensures Express is alive before the actual download request.
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

    const API_BASE = import.meta.env.VITE_API_BASE || '';

    // ── Step 1: Warm up the server ──────────────────────────────────────────
    // Render free tier sleeps after ~15 min of inactivity. The first request
    // during a cold start is handled by Render's gateway (not Express), so
    // it returns a 502 with NO CORS headers → CORS error in the browser.
    // Fix: ping /api/ping first. Retry until it responds (up to 45s).
    setState({
      status: 'downloading',
      progress: { percent: 5, speed: 'Waking up server…', eta: 'Up to 30s' },
    });

    const PING_TIMEOUT_MS = 45_000;
    const pingStart = Date.now();
    let serverAwake = false;

    while (!controller.signal.aborted && Date.now() - pingStart < PING_TIMEOUT_MS) {
      try {
        const pingRes = await window.fetch(`${API_BASE}/api/ping`, {
          signal: AbortSignal.timeout(8000),
        });
        if (pingRes.ok) { serverAwake = true; break; }
      } catch { /* still sleeping — retry */ }

      await new Promise(r => setTimeout(r, 3000));

      const remaining = Math.round((PING_TIMEOUT_MS - (Date.now() - pingStart)) / 1000);
      setState({
        status: 'downloading',
        progress: { percent: 12, speed: 'Waking up server…', eta: `~${remaining}s` },
      });
    }

    if (controller.signal.aborted) return;

    if (!serverAwake) {
      setState({
        status: 'error',
        code: 'NETWORK_ERROR',
        message: 'Server is taking too long to respond.',
        solution: 'Wait 30 seconds and try again — the server may be cold-starting.',
      });
      return;
    }

    setState({
      status: 'downloading',
      progress: { percent: 20, speed: 'Contacting server…', eta: 'Please wait' },
    });

    await new Promise(r => setTimeout(r, 200));

    // ── Step 2: Build download URL ──────────────────────────────────────────
    const params = new URLSearchParams({
      url: mediaUrl,
      format: formatId,
      filename,
      type,
      ...(audioQuality ? { audioQuality } : {}),
    });

    const downloadUrl = `${API_BASE}/api/download?${params.toString()}`;

    try {
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

      // ── Check for legacy JSON directUrl redirect ─────────────────────────
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          if (json.redirect === true && json.directUrl) {
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

      // ── Normal path: stream blob from server and save ────────────────────
      setState({
        status: 'downloading',
        progress: { percent: 50, speed: 'Streaming from server…', eta: 'Almost ready' },
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
