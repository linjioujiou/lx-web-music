/**
 * Cloudflare Pages Function: /api/cover
 * Proxies album artwork so the client can sample pixels (CORS).
 * Query: ?url=https://...
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ALLOWED_HOST_HINTS = [
  'gtimg.cn',
  'music.qq.com',
  'qq.com',
  'kuwo.cn',
  'kugou.com',
  'netease.com',
  '126.net',
  'music.126.net',
  'y.qq.com',
  'qpic.cn',
  'photo.store.qq.com',
  'migu.cn',
  'nf.migu.cn',
  'so.meituan.net',
  'byteimg.com',
  'douyinpic.com',
  'hdslb.com',
  'bilibili.com',
  'alicdn.com',
  'aliyuncs.com',
  'myqcloud.com',
  'cloudfront.net',
  'googleusercontent.com',
  'mzstatic.com',
  'scdn.co',
  'spotifycdn.com',
];

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const p = h.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
  }
  return false;
}

function hostAllowed(hostname) {
  const h = hostname.toLowerCase();
  // allow common CDNs; also allow other public https hosts (music sources vary)
  if (ALLOWED_HOST_HINTS.some((x) => h === x || h.endsWith('.' + x))) return true;
  // permissive fallback for public album CDNs
  return !isPrivateHost(h);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet(context) {
  try {
    const reqUrl = new URL(context.request.url);
    const raw = reqUrl.searchParams.get('url') || '';
    if (!raw) return bad('missing url');

    let target;
    try {
      target = new URL(raw);
    } catch {
      return bad('invalid url');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return bad('only http(s)');
    }
    if (isPrivateHost(target.hostname) || !hostAllowed(target.hostname)) {
      return bad('host not allowed', 403);
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: target.origin + '/',
      },
      cf: { cacheTtl: 86400, cacheEverything: true },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return bad('upstream ' + upstream.status, 502);
    }

    const ctype = (upstream.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.startsWith('image/') && !ctype.includes('octet-stream')) {
      return bad('not an image', 415);
    }

    // stream with size guard
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > 3.5 * 1024 * 1024) {
      return bad('image too large', 413);
    }

    return new Response(buf, {
      status: 200,
      headers: corsHeaders({
        'Content-Type': ctype.startsWith('image/') ? ctype : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      }),
    });
  } catch (err) {
    return bad(err.message || 'cover proxy failed', 500);
  }
}