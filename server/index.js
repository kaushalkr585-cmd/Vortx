// ============================================================
// VORTX Backend Server — Real yt-dlp Streaming
// Port: 3001
// ============================================================

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Resolve local ffmpeg binary path from @ffmpeg-installer/ffmpeg
let ffmpegPath = null;
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller && ffmpegInstaller.path) {
    ffmpegPath = ffmpegInstaller.path;
    console.log(`[FFMPEG] Found bundled ffmpeg at: ${ffmpegPath}`);
  }
} catch (e) {
  console.warn('[FFMPEG] @ffmpeg-installer not found, relying on system PATH');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', engine: 'VORTX yt-dlp backend v1.0', ffmpeg: !!ffmpegPath });
});

// Standard resolution presets for clean UX
const STANDARD_RESOLUTIONS = [
  { height: 144, label: '144p', resolution: '256×144', estimatedSize: '12 MB' },
  { height: 240, label: '240p', resolution: '426×240', estimatedSize: '24 MB' },
  { height: 360, label: '360p', resolution: '640×360', estimatedSize: '45 MB' },
  { height: 480, label: '480p', resolution: '854×480', estimatedSize: '78 MB' },
  { height: 720, label: '720p HD', resolution: '1280×720', estimatedSize: '135 MB' },
  { height: 1080, label: '1080p Full HD', resolution: '1920×1080', estimatedSize: '220 MB', recommended: true },
  { height: 1440, label: '1440p 2K', resolution: '2560×1440', estimatedSize: '410 MB' },
  { height: 2160, label: '2160p 4K', resolution: '3840×2160', estimatedSize: '1.1 GB', hdr: true },
];

// ─── /api/info ───────────────────────────────────────────────
// Returns yt-dlp JSON metadata for a given URL
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  console.log(`[INFO] Fetching metadata for: ${url}`);

  const cookiesPath = [
    path.join(__dirname, 'cookies.txt'),
    path.join(__dirname, '../cookies.txt'),
  ].find(p => fs.existsSync(p));

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--dump-json',
    '--quiet',
    '--extractor-args', 'youtube:player_client=ios,mweb',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ];

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  args.push(url);

  const proc = spawn('yt-dlp', args);
  let rawData = '';
  let errData = '';

  proc.stdout.on('data', (chunk) => { rawData += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { errData += chunk.toString(); });

  proc.on('error', (err) => {
    console.error('[INFO] Failed to spawn yt-dlp:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'yt-dlp is not installed or not found in PATH. Run: pip install yt-dlp',
      });
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`[INFO] yt-dlp exited ${code}: ${errData}`);
      return res.status(500).json({ error: errData.trim() || 'yt-dlp failed to fetch info' });
    }
    try {
      const data = JSON.parse(rawData);

      // Build structured format list from yt-dlp formats array
      const rawFormats = Array.isArray(data.formats) ? data.formats : [];

      // Collect unique heights available from video streams
      const heightSet = new Set();
      for (const f of rawFormats) {
        if (!f.vcodec || f.vcodec === 'none') continue;
        if (f.height) heightSet.add(f.height);
      }

      if (data.height) heightSet.add(data.height);

      const maxHeight = heightSet.size > 0 ? Math.max(...heightSet) : 1080;

      // Map sizes per height
      const sizeByHeight = new Map();
      for (const f of rawFormats) {
        if (!f.vcodec || f.vcodec === 'none') continue;
        if (!f.height) continue;
        const existing = sizeByHeight.get(f.height) || 0;
        const size = f.filesize || f.filesize_approx || 0;
        if (size > existing) sizeByHeight.set(f.height, size);
      }

      const targetHeights = heightSet.size > 0
        ? [...heightSet].sort((a, b) => a - b)
        : STANDARD_RESOLUTIONS.filter(r => r.height <= maxHeight).map(r => r.height);

      STANDARD_RESOLUTIONS.forEach(r => {
        if (r.height <= maxHeight && !targetHeights.includes(r.height)) {
          targetHeights.push(r.height);
        }
      });
      targetHeights.sort((a, b) => a - b);

      const LABEL_MAP = {
        144: '144p', 240: '240p', 360: '360p', 480: '480p',
        720: '720p HD', 1080: '1080p Full HD', 1440: '1440p 2K', 2160: '2160p 4K',
      };

      const videoFormats = targetHeights.map((height) => {
        const sizeBytes = sizeByHeight.get(height) || 0;
        const sizeStr = sizeBytes > 0
          ? sizeBytes > 1073741824
            ? `${(sizeBytes / 1073741824).toFixed(1)} GB`
            : `${Math.round(sizeBytes / 1048576)} MB`
          : '—';
        const width = Math.round((height * 16) / 9);

        // Format selector prioritizing MP4 video + M4A audio streams for clean FFmpeg merging
        const fmt = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

        return {
          id: fmt,
          label: LABEL_MAP[height] || `${height}p`,
          resolution: `${width}×${height}`,
          codec: 'H.264 / AAC',
          fps: 30,
          container: 'MP4',
          estimatedSize: sizeStr,
          recommended: height === 1080 || (maxHeight < 1080 && height === maxHeight),
          hdr: height >= 2160,
        };
      });

      // Audio formats
      const audioFormats = [
        { id: 'bestaudio/best', bitrate: '128 kbps', codec: 'MP3', estimatedSize: '8 MB',  audioQuality: '5' },
        { id: 'bestaudio/best', bitrate: '192 kbps', codec: 'MP3', estimatedSize: '14 MB', audioQuality: '3' },
        { id: 'bestaudio/best', bitrate: '256 kbps', codec: 'MP3', estimatedSize: '19 MB', audioQuality: '2', recommended: true },
        { id: 'bestaudio/best', bitrate: '320 kbps', codec: 'MP3', estimatedSize: '30 MB', audioQuality: '0' },
      ];

      const thumbnail =
        data.thumbnail ||
        (Array.isArray(data.thumbnails) && data.thumbnails.length > 0
          ? data.thumbnails[data.thumbnails.length - 1].url
          : null);

      const durationSecs = data.duration || 0;
      const durationStr = durationSecs > 0
        ? `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')}`
        : '—';

      res.json({
        url,
        title: data.title || 'Untitled',
        uploader: data.uploader || data.channel || 'Unknown',
        uploaderAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(data.uploader || 'vortx')}`,
        thumbnail,
        duration: durationStr,
        viewCount: data.view_count ? data.view_count.toLocaleString() : '—',
        publishedAt: data.upload_date
          ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}`
          : 'Recently',
        platform: data.extractor_key ? data.extractor_key.toLowerCase() : 'unknown',
        videoFormats: videoFormats.length > 0 ? videoFormats : null,
        audioFormats,
      });
    } catch (parseErr) {
      console.error('[INFO] JSON parse error:', parseErr);
      res.status(500).json({ error: 'Failed to parse yt-dlp output' });
    }
  });
});

// ─── /api/download ───────────────────────────────────────────
// Downloads via yt-dlp to a temp file, merges video+audio using ffmpeg,
// then streams the finished file to the browser and cleans up.
app.get('/api/download', (req, res) => {
  const { url, format, filename, type, audioQuality } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const isAudio = type === 'audio';
  const safeFilename = (filename || (isAudio ? 'audio.mp3' : 'video.mp4'))
    .replace(/[^\w\-. ()]/g, '_');

  const fileId = `vortx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpTemplate = path.join(os.tmpdir(), `${fileId}.%(ext)s`);

  console.log(`[DOWNLOAD] url=${url} format=${format} type=${type} file=${safeFilename}`);

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=ios,mweb',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ];

  // Check for cookies file in root or server directory
  const cookiesPath = [
    path.join(__dirname, 'cookies.txt'),
    path.join(__dirname, '../cookies.txt'),
  ].find(p => fs.existsSync(p));

  if (cookiesPath) {
    console.log(`[DOWNLOAD] Using cookies file from: ${cookiesPath}`);
    args.push('--cookies', cookiesPath);
  }

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  if (isAudio) {
    const quality = audioQuality || '2';
    args.push(
      '-f', format || 'bestaudio/best',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', quality,
      '-o', tmpTemplate,
      url
    );
  } else {
    // Clean mp4+m4a format selector with fallback
    const targetFmt = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
    args.push(
      '-f', targetFmt,
      '--merge-output-format', 'mp4',
      '-o', tmpTemplate,
      url
    );
  }

  const proc = spawn('yt-dlp', args);

  proc.on('error', (err) => {
    console.error('[DOWNLOAD] Failed to spawn yt-dlp:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'yt-dlp is not installed or not found in PATH.',
      });
    }
  });

  let errOutput = '';
  proc.stderr.on('data', (chunk) => {
    const msg = chunk.toString();
    errOutput += msg;
    process.stdout.write('[yt-dlp] ' + msg);
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`[DOWNLOAD] yt-dlp exited with code ${code}:\n${errOutput}`);
      if (!res.headersSent) {
        res.status(500).json({ error: errOutput.trim() || 'yt-dlp download failed' });
      }
      return;
    }

    // Locate the exact file produced by yt-dlp with prefix `fileId`
    const tmpDir = os.tmpdir();
    let matchingFiles = [];
    try {
      matchingFiles = fs.readdirSync(tmpDir).filter(
        (f) => f.startsWith(fileId) && !f.endsWith('.part') && !f.endsWith('.ytdl')
      );
    } catch (e) {
      console.error('[DOWNLOAD] Failed to read temp directory:', e);
    }

    if (matchingFiles.length === 0) {
      console.error('[DOWNLOAD] Temp file not found for prefix:', fileId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Output file was not generated by yt-dlp.' });
      }
      return;
    }

    const actualFilePath = path.join(tmpDir, matchingFiles[0]);

    fs.stat(actualFilePath, (statErr, stat) => {
      if (statErr || !stat) {
        console.error('[DOWNLOAD] Temp file stat error:', statErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to access generated download file.' });
        }
        return;
      }

      console.log(`[DOWNLOAD] Streaming ${stat.size} bytes (${matchingFiles[0]}) → ${safeFilename}`);

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
      res.setHeader('Content-Length', stat.size);

      const readStream = fs.createReadStream(actualFilePath);
      readStream.pipe(res);

      const cleanup = () => {
        fs.unlink(actualFilePath, (err) => {
          if (!err) console.log(`[DOWNLOAD] Cleaned up temp file: ${actualFilePath}`);
        });
      };

      readStream.on('close', cleanup);
      readStream.on('error', (err) => {
        console.error('[DOWNLOAD] Read stream error:', err);
        cleanup();
      });
    });
  });

  // Handle client abort
  req.on('close', () => {
    proc.kill('SIGTERM');
  });
});

// Serve frontend production build if present (Combined Deployment)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 VORTX backend running at http://localhost:${PORT}`);
  console.log(`   FFmpeg bundled: ${ffmpegPath ? 'YES (' + ffmpegPath + ')' : 'NO'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET /api/ping`);
  console.log(`     GET /api/info?url=<video_url>`);
  console.log(`     GET /api/download?url=<video_url>&format=<fmt>&filename=<name>&type=video|audio\n`);
});
