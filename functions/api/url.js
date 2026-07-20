/**
 * Cloudflare Pages Function: /api/url
 * Resolve playable URL via lx-music-source backends (Huibq primary, ikun fallback)
 * Query: ?source=wy&id=xxx&quality=128k
 * Uses hash when present (kugou), otherwise songmid/id
 *
 * Backends mirror pdone/lx-music-source:
 * - Huibq: https://lxmusicapi.onrender.com/url/{source}/{songId}/{quality}
 * - ikun:  https://api.ikunshare.com/url?source=&songId=&quality=
 */

const HUIBQ_BASE = 'https://lxmusicapi.onrender.com';
const HUIBQ_KEY = 'share-v3';
const IKUN_BASE = 'https://api.ikunshare.com';
const IKUN_KEY = '';

const ALLOWED_SOURCES = new Set(['kw', 'kg', 'tx', 'wy', 'mg', 'git']);
const ALLOWED_QUALITY = new Set(['128k', '320k', 'flac', 'flac24bit', 'hires']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function fetchHuibq(source, songId, quality) {
  const q = quality === 'flac' || quality === 'flac24bit' || quality === 'hires' ? '320k' : quality;
  const url = `${HUIBQ_BASE}/url/${encodeURIComponent(source)}/${encodeURIComponent(songId)}/${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      'X-Request-Key': HUIBQ_KEY,
      'User-Agent': 'lx-music-web/1.0',
    },
  });
  const data = await res.json().catch(() => ({}));
  // huibq success: code === 0
  if (data && (data.code === 0 || data.code === 200) && data.url) {
    return { url: data.url, quality: q, provider: 'huibq', raw: data };
  }
  const msg = data?.msg || data?.message || `Huibq 返回 code=${data?.code ?? res.status}`;
  throw new Error(msg);
}

async function fetchIkun(source, songId, quality) {
  const url =
    `${IKUN_BASE}/url?source=${encodeURIComponent(source)}` +
    `&songId=${encodeURIComponent(songId)}&quality=${encodeURIComponent(quality)}`;
  const headers = {
    'User-Agent': 'lx-music-web/1.0',
  };
  if (IKUN_KEY) headers['X-Request-Key'] = IKUN_KEY;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  // ikun success: code === 200
  if (data && (data.code === 200 || data.code === 0) && data.url) {
    return { url: data.url, quality, provider: 'ikun', raw: data };
  }
  const msg = data?.msg || data?.message || `ikun 返回 code=${data?.code ?? res.status}`;
  throw new Error(msg);
}

function qualityLadder(preferred) {
  const all = ['320k', '128k'];
  const list = [preferred, ...all.filter((q) => q !== preferred)];
  return list;
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();
  if (request.method !== 'GET') return json({ code: 405, message: 'Method Not Allowed' }, 405);

  const { searchParams } = new URL(request.url);
  const source = (searchParams.get('source') || '').toLowerCase();
  const songId =
    searchParams.get('id') ||
    searchParams.get('songId') ||
    searchParams.get('songmid') ||
    searchParams.get('hash') ||
    '';
  let quality = (searchParams.get('quality') || '128k').toLowerCase();

  if (!source || !ALLOWED_SOURCES.has(source)) {
    return json({ code: 400, message: '无效或缺失 source 参数' }, 400);
  }
  if (!songId) {
    return json({ code: 400, message: '缺少歌曲 id / songmid / hash' }, 400);
  }
  if (!ALLOWED_QUALITY.has(quality)) quality = '128k';

  const errors = [];
  const qualities = qualityLadder(quality);

  for (const q of qualities) {
    try {
      const result = await fetchHuibq(source, songId, q);
      return json({
        code: 0,
        url: result.url,
        quality: result.quality,
        provider: result.provider,
        source,
        songId,
      });
    } catch (e) {
      errors.push(`huibq/${q}: ${e.message}`);
    }
  }

  for (const q of qualities) {
    try {
      const result = await fetchIkun(source, songId, q);
      return json({
        code: 0,
        url: result.url,
        quality: result.quality,
        provider: result.provider,
        source,
        songId,
      });
    } catch (e) {
      errors.push(`ikun/${q}: ${e.message}`);
    }
  }

  return json(
    {
      code: 502,
      message: '所有音源解析失败',
      errors,
      source,
      songId,
    },
    502
  );
}
