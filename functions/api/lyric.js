/**
 * Cloudflare Pages Function: /api/lyric
 * Proxy lyrics for wy / tx / kw / kg (best-effort)
 * Query: ?source=wy&id=xxx
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
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

async function lyricWy(id) {
  const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=1&kv=1&tv=-1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://music.163.com/',
    },
  });
  const data = await res.json();
  return data?.lrc?.lyric || data?.tlyric?.lyric || '';
}

async function lyricTx(mid) {
  // Get song id mapping first is hard; try y.qq lyric by mid via musicu-like path
  const url =
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}` +
    `&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://y.qq.com/',
    },
  });
  const data = await res.json();
  if (!data?.lyric) return '';
  // QQ returns base64 lyric
  try {
    const binary = atob(data.lyric);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return data.lyric;
  }
}

async function lyricKw(id) {
  const rid = String(id).replace(/^MUSIC_/, '');
  const url = `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${encodeURIComponent(rid)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.kuwo.cn/',
    },
  });
  const data = await res.json();
  const list = data?.data?.lrclist || [];
  if (!list.length) return '';
  return list
    .map((line) => {
      const t = parseFloat(line.time);
      if (Number.isNaN(t)) return line.lineLyric || '';
      const m = Math.floor(t / 60);
      const s = t % 60;
      const mm = String(m).padStart(2, '0');
      const ss = s.toFixed(2).padStart(5, '0');
      return `[${mm}:${ss}]${line.lineLyric || ''}`;
    })
    .join('\n');
}

async function lyricKg(hash) {
  // Kugou lyric needs accesskey from search; best-effort empty
  return '';
}

const LYRIC_FETCHERS = {
  wy: lyricWy,
  tx: lyricTx,
  kw: lyricKw,
  kg: lyricKg,
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();
  if (request.method !== 'GET') return json({ code: 405, message: 'Method Not Allowed' }, 405);

  const { searchParams } = new URL(request.url);
  const source = (searchParams.get('source') || 'wy').toLowerCase();
  const id =
    searchParams.get('id') ||
    searchParams.get('songId') ||
    searchParams.get('songmid') ||
    searchParams.get('hash') ||
    '';

  if (!id) return json({ code: 400, message: '缺少 id', lyric: '' }, 400);
  if (!LYRIC_FETCHERS[source]) {
    return json({ code: 0, source, lyric: '', message: '该音源暂不支持歌词' });
  }

  try {
    const lyric = await LYRIC_FETCHERS[source](id);
    return json({ code: 0, source, id, lyric: lyric || '' });
  } catch (err) {
    return json({ code: 500, message: err?.message || '歌词获取失败', lyric: '' }, 500);
  }
}
