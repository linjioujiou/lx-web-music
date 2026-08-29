/**
 * Cloudflare Pages Function: /api/url
 * 解析播放地址 —— 适配洛雪音源插件的 source_data 调用方式
 *
 * 两种调用方式：
 *  1) POST JSON body: { source_data: { platform, quality, songInfo }, fallback }
 *     与洛雪插件 /api/music/url 一致；songInfo 可带 types/qualitys 表示可用音质。
 *  2) GET 兼容旧前端: ?source=wy&id=xxx&quality=320k&types=128k,320k
 *
 * 音质策略：先请求用户选择的音质；失败后按当前平台支持列表逐级降低，直到成功。
 *
 * 解析后端（按优先级）：
 *  1) ikun 赞助音源（已接入）：POST LX_API_BASE + X-Api-Key，body { source, musicId, quality }
 *  2) ikun 免费: GET IKUN_BASE/url?source=&songId=&quality=
 *  3) fallback：跨平台搜索匹配
 */

// ikun 赞助音源（洛雪脚本风格 HTTP 接口）
const LX_API_BASE = 'https://c.wwwweb.top/music/url';
const LX_API_KEY = 'IKM-P29100001-dvH2e0WUwGU169aI-6o';
const IKUN_BASE = 'https://api.ikunshare.com';
const IKUN_KEY = '';

const ALLOWED_SOURCES = new Set(['kw', 'kg', 'tx', 'wy', 'mg']);
const ALLOWED_QUALITY = new Set([
  '128k', '192k', '320k', 'hq', 'sq', 'flac', 'ape', 'wav', 'hr', 'hires', 'flac24bit', 'atmos', 'atmos_plus', 'master',
]);

const PLATFORM_QUALITY = {
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  mg: ['128k', '320k', 'flac'],
};

// 音质等级表（值越大音质越高），与洛雪插件 at() 内部一致
const QUALITY_RANK = {
  '128k': 10, '192k': 20, '320k': 30, hq: 30, sq: 50, flac: 50,
  ape: 50, wav: 50, hr: 70, hires: 70, 'flac24bit': 70,
  atmos: 75, atmos_plus: 76, master: 80,
};
const DEFAULT_RANK = 30; // 320k

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function qualityLadder(source, requested) {
  const platformQualities = PLATFORM_QUALITY[source] || ['128k', '320k', 'flac'];
  const requestedIndex = platformQualities.indexOf(requested);
  if (requestedIndex >= 0) return platformQualities.slice(0, requestedIndex + 1).reverse();

  const requestedRank = QUALITY_RANK[requested] || DEFAULT_RANK;
  const lowerQualities = platformQualities
    .filter((quality) => (QUALITY_RANK[quality] || 0) < requestedRank)
    .reverse();
  return [requested, ...lowerQualities.filter((quality) => quality !== requested)];
}

function buildSongId(sd) {
  const info = sd.songInfo || {};
  return String(
    info.hash || info.Hash || info.songmid || info.Songmid || info.musicId || info.MusicID ||
    sd.songId || info.songId || info.id || ''
  );
}

/**
 * 调用 ikun 赞助音源 HTTP 接口（洛雪脚本风格）。
 * POST { source, musicId, quality } + X-Api-Key，返回 { code:200, url }。
 */
async function fetchLxPlugin(source, songId, quality) {
  if (!LX_API_BASE) throw new Error('LX_API_BASE 未配置');
  const res = await fetch(LX_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': LX_API_KEY,
      'User-Agent': 'lx-music-web/1.0',
    },
    body: JSON.stringify({ source, musicId: songId, quality }),
  });
  const data = await res.json().catch(() => ({}));
  if (data && data.code === 200 && data.url) {
    return { url: data.url, quality: data.quality || quality, provider: 'ikun-sponsor', sourceId: '' };
  }
  const msg = data?.message || data?.error || 'ikun-sponsor HTTP ' + res.status;
  throw new Error(msg);
}
async function fetchIkun(source, songId, quality) {
  const q = quality;
  const url = `${IKUN_BASE}/url?source=${encodeURIComponent(source)}&songId=${encodeURIComponent(songId)}&quality=${encodeURIComponent(q)}`;
  const headers = { 'User-Agent': 'lx-music-web/1.0' };
  if (IKUN_KEY) headers['X-Request-Key'] = IKUN_KEY;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (data && (data.code === 200 || data.code === 0) && data.url) {
    return { url: data.url, quality: data.quality || q, provider: 'ikun', raw: data };
  }
  throw new Error(data?.msg || data?.message || `ikun 返回 code=${data?.code ?? res.status}`);
}

async function resolveWithQualityFallback(source, songId, requestedQuality, errors, prefix = '') {
  const attemptedQualities = [];
  for (const quality of qualityLadder(source, requestedQuality)) {
    attemptedQualities.push(quality);

    if (LX_API_BASE) {
      try {
        const result = await fetchLxPlugin(source, songId, quality);
        return { ...result, requestedQuality, attemptedQualities };
      } catch (error) {
        errors.push(`${prefix}lx-plugin/${quality}: ${error.message}`);
      }
    }

    try {
      const result = await fetchIkun(source, songId, quality);
      return { ...result, requestedQuality, attemptedQualities };
    } catch (error) {
      errors.push(`${prefix}ikun/${quality}: ${error.message}`);
    }
  }
  return null;
}

function ok(result, source, songId) {
  return json({
    code: 0,
    url: result.url,
    quality: result.quality,
    provider: result.provider,
    source,
    songId,
    sourceId: result.sourceId || '',
    requestedQuality: result.requestedQuality || result.quality,
    downgraded: Boolean(result.requestedQuality && result.quality !== result.requestedQuality),
    attemptedQualities: result.attemptedQualities || [result.quality],
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();

  let sourceData, fallback, requested;

  if (request.method === 'POST') {
    // 洛雪插件风格: body { source_data, fallback, quality }
    let body = {};
    try { body = await request.json(); } catch { return json({ code: 400, message: '无效的 JSON body' }, 400); }
    sourceData = body.source_data;
    if (!sourceData || typeof sourceData !== 'object') {
      return json({ code: 400, message: 'source_data is required' }, 400);
    }
    if (!sourceData.platform || !sourceData.songInfo) {
      return json({ code: 400, message: 'invalid source_data: missing platform or songInfo' }, 400);
    }
    fallback = body.fallback;
    requested = String(body.quality || sourceData.quality || '320k').toLowerCase();
  } else if (request.method === 'GET') {
    // 兼容旧前端: ?source=&id=&quality=&types=
    const { searchParams } = new URL(request.url);
    const source = (searchParams.get('source') || '').toLowerCase();
    const songId = searchParams.get('id') || searchParams.get('songId') ||
      searchParams.get('songmid') || searchParams.get('hash') || '';
    requested = (searchParams.get('quality') || '320k').toLowerCase();
    if (!source || !ALLOWED_SOURCES.has(source)) {
      return json({ code: 400, message: '无效或缺失 source 参数' }, 400);
    }
    if (!songId) return json({ code: 400, message: '缺少歌曲 id / songmid / hash' }, 400);
    const typesRaw = searchParams.get('types') || '';
    const songInfo = {
      name: searchParams.get('title') || '',
      singer: searchParams.get('artist') || '',
      album: searchParams.get('album') || '',
      musicId: songId,
      hash: searchParams.get('hash') || '',
      songmid: source === 'kg' ? '' : songId,
      types: typesRaw ? typesRaw.split(',').map((t) => ({ type: t })) : undefined,
    };
    sourceData = { platform: source, quality: requested, songInfo };
  } else {
    return json({ code: 405, message: 'Method Not Allowed' }, 405);
  }

  if (!ALLOWED_QUALITY.has(requested)) requested = '320k';
  const source = sourceData.platform;
  if (!ALLOWED_SOURCES.has(source)) {
    return json({ code: 400, message: `不支持的音源: ${source}` }, 400);
  }
  const songId = buildSongId(sourceData);
  if (!songId) return json({ code: 400, message: '缺少歌曲 id / songmid / hash' }, 400);

  const quality = requested;
  const errors = [];
  const resolved = await resolveWithQualityFallback(source, songId, quality, errors);
  if (resolved) return ok(resolved, source, songId);

  // 3) fallback：跨平台搜索匹配（简化版，需要标题+歌手）
  if (fallback && fallback.enabled && fallback.title) {
    try {
      const query = `${fallback.title} ${fallback.artist || ''}`.trim();
      // 复用搜索代理（同源 fetch）
      const sr = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}&limit=10`);
      const sd = await sr.json().catch(() => ({}));
      const songs = sd?.songs || [];
      const match = songs.find((s) =>
        s.title && fallback.title &&
        (s.title.includes(fallback.title) || fallback.title.includes(s.title))
      );
      if (match) {
        const fbId = match.hash || match.songmid || match.id;
        const fallbackResult = await resolveWithQualityFallback(source, fbId, quality, errors, 'fallback/');
        if (fallbackResult) return ok(fallbackResult, source, fbId);
      }
    } catch (e) { errors.push(`fallback: ${e.message}`); }
  }

  return json({ code: 502, message: '所有音源解析失败', errors, source, songId }, 502);
}
