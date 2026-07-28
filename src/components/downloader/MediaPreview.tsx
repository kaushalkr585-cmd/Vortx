// ============================================================
// VORTX — MediaPreview Component (Zero Overlap)
// ============================================================

import { motion } from 'framer-motion';
import { Clock, Eye, Calendar } from 'lucide-react';
import type { MediaInfo } from '../../types';
import { platformLabel } from '../../lib/utils';

type Props = { media: MediaInfo };

function PlatformBadge({ platform }: { platform: MediaInfo['platform'] }) {
  const isYT = platform.startsWith('youtube');
  return (
    <span className="platform-badge flex-shrink-0">
      {isYT ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff4444' }} aria-hidden="true">
          <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.7 12 3.7 12 3.7s-7.5 0-9.4.4a3 3 0 00-2.1 2.1A31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.4 9.4.4 9.4.4s7.5 0 9.4-.4a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect width="24" height="24" rx="5.5" fill="url(#ib)" />
          <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
          <defs>
            <radialGradient id="ib" cx="30%" cy="107%" r="120%">
              <stop offset="0%" stopColor="#ffd879" />
              <stop offset="57%" stopColor="#e1306c" />
              <stop offset="100%" stopColor="#833ab4" />
            </radialGradient>
          </defs>
        </svg>
      )}
      {platformLabel(platform)}
    </span>
  );
}

export function MediaPreview({ media }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col sm:flex-row gap-5 items-start sm:items-center"
      aria-label="Media preview"
    >
      {/* Thumbnail Container */}
      <div className="relative flex-shrink-0 w-full sm:w-52 h-32 rounded-xl overflow-hidden border border-white/10 bg-black/40 group">
        <img
          src={media.thumbnail}
          alt={`Thumbnail for ${media.title}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        {/* Duration badge pill */}
        <span
          className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-white font-mono text-[11px] font-semibold tracking-tight shadow-md"
          style={{
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {media.duration}
        </span>
      </div>

      {/* Info Details */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Creator & Platform Badge Row */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <PlatformBadge platform={media.platform} />
          <span className="text-white/20 text-xs">·</span>
          <div className="flex items-center gap-1.5 min-w-0">
            {media.uploaderAvatar && (
              <img
                src={media.uploaderAvatar}
                alt={media.uploader}
                className="w-4.5 h-4.5 rounded-full object-cover border border-white/20 flex-shrink-0"
              />
            )}
            <span className="text-xs font-semibold text-white/80 truncate">
              {media.uploader}
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-bold text-white text-base leading-snug line-clamp-2 tracking-tight">
          {media.title}
        </h2>

        {/* Metadata Stats Row — clean spacing and no overlapping icons */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-white/50 pt-0.5">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-white/40 flex-shrink-0" />
            <span>{media.duration}</span>
          </div>

          {media.viewCount && (
            <div className="flex items-center gap-1.5">
              <Eye size={13} className="text-white/40 flex-shrink-0" />
              <span>{media.viewCount} views</span>
            </div>
          )}

          {media.publishedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-white/40 flex-shrink-0" />
              <span>{media.publishedAt}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
