// ============================================================
// VORTX Backend Server — Production-Grade yt-dlp Engine
// Port: 3001
// ============================================================

const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ─── FFmpeg Resolution ────────────────────────────────────────
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

// ─── In-Memory Metadata Cache (5-min TTL) ────────────────────
const metaCache = new Map(); // key: cleanUrl → { data, expires }
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = metaCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { metaCache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  metaCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  // Prune cache if over 50 entries
  if (metaCache.size > 50) {
    const firstKey = metaCache.keys().next().value;
    metaCache.delete(firstKey);
  }
}

// ─── Standard Resolution Presets ─────────────────────────────
const STANDARD_RESOLUTIONS = [
  { height: 144,  label: '144p',           resolution: '256×144',    estimatedSize: '12 MB' },
  { height: 240,  label: '240p',           resolution: '426×240',    estimatedSize: '24 MB' },
  { height: 360,  label: '360p',           resolution: '640×360',    estimatedSize: '45 MB' },
  { height: 480,  label: '480p',           resolution: '854×480',    estimatedSize: '78 MB' },
  { height: 720,  label: '720p HD',        resolution: '1280×720',   estimatedSize: '135 MB' },
  { height: 1080, label: '1080p Full HD',  resolution: '1920×1080',  estimatedSize: '220 MB', recommended: true },
  { height: 1440, label: '1440p 2K',       resolution: '2560×1440',  estimatedSize: '410 MB' },
  { height: 2160, label: '2160p 4K',       resolution: '3840×2160',  estimatedSize: '1.1 GB', hdr: true },
];

// ─── Cookie Resolution ────────────────────────────────────────
/**
 * Returns the path to a valid YouTube Netscape cookie file, or null.
 * Priority:
 *   1. YOUTUBE_COOKIES env var (paste the cookie file contents here for cloud)
 *   2. server/cookies.txt  (local development)
 *   3. cookies.txt in project root
 */
function getCookiesPath() {
  const envCookies = process.env.YOUTUBE_COOKIES;
  if (envCookies && envCookies.trim().length > 0) {
    try {
      let cookieText = envCookies.trim();
      // Handle escaped \n if env var was set as a single string literal
      if (!cookieText.includes('\n') && cookieText.includes('\\n')) {
        cookieText = cookieText.replace(/\\n/g, '\n');
      }

      const hasYT = cookieText.includes('youtube.com') || cookieText.includes('.youtube.com');
      const hasAuth = cookieText.includes('__Secure-3PAPISID') ||
                      cookieText.includes('SAPISID') ||
                      cookieText.includes('__Secure-3PSID') ||
                      cookieText.includes('LOGIN_INFO');

      if (hasYT && hasAuth) {
        const envPath = path.join(os.tmpdir(), 'vortx_yt_cookies.txt');
        fs.writeFileSync(envPath, cookieText, 'utf8');
        console.log('[COOKIES] Loaded cookies from YOUTUBE_COOKIES env var');
        return envPath;
      } else {
        console.warn('[COOKIES] YOUTUBE_COOKIES env var present but missing required YouTube auth tokens');
      }
    } catch (e) {
      console.error('[COOKIES] Failed to write YOUTUBE_COOKIES env to file:', e.message);
    }
  }

  const candidates = [
    path.join(__dirname, 'cookies.txt'),
    path.join(__dirname, '../cookies.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const hasYT = content.includes('youtube.com');
        const hasAuth = content.includes('__Secure-3PAPISID') ||
                        content.includes('SAPISID') ||
                        content.includes('__Secure-3PSID') ||
                        content.includes('LOGIN_INFO');
        if (hasYT && hasAuth) {
          console.log(`[COOKIES] Using cookie file: ${p}`);
          return p;
        }
      } catch { /* skip */ }
    }
  }
  return null;
}

// ─── URL Validation & Sanitization ───────────────────────────
const ALLOWED_HOSTS = [
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'm.youtube.com', 'music.youtube.com',
  'instagram.com', 'www.instagram.com',
];

function extractYouTubeId(parsed) {
  const host = parsed.hostname.toLowerCase();
  if (host.includes('youtube.com')) {
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v') && parts[1]) {
      return parts[1];
    }
  }
  if (host === 'youtu.be') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0]) return parts[0];
  }
  return null;
}

function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { valid: false, reason: 'EMPTY' };
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) return { valid: false, reason: 'TOO_LONG' };
  if (/[;&|`$<>{}[\]\\]/.test(trimmed)) return { valid: false, reason: 'MALFORMED' };

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
    if (!allowed) return { valid: false, reason: 'UNSUPPORTED_HOST' };

    // Check YouTube video ID if it's a YouTube URL
    const ytId = extractYouTubeId(parsed);
    if (ytId !== null && !/^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
      return { valid: false, reason: 'INCOMPLETE_ID', rawId: ytId };
    }

    return { valid: true, href: parsed.href };
  } catch {
    return { valid: false, reason: 'INVALID_SYNTAX' };
  }
}

function sanitizeUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const ytId = extractYouTubeId(parsed);
    if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
      return `https://www.youtube.com/watch?v=${ytId}`;
    }
  } catch { /* fall through */ }
  return rawUrl;
}

// ─── Error Code Parser ────────────────────────────────────────
/**
 * Parses raw yt-dlp stderr text into a structured { code, message, solution } object.
 */
function parseYtdlpError(stderr) {
  const s = stderr || '';

  if (/Incomplete YouTube ID|Unsupported URL|is not a valid URL|not a supported/i.test(s)) {
    return {
      code: 'INVALID_URL',
      message: 'The URL or video ID is invalid or incomplete.',
      solution: 'Please check that you copied the full YouTube or Instagram URL.',
    };
  }
  if (/Sign in to confirm|not a bot|bot detection|confirm you're not a bot/i.test(s)) {
    return {
      code: 'BOT_DETECTED',
      message: 'YouTube requires authentication to verify this request is from a real user.',
      solution: 'Your session cookies need to be refreshed. Export fresh cookies from your browser and update the YOUTUBE_COOKIES environment variable.',
    };
  }
  if (/Private video|This video is private/i.test(s)) {
    return {
      code: 'PRIVATE_VIDEO',
      message: 'This video is private and cannot be downloaded.',
      solution: 'Only the video owner can access private videos. Try a public video instead.',
    };
  }
  if (/members.only|join this channel/i.test(s)) {
    return {
      code: 'MEMBERS_ONLY',
      message: 'This video is for channel members only.',
      solution: 'You need to be a member of this channel to download this video.',
    };
  }
  if (/age.restricted|confirm your age|inappropriate/i.test(s)) {
    return {
      code: 'AGE_RESTRICTED',
      message: 'This video is age-restricted.',
      solution: 'Age-restricted videos require verified account cookies. Ensure your Google account has age verification enabled.',
    };
  }
  if (/not available in your country|geo.?block|geo.?restrict/i.test(s)) {
    return {
      code: 'GEO_BLOCKED',
      message: 'This video is not available in the server\'s region.',
      solution: 'This content is geo-restricted. Try a video available in your region.',
    };
  }
  if (/live.?stream|is live|live event/i.test(s)) {
    return {
      code: 'LIVE_STREAM',
      message: 'Live streams cannot be downloaded while they are active.',
      solution: 'Wait until the stream ends, then the video will be available for download.',
    };
  }
  if (/video.?unavailable|has been removed|no longer available|404 Not Found/i.test(s)) {
    return {
      code: 'VIDEO_UNAVAILABLE',
      message: 'This video has been removed or is no longer available.',
      solution: 'The video may have been deleted by the uploader or removed by YouTube.',
    };
  }
  if (/copyright|content.?id/i.test(s)) {
    return {
      code: 'COPYRIGHT_BLOCKED',
      message: 'This video is blocked due to a copyright claim.',
      solution: 'The content owner has restricted downloads for this video.',
    };
  }
  if (/429|Too Many Requests|rate.?limit/i.test(s)) {
    return {
      code: 'RATE_LIMITED',
      message: 'Too many requests sent to YouTube. Please wait a moment.',
      solution: 'YouTube has temporarily limited requests from this server. Wait 1-2 minutes and try again.',
    };
  }
  if (/No such file|ffmpeg|merger|postprocessor/i.test(s)) {
    return {
      code: 'FFMPEG_MISSING',
      message: 'FFmpeg is required for merging video and audio streams.',
      solution: 'FFmpeg is not installed or not found. Contact the server administrator.',
    };
  }
  if (/Unable to extract|Failed to extract|ExtractorError|Requested format is not available/i.test(s)) {
    return {
      code: 'EXTRACTOR_ERROR',
      message: 'Failed to extract video information from this URL.',
      solution: 'This may be a temporary YouTube issue. Try again in a few seconds, or check if yt-dlp needs to be updated.',
    };
  }
  if (/network|Connection|timeout|SSL/i.test(s)) {
    return {
      code: 'NETWORK_ERROR',
      message: 'A network error occurred while contacting YouTube.',
      solution: 'Check the server\'s network connection and try again.',
    };
  }

  return {
    code: 'YTDLP_ERROR',
    message: 'yt-dlp encountered an error processing this video.',
    solution: 'Check that the URL is valid and the video is publicly accessible.',
  };
}

// ─── Shared yt-dlp Args Builder ───────────────────────────────
/**
 * Returns the base yt-dlp arguments that apply to both /api/info and /api/download.
 * These mimic a real browser session and use multiple client fallbacks.
 */
function buildBaseArgs(cookiesPath, clientOverride) {
  // Player client strategy:
  //   tv_embedded  — works on server IPs, no JS runtime needed, bypasses bot detection
  //   android_vr   — secondary fallback, also bypasses JS challenges
  //   web          — uses cookies for auth but requires JS runtime (deno)
  //   mweb         — mobile web, usually fails on server IPs
  const playerClient = clientOverride || 'tv_embedded,android_vr,web';

  const args = [
    '--no-playlist',
    '--no-warnings',
    // Realistic Chrome user agent
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // Add HTTP headers that real browsers send
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    // Player client fallback chain — tv_embedded works best on server IPs without JS runtime
    '--extractor-args', `youtube:player_client=${playerClient}`,
    // NOTE: Do NOT add --js-runtimes here. yt-dlp 2026.07+ uses deno by default.
    // Passing --js-runtimes node causes errors if node JS runtime is not properly configured.
    // tv_embedded/android_vr clients bypass the n-challenge that requires a JS runtime.
    // Retry & resilience
    '--retries', '5',
    '--extractor-retries', '5',
    '--fragment-retries', '5',
    '--retry-sleep', 'linear=1::3',
    // Bypass geographic restrictions
    '--geo-bypass',
    // Skip HTTPS certificate errors
    '--no-check-certificates',
  ];

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  return args;
}

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', engine: 'VORTX yt-dlp backend v2.0', ffmpeg: !!ffmpegPath });
});

// ─── /api/health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  let ytdlpVersion = 'unknown';
  try { ytdlpVersion = execSync('yt-dlp --version', { timeout: 5000 }).toString().trim(); } catch {}

  const cookiesPath = getCookiesPath();
  const hasCookies = !!cookiesPath;

  let cookiesValid = false;
  if (hasCookies) {
    try {
      const content = fs.readFileSync(cookiesPath, 'utf8');
      cookiesValid = content.includes('youtube.com') &&
        (content.includes('__Secure-3PAPISID') || content.includes('SAPISID') || content.includes('__Secure-3PSID'));
    } catch {}
  }

  res.json({
    status: 'ok',
    ytdlpVersion,
    ffmpegBundled: !!ffmpegPath,
    ffmpegPath: ffmpegPath || 'system PATH',
    hasCookies,
    cookiesValid,
    cacheSize: metaCache.size,
    uptime: Math.floor(process.uptime()),
  });
});

// ─── /api/cookies/status ──────────────────────────────────────
app.get('/api/cookies/status', (_req, res) => {
  const cookiesPath = getCookiesPath();
  if (!cookiesPath) {
    return res.json({
      configured: false,
      message: 'No YouTube cookies found. Bot detection may block some videos.',
    });
  }
  try {
    const content = fs.readFileSync(cookiesPath, 'utf8');
    const hasCore = content.includes('youtube.com') &&
      (content.includes('__Secure-3PAPISID') || content.includes('SAPISID') || content.includes('__Secure-3PSID'));
    return res.json({
      configured: true,
      valid: hasCore,
      message: hasCore ? 'Cookies are configured and appear valid.' : 'Cookie file found but may be incomplete.',
    });
  } catch {
    return res.json({ configured: false, message: 'Cookie file could not be read.' });
  }
});

// ─── Helper: Execute yt-dlp ────────────────────────────────────
function runYtdlp(args) {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', args);
    let rawData = '';
    let errData = '';

    proc.stdout.on('data', chunk => { rawData += chunk.toString(); });
    proc.stderr.on('data', chunk => { errData += chunk.toString(); });

    proc.on('error', (err) => {
      resolve({ code: -1, stdout: '', stderr: err.message, spawnError: true });
    });

    proc.on('close', (code) => {
      resolve({ code, stdout: rawData, stderr: errData });
    });
  });
}

// ─── /api/info ────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ success: false, code: 'MISSING_URL', message: 'Missing url parameter.' });

  const urlResult = validateUrl(rawUrl);
  if (!urlResult.valid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_URL',
      message: urlResult.reason === 'INCOMPLETE_ID'
        ? 'The YouTube video URL or ID appears to be incomplete.'
        : 'The link you entered is not a supported video URL.',
      solution: 'Please paste a complete YouTube or Instagram link (e.g. https://youtu.be/dQw4w9WgXcQ).',
    });
  }

  const cleanUrl = sanitizeUrl(urlResult.href);
  console.log(`[INFO] ${cleanUrl}`);

  // Cache hit
  const cached = getCached(cleanUrl);
  if (cached) {
    console.log(`[INFO] Cache hit for: ${cleanUrl}`);
    return res.json(cached);
  }

  const cookiesPath = getCookiesPath();
  let args = [...buildBaseArgs(cookiesPath), '--dump-json', cleanUrl];

  let result = await runYtdlp(args);

  if (result.spawnError) {
    return res.status(503).json({
      success: false,
      code: 'YTDLP_NOT_FOUND',
      message: 'yt-dlp is not installed on the server.',
      solution: 'Run: pip install yt-dlp',
      details: result.stderr,
    });
  }

  // Retry strategy: if first attempt fails, try with android_vr-only client
  // (avoids JS runtime requirements entirely) while keeping cookies
  if (result.code !== 0) {
    const errText = result.stderr || '';
    const isBotDetected = /Sign in to confirm|not a bot|bot detection|confirm you're not a bot|please verify/i.test(errText);
    const isJsRuntimeIssue = /JavaScript runtime|js.?runtime|ExtractorError.*nsig/i.test(errText);

    if (isBotDetected || isJsRuntimeIssue) {
      console.warn(`[INFO] Bot detection / JS runtime issue detected. Retrying with android_vr client...`);
      const retryArgs = [...buildBaseArgs(cookiesPath, 'android_vr,tv_embedded'), '--dump-json', cleanUrl];
      const retryResult = await runYtdlp(retryArgs);
      if (retryResult.code === 0) {
        result = retryResult;
      } else if (cookiesPath) {
        // Last resort: try without cookies using android_vr
        console.warn('[INFO] Retry with cookies failed. Trying without cookies...');
        const noCookieArgs = [...buildBaseArgs(null, 'android_vr,tv_embedded'), '--dump-json', cleanUrl];
        const lastResult = await runYtdlp(noCookieArgs);
        if (lastResult.code === 0) result = lastResult;
      }
    } else if (cookiesPath) {
      // Non-bot error with cookies — retry without cookies as fallback
      console.warn('[INFO] yt-dlp failed with cookies. Retrying without cookies...');
      const noCookieArgs = [...buildBaseArgs(null), '--dump-json', cleanUrl];
      const retryResult = await runYtdlp(noCookieArgs);
      if (retryResult.code === 0) result = retryResult;
    }
  }

  if (result.code !== 0) {
    console.error(`[INFO] yt-dlp exited ${result.code}: ${result.stderr.slice(0, 500)}`);
    const parsed = parseYtdlpError(result.stderr);
    return res.status(422).json({
      success: false,
      ...parsed,
      details: result.stderr.trim().slice(0, 300),
    });
  }

  try {
    const data = JSON.parse(result.stdout);

      // ── Build format list ──────────────────────────────────
      const rawFormats = Array.isArray(data.formats) ? data.formats : [];

      const heightSet = new Set();
      for (const f of rawFormats) {
        if (!f.vcodec || f.vcodec === 'none') continue;
        if (f.height) heightSet.add(f.height);
      }
      if (data.height) heightSet.add(data.height);

      const maxHeight = heightSet.size > 0 ? Math.max(...heightSet) : 1080;

      const sizeByHeight = new Map();
      for (const f of rawFormats) {
        if (!f.vcodec || f.vcodec === 'none') continue;
        if (!f.height) continue;
        const existing = sizeByHeight.get(f.height) || 0;
        const size = f.filesize || f.filesize_approx || 0;
        if (size > existing) sizeByHeight.set(f.height, size);
      }

      let targetHeights = heightSet.size > 0
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

      const durationSecs = data.duration || 0;
      const durationStr = durationSecs > 0
        ? `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')}`
        : '—';

      const estimateSizeString = (sizeBytes, height) => {
        let bytes = sizeBytes;
        if (!bytes || bytes === 0) {
          if (durationSecs > 0) {
            const BITRATE_MAP = {
              144: 150000, 240: 350000, 360: 700000, 480: 1200000,
              720: 2500000, 1080: 4500000, 1440: 9000000, 2160: 18000000,
            };
            const bps = BITRATE_MAP[height] || (height * 4000);
            bytes = Math.round((bps / 8) * durationSecs);
          }
        }
        if (!bytes || bytes === 0) return '—';
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
        const mb = Math.round(bytes / 1048576);
        return mb > 0 ? `${mb} MB` : `${Math.round(bytes / 1024)} KB`;
      };

      const videoFormats = targetHeights.map((height) => {
        const sizeBytes = sizeByHeight.get(height) || 0;
        const sizeStr = estimateSizeString(sizeBytes, height);
        const width = Math.round((height * 16) / 9);
        const fmt = `bestvideo[height<=?${height}]+bestaudio/bestvideo+bestaudio/best`;
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

      const estimateAudioSize = (bitrateKbps) => {
        if (!durationSecs || durationSecs === 0) return '10 MB';
        const bytes = Math.round(((bitrateKbps * 1000) / 8) * durationSecs);
        const mb = Math.round(bytes / 1048576);
        return mb > 0 ? `${mb} MB` : `${Math.round(bytes / 1024)} KB`;
      };

      const audioFormats = [
        { id: 'bestaudio/best', bitrate: '128 kbps', codec: 'MP3', estimatedSize: estimateAudioSize(128), audioQuality: '5' },
        { id: 'bestaudio/best', bitrate: '192 kbps', codec: 'MP3', estimatedSize: estimateAudioSize(192), audioQuality: '3' },
        { id: 'bestaudio/best', bitrate: '256 kbps', codec: 'MP3', estimatedSize: estimateAudioSize(256), audioQuality: '2', recommended: true },
        { id: 'bestaudio/best', bitrate: '320 kbps', codec: 'MP3', estimatedSize: estimateAudioSize(320), audioQuality: '0' },
      ];

      const thumbnail =
        data.thumbnail ||
        (Array.isArray(data.thumbnails) && data.thumbnails.length > 0
          ? data.thumbnails[data.thumbnails.length - 1].url
          : null);

      const response = {
        success: true,
        url: rawUrl,
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
      };

      setCache(cleanUrl, response);
      res.json(response);
    } catch (parseErr) {
      console.error('[INFO] JSON parse error:', parseErr);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          code: 'PARSE_ERROR',
          message: 'Failed to parse video metadata from yt-dlp.',
          solution: 'This is a server-side error. Please report it.',
          details: parseErr.message,
        });
      }
    }
});

// ─── /api/download ────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const { url: rawUrl, format, filename, type, audioQuality } = req.query;

  if (!rawUrl) {
    return res.status(400).json({ success: false, code: 'MISSING_URL', message: 'Missing url parameter.' });
  }

  const urlResult = validateUrl(rawUrl);
  if (!urlResult.valid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_URL',
      message: urlResult.reason === 'INCOMPLETE_ID'
        ? 'The YouTube video URL or ID is incomplete.'
        : 'The link you entered is not supported.',
      solution: 'Please paste a valid, complete YouTube or Instagram URL.',
    });
  }

  const isAudio = type === 'audio';
  const safeFilename = (filename || (isAudio ? 'audio.mp3' : 'video.mp4'))
    .replace(/[^\w\-. ()]/g, '_')
    .slice(0, 200);

  const fileId = `vortx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpTemplate = path.join(os.tmpdir(), `${fileId}.%(ext)s`);
  const cleanUrl = sanitizeUrl(urlResult.href);

  console.log(`[DOWNLOAD] ${type} | ${cleanUrl} | format=${format}`);

  function buildDownloadArgs(cp, clientOverride) {
    const dArgs = [...buildBaseArgs(cp, clientOverride)];

    if (ffmpegPath) {
      dArgs.push('--ffmpeg-location', ffmpegPath);
    }

    if (isAudio) {
      const quality = audioQuality || '2';
      dArgs.push(
        '-f', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', quality,
        '-o', tmpTemplate,
        cleanUrl
      );
    } else {
      let targetFmt = 'bv*+ba/b';
      if (format) {
        const match = format.match(/height<=?\??(\d+)/);
        if (match && match[1]) {
          const h = match[1];
          targetFmt = `bv*[height<=?${h}]+ba/b[height<=?${h}]/bv*+ba/b`;
        } else {
          targetFmt = `${format}/bv*+ba/b`;
        }
      }
      console.log(`[DOWNLOAD] format selector: ${targetFmt}`);
      dArgs.push(
        '-f', targetFmt,
        '--merge-output-format', 'mp4',
        '-o', tmpTemplate,
        cleanUrl
      );
    }
    return dArgs;
  }

  const cookiesPath = getCookiesPath();
  let result = await runYtdlp(buildDownloadArgs(cookiesPath));

  if (result.spawnError) {
    return res.status(503).json({
      success: false,
      code: 'YTDLP_NOT_FOUND',
      message: 'yt-dlp is not installed on the server.',
      solution: 'Run: pip install yt-dlp',
    });
  }

  // Retry strategy: mirror the /api/info retry logic
  if (result.code !== 0) {
    const errText = result.stderr || '';
    const isBotDetected = /Sign in to confirm|not a bot|bot detection|confirm you're not a bot|please verify/i.test(errText);
    const isJsRuntimeIssue = /JavaScript runtime|js.?runtime|ExtractorError.*nsig/i.test(errText);

    if (isBotDetected || isJsRuntimeIssue) {
      console.warn('[DOWNLOAD] Bot detection / JS runtime issue. Retrying with android_vr client...');
      // Rebuild args with android_vr client override
      function buildDownloadArgsAlt(cp, clientOverride) {
        const dArgs = [...buildBaseArgs(cp, clientOverride)];
        if (ffmpegPath) dArgs.push('--ffmpeg-location', ffmpegPath);
        if (isAudio) {
          const quality = audioQuality || '2';
          dArgs.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', quality, '-o', tmpTemplate, cleanUrl);
        } else {
          let targetFmt = 'bv*+ba/b';
          if (format) {
            const match = format.match(/height<=?\??(\d+)/);
            if (match && match[1]) {
              targetFmt = `bv*[height<=?${match[1]}]+ba/b[height<=?${match[1]}]/bv*+ba/b`;
            } else {
              targetFmt = `${format}/bv*+ba/b`;
            }
          }
          dArgs.push('-f', targetFmt, '--merge-output-format', 'mp4', '-o', tmpTemplate, cleanUrl);
        }
        return dArgs;
      }
      const retryResult = await runYtdlp(buildDownloadArgsAlt(cookiesPath, 'android_vr,tv_embedded'));
      if (retryResult.code === 0) {
        result = retryResult;
      } else if (cookiesPath) {
        console.warn('[DOWNLOAD] Retry with cookies failed. Trying without cookies...');
        const lastResult = await runYtdlp(buildDownloadArgsAlt(null, 'android_vr,tv_embedded'));
        if (lastResult.code === 0) result = lastResult;
      }
    } else if (cookiesPath) {
      console.warn('[DOWNLOAD] yt-dlp failed with cookies. Retrying download without cookies...');
      result = await runYtdlp(buildDownloadArgs(null));
    }
  }

  if (result.code !== 0) {
    console.error(`[DOWNLOAD] yt-dlp exited ${result.code}: ${result.stderr.slice(0, 500)}`);
    if (!res.headersSent) {
      const parsed = parseYtdlpError(result.stderr);
      return res.status(422).json({
        success: false,
        ...parsed,
        details: result.stderr.trim().slice(0, 300),
      });
    }
    return;
  }

  const tmpDir = os.tmpdir();
  let matchingFiles = [];
  try {
    matchingFiles = fs.readdirSync(tmpDir).filter(
      f => f.startsWith(fileId) && !f.endsWith('.part') && !f.endsWith('.ytdl')
    );
  } catch (e) {
    console.error('[DOWNLOAD] Failed to read temp directory:', e);
  }

  if (matchingFiles.length === 0) {
    console.error('[DOWNLOAD] No output file found for prefix:', fileId);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        code: 'OUTPUT_MISSING',
        message: 'Download completed but output file was not found.',
        solution: 'This may be a server disk space or permissions issue.',
      });
    }
    return;
  }

  const actualFilePath = path.join(tmpDir, matchingFiles[0]);

  fs.stat(actualFilePath, (statErr, stat) => {
    if (statErr || !stat) {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          code: 'FILE_STAT_ERROR',
          message: 'Failed to access the downloaded file.',
        });
      }
      return;
    }

    console.log(`[DOWNLOAD] Streaming ${stat.size} bytes → ${safeFilename}`);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(actualFilePath);
    readStream.pipe(res);

    const cleanup = () => {
      fs.unlink(actualFilePath, (err) => {
        if (!err) console.log(`[DOWNLOAD] Cleaned up: ${actualFilePath}`);
      });
    };
    readStream.on('close', cleanup);
    readStream.on('error', (err) => {
      console.error('[DOWNLOAD] Read stream error:', err);
      cleanup();
    });
  });
});

// ─── Serve Frontend ───────────────────────────────────────────
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  const cookiesPath = getCookiesPath();
  console.log(`\n🚀 VORTX backend running at http://localhost:${PORT}`);
  console.log(`   FFmpeg  : ${ffmpegPath ? 'BUNDLED (' + ffmpegPath + ')' : 'system PATH'}`);
  console.log(`   Cookies : ${cookiesPath ? '✓ LOADED (' + cookiesPath + ')' : '✗ NOT CONFIGURED (bot detection risk)'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET /api/ping`);
  console.log(`     GET /api/health`);
  console.log(`     GET /api/cookies/status`);
  console.log(`     GET /api/info?url=<video_url>`);
  console.log(`     GET /api/download?url=<video_url>&format=<fmt>&type=video|audio\n`);
});
