// ============================================================
// VORTX — useMediaInfo Hook (Production)
// Fetches real metadata via the /api/info backend (yt-dlp).
// Surfaces structured error codes — never silently falls back
// to oEmbed when backend returns an actionable error.
// ============================================================

import { useState, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import type { MediaInfo, Platform } from '../types';
import { detectPlatform, isValidMediaUrl, normalizeUrl } from '../lib/utils';

// ── Error code → user-friendly message map ──────────────────
export type VortxErrorCode =
  | 'BOT_DETECTED'
  | 'PRIVATE_VIDEO'
  | 'MEMBERS_ONLY'
  | 'AGE_RESTRICTED'
  | 'GEO_BLOCKED'
  | 'LIVE_STREAM'
  | 'VIDEO_UNAVAILABLE'
  | 'COPYRIGHT_BLOCKED'
  | 'RATE_LIMITED'
  | 'FFMPEG_MISSING'
  | 'EXTRACTOR_ERROR'
  | 'NETWORK_ERROR'
  | 'YTDLP_ERROR'
  | 'YTDLP_NOT_FOUND'
  | 'INVALID_URL'
  | 'MISSING_URL'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

export const ERROR_MESSAGES: Record<VortxErrorCode, { title: string; message: string; solution: string }> = {
  BOT_DETECTED: {
    title: 'YouTube Session Required',
    message: 'YouTube needs to verify this is a real user session. Your browser cookies need to be refreshed.',
    solution: 'Export fresh cookies from your logged-in browser and update the server configuration.',
  },
  PRIVATE_VIDEO: {
    title: 'Private Video',
    message: 'This video is private and can only be accessed by its owner.',
    solution: 'Try a different, publicly available video.',
  },
  MEMBERS_ONLY: {
    title: 'Members-Only Video',
    message: 'This video is exclusive to channel members.',
    solution: 'This content requires a channel membership to access.',
  },
  AGE_RESTRICTED: {
    title: 'Age-Restricted Content',
    message: 'This video has an age restriction that requires account verification.',
    solution: 'Ensure your account has age verification. Refresh your browser cookies.',
  },
  GEO_BLOCKED: {
    title: 'Not Available in This Region',
    message: 'This video is geo-restricted and not available in the server\'s location.',
    solution: 'Try a different video that is available globally.',
  },
  LIVE_STREAM: {
    title: 'Live Stream in Progress',
    message: 'Live streams cannot be downloaded while they are active.',
    solution: 'Wait for the stream to end, then try again.',
  },
  VIDEO_UNAVAILABLE: {
    title: 'Video Unavailable',
    message: 'This video has been removed or is no longer available on YouTube.',
    solution: 'The video may have been deleted. Try a different URL.',
  },
  COPYRIGHT_BLOCKED: {
    title: 'Blocked by Copyright',
    message: 'The content owner has blocked downloads for this video.',
    solution: 'This video cannot be downloaded due to a copyright restriction.',
  },
  RATE_LIMITED: {
    title: 'Too Many Requests',
    message: 'YouTube is temporarily limiting requests from this server.',
    solution: 'Wait 1–2 minutes and try again.',
  },
  FFMPEG_MISSING: {
    title: 'Server Configuration Error',
    message: 'FFmpeg is not available on the server for video processing.',
    solution: 'Contact the server administrator to install FFmpeg.',
  },
  EXTRACTOR_ERROR: {
    title: 'Extraction Failed',
    message: 'Failed to extract video information. YouTube may have changed its format.',
    solution: 'Try again in a few seconds. If the problem persists, yt-dlp may need an update.',
  },
  NETWORK_ERROR: {
    title: 'Network Error',
    message: 'A network error occurred while contacting YouTube.',
    solution: 'Check your connection and try again.',
  },
  YTDLP_ERROR: {
    title: 'Download Engine Error',
    message: 'yt-dlp encountered an unexpected error.',
    solution: 'Try again. If the problem persists, the video URL may not be supported.',
  },
  YTDLP_NOT_FOUND: {
    title: 'Server Configuration Error',
    message: 'yt-dlp is not installed on the server.',
    solution: 'Contact the server administrator.',
  },
  INVALID_URL: {
    title: 'Invalid URL',
    message: 'The link you entered is not a supported video URL.',
    solution: 'Please paste a valid YouTube or Instagram link.',
  },
  MISSING_URL: {
    title: 'No URL Provided',
    message: 'Please enter a video URL to continue.',
    solution: 'Paste a YouTube or Instagram link in the input field.',
  },
  PARSE_ERROR: {
    title: 'Metadata Parse Error',
    message: 'The server received a response it could not read.',
    solution: 'Try again. This is usually a temporary issue.',
  },
  UNKNOWN: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred.',
    solution: 'Please try again or try a different video URL.',
  },
};

const DEFAULT_THUMBNAILS: Record<Platform, string> = {
  youtube: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=1280&q=80',
  'youtube-shorts': 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=720&q=80',
  instagram: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=1280&q=80',
  'instagram-reels': 'https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=720&q=80',
  unknown: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=1280&q=80',
};

const API_BASE = import.meta.env.VITE_API_BASE || '';

// ── Fetch from backend ───────────────────────────────────────
async function fetchFromBackend(url: string): Promise<MediaInfo> {
  const res = await axios.get(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`, {
    timeout: 45000,
  });
  const d = res.data;
  const platform = detectPlatform(url);

  return {
    url,
    platform: (d.platform as Platform) ?? platform,
    title: d.title ?? 'Untitled',
    thumbnail: d.thumbnail ?? DEFAULT_THUMBNAILS[platform],
    duration: d.duration ?? '—',
    uploader: d.uploader ?? 'Unknown',
    uploaderAvatar: d.uploaderAvatar,
    viewCount: d.viewCount,
    publishedAt: d.publishedAt,
    videoFormats: Array.isArray(d.videoFormats) && d.videoFormats.length > 0
      ? d.videoFormats
      : buildFallbackVideoFormats(),
    audioFormats: Array.isArray(d.audioFormats) && d.audioFormats.length > 0
      ? d.audioFormats
      : buildFallbackAudioFormats(),
  };
}

function buildFallbackVideoFormats() {
  return [
    { id: 'bestvideo[height<=360]+bestaudio/best[height<=360]', label: '360p',        resolution: '640×360',  codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '45 MB' },
    { id: 'bestvideo[height<=480]+bestaudio/best[height<=480]', label: '480p',        resolution: '854×480',  codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '78 MB' },
    { id: 'bestvideo[height<=720]+bestaudio/best[height<=720]', label: '720p HD',     resolution: '1280×720', codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '135 MB' },
    { id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', label: '1080p Full HD', resolution: '1920×1080', codec: 'H.264', fps: 60, container: 'MP4', estimatedSize: '220 MB', recommended: true },
  ];
}

function buildFallbackAudioFormats() {
  return [
    { id: 'bestaudio/best', bitrate: '128 kbps', codec: 'MP3', estimatedSize: '8 MB',  audioQuality: '5' },
    { id: 'bestaudio/best', bitrate: '192 kbps', codec: 'MP3', estimatedSize: '14 MB', audioQuality: '3' },
    { id: 'bestaudio/best', bitrate: '256 kbps', codec: 'MP3', estimatedSize: '19 MB', audioQuality: '2', recommended: true },
    { id: 'bestaudio/best', bitrate: '320 kbps', codec: 'MP3', estimatedSize: '24 MB', audioQuality: '0' },
  ];
}

// ── Hook State ───────────────────────────────────────────────

export type MediaInfoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: MediaInfo }
  | { status: 'error'; message: string; code?: VortxErrorCode; solution?: string };

export function useMediaInfo() {
  const [state, setState] = useState<MediaInfoState>({ status: 'idle' });

  const fetch = useCallback(async (rawUrl: string) => {
    const normUrl = normalizeUrl(rawUrl);

    if (!isValidMediaUrl(normUrl)) {
      setState({
        status: 'error',
        code: 'INVALID_URL',
        message: 'Please enter a valid YouTube or Instagram link.',
        solution: 'Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      return;
    }

    setState({ status: 'loading' });

    try {
      const data = await fetchFromBackend(normUrl);
      await new Promise((r) => setTimeout(r, 300));
      setState({ status: 'success', data });
    } catch (err) {
      // ── Parse structured backend error ─────────────────────
      const axiosErr = err as AxiosError<{
        success: boolean;
        code?: string;
        message?: string;
        solution?: string;
      }>;

      const responseData = axiosErr.response?.data;

      // If backend returned a structured error, surface it directly
      if (responseData && typeof responseData === 'object' && responseData.code) {
        const code = (responseData.code as VortxErrorCode) in ERROR_MESSAGES
          ? (responseData.code as VortxErrorCode)
          : 'UNKNOWN';

        const knownError = ERROR_MESSAGES[code];
        setState({
          status: 'error',
          code,
          message: responseData.message || knownError.message,
          solution: responseData.solution || knownError.solution,
        });
        return;
      }

      // Network-level error (no response from server)
      if (!axiosErr.response) {
        setState({
          status: 'error',
          code: 'NETWORK_ERROR',
          message: 'Could not reach the download server.',
          solution: 'Make sure the backend is running and try again.',
        });
        return;
      }

      // Fallback
      setState({
        status: 'error',
        code: 'UNKNOWN',
        message: 'Failed to process this video URL.',
        solution: 'Verify the link is valid and the video is publicly accessible.',
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, fetch, reset };
}
