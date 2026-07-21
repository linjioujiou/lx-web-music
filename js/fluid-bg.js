/**
 * Apple Music style fluid gradient background
 * - palette from album artwork
 * - slow flowing blobs
 * - beat / energy reactive jumps while playing
 */
const DEFAULT_PALETTE = ['#2f6fed', '#7b3fe4', '#e0457b', '#f0a202', '#1db954'];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

/** Keep hue; only mild polish so fluid colors stay true to cover */
function polishColor(r, g, b, mode = 'keep') {
  let { h, s, l } = rgbToHsl(r, g, b);
  if (mode === 'keep') {
    // barely nudge for gradient readability
    s = clamp(s * 1.06, 0.08, 0.95);
    l = clamp(l, 0.14, 0.78);
  } else if (mode === 'vivid') {
    s = clamp(s * 1.18 + 0.04, 0.2, 0.95);
    l = clamp(l * 0.96 + 0.02, 0.2, 0.68);
  } else if (mode === 'deep') {
    s = clamp(s * 1.1, 0.12, 0.9);
    l = clamp(l * 0.62, 0.1, 0.42);
  } else if (mode === 'soft') {
    s = clamp(s * 0.92, 0.06, 0.75);
    l = clamp(l * 1.08 + 0.04, 0.22, 0.72);
  }
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function colorDist2(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  // slight luma weighting for perceptual distance
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

function hashPalette(seed, count = 5) {
  let h = 2166136261;
  const str = String(seed || 'lx');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const colors = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const hue = ((h >>> 0) % 360) / 360;
    const sat = 0.55 + ((h >>> 8) % 30) / 100;
    const light = 0.38 + ((h >>> 16) % 22) / 100;
    const rgb = hslToRgb(hue, sat, light);
    colors.push(rgbToHex(rgb.r, rgb.g, rgb.b));
  }
  return colors;
}

function coverProxyUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) return url;
  return '/api/cover?url=' + encodeURIComponent(url);
}

function loadImage(url, useCors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cover load failed'));
    img.src = url;
  });
}

function samplePixels(img, size = 72) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // cover-fit center crop for more representative album colors
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(size / iw, size / ih);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Weighted k-means on RGB for dominant palette closer to cover */
function clusterColors(data, k = 5, rounds = 10) {
  const samples = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 220) continue;
    // keep nearly all cover colors; only drop pure transparent-ish extremes
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 510;
    // allow dark and light but skip pure white / pure black noise
    if (l < 0.03 || l > 0.97) continue;
    // edge-ish sampling weight: every pixel, but prefer mid saturation slightly in weight later
    samples.push({ r, g, b });
  }
  if (!samples.length) return [];

  // seed centers from quantized histogram peaks (more stable than random)
  const hist = new Map();
  for (const p of samples) {
    const key = ((p.r >> 3) << 10) | ((p.g >> 3) << 5) | (p.b >> 3);
    const cur = hist.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1; cur.r += p.r; cur.g += p.g; cur.b += p.b;
    hist.set(key, cur);
  }
  const peaks = [...hist.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .sort((a, b) => b.n - a.n);

  const centers = [];
  for (const p of peaks) {
    if (centers.length >= k) break;
    const tooClose = centers.some((c) => colorDist2(c, p) < 900);
    if (!tooClose) centers.push({ r: p.r, g: p.g, b: p.b });
  }
  // fill seeds if needed
  let guard = 0;
  while (centers.length < k && guard < samples.length) {
    const p = samples[(guard * 97) % samples.length];
    guard += 1;
    const tooClose = centers.some((c) => colorDist2(c, p) < 700);
    if (!tooClose) centers.push({ r: p.r, g: p.g, b: p.b });
  }
  while (centers.length < k) centers.push({ ...samples[centers.length % samples.length] });

  for (let round = 0; round < rounds; round++) {
    const acc = centers.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));
    for (const p of samples) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = colorDist2(centers[i], p);
        if (d < bd) { bd = d; bi = i; }
      }
      const { s, l } = rgbToHsl(p.r, p.g, p.b);
      // weight: population + slight boost for chromatic colors that still exist on cover
      const w = 1 + s * 0.55 + (l > 0.15 && l < 0.85 ? 0.15 : 0);
      acc[bi].r += p.r * w;
      acc[bi].g += p.g * w;
      acc[bi].b += p.b * w;
      acc[bi].w += w;
    }
    for (let i = 0; i < centers.length; i++) {
      if (acc[i].w > 0) {
        centers[i] = {
          r: acc[i].r / acc[i].w,
          g: acc[i].g / acc[i].w,
          b: acc[i].b / acc[i].w,
          w: acc[i].w,
        };
      } else {
        centers[i].w = 0;
      }
    }
  }

  // final weights by nearest assignment count
  const weights = centers.map(() => 0);
  for (const p of samples) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = colorDist2(centers[i], p);
      if (d < bd) { bd = d; bi = i; }
    }
    weights[bi] += 1;
  }

  return centers
    .map((c, i) => ({ r: c.r, g: c.g, b: c.b, n: weights[i] || c.w || 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
}

function expandFromReal(colors, count) {
  const out = colors.slice();
  let i = 0;
  while (out.length < count && colors.length) {
    const base = colors[i % colors.length];
    const rgb = hexToRgb(base);
    const mode = out.length % 3 === 0 ? 'deep' : out.length % 3 === 1 ? 'soft' : 'vivid';
    const next = polishColor(rgb.r, rgb.g, rgb.b, mode);
    const tooClose = out.some((p) => {
      const o = hexToRgb(p);
      const n = hexToRgb(next);
      return colorDist2(o, n) < 500;
    });
    if (!tooClose) out.push(next);
    else {
      // shift hue tiny amount still from same base
      let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
      h = (h + 0.04 * (out.length + 1)) % 1;
      const shifted = hslToRgb(h, s, clamp(l * (0.85 + (out.length % 3) * 0.08), 0.12, 0.75));
      out.push(rgbToHex(shifted.r, shifted.g, shifted.b));
    }
    i += 1;
    if (i > count * 6) break;
  }
  while (out.length < count) out.push(out[out.length - 1] || '#334455');
  return out.slice(0, count);
}

async function extractPalette(url, count = 5) {
  if (!url || url.startsWith('data:image/svg')) {
    return hashPalette(url || 'default', count);
  }

  const candidates = [];
  // Prefer same-origin proxy so canvas is never CORS-tainted
  if (/^https?:/i.test(url)) candidates.push(coverProxyUrl(url));
  candidates.push(url);

  let lastErr = null;
  for (const src of candidates) {
    try {
      const img = await loadImage(src, true);
      let data;
      try {
        data = samplePixels(img, 80);
      } catch (err) {
        lastErr = err;
        continue;
      }

      // overall average for base (true cover mean)
      let ar = 0, ag = 0, ab = 0, an = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 220) continue;
        ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; an += 1;
      }
      const mean = an
        ? { r: ar / an, g: ag / an, b: ab / an }
        : { r: 40, g: 40, b: 48 };

      const clusters = clusterColors(data, Math.max(count, 6), 12);
      if (!clusters.length) {
        const only = polishColor(mean.r, mean.g, mean.b, 'keep');
        return expandFromReal([only], count);
      }

      // rank: dominance first, mild preference for non-gray that still exists on cover
      const ranked = clusters
        .map((c) => {
          const { s, l } = rgbToHsl(c.r, c.g, c.b);
          const score = c.n * (1 + s * 0.35) * (l > 0.08 && l < 0.92 ? 1.05 : 0.85);
          return { ...c, score, s, l };
        })
        .sort((a, b) => b.score - a.score);

      const picked = [];
      // always include true mean as first anchor (most cover-faithful)
      picked.push(polishColor(mean.r, mean.g, mean.b, 'keep'));

      for (const c of ranked) {
        if (picked.length >= count) break;
        const hex = polishColor(c.r, c.g, c.b, c.s < 0.18 ? 'keep' : 'vivid');
        const rgb = hexToRgb(hex);
        const tooClose = picked.some((p) => colorDist2(hexToRgb(p), rgb) < 1100);
        if (!tooClose) picked.push(hex);
      }

      // if still short, take more clusters with softer distance
      if (picked.length < count) {
        for (const c of ranked) {
          if (picked.length >= count) break;
          const hex = polishColor(c.r, c.g, c.b, 'keep');
          const rgb = hexToRgb(hex);
          const tooClose = picked.some((p) => colorDist2(hexToRgb(p), rgb) < 550);
          if (!tooClose) picked.push(hex);
        }
      }

      return expandFromReal(picked, count);
    } catch (err) {
      lastErr = err;
    }
  }

  console.warn('palette extract failed', lastErr);
  return hashPalette(url, count);
}

function darkenHex(hex, amount = 0.55) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * amount, g * amount, b * amount);
}

export function createFluidBackground({ sheet, bg, layer, base, audio }) {
  const blobs = [];
  const BLOB_COUNT = 5;
  let palette = DEFAULT_PALETTE.slice();
  let artworkKey = '';
  let running = false;
  let raf = 0;
  let playing = false;
  let t0 = performance.now();
  let lastFrameAt = 0;

  // audio graph
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let sourceNode = null;
  let graphFailed = false;

  // display envelopes
  let smooth = { bass: 0, mid: 0, high: 0, avg: 0, beat: 0, energy: 0 };

  // onset / rhythm
  let prevBassRaw = 0;
  let prevKickRaw = 0;
  let prevMidRaw = 0;
  let prevAvgRaw = 0;
  let beatHold = 0;
  let lastBeatAt = 0;
  let fluxMean = 0.015;
  let fluxVar = 0.00025;
  let energyMean = 0.12;
  let energyVar = 0.008;
  let energyPeak = 0.2; // recent peak for relative dynamics
  let rhythmicScore = 0;
  let isRhythmic = false;
  let beatIntervalEst = 0.5; // sec
  let lastStrongOnsetAt = 0;
  let onsetHistory = [];
  let recentOnsets = []; // short window for peak pick
  let usingSynthetic = false;
  let warmFrames = 0;

  // per-blob delayed beat impulses (organic multi-layer kick)
  const blobBeat = [0, 0, 0, 0, 0];

  const layout = [
    { x: 18, y: 22, size: 0.72, phase: 0.0, speed: 0.20, band: 'bass', lag: 0.00, weight: 1.15 },
    { x: 72, y: 28, size: 0.64, phase: 1.3, speed: 0.17, band: 'mid', lag: 0.045, weight: 1.00 },
    { x: 48, y: 68, size: 0.78, phase: 2.2, speed: 0.14, band: 'high', lag: 0.09, weight: 0.72 },
    { x: 28, y: 58, size: 0.55, phase: 3.5, speed: 0.23, band: 'mid', lag: 0.03, weight: 0.95 },
    { x: 78, y: 62, size: 0.58, phase: 4.1, speed: 0.19, band: 'bass', lag: 0.07, weight: 1.10 },
  ];

  function ensureBlobs() {
    if (!layer) return;
    if (blobs.length) return;
    layer.innerHTML = '';
    for (let i = 0; i < BLOB_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'np-blob';
      el.dataset.i = String(i);
      const L = layout[i];
      el.style.setProperty('--size', (L.size * 100) + 'vmax');
      el.style.setProperty('--ox', L.x + '%');
      el.style.setProperty('--oy', L.y + '%');
      layer.appendChild(el);
      blobs.push(el);
    }
  }

  function applyPalette(colors) {
    palette = colors && colors.length ? colors : DEFAULT_PALETTE.slice();
    ensureBlobs();
    if (base) {
      const c0 = palette[0];
      const c1 = palette[1] || palette[0];
      const c2 = palette[2] || c1;
      base.style.background =
        `radial-gradient(110% 85% at 30% 15%, ${c0} 0%, transparent 55%),` +
        `radial-gradient(100% 80% at 80% 25%, ${c1} 0%, transparent 52%),` +
        `radial-gradient(120% 100% at 50% 100%, ${darkenHex(c2, 0.55)} 0%, #050508 72%)`;
    }
    if (bg) {
      bg.style.setProperty('--np-c0', palette[0]);
      bg.style.setProperty('--np-c1', palette[1] || palette[0]);
    }
    blobs.forEach((el, i) => {
      const c = palette[i % palette.length];
      el.style.setProperty('--c', c);
      el.style.setProperty('--c2', palette[(i + 2) % palette.length]);
    });
  }

  async function setArtwork(url) {
    const key = url || '';
    if (key === artworkKey && palette.length) {
      applyPalette(palette);
      return palette;
    }
    artworkKey = key;
    const colors = await extractPalette(url, BLOB_COUNT);
    if (artworkKey !== key) return palette;
    applyPalette(colors);
    return colors;
  }

  /**
   * IMPORTANT: createMediaElementSource() permanently routes <audio> through WebAudio.
   * Cross-origin play URLs usually lack CORS → Chrome silences the stream.
   * Only analyse same-origin audio; otherwise leave <audio> alone so sound works.
   */
  function isSameOriginAudio() {
    if (!audio) return false;
    const src = audio.currentSrc || audio.src || '';
    if (!src) return false;
    try {
      const u = new URL(src, location.href);
      return u.origin === location.origin;
    } catch {
      return false;
    }
  }

  function ensureAudioGraph() {
    if (graphFailed || analyser || !audio) return analyser;
    // Never hijack cross-origin media — keeps volume/sound working
    if (!isSameOriginAudio()) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { graphFailed = true; return null; }
      audioCtx = audioCtx || new AC();
      if (!sourceNode) {
        sourceNode = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.42;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -18;
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return analyser;
    } catch (err) {
      console.warn('fluid audio graph failed', err);
      graphFailed = true;
      return null;
    }
  }

  function readBands() {
    if (!analyser || !freqData) return null;
    analyser.getByteFrequencyData(freqData);
    const n = freqData.length;
    // bin bands (approx @ 48kHz with 1024 fft):
    // kick ~40-120Hz, bass ~120-280Hz, mid ~280-2k, high rest
    const kickEnd = Math.max(2, Math.floor(n * 0.04));
    const bassEnd = Math.max(kickEnd + 1, Math.floor(n * 0.1));
    const midEnd = Math.floor(n * 0.4);

    let kick = 0, bass = 0, mid = 0, high = 0, total = 0;
    for (let i = 0; i < n; i++) {
      // mild emphasis on lower mid for presence
      const w = i < bassEnd ? 1.15 : i < midEnd ? 1.0 : 0.85;
      const v = (freqData[i] / 255) * w;
      total += v;
      if (i < kickEnd) kick += v;
      else if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else high += v;
    }
    kick /= Math.max(1, kickEnd);
    bass /= Math.max(1, bassEnd - kickEnd);
    mid /= Math.max(1, midEnd - bassEnd);
    high /= Math.max(1, n - midEnd);
    const low = kick * 0.65 + bass * 0.35;
    const avg = total / n;

    if (avg < 0.0035 && low < 0.0035) return null;
    return { kick, bass: low, mid, high, avg };
  }

  /**
   * Visual-only fallback when real FFT is unavailable (cross-origin streams).
   * Uses playback clock for a gentle pulse — no MediaElementSource, no mute risk.
   */
  function syntheticBands(now) {
    const clock = audio && !audio.paused ? (audio.currentTime || 0) : (now - t0) / 1000;
    const bpm = 92;
    const beatPhase = (clock * bpm) / 60;
    const beat = Math.pow(Math.max(0, Math.sin(beatPhase * Math.PI * 2)), 20);
    const swell =
      0.3 +
      0.14 * Math.sin(clock * 0.45) +
      0.08 * Math.sin(clock * 0.17 + 1.1) +
      beat * 0.28;
    return {
      kick: clamp(swell * 0.4 + beat * 0.55, 0, 1),
      bass: clamp(swell * 0.5 + beat * 0.4, 0, 1),
      mid: clamp(swell * 0.42 + beat * 0.2, 0, 1),
      high: clamp(0.18 + 0.12 * Math.sin(clock * 0.7 + 0.4) + beat * 0.12, 0, 1),
      avg: clamp(swell * 0.5 + beat * 0.22, 0, 1),
    };
  }

  function pushOnsetSample(nowSec, value) {
    recentOnsets.push({ t: nowSec, v: value });
    while (recentOnsets.length && nowSec - recentOnsets[0].t > 0.12) {
      recentOnsets.shift();
    }
  }

  function isLocalPeak(value) {
    if (recentOnsets.length < 3) return value > 0.04;
    let max = 0;
    for (const s of recentOnsets) max = Math.max(max, s.v);
    // require near the short-window max so we fire on peak, not on the rising edge only
    return value >= max * 0.92;
  }

  function updateRhythmModel(raw, nowSec, dt) {
    // multi-band spectral flux (kick-led)
    const kickFlux = Math.max(0, raw.kick - prevKickRaw);
    const bassFlux = Math.max(0, raw.bass - prevBassRaw);
    const midFlux = Math.max(0, raw.mid - prevMidRaw);
    const avgFlux = Math.max(0, raw.avg - prevAvgRaw);
    prevKickRaw = raw.kick;
    prevBassRaw = raw.bass;
    prevMidRaw = raw.mid;
    prevAvgRaw = raw.avg;

    // kick dominates; mid supports snare/clap; ignore steady noise
    const onset = kickFlux * 1.7 + bassFlux * 0.85 + midFlux * 0.35 + avgFlux * 0.15;
    pushOnsetSample(nowSec, onset);

    // adaptive stats (slightly slower = more stable thresholds)
    const aFlux = 1 - Math.exp(-dt * 3.2);
    const aEnergy = 1 - Math.exp(-dt * 2.0);
    fluxMean += (onset - fluxMean) * aFlux;
    const fDev = onset - fluxMean;
    fluxVar += (fDev * fDev - fluxVar) * aFlux;
    energyMean += (raw.avg - energyMean) * aEnergy;
    const eDev = raw.avg - energyMean;
    energyVar += (eDev * eDev - energyVar) * aEnergy;

    // track recent peak energy for relative dynamics (quiet vs loud tracks)
    energyPeak = Math.max(energyPeak * Math.exp(-dt * 0.35), raw.avg);
    const relEnergy = energyPeak > 0.02 ? raw.avg / energyPeak : raw.avg;

    const fluxStd = Math.sqrt(Math.max(fluxVar, 1e-6));
    const energyStd = Math.sqrt(Math.max(energyVar, 1e-6));
    const crest = energyMean > 0.02 ? energyStd / energyMean : 0;
    const fluxCrest = fluxMean > 0.004 ? fluxStd / fluxMean : 0;

    // how danceable / punchy
    const bassBias = clamp((raw.bass - raw.avg) * 2.4, 0, 0.55);
    const punch = clamp(fluxCrest * 0.5 + crest * 1.25 + bassBias, 0, 1.4);
    let targetRhythmic = clamp(punch * 0.68 + clamp(fluxMean * 9, 0, 0.32), 0, 1);

    // warm-up: first ~0.8s stay conservative (avoids open-song twitch)
    if (warmFrames < 48) {
      warmFrames += 1;
      targetRhythmic *= warmFrames / 48;
    }

    rhythmicScore += (targetRhythmic - rhythmicScore) * (1 - Math.exp(-dt * 1.8));

    // adaptive onset threshold
    // soft: high k + high minGate · rhythmic: lower k, quicker response
    const k = 3.1 - rhythmicScore * 1.35; // ~3.1 ... ~1.75
    const minGate = 0.034 + (1 - rhythmicScore) * 0.05;
    let threshold = Math.max(minGate, fluxMean + k * fluxStd);

    // tempo lock: near expected beat time, slightly lower threshold (rhythmic only)
    const sinceLast = nowSec - lastBeatAt;
    let tempoBoost = 0;
    if (rhythmicScore > 0.4 && beatIntervalEst > 0.28 && lastBeatAt > 0) {
      const phase = sinceLast / beatIntervalEst;
      const near = Math.abs(phase - Math.round(phase));
      if (near < 0.12 && sinceLast > beatIntervalEst * 0.55) {
        threshold *= 0.82;
        tempoBoost = 0.15;
      }
    }

    // refractory gap
    const minGap = 0.48 - rhythmicScore * 0.22; // ~0.48s soft ... ~0.26s dance
    const energyFloor = 0.04 + (1 - rhythmicScore) * 0.07;

    let fired = false;
    let strength = 0;
    const peakOk = isLocalPeak(onset);

    if (
      onset > threshold &&
      peakOk &&
      sinceLast >= minGap &&
      raw.avg > energyFloor &&
      relEnergy > 0.18 + (1 - rhythmicScore) * 0.12
    ) {
      strength = clamp((onset - threshold) / Math.max(threshold, 0.02) + tempoBoost, 0.12, 1.7);

      // soft songs: only clear, strong peaks survive
      const softCut = 0.62 - rhythmicScore * 0.25; // higher cut when soft
      if (rhythmicScore < 0.45 && strength < softCut) {
        strength = 0;
      } else {
        fired = true;
        lastBeatAt = nowSec;

        if (lastStrongOnsetAt > 0) {
          const gap = nowSec - lastStrongOnsetAt;
          // accept plausible musical intervals (~50–160 BPM half/double tolerant)
          if (gap > 0.28 && gap < 1.35) {
            beatIntervalEst += (gap - beatIntervalEst) * 0.22;
          }
        }
        lastStrongOnsetAt = nowSec;
        onsetHistory.push(nowSec);
        while (onsetHistory.length && nowSec - onsetHistory[0] > 8) onsetHistory.shift();
      }
    }

    // regularity of onsets → lock into rhythmic mode
    if (onsetHistory.length >= 4) {
      const gaps = [];
      for (let i = 1; i < onsetHistory.length; i++) {
        gaps.push(onsetHistory[i] - onsetHistory[i - 1]);
      }
      const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      let gVar = 0;
      for (const g of gaps) gVar += (g - meanGap) ** 2;
      gVar /= gaps.length;
      const regularity = clamp(1 - Math.sqrt(gVar) / Math.max(meanGap, 0.01), 0, 1);
      // only boost if tempo is musical
      if (meanGap > 0.3 && meanGap < 1.1) {
        rhythmicScore = clamp(
          rhythmicScore + regularity * 0.028 * (dt * 60),
          0,
          1
        );
      }
    }

    // hysteresis for mode switch (prevents flicker)
    if (!isRhythmic && rhythmicScore > 0.48) isRhythmic = true;
    else if (isRhythmic && rhythmicScore < 0.34) isRhythmic = false;

    return { onset, fired, strength: clamp(strength, 0, 1.5), relEnergy };
  }

  function fireBlobBeats(strength) {
    // bass blobs hit first/harder; high lags and softer
    for (let i = 0; i < BLOB_COUNT; i++) {
      const L = layout[i];
      const amp = strength * L.weight * (0.75 + rhythmicScore * 0.45);
      // schedule via delayed peak using lag as reduced immediate + residual
      const immediate = amp * (1 - Math.min(0.55, L.lag * 5.5));
      blobBeat[i] = Math.max(blobBeat[i], immediate);
      // residual delayed energy for lagged blobs
      if (L.lag > 0.02) {
        // store a tiny delayed bump by slightly less decay target next frames
        blobBeat[i] = Math.max(blobBeat[i], amp * 0.35);
      }
    }
  }

  function tick(now) {
    if (!running) return;
    ensureBlobs();

    const dt = lastFrameAt ? clamp((now - lastFrameAt) / 1000, 0.008, 0.05) : 0.016;
    lastFrameAt = now;
    const t = (now - t0) / 1000;
    const nowSec = now / 1000;

    let bands;
    usingSynthetic = false;

    if (playing) {
      ensureAudioGraph();
      bands = readBands();
      if (!bands) {
        bands = syntheticBands(now);
        usingSynthetic = true;
        const target = 0.22 + bands.kick * 0.2;
        rhythmicScore += (target - rhythmicScore) * 0.04;
        if (isRhythmic && rhythmicScore < 0.34) isRhythmic = false;
      }
    } else {
      bands = { kick: 0.06, bass: 0.07, mid: 0.07, high: 0.07, avg: 0.07 };
      rhythmicScore *= 0.94;
      beatHold *= 0.88;
      for (let i = 0; i < blobBeat.length; i++) blobBeat[i] *= 0.88;
      isRhythmic = false;
    }

    // display smoothing: soft = heavy smooth, rhythmic = snappier follow
    const displayA = playing
      ? 1 - Math.exp(-dt * (4.5 + rhythmicScore * 7))
      : 1 - Math.exp(-dt * 2.5);
    smooth.bass += (bands.bass - smooth.bass) * displayA;
    smooth.mid += (bands.mid - smooth.mid) * displayA;
    smooth.high += (bands.high - smooth.high) * displayA;
    smooth.avg += (bands.avg - smooth.avg) * displayA;

    // very slow energy for ambient glow (Apple soft wash)
    const energyA = 1 - Math.exp(-dt * (1.2 + rhythmicScore * 1.5));
    smooth.energy += (bands.avg - smooth.energy) * energyA;

    let beatInfo = { fired: false, strength: 0, relEnergy: 0.3 };
    if (playing && !usingSynthetic) {
      beatInfo = updateRhythmModel(bands, nowSec, dt);
    } else if (playing && usingSynthetic) {
      const kickRise = Math.max(0, bands.kick - prevKickRaw);
      prevKickRaw = bands.kick;
      prevBassRaw = bands.bass;
      prevMidRaw = bands.mid;
      prevAvgRaw = bands.avg;
      if (kickRise > 0.18 && bands.kick > 0.45 && nowSec - lastBeatAt > 0.42) {
        beatInfo = { fired: true, strength: 0.35 + kickRise * 0.4, relEnergy: 0.4 };
        lastBeatAt = nowSec;
      } else {
        beatInfo = { fired: false, strength: 0, relEnergy: 0.3 };
      }
    }

    // global beat envelope (time-constant decay)
    if (beatInfo.fired) {
      // soft: elegant nudge · rhythmic: full punch
      const gain = 0.18 + rhythmicScore * 0.9;
      const peak = clamp(beatInfo.strength * gain, 0.14, 1.2);
      beatHold = Math.max(beatHold, peak);
      fireBlobBeats(peak);
    } else {
      // soft decay slower/gentler residual; rhythmic snappy
      const decayTau = 0.28 - rhythmicScore * 0.12; // sec
      beatHold *= Math.exp(-dt / Math.max(0.08, decayTau));
      if (beatHold < 0.015) beatHold = 0;
    }
    smooth.beat = beatHold;

    // per-blob beat decay (slightly staggered feel)
    for (let i = 0; i < blobBeat.length; i++) {
      const tau = 0.26 - rhythmicScore * 0.1 + layout[i].lag * 0.35;
      blobBeat[i] *= Math.exp(-dt / Math.max(0.08, tau));
      if (blobBeat[i] < 0.012) blobBeat[i] = 0;
    }

    if (sheet) {
      sheet.classList.toggle('is-playing', playing);
      sheet.classList.toggle('is-rhythmic', isRhythmic);
      sheet.style.setProperty('--np-energy', smooth.energy.toFixed(3));
      sheet.style.setProperty('--np-rhythm', rhythmicScore.toFixed(3));
      sheet.style.setProperty('--np-beat', smooth.beat.toFixed(3));
    }

    // flow: soft = wide slow; rhythmic = tighter orbit, more alive
    const flowAmp = 7.5 + (1 - rhythmicScore) * 7;
    const flowAmpY = 6.5 + (1 - rhythmicScore) * 6;
    const speedMul = 0.55 + (1 - rhythmicScore) * 0.55 + rhythmicScore * 0.35;

    blobs.forEach((el, i) => {
      const L = layout[i];
      const bandVal =
        L.band === 'bass' ? smooth.bass : L.band === 'high' ? smooth.high : smooth.mid;

      // multi-frequency fluid drift (organic, not robotic)
      const flowX =
        Math.sin(t * L.speed * speedMul + L.phase) * flowAmp +
        Math.sin(t * L.speed * 0.37 + i * 1.1) * (flowAmp * 0.52) +
        Math.sin(t * 0.11 + L.phase * 0.5) * 2.2;
      const flowY =
        Math.cos(t * L.speed * 0.88 * speedMul + L.phase) * flowAmpY +
        Math.sin(t * L.speed * 0.29 + i * 1.7) * (flowAmpY * 0.48) +
        Math.cos(t * 0.09 + i) * 1.8;

      // continuous breath: slow LFO + smoothed energy (never twitchy)
      const lfo =
        0.5 +
        0.28 * Math.sin(t * (0.28 + rhythmicScore * 0.18) + L.phase) +
        0.12 * Math.sin(t * 0.13 + i * 0.9);
      const energyPart = clamp(smooth.energy * 1.4 + bandVal * (0.25 + rhythmicScore * 0.45), 0, 1);
      // soft: mostly LFO · rhythmic: more energy-driven
      const pulse = playing
        ? clamp(
            energyPart * (0.32 + rhythmicScore * 0.55) +
              lfo * (0.42 - rhythmicScore * 0.22) * 0.55,
            0,
            1
          )
        : 0.05;

      // jump: only real beat impulses (per-blob)
      // soft mode: tiny · rhythmic: big kick
      const jumpScale = isRhythmic ? 0.95 + rhythmicScore * 0.35 : 0.1 + rhythmicScore * 0.25;
      const jump = playing ? clamp(blobBeat[i] * jumpScale, 0, 1.3) : 0;

      // slight position nudge on kick for more "alive" feel (rhythmic only)
      const kickNudge = isRhythmic ? jump * 2.2 : jump * 0.4;
      const nx = flowX + Math.sin(L.phase + 1) * kickNudge;
      const ny = flowY + Math.cos(L.phase + 2) * kickNudge * 0.85;

      el.style.left = L.x + '%';
      el.style.top = L.y + '%';
      el.style.setProperty('--fx', nx.toFixed(2) + '%');
      el.style.setProperty('--fy', ny.toFixed(2) + '%');
      el.style.setProperty('--pulse', pulse.toFixed(3));
      el.style.setProperty('--jump', jump.toFixed(3));
      el.style.setProperty(
        '--spin',
        (
          Math.sin(t * (0.07 + rhythmicScore * 0.05) + L.phase) *
          (8 + rhythmicScore * 8 + jump * 4)
        ).toFixed(2) + 'deg'
      );
    });

    raf = requestAnimationFrame(tick);
  }

  function resetAnalysis() {
    prevKickRaw = prevBassRaw = prevMidRaw = prevAvgRaw = 0;
    beatHold = 0;
    smooth.beat = 0;
    rhythmicScore = 0;
    isRhythmic = false;
    onsetHistory = [];
    recentOnsets = [];
    lastBeatAt = 0;
    lastStrongOnsetAt = 0;
    fluxMean = 0.015;
    fluxVar = 0.00025;
    energyMean = 0.12;
    energyVar = 0.008;
    energyPeak = 0.2;
    warmFrames = 0;
    beatIntervalEst = 0.5;
    for (let i = 0; i < blobBeat.length; i++) blobBeat[i] = 0;
  }

  function start() {
    ensureBlobs();
    if (!palette.length) applyPalette(DEFAULT_PALETTE);
    if (running) return;
    running = true;
    t0 = performance.now();
    lastFrameAt = 0;
    resetAnalysis();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (sheet) {
      sheet.classList.remove('is-rhythmic');
      sheet.classList.remove('is-playing');
    }
  }

  function setPlaying(isPlaying) {
    playing = !!isPlaying;
    if (playing) {
      ensureAudioGraph();
      warmFrames = 0;
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } else {
      beatHold = 0;
      smooth.beat = 0;
      for (let i = 0; i < blobBeat.length; i++) blobBeat[i] = 0;
      if (sheet) sheet.classList.remove('is-rhythmic');
    }
    if (sheet) sheet.classList.toggle('is-playing', playing);
  }

  // init defaults
  ensureBlobs();
  applyPalette(DEFAULT_PALETTE);

  return {
    setArtwork,
    setPlaying,
    start,
    stop,
    applyPalette,
  };
}
