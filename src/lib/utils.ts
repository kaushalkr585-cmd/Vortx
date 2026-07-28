// ============================================================
// VORTX — Utility Functions
// ============================================================

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Platform } from '../types';

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Automatically normalize user-entered URLs (add https:// if missing).
 */
export function normalizeUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

/**
 * Detect platform from a URL string (handles youtube.com, youtu.be, instagram.com, instagr.am, etc).
 */
export function detectPlatform(rawUrl: string): Platform {
  const url = normalizeUrl(rawUrl);
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '').toLowerCase();
    const path = u.pathname.toLowerCase();

    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('youtube-nocookie.com') ||
      host.includes('m.youtube.com')
    ) {
      if (path.includes('/shorts/')) return 'youtube-shorts';
      return 'youtube';
    }

    if (host.includes('instagram.com') || host.includes('instagr.am')) {
      if (path.includes('/reel/') || path.includes('/reels/')) return 'instagram-reels';
      return 'instagram';
    }
  } catch {
    /* ignore parse errors */
  }
  return 'unknown';
}

/**
 * Check whether a URL string looks like a valid web URL or media link.
 */
export function isValidMediaUrl(rawUrl: string): boolean {
  const url = normalizeUrl(rawUrl);
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Format large numbers with K / M suffixes.
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/**
 * Generate a short unique ID.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Returns the human-readable platform label.
 */
export function platformLabel(platform: Platform): string {
  const map: Record<Platform, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    'youtube-shorts': 'YouTube Shorts',
    'instagram-reels': 'Instagram Reels',
    unknown: 'Web Media',
  };
  return map[platform];
}
