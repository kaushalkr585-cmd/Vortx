// ============================================================
// VORTX — useDownload Hook (Production)
// Strategy:
//   1. Warm up Render server (handles cold-start 502 / CORS issue)
//   2. Ask server to proxy the download (Cobalt/Piped/Invidious)
//   3. If server returns STREAM_UNAVAILABLE → client-side fallback:
//      call Invidious API directly from the browser (user's IP is
//      not blocked by YouTube, unlike Render's cloud IP).
//      Uses ?local=true for CORS-enabled proxied URLs.
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

// ── Client-side Invidious fallback ────────────────────────────────
// Called when the server can't proxy the stream (all cloud providers blocked).
// The BROWSER's IP is not blocked by YouTube, so this works!
const CLIENT_INVIDIOUS = [
  'https://vid.puffyan.us',
  'https://inv.riverside.rocks',
  'https://yt.artemislena.eu',
  'https://invidious.flokinet.to',
  'https://invidious.tiekoetter.com',
  'https://invidious.snopyta.org',
];

const CLIENT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped.tokhmi.xyz',
];

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v');
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
  } catch { /* ignore */ }
  return null;
}

async function clientSideDownload(
  mediaUrl: string,
  formatId: string,
  isAudio: boolean,
  filename: string,
  onProgress: (msg: string) => void,
): Promise<boolean> {
  const videoId = extractVideoId(mediaUrl);
  if (!videoId) return false;

  const targetHeight = (() => {
    const m = formatId?.match(/height<=?\??([\d]+)/);
    return m ? parseInt(m[1]) : 720;
  })();

  // ── Try Piped API first (has CORS, fast) ────────────────────────
  for (const instance of CLIENT_PIPED) {
    try {
      onProgress(`Trying ${new URL(instance).hostname}…`);
      const resp = await fetch(`${instance}/streams/${videoId}`, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const data = await resp.json();

      let streamUrl: string | null = null;
      if (isAudio) {
        const streams: any[] = (data.audioStreams || []).filter((s: any) => s.url);
        streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        streamUrl = streams[0]?.url ?? null;
      } else {
        const muxed: any[] = (data.videoStreams || []).filter((s: any) => s.url && !s.videoOnly);
        muxed.sort((a, b) => {
          const qa = parseInt((a.quality || '').replace('p', '') || '0');
          const qb = parseInt((b.quality || '').replace('p', '') || '0');
          return qb - qa;
        });
        const match = muxed.find(s => parseInt((s.quality || '').replace('p', '') || '9999') <= targetHeight)
          ?? muxed[muxed.length - 1];
        streamUrl = match?.url ?? null;
      }

      if (streamUrl) {
        // Try fetching the stream (works if URL has CORS headers)
        try {
          onProgress('Downloading stream…');
          const vidResp = await fetch(streamUrl, { signal: AbortSignal.timeout(60000), mode: 'cors' });
          if (vidResp.ok) {
            const blob = await vidResp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            return true;
          }
        } catch {
          // CORS blocked — open in new tab as last resort
          window.open(streamUrl, '_blank');
          return true;
        }
      }
    } catch { /* this instance failed, try next */ }
  }

  // ── Try Invidious with ?local=true (proxied URLs with CORS) ─────
  for (const instance of CLIENT_INVIDIOUS) {
    try {
      onProgress(`Trying ${new URL(instance).hostname}…`);
      const resp = await fetch(`${instance}/api/v1/videos/${videoId}?local=true`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();

      let streamUrl: string | null = null;
      if (isAudio) {
        const streams: any[] = (data.adaptiveFormats || [])
          .filter((f: any) => f.type?.startsWith('audio/') && f.url);
        streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        streamUrl = streams[0]?.url ?? null;
      } else {
        const muxed: any[] = (data.formatStreams || []).filter((f: any) => f.url);
        muxed.sort((a, b) => {
          const ha = parseInt((a.resolution || '0').replace('p', '')) || 0;
          const hb = parseInt((b.resolution || '0').replace('p', '')) || 0;
          return hb - ha;
        });
        const match = muxed.find(f =>
          (parseInt((f.resolution || '9999').replace('p', '')) || 9999) <= targetHeight
        ) ?? muxed[muxed.length - 1];
        streamUrl = match?.url ?? null;
      }

      if (streamUrl) {
        try {
          onProgress('Downloading stream…');
          const vidResp = await fetch(streamUrl, { signal: AbortSignal.timeout(60000), mode: 'cors' });
          if (vidResp.ok) {
            const blob = await vidResp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            return true;
          }
        } catch {
          window.open(streamUrl, '_blank');
          return true;
        }
      }
    } catch { /* this instance failed, try next */ }
  }

  return false;
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

    const API_BASE = import.meta.env.VITE_API_BASE || '';
    const isAudio = type === 'audio';

    // ── Step 1: Warm up the Render server ──────────────────────────
    // Free Render tier cold-starts return 502 with no CORS headers.
    // Pinging first ensures Express is alive before the download request.
    setState({ status: 'downloading', progress: { percent: 5, speed: 'Waking up server…', eta: 'Up to 30s' } });

    const PING_TIMEOUT_MS = 45_000;
    const pingStart = Date.now();
    let serverAwake = false;

    while (!controller.signal.aborted && Date.now() - pingStart < PING_TIMEOUT_MS) {
      try {
        const pingRes = await window.fetch(`${API_BASE}/api/ping`, { signal: AbortSignal.timeout(8000) });
        if (pingRes.ok) { serverAwake = true; break; }
      } catch { /* still sleeping */ }

      await new Promise(r => setTimeout(r, 3000));
      const remaining = Math.round((PING_TIMEOUT_MS - (Date.now() - pingStart)) / 1000);
      setState({ status: 'downloading', progress: { percent: 12, speed: 'Waking server…', eta: `~${remaining}s` } });
    }

    if (controller.signal.aborted) return;

    if (!serverAwake) {
      // Server is completely down — try client-side fallback immediately
      setState({ status: 'downloading', progress: { percent: 20, speed: 'Server offline — using browser fallback…', eta: 'Please wait' } });
      const ok = await clientSideDownload(mediaUrl, formatId, isAudio, filename,
        (msg) => setState({ status: 'downloading', progress: { percent: 40, speed: msg, eta: 'Please wait' } })
      );
      if (ok) { setState({ status: 'complete', filename }); return; }
      setState({ status: 'error', code: 'NETWORK_ERROR', message: 'Server is unreachable and all fallbacks failed.', solution: 'Wait 30s and try again.' });
      return;
    }

    setState({ status: 'downloading', progress: { percent: 20, speed: 'Contacting server…', eta: 'Please wait' } });
    await new Promise(r => setTimeout(r, 200));

    // ── Step 2: Ask server to proxy the download ────────────────────
    const params = new URLSearchParams({
      url: mediaUrl, format: formatId, filename, type,
      ...(audioQuality ? { audioQuality } : {}),
    });
    const downloadUrl = `${API_BASE}/api/download?${params.toString()}`;

    try {
      const response = await window.fetch(downloadUrl, { signal: controller.signal });

      if (!response.ok) {
        let errorCode: VortxErrorCode = 'YTDLP_ERROR';
        let errorMessage = 'Download failed. Please try again.';
        let errorSolution = 'Check that the video is publicly available.';

        try {
          const errBody = await response.json();
          if (errBody?.code) { errorCode = errBody.code as VortxErrorCode; errorMessage = errBody.message || errorMessage; errorSolution = errBody.solution || errorSolution; }
        } catch { /* ignore */ }

        // ── Step 3: Client-side fallback when server providers all fail ─
        if (errorCode === 'STREAM_UNAVAILABLE' || response.status === 503) {
          setState({ status: 'downloading', progress: { percent: 30, speed: 'Server fallback — using browser…', eta: 'Please wait' } });
          const ok = await clientSideDownload(mediaUrl, formatId, isAudio, filename,
            (msg) => setState({ status: 'downloading', progress: { percent: 50, speed: msg, eta: 'Please wait' } })
          );
          if (ok) { setState({ status: 'complete', filename }); return; }
        }

        setState({ status: 'error', code: errorCode, message: errorMessage, solution: errorSolution });
        return;
      }

      // ── Legacy JSON directUrl handling ──────────────────────────────
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          if (json.redirect === true && json.directUrl) {
            const a = document.createElement('a');
            a.href = json.directUrl; a.download = json.filename || filename;
            a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setState({ status: 'complete', filename: json.filename || filename });
            return;
          }
        } catch { /* fall through to blob */ }
      }

      // ── Normal path: stream blob from server ─────────────────────────
      setState({ status: 'downloading', progress: { percent: 50, speed: 'Streaming from server…', eta: 'Almost ready' } });

      const blob = await response.blob();
      if (controller.signal.aborted) return;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

      setState({ status: 'complete', filename });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[useDownload] error:', err);

      // Network error — try client-side fallback
      setState({ status: 'downloading', progress: { percent: 30, speed: 'Network error — using browser fallback…', eta: 'Please wait' } });
      const ok = await clientSideDownload(mediaUrl, formatId, isAudio, filename,
        (msg) => setState({ status: 'downloading', progress: { percent: 50, speed: msg, eta: 'Please wait' } })
      );
      if (ok) { setState({ status: 'complete', filename }); return; }

      const knownError = ERROR_MESSAGES['NETWORK_ERROR'];
      setState({ status: 'error', code: 'NETWORK_ERROR', message: 'Could not connect to the download server.', solution: knownError.solution });
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setState({ status: 'idle' });
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, cancel, reset };
}
