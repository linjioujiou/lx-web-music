/**
 * LX Web — online music player
 * Search via /api/search, play URL via the lx-music-desktop user-source contract.
 */

import { createFluidBackground } from './fluid-bg.js?v=mode-icon1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const PLACEHOLDER_COVER =
  "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'300\'%3E%3Cdefs%3E%3ClinearGradient id=\'g\' x1=\'0\' y1=\'0\' x2=\'1\' y2=\'1\'%3E%3Cstop stop-color=\'%231a1f2e\'/%3E%3Cstop offset=\'1\' stop-color=\'%23252c42\'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill=\'url(%23g)\' width=\'300\' height=\'300\'/%3E%3Ccircle cx=\'150\' cy=\'150\' r=\'70\' fill=\'none\' stroke=\'%23636b84\' stroke-width=\'2\' opacity=\'.5\'/%3E%3Ctext x=\'50%25\' y=\'52%25\' fill=\'%238b93a7\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'42\' font-family=\'sans-serif\'%3E%E2%99%AA%3C/text%3E%3C/svg%3E";

const STORAGE_KEY = 'lx-web-queue-v1';
const QUALITY_KEY = 'lx-web-quality';
const VOLUME_KEY = 'lx-web-volume';
const SUPPORTED_SOURCES = new Set(['wy', 'tx', 'kw', 'kg']);

const SOURCE_LABELS = {
  wy: '网易云音乐',
  tx: 'QQ音乐',
  kw: '酷我音乐',
  kg: '酷狗音乐',
};
// 各平台可用音质（启动时从 /api/platforms 拉取，未拉取到则用兜底）
let PLATFORM_QUALITY = {
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
};
const QUALITY_LABELS = {
  '128k': '标准',
  '320k': '较高',
  flac: '无损',
  flac24bit: '24-bit 无损',
  hires: 'Hi-Res',
  atmos: '全景声',
  atmos_plus: '全景声+',
  master: '母带',
};

const MODE_PATHS = {
  // 顺序播放：列表 + 播放
  order: 'M3 5h11v2H3V5zm0 6h11v2H3v-2zm0 6h7v2H3v-2zm15.5-8.5L14 12l4.5 3.5V8.5zM21 16.5L16.5 13v7L21 16.5z',
  // 列表循环
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  // 单曲循环：循环 + 1
  single: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15h-1.5V10.8L10 11.5v-1.2l2.2-1.3H13V15z',
  // 随机播放
  shuffle: 'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
};

const MODE_LABELS = {
  order: '顺序播放',
  loop: '列表循环',
  single: '单曲循环',
  shuffle: '随机播放',
};

const state = {
  source: 'tx',
  songs: [],
  queue: [],
  currentIndex: -1,
  playing: false,
  mode: 'order',
  quality: localStorage.getItem(QUALITY_KEY) || '320k',
  lyrics: [],
  lyricIndex: -1,
  sheetOpen: false,
  seeking: false,
};

const audio = $('#audio');
const els = {
  form: $('#searchForm'),
  input: $('#searchInput'),
  searchSubmit: $('#searchSubmit'),
  tabs: $('#sourceTabs'),
  songList: $('#songList'),
  empty: $('#emptyState'),
  loading: $('#loading'),
  resultsMeta: $('#resultsMeta'),
  resultsTitle: $('#resultsTitle'),
  sourcePill: $('#sourcePill'),
  heroSourcePill: $('#heroSourcePill'),
  sourceHint: $('#sourceHint'),
  coverArt: $('#coverArt'),
  vinyl: $('#vinyl'),
  ambientCover: $('#ambientCover'),
  npTitle: $('#npTitle'),
  npArtist: $('#npArtist'),
  npSource: $('#npSource'),
  lyricsInner: $('#lyricsInner'),
  queueList: $('#queueList'),
  queueCount: $('#queueCount'),
  clearQueue: $('#clearQueue'),
  miniCover: $('#miniCover'),
  miniTitle: $('#miniTitle'),
  miniArtist: $('#miniArtist'),
  miniEq: $('#miniEq'),
  btnPlay: $('#btnPlay'),
  btnPrev: $('#btnPrev'),
  btnNext: $('#btnNext'),
  btnMode: $('#btnMode'),
  btnMute: $('#btnMute'),
  seekBar: $('#seekBar'),
  volBar: $('#volBar'),
  curTime: $('#curTime'),
  durTime: $('#durTime'),
  qualitySelect: $('#qualitySelect'),
  toast: $('#toast'),
  npSheet: $('#npSheet'),
  npSheetBg: $('#npSheetBg'),
  npFluidLayer: $('#npFluidLayer'),
  npFluidBase: $('#npFluidBase'),
  npSheetCover: $('#npSheetCover'),
  npSheetTitle: $('#npSheetTitle'),
  npSheetArtist: $('#npSheetArtist'),
  npSheetSource: $('#npSheetSource'),
  npSeekBar: $('#npSeekBar'),
  npCurTime: $('#npCurTime'),
  npDurTime: $('#npDurTime'),
  npBtnPlay: $('#npBtnPlay'),
  npBtnPrev: $('#npBtnPrev'),
  npBtnNext: $('#npBtnNext'),
  npBtnMode: $('#npBtnMode'),
  npBtnVol: $('#npBtnVol'),
  npVolWrap: $('#npVolWrap'),
  npVolPopover: $('#npVolPopover'),
  npVolBar: $('#npVolBar'),
  npVolHit: $('#npVolHit'),
  npVolFill: $('#npVolFill'),
  npVolKnob: $('#npVolKnob'),
  lyricsBox: $('#lyricsBox'),
  btnOpenDetail: $('#btnOpenDetail'),
  btnCloseDetail: $('#btnCloseDetail'),
  btnSheetQueue: $('#btnSheetQueue'),
  npLyricsHint: $('#npLyricsHint'),
};

let toastTimer = null;
let fluidBg = null;
let qualityFallbackActive = false;
let playbackBusy = false;
let searchRequestId = 0;
let playbackRequestId = 0;
let cancelActivePlayback = null;

function toast(msg, ms = 2600) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function songKey(song) {
  return `${song.source}:${song.hash || song.songmid || song.id}`;
}

function playIdOf(song) {
  return song.hash || song.songmid || song.id;
}

function setRangeProgress(el, ratio) {
  if (!el) return;
  const p = Math.max(0, Math.min(100, ratio * 100));
  el.style.setProperty('--progress', `${p}%`);
}

function saveQueue() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue: state.queue, currentIndex: state.currentIndex }));
  } catch {}
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.queue)) {
      state.queue = data.queue.filter((song) => SUPPORTED_SOURCES.has(song?.source));
    }
    if (typeof data.currentIndex === 'number' && state.queue.length) {
      state.currentIndex = Math.min(Math.max(data.currentIndex, 0), state.queue.length - 1);
    } else if (!state.queue.length) {
      state.currentIndex = -1;
    }
    saveQueue();
  } catch {}
}

async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { res, data };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('搜索超时，请稍后重试或切换音源');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function apiSearch(keyword, source) {
  const url = `/api/search?q=${encodeURIComponent(keyword)}&source=${encodeURIComponent(source)}&limit=30`;
  const { res, data } = await fetchJsonWithTimeout(url, 15000);
  if (!data) throw new Error('搜索接口返回异常');
  if (!res.ok || data.code !== 0) throw new Error(data.message || '搜索失败');
  return data;
}

function buildDesktopMusicInfo(song) {
  const id = playIdOf(song);
  const desktopMusicInfo = {
    name: song.title || '',
    singer: song.artist || '',
    album: song.album || '',
    musicId: id,
    songmid: song.songmid || id,
    img: song.artwork || '',
    interval: song.duration || 0,
  };
  if (song.hash) desktopMusicInfo.hash = song.hash;
  if (Array.isArray(song.types) && song.types.length) desktopMusicInfo.types = song.types;
  return desktopMusicInfo;
}

async function apiUrl(song, quality) {
  const q = quality || state.quality;
  // 与 lx-music-desktop 的 sendUserApiRequest 数据结构保持一致。
  const body = {
    requestKey: 'request__' + Math.random().toString().slice(2),
    data: {
      source: song.source,
      action: 'musicUrl',
      info: {
        type: q,
        musicInfo: buildDesktopMusicInfo(song),
      },
    },
  };
  const res = await fetch('/api/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json();
  const result = data?.result?.data;
  if (!res.ok || data.code !== 0 || !result?.url) {
    throw new Error(data.message || '无法获取播放地址');
  }
  return {
    url: result.url,
    quality: result.type || q,
    provider: 'ikun · 桌面音源',
    source: data.result.source || song.source,
  };
}

async function apiLyric(song) {
  const id = playIdOf(song);
  const params = new URLSearchParams({ source: song.source, id });
  try {
    const res = await fetch(`/api/lyric?${params}`);
    const data = await res.json();
    return data.lyric || '';
  } catch { return ''; }
}

function parseLRC(text) {
  if (!text) return [];
  const lines = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const times = [...raw.matchAll(re)];
    if (!times.length) continue;
    const content = raw.replace(re, '').trim();
    if (!content) continue;
    for (const m of times) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      lines.push({ time: min * 60 + sec + ms / 1000, text: content });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function setLoading(on) {
  if (!els.loading) return;
  els.loading.hidden = !on;
  els.loading.style.display = on ? 'grid' : 'none';
  if (on) {
    els.loading.removeAttribute('hidden');
  } else {
    els.loading.setAttribute('hidden', '');
  }
}

function setSearchBusy(on, keyword = '', source = state.source) {
  setLoading(on);
  els.form?.setAttribute('aria-busy', on ? 'true' : 'false');
  if (els.searchSubmit) {
    els.searchSubmit.disabled = on;
    els.searchSubmit.classList.toggle('is-loading', on);
    els.searchSubmit.setAttribute('aria-label', on ? '正在搜索' : '提交搜索');
  }
  if (on && els.resultsMeta) {
    els.resultsMeta.textContent = `${SOURCE_LABELS[source] || source} · 正在搜索「${keyword}」`;
  }
}

function applySourceHighlight(source) {
  const src = source || state.source || 'tx';
  const label = SOURCE_LABELS[src] || src;
  const classes = ['src-wy', 'src-tx', 'src-kw', 'src-kg'];
  const setClass = (el) => {
    if (!el || !el.classList) return;
    classes.forEach((c) => el.classList.remove(c));
    el.classList.add('src-' + src);
  };
  setClass(els.sourcePill);
  setClass(els.heroSourcePill);
  if (els.sourcePill) els.sourcePill.textContent = label;
  if (els.heroSourcePill) els.heroSourcePill.textContent = label;
  if (els.sourceHint) {
    els.sourceHint.textContent = '当前：' + String(label).replace(/音乐/g, '') + ' · 点击切换平台后重新搜索';
  }
  if (els.tabs) {
    $$('.chip-tab', els.tabs).forEach((t) => {
      const on = t.dataset.source === src;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
}

function cleanText(str) {
  return String(str ?? '')
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return cleanText(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSongs() {
  const list = state.songs;
  els.songList.innerHTML = '';
  if (!list.length) {
    els.empty.hidden = false;
    updatePlayUI();
    return;
  }
  els.empty.hidden = true;
  const current = state.queue[state.currentIndex];
  const frag = document.createDocumentFragment();
  list.forEach((song, i) => {
    const item = document.createElement('div');
    item.className = 'song-item';
    if (current && songKey(current) === songKey(song)) item.classList.add('active');
    const cover = song.artwork || PLACEHOLDER_COVER;
    item.innerHTML =
      '<div class="idx">' + (i + 1) + '</div>' +
      '<div class="title-cell">' +
        '<img src="' + cover + '" alt="" loading="lazy" onerror="this.src=\'' + PLACEHOLDER_COVER + '\'" />' +
        '<div class="meta">' +
          '<div class="title" title="' + escapeHtml(song.title) + '">' + escapeHtml(song.title) + '</div>' +
          '<div class="sub" title="' + escapeHtml(song.artist) + '">' + escapeHtml(song.artist) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="album" title="' + escapeHtml(song.album || '') + '">' + escapeHtml(song.album || '—') + '</div>' +
      '<div class="dur">' + (song.duration ? formatTime(song.duration) : '—') + '</div>' +
      '<div class="actions">' +
        '<button type="button" class="chip primary" data-act="play">播放</button>' +
        '<button type="button" class="chip" data-act="add">+</button>' +
      '</div>';
    item.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === 'add') {
        e.stopPropagation();
        addToQueue(song, false);
        return;
      }
      playSong(song);
    });
    frag.appendChild(item);
  });
  els.songList.appendChild(frag);
  updatePlayUI();
}

function renderQueue() {
  if (els.queueCount) els.queueCount.textContent = String(state.queue.length);
  if (els.clearQueue) els.clearQueue.disabled = state.queue.length === 0;
  els.queueList.innerHTML = '';
  if (!state.queue.length) {
    els.queueList.innerHTML = '<p class="muted center small" style="padding:16px">播放列表为空，去搜索加点歌吧</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  state.queue.forEach((song, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item' + (i === state.currentIndex ? ' active' : '');
    item.innerHTML =
      '<div><div class="q-title">' + escapeHtml(song.title) + '</div>' +
      '<div class="q-sub">' + escapeHtml(song.artist) + ' · ' +
      escapeHtml(song.sourceLabel || song.source) + '</div></div>' +
      '<button type="button" class="chip chip-rm" data-act="rm" title="从列表移除" aria-label="移除">移除</button>';
    item.addEventListener('click', (e) => {
      if (e.target && e.target.dataset && e.target.dataset.act === 'rm') {
        e.stopPropagation();
        removeFromQueue(i);
        return;
      }
      state.currentIndex = i;
      saveQueue();
      playCurrent();
    });
    frag.appendChild(item);
  });
  els.queueList.appendChild(frag);
}

function updateNowPlaying(song) {
  if (!song) {
    els.npTitle.textContent = '尚未播放';
    els.npArtist.textContent = '选择一首歌曲开始聆听';
    if (els.npSource) {
      els.npSource.hidden = false;
      els.npSource.textContent = '单曲';
    }
    els.coverArt.src = PLACEHOLDER_COVER;
    els.miniCover.src = PLACEHOLDER_COVER;
  if (els.npSheetCover) els.npSheetCover.src = PLACEHOLDER_COVER;
    els.miniTitle.textContent = '未在播放';
    els.miniArtist.textContent = '—';
    if (els.npSheetTitle) els.npSheetTitle.textContent = '未在播放';
    if (els.npSheetArtist) els.npSheetArtist.textContent = '选择一首歌曲开始聆听';
    if (els.npSheetCover) els.npSheetCover.src = PLACEHOLDER_COVER;
    if (els.npSheetSource) els.npSheetSource.textContent = '—';
    if (fluidBg) fluidBg.setArtwork('');
    if (els.ambientCover) {
      els.ambientCover.classList.remove('on');
      els.ambientCover.style.backgroundImage = '';
    }
    return;
  }
  const cover = song.artwork || PLACEHOLDER_COVER;
  const sourceLabel = song.sourceLabel || SOURCE_LABELS[song.source] || song.source;
  els.npTitle.textContent = song.title;
  els.npArtist.textContent = song.artist;
  if (els.npSource) {
    els.npSource.hidden = false;
    els.npSource.textContent = sourceLabel;
  }
  els.coverArt.src = cover;
  els.miniCover.src = cover;
  els.miniTitle.textContent = song.title;
  els.miniArtist.textContent = song.artist;
  if (els.npSheetTitle) els.npSheetTitle.textContent = song.title;
  if (els.npSheetArtist) els.npSheetArtist.textContent = song.artist;
  if (els.npSheetCover) els.npSheetCover.src = cover;
  if (els.npSheetSource) els.npSheetSource.textContent = sourceLabel;
  if (fluidBg) fluidBg.setArtwork(song.artwork || '');
  document.title = song.title + ' - ' + song.artist + ' · linjioujiou Web Music Player';
  if (els.ambientCover) {
    if (song.artwork) {
      els.ambientCover.style.backgroundImage = 'url("' + song.artwork.replace(/"/g, '') + '")';
      els.ambientCover.classList.add('on');
    } else {
      els.ambientCover.classList.remove('on');
    }
  }
}

let lyricScrollRaf = 0;
let lyricPrevIndex = -1;

/** Soft ease with slight overshoot then settle (not flashy) */
function easeOutBackSoft(x) {
  // very mild settle, almost cubic (~2% overshoot)
  const c1 = 1.05;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Focus-centric lyric look:
 * - active: opacity 1, sharp, slight scale
 * - others: opacity/blur grow with distance (future stronger)
 * - staggered delays top→bottom + soft overshoot on transform
 */
function applyLyricFocusStyles(lines, idx, prevIdx) {
  const n = lines.length;
  const goingDown = idx >= prevIdx;
  lines.forEach((el, i) => {
    const dist = idx < 0 ? i + 1 : i - idx; // + future, - past, 0 active
    const abs = Math.abs(dist);

    el.classList.remove('active', 'past', 'future');
    if (idx < 0 || dist > 0) el.classList.add('future');
    else if (dist < 0) el.classList.add('past');
    else el.classList.add('active');

    let opacity;
    let blur;
    let scale;
    let y;

    if (dist === 0) {
      // 当前行：完全不透明，清晰聚焦，极轻放大
      opacity = 1;
      blur = 0;
      scale = 1.04;
      y = 0;
    } else if (dist < 0) {
      // 已播放：略淡、轻模糊，不抢焦点
      const t = Math.min(abs, 8) / 8;
      opacity = 0.5 - t * 0.28; // ~0.50 → ~0.22
      blur = 0.25 + t * 2.1;
      scale = 1 - Math.min(0.05, abs * 0.011);
      y = -Math.min(5, abs * 0.95);
    } else {
      // 未播放：自上而下（距当前越远）透明与模糊递增，仍可读
      const t = Math.min(dist, 10) / 10;
      opacity = 0.58 - t * 0.38; // ~0.58 → ~0.20
      blur = 0.45 + t * 3.2; // ~0.45 → ~3.65px
      scale = 1 - Math.min(0.08, dist * 0.013);
      y = Math.min(8, dist * 1.15);
    }

    opacity = clamp(opacity, 0.16, 1);
    blur = clamp(blur, 0, 4.2);
    scale = clamp(scale, 0.92, 1.06);

    // 滚动牵动：整体从上到下逐行延迟
    let stagger;
    if (goingDown) {
      stagger = Math.min(i * 20 + abs * 6, 220);
    } else {
      // 往回跳时自下而上牵动，仍保持连贯
      stagger = Math.min((n - 1 - i) * 20 + abs * 6, 220);
    }
    // 当前行稍快落下焦点
    if (dist === 0) stagger = Math.min(stagger, 28);

    el.style.setProperty('--lo', opacity.toFixed(3));
    el.style.setProperty('--lb', blur.toFixed(2) + 'px');
    el.style.setProperty('--ls', scale.toFixed(3));
    el.style.setProperty('--ly', y.toFixed(2) + 'px');
    el.style.setProperty('--ld', stagger + 'ms');
  });
}

function scrollLyricsToActive(activeEl) {
  if (!activeEl || !els.lyricsBox || !state.sheetOpen) return;
  const box = els.lyricsBox;
  const boxRect = box.getBoundingClientRect();
  const lineRect = activeEl.getBoundingClientRect();
  // 焦点约在视口上方 32% 处
  const target = lineRect.top - boxRect.top - boxRect.height * 0.32 + box.scrollTop;
  const start = box.scrollTop;
  const delta = Math.max(0, target) - start;
  if (Math.abs(delta) < 0.5) return;

  const dur = clamp(480 + Math.abs(delta) * 0.38, 480, 900);
  const t0 = performance.now();
  if (lyricScrollRaf) cancelAnimationFrame(lyricScrollRaf);

  const frame = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    // 接近 cubic 的柔和减速，几乎无回弹
    const base = easeOutCubic(p);
    const over = easeOutBackSoft(p) - base;
    const eased = base + over * 0.35;
    box.scrollTop = start + delta * eased;
    if (p < 1) lyricScrollRaf = requestAnimationFrame(frame);
    else {
      box.scrollTop = start + delta;
      lyricScrollRaf = 0;
    }
  };
  lyricScrollRaf = requestAnimationFrame(frame);
}

function renderLyrics(raw) {
  state.lyrics = parseLRC(raw);
  state.lyricIndex = -1;
  lyricPrevIndex = -1;
  if (!els.lyricsInner) return;
  if (!state.lyrics.length) {
    els.lyricsInner.innerHTML = raw
      ? '<pre style="white-space:pre-wrap;margin:0">' + escapeHtml(raw) + '</pre>'
      : '<p class="muted center">暂无歌词</p>';
    if (els.npLyricsHint) els.npLyricsHint.textContent = raw ? '纯文本歌词' : '暂无歌词';
    return;
  }
  if (els.npLyricsHint) els.npLyricsHint.textContent = '点击歌词可跳转 · 随播放自动滚动';
  els.lyricsInner.innerHTML = state.lyrics
    .map((l, i) =>
      '<div class="line future" data-i="' +
      i +
      '" data-t="' +
      l.time +
      '">' +
      escapeHtml(l.text) +
      '</div>'
    )
    .join('');
  // 初始：全部按「未播放」渐隐渐模糊铺开
  const lines = $$('.line', els.lyricsInner);
  applyLyricFocusStyles(lines, -1, -1);
}

function syncLyricHighlight(t) {
  if (!state.lyrics.length || !els.lyricsInner) return;
  let idx = -1;
  for (let i = 0; i < state.lyrics.length; i++) {
    if (state.lyrics[i].time <= t + 0.18) idx = i;
    else break;
  }
  if (idx === state.lyricIndex) return;
  const prev = state.lyricIndex;
  state.lyricIndex = idx;
  const lines = $$('.line', els.lyricsInner);
  applyLyricFocusStyles(lines, idx, prev < 0 ? idx : prev);
  lyricPrevIndex = idx;

  const activeEl = idx >= 0 ? lines[idx] : null;
  scrollLyricsToActive(activeEl);
}

function openNowPlayingSheet() {
  if (!els.npSheet) return;
  state.sheetOpen = true;
  els.npSheet.hidden = false;
  els.npSheet.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    els.npSheet.classList.add('is-open');
  });
  document.body.classList.add('np-open');
  if (fluidBg) {
    fluidBg.start();
    fluidBg.setPlaying(!!(audio && !audio.paused));
    const song = state.queue[state.currentIndex];
    if (song) fluidBg.setArtwork(song.artwork || '');
  }
  // resync lyric scroll after open
  if (audio) syncLyricHighlight(audio.currentTime || 0);
}

function closeNowPlayingSheet() {
  if (!els.npSheet) return;
  state.sheetOpen = false;
  els.npSheet.classList.remove('is-open');
  document.body.classList.remove('np-open');
  els.npSheet.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!state.sheetOpen) {
      els.npSheet.hidden = true;
      if (fluidBg) fluidBg.stop();
    }
  }, 320);
}

function addToQueue(song, playNow) {
  const exists = state.queue.findIndex((s) => songKey(s) === songKey(song));
  if (exists >= 0) {
    if (playNow) {
      state.currentIndex = exists;
      saveQueue();
      playCurrent();
    } else toast('已在播放列表中');
    renderQueue();
    return;
  }
  state.queue.push(Object.assign({}, song));
  if (playNow || state.currentIndex < 0) {
    state.currentIndex = state.queue.length - 1;
    saveQueue();
    renderQueue();
    if (playNow || state.queue.length === 1) playCurrent();
  } else {
    saveQueue();
    renderQueue();
    toast('已加入播放列表');
  }
}

function removeFromQueue(index) {
  if (index < 0 || index >= state.queue.length) return;
  state.queue.splice(index, 1);
  if (!state.queue.length) {
    cancelPendingPlayback();
    setPlaybackBusy(false);
    state.currentIndex = -1;
    audio.pause();
    audio.removeAttribute('src');
    state.playing = false;
    updatePlayUI();
    updateNowPlaying(null);
  } else if (index < state.currentIndex) {
    state.currentIndex -= 1;
  } else if (index === state.currentIndex) {
    if (state.currentIndex >= state.queue.length) state.currentIndex = state.queue.length - 1;
    playCurrent();
  }
  saveQueue();
  renderQueue();
  renderSongs();
}

function playSong(song) {
  addToQueue(song, true);
}

function playbackQualityLadder(source, requested) {
  const list = PLATFORM_QUALITY[source] || ['128k', '320k', 'flac'];
  const index = list.indexOf(requested);
  if (index >= 0) return list.slice(0, index + 1).reverse();
  return [requested, ...list.slice().reverse().filter((quality) => quality !== requested)];
}

function playResolvedUrl(url, timeoutMs = 15000) {
  const playbackUrl = location.protocol === 'https:' && url.startsWith('http:')
    ? 'https:' + url.slice(5)
    : url;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancel = () => finish(new DOMException('Playback superseded', 'AbortError'));
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
      if (cancelActivePlayback === cancel) cancelActivePlayback = null;
      if (error) reject(error);
      else resolve();
    };
    const onPlaying = () => finish();
    const onError = () => finish(new Error('音频链接加载失败'));
    const timer = setTimeout(() => finish(new Error('音频加载超时')), timeoutMs);

    audio.addEventListener('playing', onPlaying, { once: true });
    audio.addEventListener('error', onError, { once: true });
    cancelActivePlayback = cancel;
    audio.src = playbackUrl;
    audio.load();
    audio.play().catch(finish);
  });
}

function setPlaybackBusy(on, quality = '') {
  playbackBusy = on;
  const playerBar = document.getElementById('playerBar');
  const heroPlay = document.getElementById('btnHeroPlay');
  playerBar?.setAttribute('aria-busy', on ? 'true' : 'false');
  els.btnPlay?.classList.toggle('is-loading', on);
  if (els.btnPlay) els.btnPlay.disabled = on;
  if (els.npBtnPlay) els.npBtnPlay.disabled = on;
  if (heroPlay) {
    heroPlay.disabled = on;
    const text = heroPlay.querySelector('.hero-play-text');
    if (on && text) text.textContent = quality ? `正在尝试 ${QUALITY_LABELS[quality] || quality}` : '正在解析';
  }
}

function cancelPendingPlayback() {
  playbackRequestId += 1;
  qualityFallbackActive = false;
  if (cancelActivePlayback) cancelActivePlayback();
  cancelActivePlayback = null;
}

async function playCurrent(options = {}) {
  const song = state.queue[state.currentIndex];
  if (!song) return;
  cancelPendingPlayback();
  const requestId = playbackRequestId;
  const resumeAt = Number(options.resumeAt) || 0;
  const previousPlayback = options.preserveCurrentAudio && audio.src
    ? { src: audio.currentSrc || audio.src, time: resumeAt, wasPlaying: !audio.paused }
    : null;
  if (!options.preserveCurrentAudio) audio.pause();
  updateNowPlaying(song);
  renderQueue();
  renderSongs();
  if (els.vinyl) els.vinyl.classList.remove('playing');

  const selectedQuality = els.qualitySelect.value || state.quality || '320k';
  state.quality = selectedQuality;
  localStorage.setItem(QUALITY_KEY, selectedQuality);
  const qualityCandidates = playbackQualityLadder(song.source, selectedQuality);
  const attemptedUrls = new Set();
  let lastError = null;

  qualityFallbackActive = true;
  setPlaybackBusy(true);
  try {
    for (let index = 0; index < qualityCandidates.length; index += 1) {
      if (requestId !== playbackRequestId) return;
      const quality = qualityCandidates[index];
      setPlaybackBusy(true, quality);
      toast('正在解析：' + song.title + ' · ' + (QUALITY_LABELS[quality] || quality), 0);
      let candidateLoaded = false;
      try {
        const data = await apiUrl(song, quality);
        if (requestId !== playbackRequestId) return;
        const actualQuality = data.quality || quality;
        const actualIndex = qualityCandidates.indexOf(actualQuality);
        if (actualIndex > index) index = actualIndex;
        if (!data.url || attemptedUrls.has(data.url)) continue;
        attemptedUrls.add(data.url);
        candidateLoaded = true;
        await playResolvedUrl(data.url);
        if (requestId !== playbackRequestId) return;
        if (resumeAt > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1));
        }

        state.playing = true;
        updatePlayUI();
        const downgraded = actualQuality !== selectedQuality;
        toast(
          downgraded
            ? '当前音质不可用，已自动降级至 ' + (QUALITY_LABELS[actualQuality] || actualQuality)
            : '正在播放 · ' + (data.provider || 'lx-source') + ' · ' + (QUALITY_LABELS[actualQuality] || actualQuality),
          2600
        );
        apiLyric(song).then(renderLyrics);
        return;
      } catch (error) {
        if (error?.name === 'AbortError' || requestId !== playbackRequestId) return;
        lastError = error;
        console.warn('音质播放失败，尝试降级：', quality, error);
        if (candidateLoaded || !previousPlayback) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }
      }
    }

    if (previousPlayback) {
      audio.src = previousPlayback.src;
      audio.load();
      const restoreTime = () => {
        if (Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(previousPlayback.time, Math.max(0, audio.duration - 1));
        }
      };
      audio.addEventListener('loadedmetadata', restoreTime, { once: true });
      if (previousPlayback.wasPlaying) await audio.play().catch(() => {});
      updatePlayUI();
      toast('该音质不可用，已继续使用当前播放音质');
      return;
    }

    state.playing = false;
    updatePlayUI();
    toast('所有音质均播放失败：' + (lastError?.message || '未知错误'));
  } finally {
    if (requestId === playbackRequestId) {
      qualityFallbackActive = false;
      setPlaybackBusy(false);
      updatePlayUI();
    }
  }
}

function updatePlayUI() {
  const playing = !!(audio && !audio.paused && audio.src && !audio.ended);
  state.playing = playing;

  const setIconPair = (root, playSel, pauseSel) => {
    if (!root) return;
    root.classList.toggle('is-playing', playing);
    root.dataset.playing = playing ? 'true' : 'false';
    root.setAttribute('aria-label', playing ? '暂停' : '播放');
    root.setAttribute('title', playing ? '暂停' : '播放');
    const playIcon = root.querySelector(playSel);
    const pauseIcon = root.querySelector(pauseSel);
    if (playIcon) {
      playIcon.hidden = playing;
      playIcon.style.setProperty('display', playing ? 'none' : 'block', 'important');
    }
    if (pauseIcon) {
      pauseIcon.hidden = !playing;
      pauseIcon.style.setProperty('display', playing ? 'block' : 'none', 'important');
    }
  };

  setIconPair(els.btnPlay, '.icon-play', '.icon-pause');
  setIconPair(els.npBtnPlay, '.icon-play', '.icon-pause');
  if (els.vinyl) els.vinyl.classList.toggle('playing', playing);
  if (els.miniEq) els.miniEq.classList.toggle('on', playing);

  const hasQueue = state.queue.length > 0;
  const hasCurrent = Boolean(state.queue[state.currentIndex]);
  const heroPlay = document.getElementById('btnHeroPlay');
  setIconPair(heroPlay, '.hero-play', '.hero-pause');
  if (heroPlay) {
    const text = heroPlay.querySelector('.hero-play-text');
    const emptyAction = state.songs.length ? '播放第一首' : '搜索歌曲';
    if (text && !playbackBusy) text.textContent = hasCurrent ? (playing ? '暂停' : '播放') : emptyAction;
    if (!hasCurrent && !playbackBusy) {
      heroPlay.setAttribute('aria-label', emptyAction);
      heroPlay.setAttribute('title', emptyAction);
    } else if (!playbackBusy) {
      heroPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
      heroPlay.setAttribute('title', playing ? '暂停' : '播放');
    }
  }
  if (fluidBg) fluidBg.setPlaying(playing);

  if (els.btnPlay) els.btnPlay.disabled = playbackBusy || !hasCurrent;
  if (els.btnPrev) els.btnPrev.disabled = !hasQueue;
  if (els.btnNext) els.btnNext.disabled = !hasQueue;
  if (els.btnMode) els.btnMode.disabled = !hasQueue;
  if (els.npBtnPrev) els.npBtnPrev.disabled = !hasQueue;
  if (els.npBtnNext) els.npBtnNext.disabled = !hasQueue;
  if (els.npBtnMode) els.npBtnMode.disabled = !hasQueue;
  if (els.npBtnPlay) els.npBtnPlay.disabled = playbackBusy || !hasCurrent;
  if (els.btnOpenDetail) els.btnOpenDetail.disabled = !hasCurrent;
  if (els.seekBar) els.seekBar.disabled = !audio.src;
  if (heroPlay) heroPlay.disabled = playbackBusy;
}

function nextIndex() {
  const n = state.queue.length;
  if (!n) return -1;
  if (state.mode === 'single') return state.currentIndex;
  if (state.mode === 'shuffle') {
    if (n === 1) return 0;
    let i = state.currentIndex;
    while (i === state.currentIndex) i = Math.floor(Math.random() * n);
    return i;
  }
  if (state.currentIndex + 1 < n) return state.currentIndex + 1;
  return state.mode === 'loop' ? 0 : -1;
}

function prevIndex() {
  const n = state.queue.length;
  if (!n) return -1;
  if (state.mode === 'shuffle') return nextIndex();
  if (state.currentIndex - 1 >= 0) return state.currentIndex - 1;
  return state.mode === 'loop' ? n - 1 : state.currentIndex;
}

function playNext() {
  const i = nextIndex();
  if (i < 0) {
    state.playing = false;
    updatePlayUI();
    return;
  }
  if (state.mode === 'single') {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  state.currentIndex = i;
  saveQueue();
  playCurrent();
}

function playPrev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const i = prevIndex();
  if (i < 0) return;
  state.currentIndex = i;
  saveQueue();
  playCurrent();
}

function updateModeButton() {
  const path = MODE_PATHS[state.mode] || MODE_PATHS.order;
  const label = MODE_LABELS[state.mode] || MODE_LABELS.order;
  const apply = (btn) => {
    if (!btn) return;
    const svgPath = btn.querySelector('svg path');
    if (svgPath) svgPath.setAttribute('d', path);
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.dataset.mode = state.mode;
    btn.classList.toggle('is-active-mode', state.mode !== 'order');
  };
  apply(els.btnMode);
  apply(els.npBtnMode);
}

function cycleMode() {
  const order = ['order', 'loop', 'single', 'shuffle'];
  const idx = order.indexOf(state.mode);
  state.mode = order[(idx + 1) % order.length];
  updateModeButton();
  toast(MODE_LABELS[state.mode]);
}

function setMuteUI(muted) {
  // Bottom bar mute only — detail page has volume popover, no mute button
  const btn = els.btnMute;
  if (!btn) return;
  const on = btn.querySelector('.vol-on');
  const off = btn.querySelector('.vol-off');
  if (on && off) {
    on.hidden = muted;
    off.hidden = !muted;
  }
  btn.title = muted ? '取消静音' : '静音';
  btn.setAttribute('aria-label', muted ? '取消静音' : '静音');
  btn.classList.toggle('is-muted', !!muted);
}

function setVolumeUI(percent) {
  const p = clamp(Number(percent) || 0, 0, 100);
  if (els.volBar) {
    els.volBar.value = String(p);
    setRangeProgress(els.volBar, p / 100);
  }
  if (els.npVolBar) {
    els.npVolBar.value = String(p);
    setRangeProgress(els.npVolBar, p / 100);
  }
  // Full-panel vertical slider: bottom = 0%, top = 100% of entire popover
  const track = els.npVolPopover || els.npVolHit;
  if (track) track.style.setProperty('--vol', p + '%');
  if (els.npVolHit) {
    els.npVolHit.style.setProperty('--vol', p + '%');
    els.npVolHit.setAttribute('aria-valuenow', String(p));
  }
  if (els.npVolFill) {
    els.npVolFill.style.height = p + '%';
    els.npVolFill.classList.toggle('is-full', p >= 99.5);
    els.npVolFill.classList.toggle('is-empty', p <= 0.5);
  }
  if (els.npVolKnob) {
    els.npVolKnob.style.bottom = p + '%';
  }
  setMuteUI(p === 0);
}

function applyVolume(percent, { persist = true } = {}) {
  const p = clamp(Number(percent) || 0, 0, 100);
  audio.volume = p / 100;
  setVolumeUI(p);
  if (persist) localStorage.setItem(VOLUME_KEY, String(p));
}

function toggleMute() {
  if (audio.volume > 0) {
    audio.dataset.prevVol = String(els.volBar ? els.volBar.value : Math.round(audio.volume * 100));
    applyVolume(0, { persist: false });
  } else {
    const prev = Number(audio.dataset.prevVol || localStorage.getItem(VOLUME_KEY) || 80);
    applyVolume(prev || 80, { persist: true });
  }
}

function setNpVolumeOpen(open) {
  const pop = els.npVolPopover;
  const btn = els.npBtnVol;
  const wrap = els.npVolWrap;
  if (!pop || !btn) return;
  const on = !!open;
  pop.hidden = !on;
  btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  btn.classList.toggle('is-open', on);
  if (wrap) wrap.classList.toggle('is-open', on);
  if (on) {
    const focusEl = els.npVolHit || pop;
    try { focusEl.focus({ preventScroll: true }); } catch {}
  }
}

function volumeFromPointerY(clientY) {
  // Always map against the whole panel height (edge to edge)
  const el = els.npVolPopover || els.npVolHit;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const ratio = 1 - (clientY - rect.top) / rect.height;
  return clamp(Math.round(ratio * 100), 0, 100);
}

function setupNpVolumePopover() {
  if (!els.npBtnVol || !els.npVolPopover) return;
  const panel = els.npVolPopover;
  const hit = els.npVolHit || panel;
  let dragging = false;
  let activePointerId = null;

  const setFromEvent = (e) => {
    const y = e.clientY != null ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY);
    if (y == null) return;
    applyVolume(volumeFromPointerY(y), { persist: true });
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    activePointerId = e.pointerId;
    if (els.npVolWrap) els.npVolWrap.classList.add('is-dragging');
    if (panel.setPointerCapture && e.pointerId != null) {
      try { panel.setPointerCapture(e.pointerId); } catch {}
    }
    setFromEvent(e);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    if (activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;
    e.preventDefault();
    setFromEvent(e);
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    if (activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    if (els.npVolWrap) els.npVolWrap.classList.remove('is-dragging');
    if (panel.releasePointerCapture && e.pointerId != null) {
      try { panel.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  // Entire panel surface is interactive (edge to edge)
  panel.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('pointercancel', onPointerUp);
  if (hit && hit !== panel) hit.addEventListener('pointerdown', onPointerDown);

  hit.addEventListener('keydown', (e) => {
    const cur = Number(els.npVolBar ? els.npVolBar.value : Math.round((audio.volume || 0) * 100));
    let next = cur;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = cur + 5;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = cur - 5;
    else if (e.key === 'Home') next = 100;
    else if (e.key === 'End') next = 0;
    else if (e.key === 'PageUp') next = cur + 10;
    else if (e.key === 'PageDown') next = cur - 10;
    else return;
    e.preventDefault();
    applyVolume(next, { persist: true });
  });

  els.npBtnVol.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = els.npVolPopover.hidden;
    setNpVolumeOpen(open);
  });

  if (els.npVolWrap) {
    els.npVolWrap.addEventListener('click', (e) => e.stopPropagation());
  }

  document.addEventListener('click', () => {
    if (els.npVolPopover && !els.npVolPopover.hidden) setNpVolumeOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.npVolPopover && !els.npVolPopover.hidden) {
      setNpVolumeOpen(false);
    }
  });

  if (els.btnCloseDetail) {
    els.btnCloseDetail.addEventListener('click', () => setNpVolumeOpen(false));
  }
}

async function doSearch(keyword) {
  const q = keyword.trim();
  if (!q) {
    els.input?.focus();
    return;
  }
  const requestSource = state.source;
  const requestId = ++searchRequestId;
  setSearchBusy(true, q, requestSource);
  els.empty.hidden = true;
  try {
    const data = await apiSearch(q, requestSource);
    if (requestId !== searchRequestId) return;
    state.songs = data.songs || [];
    els.resultsTitle.textContent = '搜索结果';
    els.resultsMeta.textContent = (data.sourceLabel || SOURCE_LABELS[requestSource]) + ' ·「' + q + '」· ' + state.songs.length + ' 首';
    applySourceHighlight(requestSource);
    if (els.sourceHint) {
      const resultLabel = data.sourceLabel || SOURCE_LABELS[requestSource] || requestSource;
      els.sourceHint.textContent = '当前：' + String(resultLabel).replace(/音乐/g, '') + ' · 共 ' + (state.songs.length || 0) + ' 首';
    }
    renderSongs();
    if (!state.songs.length) {
      els.empty.hidden = false;
      const h = els.empty.querySelector('h3');
      const p = els.empty.querySelector('p');
      if (h) h.textContent = '没有找到相关歌曲';
      if (p) p.textContent = '换个关键词，或切换其他音乐平台试试。';
      els.resultsMeta.textContent = `${data.sourceLabel || SOURCE_LABELS[requestSource]} ·「${q}」· 暂无结果`;
    }
  } catch (err) {
    if (requestId !== searchRequestId) return;
    toast(err.message || '搜索失败');
    state.songs = [];
    renderSongs();
    els.empty.hidden = false;
    const h = els.empty.querySelector('h3');
    const p = els.empty.querySelector('p');
    if (h) h.textContent = '搜索失败，请稍后重试';
    if (p) p.textContent = '可以重试，或切换其他音乐平台。';
    els.resultsMeta.textContent = `${SOURCE_LABELS[requestSource] || requestSource} ·「${q}」· 搜索失败`;
  } finally {
    if (requestId === searchRequestId) setSearchBusy(false);
  }
}

function bindEvents() {
  const heroPlay = document.getElementById('btnHeroPlay');
  if (heroPlay) {
    heroPlay.addEventListener('click', async () => {
      if (state.queue.length) {
        if (state.currentIndex < 0) state.currentIndex = 0;
        if (audio.src && !audio.paused) {
          audio.pause();
          state.playing = false;
          updatePlayUI();
        } else if (audio.src) {
          try {
            await audio.play();
            state.playing = true;
            updatePlayUI();
          } catch (err) {
            toast(err.message || '播放失败');
          }
        } else {
          playCurrent();
        }
      } else if (state.songs.length) {
        playSong(state.songs[0]);
      } else {
        els.input?.focus();
        toast('先搜索一首歌吧');
      }
    });
  }

  const navSearch = document.getElementById('navSearch');
  if (navSearch) {
    navSearch.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      navSearch.classList.add('active');
      els.input?.focus();
      els.input?.select();
    });
  }
  const navHome = document.getElementById('navHome');
  if (navHome) {
    navHome.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      navHome.classList.add('active');
      document.getElementById('mainContent')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  const navLibrary = document.getElementById('navLibrary');
  if (navLibrary) {
    navLibrary.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      navLibrary.classList.add('active');
      document.querySelector('.sidebar-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (state.queue.length === 0) toast('播放列表还是空的');
    });
  }

  els.form && els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    doSearch(els.input.value);
  });

  if (els.tabs) els.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-source]');
    if (!btn) return;
    const next = btn.dataset.source;
    if (next === state.source && !els.input.value.trim()) {
      toast('当前已是' + (SOURCE_LABELS[next] || next));
      return;
    }
    state.source = next;
    renderQualityOptions(next);
    applySourceHighlight(next);
    toast('已切换到 ' + (SOURCE_LABELS[next] || next), 1200);
    if (els.input.value.trim()) doSearch(els.input.value);
  });

  els.btnPlay.addEventListener('click', async () => {
    if (!audio.src) {
      if (state.queue.length) {
        if (state.currentIndex < 0) state.currentIndex = 0;
        playCurrent();
      } else toast('请先搜索并选择歌曲');
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
        state.playing = true;
        updatePlayUI();
      } catch (err) {
        toast(err.message || '播放失败');
        state.playing = false;
        updatePlayUI();
      }
    } else {
      audio.pause();
      state.playing = false;
      updatePlayUI();
    }
  });

  els.btnNext.addEventListener('click', playNext);
  els.btnPrev.addEventListener('click', playPrev);
  els.btnMode.addEventListener('click', cycleMode);

  els.clearQueue.addEventListener('click', () => {
    cancelPendingPlayback();
    setPlaybackBusy(false);
    state.queue = [];
    state.currentIndex = -1;
    audio.pause();
    audio.removeAttribute('src');
    state.playing = false;
    updatePlayUI();
    updateNowPlaying(null);
    renderLyrics('');
    saveQueue();
    renderQueue();
    renderSongs();
    toast('已清空播放列表');
  });

  els.seekBar.addEventListener('input', () => {
    state.seeking = true;
    setRangeProgress(els.seekBar, Number(els.seekBar.value) / 1000);
  });
  els.seekBar.addEventListener('change', () => {
    if (!audio.duration) return;
    audio.currentTime = (Number(els.seekBar.value) / 1000) * audio.duration;
    state.seeking = false;
  });

  if (els.volBar) {
    els.volBar.addEventListener('input', () => {
      applyVolume(Number(els.volBar.value), { persist: true });
    });
  }
  if (els.npVolBar) {
    els.npVolBar.addEventListener('input', () => {
      applyVolume(Number(els.npVolBar.value), { persist: true });
    });
  }
  if (els.btnMute) els.btnMute.addEventListener('click', toggleMute);
  setupNpVolumePopover();

  els.qualitySelect.addEventListener('change', () => {
    state.quality = els.qualitySelect.value;
    localStorage.setItem(QUALITY_KEY, state.quality);
    const label = QUALITY_LABELS[state.quality] || state.quality;
    const currentSong = state.queue[state.currentIndex];
    if (currentSong && audio.src) {
      const resumeAt = audio.currentTime || 0;
      toast('正在切换到 ' + label, 0);
      playCurrent({ resumeAt, preserveCurrentAudio: true });
    } else {
      toast('默认音质已设为 ' + label);
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!state.seeking && audio.duration) {
      const ratio = audio.currentTime / audio.duration;
      const v = String(Math.floor(ratio * 1000));
      els.seekBar.value = v;
      setRangeProgress(els.seekBar, ratio);
      if (els.npSeekBar) {
        els.npSeekBar.value = v;
        setRangeProgress(els.npSeekBar, ratio);
      }
    }
    const cur = formatTime(audio.currentTime);
    els.curTime.textContent = cur;
    if (els.npCurTime) els.npCurTime.textContent = cur;
    syncLyricHighlight(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => {
    const d = formatTime(audio.duration);
    els.durTime.textContent = d;
    if (els.npDurTime) els.npDurTime.textContent = d;
  });
  audio.addEventListener('ended', playNext);
  audio.addEventListener('play', () => { state.playing = true; updatePlayUI(); });
  audio.addEventListener('pause', () => { state.playing = false; updatePlayUI(); });
  audio.addEventListener('error', () => {
    if (!qualityFallbackActive) toast('音频加载失败，可能是链接失效或跨域限制');
  });

  // Now-playing detail sheet
  const togglePlay = async () => {
    if (!audio.src) {
      if (state.queue.length) {
        if (state.currentIndex < 0) state.currentIndex = 0;
        playCurrent();
      } else toast('请先搜索并选择歌曲');
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
        state.playing = true;
        updatePlayUI();
      } catch (err) {
        toast(err.message || '播放失败');
      }
    } else {
      audio.pause();
      state.playing = false;
      updatePlayUI();
    }
  };

  if (els.btnOpenDetail) {
    els.btnOpenDetail.addEventListener('click', () => {
      openNowPlayingSheet();
    });
  }
  if (els.btnCloseDetail) {
    els.btnCloseDetail.addEventListener('click', () => closeNowPlayingSheet());
  }
  if (els.btnSheetQueue) {
    els.btnSheetQueue.addEventListener('click', () => {
      closeNowPlayingSheet();
      document.querySelector('.sidebar-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const navLibrary = document.getElementById('navLibrary');
      if (navLibrary) {
        document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
        navLibrary.classList.add('active');
      }
    });
  }
  if (els.npBtnPlay) els.npBtnPlay.addEventListener('click', togglePlay);
  if (els.npBtnNext) els.npBtnNext.addEventListener('click', playNext);
  if (els.npBtnPrev) els.npBtnPrev.addEventListener('click', playPrev);
  if (els.npBtnMode) els.npBtnMode.addEventListener('click', cycleMode);

  if (els.npSeekBar) {
    els.npSeekBar.addEventListener('input', () => {
      state.seeking = true;
      setRangeProgress(els.npSeekBar, Number(els.npSeekBar.value) / 1000);
      if (els.seekBar) {
        els.seekBar.value = els.npSeekBar.value;
        setRangeProgress(els.seekBar, Number(els.npSeekBar.value) / 1000);
      }
    });
    els.npSeekBar.addEventListener('change', () => {
      if (!audio.duration) { state.seeking = false; return; }
      audio.currentTime = (Number(els.npSeekBar.value) / 1000) * audio.duration;
      state.seeking = false;
    });
  }

  if (els.lyricsInner) {
    els.lyricsInner.addEventListener('click', (e) => {
      const line = e.target.closest('.line');
      if (!line || !audio.duration) return;
      const t = Number(line.dataset.t);
      if (!Number.isFinite(t)) return;
      audio.currentTime = Math.min(t, audio.duration - 0.05);
      syncLyricHighlight(audio.currentTime);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.sheetOpen) {
      e.preventDefault();
      closeNowPlayingSheet();
    }
  });
  if ('mediaSession' in navigator) {
    audio.addEventListener('play', () => {
      const song = state.queue[state.currentIndex];
      if (!song) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album || '',
        artwork: song.artwork ? [{ src: song.artwork, sizes: '300x300', type: 'image/jpeg' }] : [],
      });
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }
}

// 拉取各平台音质映射；失败时沿用内置兜底 PLATFORM_QUALITY
async function loadPlatforms() {
  try {
    const res = await fetch('/api/platforms');
    const data = await res.json();
    if (data && data.code === 0 && Array.isArray(data.platforms)) {
      const map = {};
      for (const p of data.platforms) {
        if (p.id && Array.isArray(p.qualities)) map[p.id] = p.qualities.map((q) => q.id || q);
      }
      if (Object.keys(map).length) PLATFORM_QUALITY = map;
      if (data.qualityLabels) Object.assign(QUALITY_LABELS, data.qualityLabels);
    }
  } catch {}
  renderQualityOptions(state.source);
}

// 按当前平台动态渲染音质下拉；保留上次选择，不存在时回退到 320k
function renderQualityOptions(source) {
  const src = source || state.source || 'tx';
  const list = PLATFORM_QUALITY[src] || ['128k', '320k', 'flac'];
  const prev = state.quality || '320k';
  els.qualitySelect.innerHTML = list
    .map((q) => '<option value="' + q + '">' + (QUALITY_LABELS[q] || q) + ' · ' + q + '</option>')
    .join('');
  const keep = list.includes(prev) ? prev : (list.includes('320k') ? '320k' : list[list.length - 1]);
  state.quality = keep;
  els.qualitySelect.value = keep;
  localStorage.setItem(QUALITY_KEY, keep);
}
function init() {
  loadQueue();
  loadPlatforms();  // 音质选项由 renderQualityOptions 动态填充并设值
  const vol = Number(localStorage.getItem(VOLUME_KEY) || 80);
  applyVolume(Number.isFinite(vol) ? vol : 80, { persist: false });
  updateModeButton();
  els.coverArt.src = PLACEHOLDER_COVER;
  els.miniCover.src = PLACEHOLDER_COVER;
  if (els.npSheetCover) els.npSheetCover.src = PLACEHOLDER_COVER;
  applySourceHighlight(state.source);
  renderQueue();
  if (state.queue[state.currentIndex]) updateNowPlaying(state.queue[state.currentIndex]);
  bindEvents();
  updatePlayUI();
  if (els.npSheetBg) {
    fluidBg = createFluidBackground({
      sheet: els.npSheet,
      bg: els.npSheetBg,
      layer: els.npFluidLayer,
      base: els.npFluidBase,
      audio,
    });
    if (state.queue[state.currentIndex]) {
      fluidBg.setArtwork(state.queue[state.currentIndex].artwork || '');
    }
  }
  if (!state.songs.length) els.empty.hidden = false;
}

init();
