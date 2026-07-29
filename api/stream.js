/**
 * Vercel Edge Function — VORTX Stream Proxy
 *
 * Runs on Vercel's edge network (server-side, different IPs from Render).
 * Calls Piped/Cobalt APIs without CORS restrictions (server → server).
 * Streams the response back to the browser as Content-Disposition attachment.
 *
 * Endpoint: GET /api/stream?videoId=&isAudio=&height=&filename=
 */

export const config = { runtime: 'edge' };

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped.tokhmi.xyz',
  'https://piped.moomoo.me',
  'https://pipedapi.tokhmi.xyz',
  'https://piped.adminforge.de',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const videoId  = searchParams.get('videoId');
  const isAudio  = searchParams.get('isAudio') === 'true';
  const height   = parseInt(searchParams.get('height') || '720', 10);
  const filename = searchParams.get('filename') || (isAudio ? 'audio.mp3' : 'video.mp4');

  if (!videoId) {
    return Response.json({ error: 'Missing videoId' }, { status: 400, headers: CORS_HEADERS });
  }

  // ── Try Piped (server-to-server, no CORS) ───────────────────────
  let streamUrl = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      const resp = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!resp.ok) continue;

      const data = await resp.json();

      if (isAudio) {
        const streams = (data.audioStreams || []).filter(s => s.url);
        streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        streamUrl = streams[0]?.url ?? null;
      } else {
        const muxed = (data.videoStreams || []).filter(s => s.url && !s.videoOnly);
        muxed.sort((a, b) => {
          const qa = parseInt((a.quality || '').replace('p', '') || '0');
          const qb = parseInt((b.quality || '').replace('p', '') || '0');
          return qb - qa;
        });
        const match = muxed.find(
          s => parseInt((s.quality || '').replace('p', '') || '9999') <= height
        ) ?? muxed[muxed.length - 1];
        streamUrl = match?.url ?? null;
      }

      if (streamUrl) {
        console.log(`[EDGE] Piped ${instance} → got stream URL`);
        break;
      }
    } catch (e) {
      console.warn(`[EDGE] Piped ${instance} failed: ${e.message}`);
    }
  }

  // ── Try Cobalt as fallback (updated API: POST / with vQuality) ──────────────
  if (!streamUrl) {
    // Try multiple public Cobalt instances
    const cobaltInstances = [
      'https://api.cobalt.tools',
      'https://cobalt.tools',
    ];
    for (const cobaltBase of cobaltInstances) {
      try {
        const cobaltResp = await fetch(`${cobaltBase}/`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            vQuality: String(height),
            isAudioOnly: isAudio,
            filenameStyle: 'basic',
            disableMetadata: true,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (cobaltResp.ok) {
          const data = await cobaltResp.json();
          streamUrl = data.url ?? data.tunnel ?? null;
          if (streamUrl) { console.log(`[EDGE] Cobalt ${cobaltBase} → got stream URL`); break; }
        } else {
          console.warn(`[EDGE] Cobalt ${cobaltBase} returned HTTP ${cobaltResp.status}`);
        }
      } catch (e) {
        console.warn(`[EDGE] Cobalt ${cobaltBase} failed: ${e.message}`);
      }
    }
  }

  if (!streamUrl) {
    return Response.json(
      { success: false, code: 'STREAM_UNAVAILABLE', message: 'All providers failed.' },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  // ── Proxy the stream ─────────────────────────────────────────────
  try {
    const rangeHeader = request.headers.get('Range') || '';
    const upstream = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(rangeHeader ? { 'Range': rangeHeader } : {}),
      },
    });

    const contentType = upstream.headers.get('content-type')
      || (isAudio ? 'audio/mpeg' : 'video/mp4');

    const headers = {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache',
    };

    const cl = upstream.headers.get('content-length');
    if (cl) headers['Content-Length'] = cl;

    const cr = upstream.headers.get('content-range');
    if (cr) headers['Content-Range'] = cr;

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    console.error(`[EDGE] Stream proxy error: ${e.message}`);
    return Response.json({ error: 'Stream proxy failed' }, { status: 502, headers: CORS_HEADERS });
  }
}
