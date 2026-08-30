/**
 * Cloudflare Pages Function: /api/url
 * 兼容 lx-music-desktop 自定义音源的 request / musicUrl 调用协议。
 */

const API_URL = 'https://c.wwwweb.top';
const API_KEY = 'IKM-P29100001-dvH2e0WUwGU169aI-6o';
const REQUEST_TIMEOUT = 20000;

const SOURCE_QUALITIES = {
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
};

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

function getMusicId(musicInfo) {
  const value = musicInfo?.hash ?? musicInfo?.songmid;
  return value == null ? '' : String(value).trim();
}

function parseDesktopRequest(body) {
  const payload = body?.data && typeof body.data === 'object' ? body.data : body;
  return {
    requestKey: typeof body?.requestKey === 'string' ? body.requestKey : '',
    source: String(payload?.source || '').toLowerCase(),
    action: payload?.action,
    type: String(payload?.info?.type || '').toLowerCase(),
    musicInfo: payload?.info?.musicInfo,
  };
}

async function requestMusicUrl(source, musicInfo, type) {
  const musicId = getMusicId(musicInfo);
  if (!musicId) throw new Error('缺少歌曲 hash / songmid');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let response;
  try {
    response = await fetch(`${API_URL}/music/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'lx-music-desktop/2.0.0',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify({ source, musicId, quality: type }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('音源请求超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const result = await response.json().catch(() => ({}));

  if (Number(result?.code) === 200 && typeof result.url === 'string' && /^https?:\/\//.test(result.url)) {
    return result.url;
  }

  switch (Number(result?.code)) {
    case 403:
      throw new Error('音源鉴权失败');
    case 429:
      throw new Error('音源请求过速');
    case 500:
      throw new Error(`获取 URL 失败：${result?.message || '未知错误'}`);
    default:
      throw new Error(result?.message || `音源请求失败（HTTP ${response.status}）`);
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();
  if (request.method !== 'POST') return json({ code: 405, message: 'Method Not Allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: 400, message: '无效的 JSON body' }, 400);
  }

  const desktopRequest = parseDesktopRequest(body);
  const { requestKey, source, action, type } = desktopRequest;
  const songInfo = desktopRequest.musicInfo;
  if (action !== 'musicUrl') return json({ code: 400, message: 'action not support' }, 400);
  if (!SOURCE_QUALITIES[source]) return json({ code: 400, message: `音源不支持平台：${source}` }, 400);
  if (!SOURCE_QUALITIES[source].includes(type)) {
    return json({ code: 400, message: `${source} 不支持音质：${type}` }, 400);
  }
  if (!songInfo || typeof songInfo !== 'object') {
    return json({ code: 400, message: '缺少 info.musicInfo' }, 400);
  }

  try {
    const url = await requestMusicUrl(source, songInfo, type);
    return json({
      code: 0,
      requestKey,
      result: {
        source,
        action: 'musicUrl',
        data: { type, url },
      },
    });
  } catch (error) {
    return json({
      code: 502,
      requestKey,
      source,
      action: 'musicUrl',
      message: error?.message || '音源解析失败',
    }, 502);
  }
}
