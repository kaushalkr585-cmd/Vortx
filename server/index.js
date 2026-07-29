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
const https = require('https');

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

app.use(cors({ origin: '*', credentials: false }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
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
      // Accept any meaningful YouTube auth token
      const hasAuth = cookieText.includes('__Secure-3PAPISID') ||
                      cookieText.includes('SAPISID') ||
                      cookieText.includes('__Secure-3PSID') ||
                      cookieText.includes('LOGIN_INFO') ||
                      cookieText.includes('SID') ||
                      cookieText.includes('SSID');

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
                        content.includes('LOGIN_INFO') ||
                        content.includes('SID');
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
  //   web          — full auth with cookies, best quality, needs JS runtime on server IPs
  //   tv_embedded  — works on server IPs, no JS runtime needed, good bot bypass
  //   android_vr   — secondary fallback, bypasses JS challenges
  //   web_creator  — creator client, sometimes bypasses bot detection differently
  //   mweb         — mobile web, last resort
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
    '--add-header', 'Origin:https://www.youtube.com',
    // Player client
    '--extractor-args', `youtube:player_client=${playerClient}`,
    // Retry & resilience (keep timeouts low on cloud servers)
    '--socket-timeout', '8',
    '--retries', '1',
    '--extractor-retries', '1',
    '--fragment-retries', '1',
    // Bypass geographic restrictions
    '--geo-bypass',
    '--no-check-certificates',
  ];

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  return args;
}

// ─── Exhaustive Bot-Detection Bypass Runner ───────────────────
/**
 * Tries yt-dlp with multiple client/cookie combinations in sequence.
 * Returns the first successful result, or the last failed result.
 * Attempts (in order):
 *   1. tv_embedded + cookies       — best for cloud IPs with auth
 *   2. web_creator + cookies       — alternate client with auth
 *   3. android_vr + cookies        — no JS runtime needed
 *   4. tv_embedded (no cookies)    — unauthenticated fallback
 *   5. android_vr (no cookies)     — last resort
 */
async function runWithBotBypass(extraArgs, cookiesPath) {
  const attempts = [
    { client: 'tv_embedded', cp: cookiesPath, label: 'tv_embedded+cookies' },
    { client: 'android_vr',  cp: cookiesPath, label: 'android_vr+cookies'  },
  ];

  let lastResult;
  for (const attempt of attempts) {
    const args = [...buildBaseArgs(attempt.cp, attempt.client), ...extraArgs];
    console.log(`[BOT-BYPASS] Trying: ${attempt.label}`);
    const result = await runYtdlp(args);
    if (result.code === 0) {
      console.log(`[BOT-BYPASS] Success with: ${attempt.label}`);
      return result;
    }
    lastResult = result;
    const errText = result.stderr || '';
    // If it's NOT a bot detection error, stop retrying (different error type)
    const isBotOrAuth = /Sign in to confirm|not a bot|bot detection|confirm you're not a bot|please verify|authentication|This video is unavailable/i.test(errText);
    if (!isBotOrAuth) {
      console.warn(`[BOT-BYPASS] Non-bot error on ${attempt.label}, stopping retries.`);
      break;
    }
  }
  return lastResult;
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

// ─── YouTube oEmbed Fallback ──────────────────────────────────
/**
 * When yt-dlp is blocked by bot detection on cloud IPs, this uses
 * YouTube's free public oEmbed API to get basic metadata.
 * No authentication, no cookies, works from any IP.
 */
function httpsGet(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── Alternative Download: Piped + Invidious via Server Proxy ───
/**
 * When yt-dlp is bot-blocked, use Piped or Invidious public APIs to get the
 * video stream URL, then PROXY it through our server to the client.
 * Server-side proxy = no CORS issues, no redirect issues.
 * Flow: Client → Our server → Piped/Invidious CDN → Our server → Client
 */

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped.tokhmi.xyz',
  'https://piped.moomoo.me',
  'https://piped.yt',
  'https://pipedapi.tokhmi.xyz',
  'https://piped.adminforge.de',
];

const INVIDIOUS_INSTANCES = [
  'https://iv.datura.network',
  'https://invidious.nerdvpn.de',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
  'https://invidious.flokinet.to',
  'https://invidious.tiekoetter.com',
];

/** Proxies a CDN/stream URL through the server to the HTTP response. */
function proxyStreamToClient(res, streamUrl, filename, isAudio) {
  return new Promise((resolve) => {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    };

    function doRequest(targetUrl, redirectsLeft = 5) {
      https.get(targetUrl, { headers: reqHeaders }, (upstream) => {
        // Handle HTTP redirects manually
        if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
          upstream.resume();
          if (redirectsLeft <= 0) { resolve(false); return; }
          const next = upstream.headers.location.startsWith('http')
            ? upstream.headers.location
            : new URL(upstream.headers.location, targetUrl).href;
          return doRequest(next, redirectsLeft - 1);
        }

        if (upstream.statusCode >= 400) {
          console.warn(`[PROXY] Upstream returned HTTP ${upstream.statusCode} for ${targetUrl.slice(0, 80)}`);
          upstream.resume();
          return resolve(false);
        }

        if (res.headersSent) return resolve(false);

        const ct = upstream.headers['content-type'] || (isAudio ? 'audio/webm' : 'video/mp4');
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        if (upstream.headers['content-length']) {
          res.setHeader('Content-Length', upstream.headers['content-length']);
        }
        res.setHeader('Cache-Control', 'no-store');

        upstream.pipe(res);
        upstream.on('end', () => { console.log('[PROXY] ✓ Stream complete'); resolve(true); });
        upstream.on('error', (e) => { console.error('[PROXY] Stream error:', e.message); resolve(false); });
        res.on('close', () => resolve(true)); // client closed connection early
      }).on('error', (e) => {
        console.error('[PROXY] Request error:', e.message);
        resolve(false);
      }).setTimeout(60000, function() { this.destroy(); resolve(false); });
    }

    doRequest(streamUrl);
  });
}

/** Races all providers in parallel and returns the first working stream URL. */
async function resolveYouTubeStreamUrl(videoId, isAudio, targetHeight) {
  // ─ Direct InnerTube helper (ANDROID_VR client)
  async function innerTubePromise() {
    const raw = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        videoId: videoId,
        context: { client: { clientName: 'ANDROID_VR', clientVersion: '1.50.11', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12', hl: 'en', gl: 'US' } }
      });
      const r = https.request({
        hostname: 'www.youtube.com', path: '/youtubei/v1/player', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('InnerTube timeout')); });
      r.write(body);
      r.end();
    });

    const data = JSON.parse(raw);
    const formats = data.streamingData ? [...(data.streamingData.formats || []), ...(data.streamingData.adaptiveFormats || [])] : [];
    let url = null;
    if (isAudio) {
      const audioStreams = formats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('audio/'));
      audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      url = audioStreams[0]?.url || null;
    } else {
      const muxed = formats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('video/') && f.height);
      if (muxed.length > 0) {
        muxed.sort((a, b) => (b.height || 0) - (a.height || 0));
        const match = muxed.find(f => (f.height || 9999) <= targetHeight) || muxed[muxed.length - 1];
        url = match?.url || null;
      } else {
        const videoStreams = formats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('video/'));
        videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));
        url = videoStreams[0]?.url || null;
      }
    }
    if (!url) throw new Error('No direct stream URL from InnerTube');
    return url;
  }

  // ─ Cobalt helper (updated API: POST / with vQuality)
  function cobaltPromise() {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        vQuality: String(targetHeight),
        isAudioOnly: Boolean(isAudio),
        filenameStyle: 'basic',
        disableMetadata: true,
      });
      // Try multiple Cobalt instances
      const cobaltHosts = [
        { hostname: 'api.cobalt.tools', path: '/' },
      ];
      let tried = 0;
      function tryNext() {
        if (tried >= cobaltHosts.length) { reject(new Error('All Cobalt instances failed')); return; }
        const { hostname, path } = cobaltHosts[tried++];
        const r = https.request({
          hostname, path, method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 9000,
        }, (upstream) => {
          let d = '';
          upstream.on('data', c => d += c);
          upstream.on('end', () => {
            try {
              const parsed = JSON.parse(d);
              const url = parsed.url || parsed.tunnel || null;
              if (url) resolve(url);
              else { console.warn(`[COBALT] ${hostname} - no URL in response`); tryNext(); }
            } catch { tryNext(); }
          });
        });
        r.on('error', (e) => { console.warn(`[COBALT] ${hostname} error: ${e.message}`); tryNext(); });
        r.on('timeout', () => { r.destroy(); tryNext(); });
        r.write(body);
        r.end();
      }
      tryNext();
    });
  }

  // ─ Piped helper
  async function pipedPromise(instance) {
    const raw = await httpsGet(`${instance}/streams/${videoId}`, 9000);
    const data = JSON.parse(raw);
    let url = null;
    if (isAudio) {
      const streams = (data.audioStreams || []).filter(s => s.url);
      streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      url = streams[0]?.url;
    } else {
      const muxed = (data.videoStreams || []).filter(s => s.url && !s.videoOnly);
      muxed.sort((a, b) => {
        const qa = parseInt((a.quality || '').replace('p','') || '0');
        const qb = parseInt((b.quality || '').replace('p','') || '0');
        return qb - qa;
      });
      const match = muxed.find(s => parseInt((s.quality || '').replace('p','') || '9999') <= targetHeight)
        || muxed[muxed.length - 1];
      url = match?.url;
    }
    if (!url) throw new Error(`No URL from Piped ${instance}`);
    return url;
  }

  // ─ Invidious helper (?local=true forces proxied URLs with CORS headers)
  async function invidiousPromise(instance) {
    const raw = await httpsGet(`${instance}/api/v1/videos/${videoId}?local=true`, 9000);
    const data = JSON.parse(raw);
    let url = null;
    if (isAudio) {
      const streams = (data.adaptiveFormats || []).filter(f => f.type?.startsWith('audio/') && f.url);
      streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      url = streams[0]?.url;
    } else {
      const muxed = (data.formatStreams || []).filter(f => f.url);
      muxed.sort((a, b) => (parseInt((b.resolution||'0').replace('p',''))||0) - (parseInt((a.resolution||'0').replace('p',''))||0));
      const match = muxed.find(f => (parseInt((f.resolution||'9999').replace('p',''))||9999) <= targetHeight)
        || muxed[muxed.length - 1];
      url = match?.url;
    }
    if (!url) throw new Error(`No URL from Invidious ${instance}`);
    return url;
  }

  // ─ Race everything in parallel with a hard 12s cap
  const hardTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('resolveStreamUrl: 12s timeout')), 12000));

  try {
    const url = await Promise.race([
      Promise.any([
        innerTubePromise(),
        cobaltPromise(),
        pipedPromise('https://pipedapi.kavin.rocks'),
        pipedPromise('https://api.piped.yt'),
        pipedPromise('https://pipedapi.tokhmi.xyz'),
        invidiousPromise('https://iv.datura.network'),
        invidiousPromise('https://invidious.nerdvpn.de'),
        invidiousPromise('https://inv.tux.pizza'),
        invidiousPromise('https://invidious.privacyredirect.com'),
      ]),
      hardTimeout,
    ]);
    console.log(`[RESOLVE] ✓ Got stream URL: ${String(url).slice(0, 80)}`);
    return url;
  } catch (e) {
    console.error('[RESOLVE] All providers failed:', e.message);
    return null;
  }
}

// ─── YouTube oEmbed + Video ID helpers ───────────────────────
async function fetchYouTubeOEmbed(videoUrl) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
  const raw = await httpsGet(url);
  return JSON.parse(raw);
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') || null;
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
  } catch { /* ignore */ }
  return null;
}

function buildOEmbedResponse(rawUrl, oembed) {
  const videoId = extractVideoId(rawUrl);
  const thumbnail = videoId
    ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    : (oembed.thumbnail_url || null);

  // Standard resolution presets — shown since we can't get exact formats via oEmbed
  const videoFormats = [
    { id: 'bestvideo[height<=?360]+bestaudio/best',  label: '360p',        resolution: '640×360',   codec: 'H.264 / AAC', fps: 30, container: 'MP4', estimatedSize: '~45 MB' },
    { id: 'bestvideo[height<=?480]+bestaudio/best',  label: '480p',        resolution: '854×480',   codec: 'H.264 / AAC', fps: 30, container: 'MP4', estimatedSize: '~78 MB' },
    { id: 'bestvideo[height<=?720]+bestaudio/best',  label: '720p HD',     resolution: '1280×720',  codec: 'H.264 / AAC', fps: 30, container: 'MP4', estimatedSize: '~135 MB' },
    { id: 'bestvideo[height<=?1080]+bestaudio/best', label: '1080p Full HD', resolution: '1920×1080', codec: 'H.264 / AAC', fps: 30, container: 'MP4', estimatedSize: '~220 MB', recommended: true },
  ];

  const audioFormats = [
    { id: 'bestaudio/best', bitrate: '128 kbps', codec: 'MP3', estimatedSize: '~8 MB',  audioQuality: '5' },
    { id: 'bestaudio/best', bitrate: '192 kbps', codec: 'MP3', estimatedSize: '~14 MB', audioQuality: '3' },
    { id: 'bestaudio/best', bitrate: '256 kbps', codec: 'MP3', estimatedSize: '~19 MB', audioQuality: '2', recommended: true },
    { id: 'bestaudio/best', bitrate: '320 kbps', codec: 'MP3', estimatedSize: '~24 MB', audioQuality: '0' },
  ];

  return {
    success: true,
    url: rawUrl,
    title: oembed.title || 'Untitled',
    uploader: oembed.author_name || 'Unknown',
    uploaderAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(oembed.author_name || 'vortx')}`,
    thumbnail,
    duration: '—',
    viewCount: null,
    publishedAt: null,
    platform: 'youtube',
    videoFormats,
    audioFormats,
    _source: 'oembed', // internal flag — metadata via oEmbed fallback
  };
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

  // Use exhaustive bot-bypass runner for /api/info
  let result = await runWithBotBypass(['--dump-json', cleanUrl], cookiesPath);

  if (result.spawnError) {
    return res.status(503).json({
      success: false,
      code: 'YTDLP_NOT_FOUND',
      message: 'yt-dlp is not installed on the server.',
      solution: 'Run: pip install yt-dlp',
      details: result.stderr,
    });
  }

  if (result.code !== 0) {
    console.error(`[INFO] yt-dlp exited ${result.code}: ${result.stderr.slice(0, 500)}`);
    const parsed = parseYtdlpError(result.stderr);
    const isBotBlocked = parsed.code === 'BOT_DETECTED';
    const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');

    // ── oEmbed fallback for YouTube bot detection on cloud IPs ──
    if (isBotBlocked && isYouTube) {
      console.warn('[INFO] All yt-dlp clients blocked. Falling back to YouTube oEmbed API...');
      try {
        const oembed = await fetchYouTubeOEmbed(cleanUrl);
        const response = buildOEmbedResponse(rawUrl, oembed);
        setCache(cleanUrl, response);
        console.log(`[INFO] oEmbed fallback success for: ${cleanUrl}`);
        return res.json(response);
      } catch (oembedErr) {
        console.error('[INFO] oEmbed fallback also failed:', oembedErr.message);
        // Fall through to return the original bot-detected error
      }
    }

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
  const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
  const videoId = extractVideoId(cleanUrl);

  console.log(`[DOWNLOAD] ${type} | ${cleanUrl} | format=${format}`);

  // ── FAST PATH for YouTube: parallel race of all providers (no yt-dlp needed) ──
  if (isYouTube && videoId) {
    let targetHeight = 720;
    if (format) {
      const m = format.match(/height<=?\??(\d+)/);
      if (m && m[1]) targetHeight = parseInt(m[1]);
    }

    console.log(`[DOWNLOAD] Racing stream providers for videoId=${videoId}...`);
    const streamUrl = await resolveYouTubeStreamUrl(videoId, isAudio, targetHeight);

    if (streamUrl) {
      const ok = await proxyStreamToClient(res, streamUrl, safeFilename, isAudio);
      if (ok) {
        console.log('[DOWNLOAD] ✓ Stream proxy complete');
        return;
      }
    }

    console.log('[DOWNLOAD] Fast-path stream proxy unavailable. Falling back to server-side yt-dlp download...');
  }

  // Non-YouTube (Instagram etc.) — use yt-dlp
  const downloadExtraArgs = [];
  if (ffmpegPath) downloadExtraArgs.push('--ffmpeg-location', ffmpegPath);

  if (isAudio) {
    const quality = audioQuality || '2';
    downloadExtraArgs.push(
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
    downloadExtraArgs.push(
      '-f', targetFmt,
      '--merge-output-format', 'mp4',
      '-o', tmpTemplate,
      cleanUrl
    );
  }

  const cookiesPath = getCookiesPath();

  // Use exhaustive bot-bypass runner for /api/download
  let result = await runWithBotBypass(downloadExtraArgs, cookiesPath);

  if (result.spawnError) {
    return res.status(503).json({
      success: false,
      code: 'YTDLP_NOT_FOUND',
      message: 'yt-dlp is not installed on the server.',
      solution: 'Run: pip install yt-dlp',
    });
  }

  if (result.code !== 0) {
    console.error(`[DOWNLOAD] yt-dlp exited ${result.code}: ${result.stderr.slice(0, 500)}`);
    if (res.headersSent) return;

    const parsedErr = parseYtdlpError(result.stderr);
    const isBotBlocked = parsedErr.code === 'BOT_DETECTED';
    const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
    const videoId = extractVideoId(cleanUrl);

    // ── Invidious fallback: redirect browser to direct CDN URL ──
    if (isBotBlocked && isYouTube && videoId) {
      console.warn('[DOWNLOAD] Bot blocked. Attempting Invidious fallback...');
      const redirected = await tryInvidiousDownload(res, videoId, format, isAudio, safeFilename);
      if (redirected) return;
      console.warn('[DOWNLOAD] All Invidious instances failed.');
    }

    return res.status(422).json({
      success: false,
      ...parsedErr,
      details: result.stderr.trim().slice(0, 300),
    });
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
