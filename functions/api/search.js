/**
 * Cloudflare Pages Function: /api/search
 * Proxies multi-source music search (wy / tx / kw / kg / mg)
 * Query: ?q=keyword&source=wy|tx|kw|kg|mg&limit=20
 */

const SOURCE_LABELS = {
  wy: '网易云',
  tx: 'QQ音乐',
  kw: '酷我',
  kg: '酷狗',
  mg: '咪咕',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=30',
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

async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      // kuwo sometimes returns almost-json
      return JSON.parse(text.replace(/'/g, '"'));
    }
  } finally {
    clearTimeout(timer);
  }
}

async function searchWy(keyword, limit) {
  const headers = { Referer: 'https://music.163.com/' };
  let data = await fetchJson(
    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=${limit}`,
    headers
  );
  let songs = data?.result?.songs || [];
  if (!songs.length) {
    data = await fetchJson(
      `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=${limit}&total=true`,
      headers
    );
    songs = data?.result?.songs || [];
  }
  return songs.map((s) => {
    const artists = (s.artists || s.ar || []).map((a) => a.name).filter(Boolean).join(' / ');
    const albumObj = s.album || s.al || {};
    let artwork = albumObj.picUrl || s.al?.picUrl || '';
    if (artwork) artwork = `${artwork}${artwork.includes('?') ? '&' : '?'}param=300y300`;
    const durationMs = s.duration || s.dt || 0;
    return {
      id: String(s.id),
      songmid: String(s.id),
      hash: null,
      title: s.name || '未知歌曲',
      artist: artists || '未知歌手',
      album: albumObj.name || '',
      duration: Math.floor(durationMs / 1000),
      artwork,
      source: 'wy',
      sourceLabel: SOURCE_LABELS.wy,
    };
  });
}

async function searchTx(keyword, limit) {
  const headers = { Referer: 'https://y.qq.com/' };
  const urls = [
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song` +
      `&searchid=${Date.now()}&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=${limit}` +
      `&w=${encodeURIComponent(keyword)}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?g_tk=5381&uin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1&w=${encodeURIComponent(keyword)}&zhidaqu=1&catZhida=1&t=0&flag=1&ie=utf-8&sem=1&aggr=0&perpage=${limit}&n=${limit}&p=1&remoteplace=txt.mqq.all`,
  ];

  let list = [];
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, headers);
      list = data?.data?.song?.list || data?.data?.song?.itemlist || [];
      if (list.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!list.length && lastErr) throw lastErr;

  return list.map((s) => {
    const mid = s.mid || s.songmid || '';
    const artists = (s.singer || []).map((a) => a.name).filter(Boolean).join(' / ');
    const albumMid = s.album?.mid || s.albummid || '';
    const artwork = albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
      : '';
    return {
      id: mid,
      songmid: mid,
      hash: null,
      title: s.name || s.songname || '未知歌曲',
      artist: artists || '未知歌手',
      album: s.album?.name || s.albumname || '',
      duration: s.interval || 0,
      artwork,
      source: 'tx',
      sourceLabel: SOURCE_LABELS.tx,
    };
  });
}

async function searchKw(keyword, limit) {
  const data = await fetchJson(
    `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}` +
      `&pn=0&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1` +
      `&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8` +
      `&rformat=json&vermerge=1&mobi=1&issubtitle=1`,
    { Referer: 'https://www.kuwo.cn/' }
  );
  const list = data?.abslist || data?.list || [];
  return list.map((s) => {
    const rid = String(s.MUSICRID || s.rid || s.id || '').replace(/^MUSIC_/, '');
    let artwork = s.web_albumpic_short || s.albumpic || s.pic || '';
    if (artwork && !artwork.startsWith('http')) {
      artwork = `https://img2.kuwo.cn/star/albumcover/${artwork}`;
    }
    const duration = parseInt(s.DURATION || s.duration || 0, 10) || 0;
    return {
      id: rid,
      songmid: rid,
      hash: null,
      title: s.SONGNAME || s.name || s.songname || '未知歌曲',
      artist: s.ARTIST || s.artist || '未知歌手',
      album: s.ALBUM || s.album || '',
      duration,
      artwork,
      source: 'kw',
      sourceLabel: SOURCE_LABELS.kw,
    };
  });
}

async function searchKg(keyword, limit) {
  const headers = { Referer: 'https://www.kugou.com/' };
  const urls = [
    `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=${limit}&showtype=1`,
    `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=1&pagesize=${limit}&userid=-1&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0`,
  ];
  let list = [];
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, headers);
      list = data?.data?.info || data?.data?.lists || [];
      if (list.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!list.length && lastErr) throw lastErr;

  return list.map((s) => {
    const hash = String(s.hash || s.FileHash || '').toLowerCase();
    const duration = s.duration || s.timeLength || s.Duration || 0;
    let artwork = s.album_img || s.imgUrl || s.Image || s.trans_param?.union_cover || '';
    if (artwork) artwork = artwork.replace('{size}', '400');
    return {
      id: hash || String(s.audio_id || s.AlbumID || s.ID || ''),
      songmid: hash || String(s.audio_id || s.ID || ''),
      hash: hash || null,
      title: s.songname || s.SongName || s.SongName || '未知歌曲',
      artist: s.singername || s.SingerName || '未知歌手',
      album: s.album_name || s.AlbumName || '',
      duration,
      artwork,
      source: 'kg',
      sourceLabel: SOURCE_LABELS.kg,
    };
  });
}

async function searchMg(keyword, limit) {
  const headers = {
    Referer: 'https://m.music.migu.cn/',
    Channel: '0146951',
  };
  const urls = [
    `https://m.music.migu.cn/migu/remoting/scr_search_tag?rows=${limit}&type=2&keyword=${encodeURIComponent(keyword)}&pgc=1`,
    `https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?text=${encodeURIComponent(keyword)}&pageNo=1&pageSize=${limit}&searchSwitch=%7B%22song%22%3A1%7D`,
  ];
  let list = [];
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, headers);
      list = data?.musics || data?.songResultData?.result || [];
      if (list.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!list.length && lastErr) throw lastErr;

  return list.map((s) => {
    const songmid = s.copyrightId || s.copyrightID || s.id || s.songId || s.contentId || '';
    const artists = Array.isArray(s.artists)
      ? s.artists.map((a) => a.name).filter(Boolean).join(' / ')
      : s.singerName || s.artist || '';
    return {
      id: String(songmid),
      songmid: String(songmid),
      hash: null,
      title: s.songName || s.name || s.title || '未知歌曲',
      artist: artists || '未知歌手',
      album: s.albumName || s.album || '',
      duration: 0,
      artwork: s.cover || s.pic || s.imgItems?.[0]?.img || '',
      source: 'mg',
      sourceLabel: SOURCE_LABELS.mg,
    };
  });
}

const SEARCHERS = {
  wy: searchWy,
  tx: searchTx,
  kw: searchKw,
  kg: searchKg,
  mg: searchMg,
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();
  if (request.method !== 'GET') return json({ code: 405, message: 'Method Not Allowed' }, 405);

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || searchParams.get('keyword') || '').trim();
  const source = (searchParams.get('source') || 'wy').toLowerCase();
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50);

  if (!q) return json({ code: 400, message: '缺少搜索关键词 q', songs: [] }, 400);
  if (!SEARCHERS[source]) {
    return json({ code: 400, message: `不支持的音源: ${source}`, songs: [] }, 400);
  }

  try {
    const songs = await SEARCHERS[source](q, limit);
    return json({
      code: 0,
      source,
      sourceLabel: SOURCE_LABELS[source],
      keyword: q,
      songs: Array.isArray(songs) ? songs : [],
    });
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? `${SOURCE_LABELS[source] || source} 搜索超时，请换音源或稍后重试`
        : err?.message || '搜索失败';
    return json({ code: 500, message, songs: [] }, 500);
  }
}
