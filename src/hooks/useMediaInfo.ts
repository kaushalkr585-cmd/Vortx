// ============================================================
// VORTX — useMediaInfo Hook
// Fetches real metadata via the /api/info backend (yt-dlp).
// Falls back to oEmbed + static data if the backend is offline.
// ============================================================

import { useState, useCallback } from 'react';
import axios from 'axios';
import type { MediaInfo, Platform } from '../types';
import { detectPlatform, isValidMediaUrl, normalizeUrl } from '../lib/utils';

const DEFAULT_THUMBNAILS: Record<Platform, string> = {
  youtube: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=1280&q=80',
  'youtube-shorts': 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=720&q=80',
  instagram: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=1280&q=80',
  'instagram-reels': 'https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=720&q=80',
  unknown: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=1280&q=80',
};

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function fetchFromBackend(url: string): Promise<MediaInfo> {
  const res = await axios.get(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`, { timeout: 30000 });
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

// ── Fallback (oEmbed + static) ────────────────────────────────
// Used only if the backend is unavailable

function buildFallbackVideoFormats() {
  return [
    { id: 'bestvideo[height<=360]+bestaudio/best[height<=360]', label: '360p', resolution: '640×360', codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '45 MB' },
    { id: 'bestvideo[height<=480]+bestaudio/best[height<=480]', label: '480p', resolution: '854×480', codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '78 MB' },
    { id: 'bestvideo[height<=720]+bestaudio/best[height<=720]', label: '720p HD', resolution: '1280×720', codec: 'H.264', fps: 30, container: 'MP4', estimatedSize: '135 MB' },
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

async function fetchFallback(rawUrl: string): Promise<MediaInfo> {
  const url = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);

  let title = 'Downloaded Media Content';
  let uploader = 'VORTX Media Stream';
  let thumbnail = DEFAULT_THUMBNAILS[platform];
  let duration = '03:45';
  let viewCount = '—';
  let publishedAt = 'Recently';

  const ytMatch = url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch?.[1]) {
    thumbnail = `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }

  if (platform === 'youtube' || platform === 'youtube-shorts' || ytMatch) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await axios.get(oembedUrl, { timeout: 3500 });
      if (res.data?.title) title = res.data.title;
      if (res.data?.author_name) uploader = res.data.author_name;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch {
      title = ytMatch ? `YouTube Video #${ytMatch[1]}` : 'YouTube Video';
      uploader = 'YouTube Creator';
    }
  } else if (platform === 'instagram' || platform === 'instagram-reels') {
    const igMatch = url.match(/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/);
    title = igMatch ? `Instagram Content (${igMatch[1]})` : 'Instagram Video';
    uploader = '@instagram.user';
    duration = '0:45';
  } else {
    try {
      const parsed = new URL(url);
      title = `Media from ${parsed.hostname}`;
      uploader = parsed.hostname;
    } catch {
      title = 'Web Video Content';
    }
  }

  return {
    url,
    platform,
    title,
    thumbnail,
    duration,
    uploader,
    uploaderAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(uploader)}`,
    viewCount,
    publishedAt,
    videoFormats: buildFallbackVideoFormats(),
    audioFormats: buildFallbackAudioFormats(),
  };
}

// ── Main resolver ─────────────────────────────────────────────

async function resolveMediaInfo(rawUrl: string): Promise<MediaInfo> {
  const url = normalizeUrl(rawUrl);

  // Try the real backend first
  try {
    return await fetchFromBackend(url);
  } catch (backendErr) {
    console.warn('[useMediaInfo] Backend unavailable, using fallback:', backendErr);
    // Fall back to oEmbed + static formats
    return await fetchFallback(url);
  }
}

// ── Hook ─────────────────────────────────────────────────────

export type MediaInfoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: MediaInfo }
  | { status: 'error'; message: string };

export function useMediaInfo() {
  const [state, setState] = useState<MediaInfoState>({ status: 'idle' });

  const fetch = useCallback(async (rawUrl: string) => {
    const normUrl = normalizeUrl(rawUrl);

    if (!isValidMediaUrl(normUrl)) {
      setState({
        status: 'error',
        message: 'Please enter a valid video link or URL (e.g. youtube.com/watch?v=...)',
      });
      return;
    }

    setState({ status: 'loading' });

    try {
      const data = await resolveMediaInfo(normUrl);
      await new Promise((r) => setTimeout(r, 400));
      setState({ status: 'success', data });
    } catch {
      setState({
        status: 'error',
        message: 'Failed to process media URL. Please verify the link and try again.',
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, fetch, reset };
}


