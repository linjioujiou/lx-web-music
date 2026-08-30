/**
 * Cloudflare Pages Function: /api/platforms
 * 返回桌面自定义音源脚本通过 inited.sources 声明的平台与音质。
 * 前端据此动态渲染当前平台的音质选项。
 */

// 与 ikun 音源脚本 MUSIC_QUALITY 一致
const PLATFORM_QUALITY = {
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
};

const SOURCE_LABELS = {
  wy: '网易云音乐',
  tx: 'QQ音乐',
  kw: '酷我音乐',
  kg: '酷狗音乐',
};

const QUALITY_LABELS = {
  '128k': '标准',
  '320k': '较高',
  flac: '无损',
  flac24bit: 'Hi-Res',
  hires: 'Hi-Res',
  atmos: '全景声',
  atmos_plus: '全景声+',
  master: '母带',
};

const ORDER = ['wy', 'tx', 'kw', 'kg'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'GET') return json({ code: 405, message: 'Method Not Allowed' }, 405);

  const platforms = ORDER.map((id) => ({
    id,
    name: SOURCE_LABELS[id] || id,
    qualities: (PLATFORM_QUALITY[id] || []).map((q) => ({ id: q, name: QUALITY_LABELS[q] || q })),
  }));

  return json({ code: 0, platforms, qualityLabels: QUALITY_LABELS });
}
