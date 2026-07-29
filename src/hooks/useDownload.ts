// ============================================================
// VORTX — useDownload Hook (Production)
// Download Strategy (in priority order):
//   1. Server-side stream proxy (Render backend)
//   2. Cobalt API from browser (CORS-enabled download service)
//   3. Piped API from browser → blob download or window.open()
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
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ── Client-side download fallback ────────────────────────────────
// Called when Render's server can't proxy the stream.
// The BROWSER's IP is not blocked by YouTube, so direct API calls work!

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

  // ── 1. Cobalt API (purpose-built downloader with CORS) ─────────
  // Cobalt tunnel URLs set Content-Disposition: attachment, so
  // window.open() actually triggers a file download (not just play).
  const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://cobalt.api.012.one',
    'https://co.wuk.sh',
  ];

  for (const cobaltBase of COBALT_INSTANCES) {
    try {
      onProgress(`Trying Cobalt (${new URL(cobaltBase).hostname})…`);
      const body = JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoQuality: String(targetHeight),
        isAudioOnly: isAudio,
        isNoTTWatermark: true,
        filenameStyle: 'basic',
      });

      let cobaltUrl: string | null = null;
      let cobaltStatus: string = '';

      // Try new API endpoint first
      for (const endpoint of [`${cobaltBase}/`, `${cobaltBase}/api/json`]) {
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          cobaltUrl = data.url || data.tunnelUrl || null;
          cobaltStatus = data.status || '';
          if (cobaltUrl) break;
        } catch { /* try next endpoint */ }
      }

      if (cobaltUrl) {
        onProgress('Download link found, starting…');

        // For tunnel URLs: Content-Disposition:attachment → window.open() downloads the file
        // For redirect URLs (YouTube CDN): try blob fetch first, fall back to window.open()
        if (cobaltStatus === 'tunnel') {
          // Tunnel has CORS — try blob download for best experience
          try {
            const streamResp = await fetch(cobaltUrl, { signal: AbortSignal.timeout(120000), mode: 'cors' });
            if (streamResp.ok) {
              const blob = await streamResp.blob();
              triggerBlobDownload(blob, filename);
              return true;
            }
          } catch { /* CORS failed — fall through to window.open */ }

          // Content-Disposition: attachment means window.open triggers download
          window.open(cobaltUrl, '_blank');
          return true;
        }

        // Redirect URL (YouTube CDN) — try blob, fall to window.open
        try {
          const streamResp = await fetch(cobaltUrl, { signal: AbortSignal.timeout(120000), mode: 'cors' });
          if (streamResp.ok) {
            const blob = await streamResp.blob();
            triggerBlobDownload(blob, filename);
            return true;
          }
        } catch { /* CORS failed */ }

        window.open(cobaltUrl, '_blank');
        return true;
      }
    } catch { /* this cobalt instance failed */ }
  }

  // ── 2. Piped API (has CORS, proxies streams through their servers) ─
  const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://piped.tokhmi.xyz',
    'https://piped.moomoo.me',
  ];

  for (const instance of PIPED_INSTANCES) {
    try {
      onProgress(`Trying Piped (${new URL(instance).hostname})…`);
      const resp = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();

      let streamUrl: string | null = null;
      if (isAudio) {
        const streams: any[] = (data.audioStreams || []).filter((s: any) => s.url);
        streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        streamUrl = streams[0]?.url ?? null;
      } else {
        const muxed: any[] = (data.videoStreams || []).filter((s: any) => s.url && !s.videoOnly);
        muxed.sort((a: any, b: any) => {
          const qa = parseInt((a.quality || '').replace('p', '') || '0');
          const qb = parseInt((b.quality || '').replace('p', '') || '0');
          return qb - qa;
        });
        const match = muxed.find(
          (s: any) => parseInt((s.quality || '').replace('p', '') || '9999') <= targetHeight
        ) ?? muxed[muxed.length - 1];
        streamUrl = match?.url ?? null;
      }

      if (!streamUrl) continue;

      // Try CORS blob download (works if Piped proxies through their domain)
      try {
        onProgress('Streaming from Piped…');
        const streamResp = await fetch(streamUrl, {
          signal: AbortSignal.timeout(120000),
          mode: 'cors',
        });
        if (streamResp.ok) {
          const blob = await streamResp.blob();
          triggerBlobDownload(blob, filename);
          return true;
        }
      } catch {
        // CORS failed — open in new tab (video plays, not ideal but functional)
        onProgress('Opening stream (CORS restriction)…');
        window.open(streamUrl, '_blank');
        return true;
      }
    } catch { /* this Piped instance failed */ }
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
    setState({ status: 'downloading', progress: { percent: 5, speed: 'Waking up server…', eta: 'Up to 30s' } });

    const PING_TIMEOUT_MS = 30_000;
    const pingStart = Date.now();
    let serverAwake = false;

    while (!controller.signal.aborted && Date.now() - pingStart < PING_TIMEOUT_MS) {
      try {
        const pingRes = await window.fetch(`${API_BASE}/api/ping`, { signal: AbortSignal.timeout(6000) });
        if (pingRes.ok) { serverAwake = true; break; }
      } catch { /* sleeping */ }

      await new Promise(r => setTimeout(r, 2500));
      const remaining = Math.round((PING_TIMEOUT_MS - (Date.now() - pingStart)) / 1000);
      setState({ status: 'downloading', progress: { percent: 12, speed: 'Waking server…', eta: `~${remaining}s` } });
    }

    if (controller.signal.aborted) return;

    // ── Step 2: If server is up, try server-side proxy ──────────────
    if (serverAwake) {
      setState({ status: 'downloading', progress: { percent: 20, speed: 'Contacting server…', eta: 'Please wait' } });
      await new Promise(r => setTimeout(r, 150));

      const params = new URLSearchParams({
        url: mediaUrl, format: formatId, filename, type,
        ...(audioQuality ? { audioQuality } : {}),
      });

      try {
        const response = await window.fetch(`${API_BASE}/api/download?${params}`, { signal: controller.signal });

        if (response.ok) {
          setState({ status: 'downloading', progress: { percent: 50, speed: 'Streaming from server…', eta: 'Almost ready' } });
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          triggerBlobDownload(blob, filename);
          setState({ status: 'complete', filename });
          return;
        }

        // Parse error code
        let errorCode: VortxErrorCode = 'YTDLP_ERROR';
        try {
          const errBody = await response.json();
          if (errBody?.code) errorCode = errBody.code as VortxErrorCode;
        } catch { /* ignore */ }

        // Fall through to client-side if server providers all failed
        if (errorCode !== 'STREAM_UNAVAILABLE') {
          setState({ status: 'error', code: errorCode, message: 'Download failed.', solution: 'Check that the video is publicly available.' });
          return;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Network error → fall through to client-side
      }
    }

    // ── Step 3: Client-side fallback (browser IP not blocked) ───────
    setState({ status: 'downloading', progress: { percent: 30, speed: 'Using browser fallback…', eta: 'Please wait' } });

    const ok = await clientSideDownload(
      mediaUrl, formatId, isAudio, filename,
      (msg) => setState({ status: 'downloading', progress: { percent: 50, speed: msg, eta: 'Please wait' } }),
    );

    if (ok) {
      setState({ status: 'complete', filename });
    } else {
      setState({
        status: 'error',
        code: 'STREAM_UNAVAILABLE',
        message: 'All download providers are currently unavailable.',
        solution: 'Try again in a few minutes. The video may also be restricted.',
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
