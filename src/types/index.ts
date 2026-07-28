// ============================================================
// VORTX — TypeScript Type Definitions
// ============================================================

export type Platform = 'youtube' | 'instagram' | 'youtube-shorts' | 'instagram-reels' | 'unknown';

export type VideoFormat = {
  id: string;
  label: string;         // e.g. "1080p Full HD"
  resolution: string;    // e.g. "1920×1080"
  codec: string;         // e.g. "H.264 / AVC"
  fps: number;           // e.g. 30 | 60
  container: string;     // e.g. "MP4"
  estimatedSize: string; // e.g. "248 MB"
  recommended?: boolean;
  hdr?: boolean;
};

export type AudioFormat = {
  id: string;
  bitrate: string;       // e.g. "320 kbps"
  codec: string;         // e.g. "MP3"
  estimatedSize: string; // e.g. "12 MB"
  recommended?: boolean;
  audioQuality?: string; // yt-dlp VBR quality: '0'=best … '9'=worst
};

export type MediaInfo = {
  url: string;
  platform: Platform;
  title: string;
  thumbnail: string;
  duration: string;      // e.g. "12:34"
  uploader: string;
  uploaderAvatar?: string;
  viewCount?: string;
  publishedAt?: string;
  videoFormats: VideoFormat[];
  audioFormats: AudioFormat[];
};


export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type FeatureItem = {
  icon: string;
  title: string;
  description: string;
};
