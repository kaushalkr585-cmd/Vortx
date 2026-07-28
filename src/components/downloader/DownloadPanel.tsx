// ============================================================
// VORTX — DownloadPanel Component (Zero Overlap)
// ============================================================

import { motion } from 'framer-motion';
import { Download, File, HardDrive, Cpu, CheckCircle } from 'lucide-react';
import type { VideoFormat, AudioFormat } from '../../types';

type VideoProps = {
  format: VideoFormat;
  onDownload: () => void;
  loading: boolean;
};

type AudioProps = {
  format: AudioFormat;
  title: string;
  onDownload: () => void;
  loading: boolean;
};

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', flexShrink: 0, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ffffff', textAlign: 'right', minWidth: 0, wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

export function VideoDownloadPanel({ format, onDownload, loading }: VideoProps) {
  const filename = `VORTX_${format.label.replace(/\s+/g, '_')}.${format.container.toLowerCase()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4"
    >
      {/* File Metadata Summary Table */}
      <div style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <MetaRow icon={<File size={14} />} label="File Name" value={filename} />
        <MetaRow icon={<Cpu size={14} />} label="Format" value={`${format.container} · ${format.codec}`} />
        <MetaRow icon={<HardDrive size={14} />} label="Est. File Size" value={format.estimatedSize} />
        <MetaRow icon={<Download size={14} />} label="Resolution" value={`${format.resolution} @ ${format.fps}fps`} />
      </div>

      {/* Action Download Trigger */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        className="btn-cut w-full justify-center py-3.5 text-sm font-semibold tracking-tight shadow-xl flex items-center gap-2"
        onClick={onDownload}
        disabled={loading}
        aria-label={`Download ${format.label} video`}
      >
        {loading ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            Preparing Direct Download…
          </>
        ) : (
          <>
            <Download size={16} />
            Download {format.label} ({format.estimatedSize})
          </>
        )}
      </motion.button>
    </motion.div>
  );
}

export function AudioDownloadPanel({ format, onDownload, loading }: AudioProps) {
  const filename = `VORTX_Audio_${format.bitrate.replace(/\s+/g, '_')}.mp3`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
      className="flex flex-col gap-4"
    >
      {/* File Metadata Summary Table */}
      <div style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <MetaRow icon={<File size={14} />} label="File Name" value={filename} />
        <MetaRow icon={<Cpu size={14} />} label="Audio Format" value={`${format.codec} Audio Stream`} />
        <MetaRow icon={<HardDrive size={14} />} label="Est. File Size" value={format.estimatedSize} />
        <MetaRow icon={<CheckCircle size={14} />} label="Audio Bitrate" value={format.bitrate} />
      </div>

      {/* Action Download Trigger */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        className="btn-cut w-full justify-center py-3.5 text-sm font-semibold tracking-tight shadow-xl flex items-center gap-2"
        onClick={onDownload}
        disabled={loading}
        aria-label={`Download ${format.bitrate} MP3`}
      >
        {loading ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            Preparing Audio Stream…
          </>
        ) : (
          <>
            <Download size={16} />
            Download MP3 ({format.bitrate})
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
