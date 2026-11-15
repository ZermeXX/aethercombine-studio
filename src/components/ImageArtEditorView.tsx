/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Scissors,
  Wand2,
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Unlock,
  Sliders,
  Sparkles,
  Undo2,
  Image as ImageIcon,
  Maximize2,
  ArrowLeft,
  Eraser,
  Layers,
  Move,
  ZoomIn,
  Tv,
  Target,
  Eye
} from 'lucide-react';

export interface ArtEditorIncomingAsset {
  dataUrl: string;
  label?: string;
  nonce: number;
}

interface ImageArtEditorViewProps {
  incomingAsset?: ArtEditorIncomingAsset | null;
  onApplyToThumbnailCoverA?: (dataUrl: string) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

interface ImageEffectsState {
  brightness: number; // 50..160 (%)
  contrast: number; // 50..170 (%)
  saturation: number; // 0..200 (%)
  warmth: number; // -50..50
  sharpness: number; // 0..100
  vignette: number; // 0..100
  blur: number; // 0..20 (px)
}

const DEFAULT_EFFECTS: ImageEffectsState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  sharpness: 0,
  vignette: 0,
  blur: 0
};

type CropFitMode = 'cover' | 'contain' | 'stretch';
type WandScopeMode = 'contiguous' | 'global';
type SvgExportMode = 'embedded_hires' | 'vector_trace';

interface SizePreset {
  id: string;
  label: string;
  w: number;
  h: number;
  defaultFit?: CropFitMode;
  autoSafeZone?: boolean;
}

const YOUTUBE_BRANDING_PRESETS: SizePreset[] = [
  {
    id: 'yt_banner',
    label: '🖼️ Баннер канала (2560 × 1440 px)',
    w: 2560,
    h: 1440,
    defaultFit: 'cover',
    autoSafeZone: true
  },
  {
    id: 'yt_avatar',
    label: '👤 Аватарка канала (800 × 800 px)',
    w: 800,
    h: 800,
    defaultFit: 'cover',
    autoSafeZone: true
  },
  {
    id: 'yt_watermark',
    label: '💧 Водяной знак видео / Логотип (150 × 150 px)',
    w: 150,
    h: 150,
    defaultFit: 'contain',
    autoSafeZone: false
  },
  {
    id: 'yt_thumb_4k',
    label: '🎬 Превью видео 4K (3840 × 2160 px)',
    w: 3840,
    h: 2160,
    defaultFit: 'cover',
    autoSafeZone: false
  },
  {
    id: 'yt_thumb_fhd',
    label: '📺 Превью FullHD (1920 × 1080 px)',
    w: 1920,
    h: 1080,
    defaultFit: 'cover',
    autoSafeZone: false
  }
];

const EXTRA_SIZE_PRESETS: SizePreset[] = [
  { id: 'shorts', label: '1080×1920 Shorts 9:16', w: 1080, h: 1920, defaultFit: 'cover' },
  { id: 'square', label: '1000×1000 Аватар/Обложка', w: 1000, h: 1000, defaultFit: 'contain' },
  { id: 'sticker', label: '512×512 Стикер', w: 512, h: 512, defaultFit: 'contain' }
];

interface FilterPreset {
  id: string;
  label: string;
  accent: string;
  effects: ImageEffectsState;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'cinematic_gold',
    label: 'Cinematic Gold',
    accent: 'from-amber-500/20 to-orange-500/20 border-amber-400/40 text-amber-200',
    effects: {
      brightness: 103,
      contrast: 118,
      saturation: 115,
      warmth: 24,
      sharpness: 25,
      vignette: 36,
      blur: 0
    }
  },
  {
    id: 'cold_noir',
    label: 'Cold Noir',
    accent: 'from-cyan-500/20 to-slate-700/30 border-cyan-400/40 text-cyan-200',
    effects: {
      brightness: 96,
      contrast: 132,
      saturation: 38,
      warmth: -26,
      sharpness: 30,
      vignette: 52,
      blur: 0
    }
  },
  {
    id: 'vintage_archive',
    label: 'Vintage Archive',
    accent: 'from-yellow-600/20 to-stone-700/30 border-yellow-500/35 text-yellow-200',
    effects: {
      brightness: 98,
      contrast: 108,
      saturation: 72,
      warmth: 32,
      sharpness: 12,
      vignette: 45,
      blur: 0.4
    }
  },
  {
    id: 'hdr_crisp',
    label: 'HDR Crisp',
    accent: 'from-emerald-500/20 to-sky-500/20 border-emerald-400/40 text-emerald-200',
    effects: {
      brightness: 106,
      contrast: 124,
      saturation: 128,
      warmth: 4,
      sharpness: 55,
      vignette: 14,
      blur: 0
    }
  }
];

function createInitialSampleDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  // Studio backdrop gradient
  const bg = ctx.createLinearGradient(0, 0, 1280, 720);
  bg.addColorStop(0, '#090D16');
  bg.addColorStop(0.55, '#131B2E');
  bg.addColorStop(1, '#090D16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 720);

  // Warm rim glow behind foreground object
  const glow = ctx.createRadialGradient(640, 355, 25, 640, 355, 330);
  glow.addColorStop(0, 'rgba(250, 204, 21, 0.32)');
  glow.addColorStop(0.55, 'rgba(56, 189, 248, 0.14)');
  glow.addColorStop(1, 'rgba(9, 13, 22, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1280, 720);

  // Distinct foreground silhouette (antique brass lantern / hourglass motif) for easy testing
  ctx.save();
  ctx.translate(640, 360);

  // Pedestal base
  const metalGrad = ctx.createLinearGradient(-150, -210, 150, 210);
  metalGrad.addColorStop(0, '#FDE047');
  metalGrad.addColorStop(0.45, '#D97706');
  metalGrad.addColorStop(1, '#78350F');

  ctx.fillStyle = metalGrad;
  ctx.beginPath();
  ctx.roundRect(-135, 165, 270, 34, 10);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(-115, -200, 230, 30, 10);
  ctx.fill();

  // Glass core chamber
  const coreGrad = ctx.createRadialGradient(0, -10, 15, 0, -10, 145);
  coreGrad.addColorStop(0, '#FEF08A');
  coreGrad.addColorStop(0.45, '#F59E0B');
  coreGrad.addColorStop(0.85, '#1E293B');
  coreGrad.addColorStop(1, '#0F172A');

  ctx.fillStyle = coreGrad;
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(-102, -165, 204, 326, 36);
  ctx.fill();
  ctx.stroke();

  // Inner emblem ring
  ctx.strokeStyle = '#FDE047';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -2, 66, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#090D16';
  ctx.beginPath();
  ctx.arc(0, -2, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.arc(0, -2, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  return c.toDataURL('image/png');
}

function colorDistWeighted(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
}

/**
 * Мягкое сепарабельное размытие альфа-маски + очистка краевых ореолов (Feather & Alpha Matte Smoothing).
 */
function smoothAlphaMask(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  featherPx: number
): Uint8ClampedArray {
  if (featherPx <= 0) return new Uint8ClampedArray(mask);
  const radius = Math.max(1, Math.min(12, Math.round(featherPx)));
  const temp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      const xStart = Math.max(0, x - radius);
      const xEnd = Math.min(w - 1, x + radius);
      for (let kx = xStart; kx <= xEnd; kx++) {
        sum += mask[rowOff + kx];
        count++;
      }
      temp[rowOff + x] = sum / count;
    }
  }

  // Vertical pass + subtle contrast curve to keep subject core solid
  for (let y = 0; y < h; y++) {
    const yStart = Math.max(0, y - radius);
    const yEnd = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let ky = yStart; ky <= yEnd; ky++) {
        sum += temp[ky * w + x];
        count++;
      }
      const orig = mask[y * w + x];
      const blurred = sum / count;
      // Preserve solid interior foreground while softening outer silhouette transition
      const blended = orig === 255 && blurred > 205 ? 255 : blurred;
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(blended)));
    }
  }

  return out;
}

/**
 * Автоматическая оффлайн-сегментация переднего плана («✂️ Удалить фон»):
 * 1) Собирает кластерную палитру фона по всему периметру кадра.
 * 2) Строит карту границ Собеля (Sobel Edge Magnitude), чтобы границы объекта сдерживали заливку.
 * 3) Выполняет BFS-заливку от краёв изображения с адаптивным допуском + защитой центральной зоны.
 */
function runAutoBackgroundSegmentation(
  rgba: Uint8ClampedArray,
  currentMask: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number
): Uint8ClampedArray {
  const total = w * h;
  const nextMask = new Uint8ClampedArray(currentMask);

  // Step 1: Collect quantized perimeter samples
  const borderSamples: Array<[number, number, number]> = [];
  const stepX = Math.max(1, Math.floor(w / 72));
  const stepY = Math.max(1, Math.floor(h / 72));

  for (let x = 0; x < w; x += stepX) {
    for (const y of [0, 1, Math.max(0, h - 2), h - 1]) {
      const idx = (y * w + x) * 4;
      if (rgba[idx + 3] > 20) {
        borderSamples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      }
    }
  }
  for (let y = 0; y < h; y += stepY) {
    for (const x of [0, 1, Math.max(0, w - 2), w - 1]) {
      const idx = (y * w + x) * 4;
      if (rgba[idx + 3] > 20) {
        borderSamples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      }
    }
  }

  if (borderSamples.length === 0) return nextMask;

  // Cluster border samples into up to 8 dominant perimeter color centroids
  const centroids: Array<{ r: number; g: number; b: number; count: number }> = [];
  for (const [sr, sg, sb] of borderSamples) {
    let matched = false;
    for (const c of centroids) {
      if (colorDistWeighted(sr, sg, sb, c.r, c.g, c.b) < 26) {
        const n = c.count + 1;
        c.r = (c.r * c.count + sr) / n;
        c.g = (c.g * c.count + sg) / n;
        c.b = (c.b * c.count + sb) / n;
        c.count = n;
        matched = true;
        break;
      }
    }
    if (!matched && centroids.length < 10) {
      centroids.push({ r: sr, g: sg, b: sb, count: 1 });
    }
  }

  // Step 2: Luminance + Sobel edge strength map to guard subject silhouettes
  const luma = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    luma[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }

  const edgeMag = new Float32Array(total);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -luma[i - w - 1] +
        luma[i - w + 1] -
        2 * luma[i - 1] +
        2 * luma[i + 1] -
        luma[i + w - 1] +
        luma[i + w + 1];
      const gy =
        -luma[i - w - 1] -
        2 * luma[i - w] -
        luma[i - w + 1] +
        luma[i + w - 1] +
        2 * luma[i + w] +
        luma[i + w + 1];
      edgeMag[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 0.35);
    }
  }

  const minDistToBorderPalette = (r: number, g: number, b: number): number => {
    let best = 999;
    for (let k = 0; k < centroids.length; k++) {
      const c = centroids[k];
      const d = colorDistWeighted(r, g, b, c.r, c.g, c.b);
      if (d < best) best = d;
    }
    return best;
  };

  // Step 3: Perimeter BFS flood-fill (prevents punching interior enclosed highlights)
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const trySeed = (idx: number) => {
    if (visited[idx]) return;
    const p = idx * 4;
    const d = minDistToBorderPalette(rgba[p], rgba[p + 1], rgba[p + 2]);
    if (d <= tolerance * 1.35 || nextMask[idx] === 0) {
      visited[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x);
    trySeed((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    trySeed(y * w);
    trySeed(y * w + (w - 1));
  }

  const hardThreshold = Math.max(8, tolerance);
  const softRange = Math.max(8, tolerance * 0.45);

  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const cp = cur * 4;
    const cr = rgba[cp];
    const cg = rgba[cp + 1];
    const cb = rgba[cp + 2];

    const dist = minDistToBorderPalette(cr, cg, cb);
    if (nextMask[cur] > 0) {
      if (dist <= hardThreshold * 0.72) {
        nextMask[cur] = 0;
      } else {
        const factor = Math.max(0, Math.min(1, (dist - hardThreshold * 0.72) / softRange));
        nextMask[cur] = Math.min(nextMask[cur], Math.round(factor * 255));
      }
    }

    const neighbors = [
      cx > 0 ? cur - 1 : -1,
      cx < w - 1 ? cur + 1 : -1,
      cy > 0 ? cur - w : -1,
      cy < h - 1 ? cur + w : -1
    ];

    for (let n = 0; n < 4; n++) {
      const nb = neighbors[n];
      if (nb < 0 || visited[nb]) continue;

      const np = nb * 4;
      const nr = rgba[np];
      const ng = rgba[np + 1];
      const nbCol = rgba[np + 2];
      const paletteDist = minDistToBorderPalette(nr, ng, nbCol);
      const localStepDist = colorDistWeighted(cr, cg, cb, nr, ng, nbCol);

      // Center salience damping: slightly tighter near center so subject core stays safe
      const nx = nb % w;
      const ny = (nb - nx) / w;
      const dxNorm = (nx / w - 0.5) * 2;
      const dyNorm = (ny / h - 0.5) * 2;
      const radialFromCenter = Math.min(1, Math.sqrt(dxNorm * dxNorm + dyNorm * dyNorm));
      const edgePenalty = edgeMag[nb] * 0.22;
      const effectiveLimit = hardThreshold * (0.78 + 0.34 * radialFromCenter) - edgePenalty;

      if (
        nextMask[nb] === 0 ||
        (paletteDist <= effectiveLimit && localStepDist <= Math.max(22, tolerance * 0.7))
      ) {
        visited[nb] = 1;
        queue[qTail++] = nb;
      }
    }
  }

  return nextMask;
}

/**
 * Волшебная палочка (Contiguous Flood-Fill или Global Color Key).
 */
function runMagicWandRemoval(
  rgba: Uint8ClampedArray,
  currentMask: Uint8ClampedArray,
  w: number,
  h: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  scope: WandScopeMode
): Uint8ClampedArray {
  const sx = Math.max(0, Math.min(w - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seedY)));
  const seedIdx = sy * w + sx;
  const sp = seedIdx * 4;
  const sr = rgba[sp];
  const sg = rgba[sp + 1];
  const sb = rgba[sp + 2];

  const total = w * h;
  const nextMask = new Uint8ClampedArray(currentMask);
  const hardLimit = Math.max(4, tolerance);
  const softBand = Math.max(4, tolerance * 0.35);

  if (scope === 'global') {
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const d = colorDistWeighted(rgba[p], rgba[p + 1], rgba[p + 2], sr, sg, sb);
      if (d <= hardLimit * 0.78) {
        nextMask[i] = 0;
      } else if (d <= hardLimit + softBand) {
        const alphaFrac = (d - hardLimit * 0.78) / (hardLimit * 0.22 + softBand);
        nextMask[i] = Math.min(nextMask[i], Math.round(Math.max(0, Math.min(1, alphaFrac)) * 255));
      }
    }
    return nextMask;
  }

  // Contiguous BFS flood fill from clicked pixel
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  visited[seedIdx] = 1;
  queue[tail++] = seedIdx;

  while (head < tail) {
    const cur = queue[head++];
    const cp = cur * 4;
    const dSeed = colorDistWeighted(rgba[cp], rgba[cp + 1], rgba[cp + 2], sr, sg, sb);
    if (dSeed <= hardLimit * 0.75) {
      nextMask[cur] = 0;
    } else {
      const alphaFrac = Math.max(0, Math.min(1, (dSeed - hardLimit * 0.75) / softBand));
      nextMask[cur] = Math.min(nextMask[cur], Math.round(alphaFrac * 255));
    }

    const cx = cur % w;
    const cy = (cur - cx) / w;
    const neighbors = [
      cx > 0 ? cur - 1 : -1,
      cx < w - 1 ? cur + 1 : -1,
      cy > 0 ? cur - w : -1,
      cy < h - 1 ? cur + w : -1
    ];

    for (let i = 0; i < 4; i++) {
      const nb = neighbors[i];
      if (nb < 0 || visited[nb]) continue;
      const np = nb * 4;
      const d = colorDistWeighted(rgba[np], rgba[np + 1], rgba[np + 2], sr, sg, sb);
      if (d <= hardLimit + softBand * 0.5) {
        visited[nb] = 1;
        queue[tail++] = nb;
      }
    }
  }

  return nextMask;
}

/**
 * Применяет 3x3 Unsharp Convolution (Резкость) + теплоту (Warmth) к готовому ImageData.
 */
function applyPixelSharpenAndWarmth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sharpness: number,
  warmth: number
) {
  if (sharpness <= 0 && warmth === 0) return;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = imgData.data;

  // Apply Warmth shift (Red +, Blue -)
  if (warmth !== 0) {
    const rShift = warmth * 1.1;
    const gShift = warmth * 0.25;
    const bShift = -warmth * 1.05;
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] === 0) continue;
      src[i] = Math.max(0, Math.min(255, src[i] + rShift));
      src[i + 1] = Math.max(0, Math.min(255, src[i + 1] + gShift));
      src[i + 2] = Math.max(0, Math.min(255, src[i + 2] + bShift));
    }
  }

  // Apply 3x3 sharpening kernel
  if (sharpness > 0 && w > 2 && h > 2) {
    const amount = (sharpness / 100) * 1.35;
    const copy = new Uint8ClampedArray(src);
    const stride = w * 4;
    for (let y = 1; y < h - 1; y++) {
      const rowOff = y * stride;
      for (let x = 1; x < w - 1; x++) {
        const i = rowOff + x * 4;
        if (copy[i + 3] === 0) continue;
        for (let ch = 0; ch < 3; ch++) {
          const center = copy[i + ch];
          const avgNeighbors =
            (copy[i - 4 + ch] +
              copy[i + 4 + ch] +
              copy[i - stride + ch] +
              copy[i + stride + ch]) *
            0.25;
          const sharpened = center + (center - avgNeighbors) * amount;
          src[i + ch] = Math.max(0, Math.min(255, sharpened));
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Создаёт чистый векторный SVG (либо high-res PNG inside SVG viewBox, либо векторную трассировку контуров в <path>).
 */
function buildSvgDocumentFromCanvas(
  canvas: HTMLCanvasElement,
  mode: SvgExportMode
): string {
  const w = canvas.width;
  const h = canvas.height;

  if (mode === 'embedded_hires') {
    const pngUri = canvas.toDataURL('image/png');
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
      `  <title>AetherCombine Export ${w}x${h}</title>`,
      `  <image href="${pngUri}" xlink:href="${pngUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" />`,
      `</svg>`
    ].join('\n');
  }

  // True quantized vector run-length path tracing on a compact sampling grid
  const gridCols = Math.min(96, Math.max(48, Math.round(w / 14)));
  const gridRows = Math.max(24, Math.round((gridCols * h) / Math.max(1, w)));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = gridCols;
  sampleCanvas.height = gridRows;
  const sCtx = sampleCanvas.getContext('2d');
  if (!sCtx) {
    return buildSvgDocumentFromCanvas(canvas, 'embedded_hires');
  }
  sCtx.drawImage(canvas, 0, 0, gridCols, gridRows);
  const pixels = sCtx.getImageData(0, 0, gridCols, gridRows).data;

  const cellW = w / gridCols;
  const cellH = h / gridRows;
  const colorBuckets = new Map<string, string[]>();

  const quantize = (v: number) => Math.min(255, Math.round(v / 24) * 24);

  for (let y = 0; y < gridRows; y++) {
    let x = 0;
    while (x < gridCols) {
      const idx = (y * gridCols + x) * 4;
      const alpha = pixels[idx + 3];
      if (alpha < 24) {
        x++;
        continue;
      }
      const r = quantize(pixels[idx]);
      const g = quantize(pixels[idx + 1]);
      const b = quantize(pixels[idx + 2]);
      const a = Number((alpha / 255).toFixed(2));
      const key = `${r},${g},${b},${a}`;

      let runEnd = x + 1;
      while (runEnd < gridCols) {
        const nIdx = (y * gridCols + runEnd) * 4;
        const na = pixels[nIdx + 3];
        if (na < 24) break;
        const nKey = `${quantize(pixels[nIdx])},${quantize(pixels[nIdx + 1])},${quantize(
          pixels[nIdx + 2]
        )},${Number((na / 255).toFixed(2))}`;
        if (nKey !== key) break;
        runEnd++;
      }

      const rx = (x * cellW).toFixed(1);
      const ry = (y * cellH).toFixed(1);
      const rw = ((runEnd - x) * cellW + 0.35).toFixed(1);
      const rh = (cellH + 0.35).toFixed(1);

      const bucket = colorBuckets.get(key) || [];
      bucket.push(`M${rx},${ry}h${rw}v${rh}h-${rw}z`);
      colorBuckets.set(key, bucket);

      x = runEnd;
    }
  }

  const paths: string[] = [];
  colorBuckets.forEach((segments, key) => {
    const [r, g, b, a] = key.split(',');
    const opacityAttr = Number(a) < 0.99 ? ` fill-opacity="${a}"` : '';
    paths.push(`  <path fill="rgb(${r},${g},${b})"${opacityAttr} d="${segments.join('')}" />`);
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">`,
    `  <title>AetherCombine Vector Trace ${w}x${h}</title>`,
    ...paths,
    `</svg>`
  ].join('\n');
}

export const ImageArtEditorView: React.FC<ImageArtEditorViewProps> = ({
  incomingAsset,
  onApplyToThumbnailCoverA,
  onNotify
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Offscreen pristine RGB+original alpha raster & modifiable alpha mask
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const origAlphaRef = useRef<Uint8ClampedArray | null>(null);
  const alphaMaskRef = useRef<Uint8ClampedArray | null>(null);
  const maskHistoryRef = useRef<Uint8ClampedArray[]>([]);

  const [sourceLabel, setSourceLabel] = useState<string>('Студийный образец (Aether Lantern)');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  const [targetWidth, setTargetWidth] = useState<number>(1920);
  const [targetHeight, setTargetHeight] = useState<number>(1080);
  const [lockAspect, setLockAspect] = useState<boolean>(true);
  const [keepPresetDimensionsOnLoad, setKeepPresetDimensionsOnLoad] = useState<boolean>(false);
  const [cropFitMode, setCropFitMode] = useState<CropFitMode>('contain');

  // YouTube Safe Zones & Interactive Pan/Zoom controls
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [panX, setPanX] = useState<number>(0); // offset in target canvas pixels
  const [panY, setPanY] = useState<number>(0); // offset in target canvas pixels
  const [isPanning, setIsPanning] = useState<boolean>(false);

  // Background Removal & Magic Wand controls
  const [wandActive, setWandActive] = useState<boolean>(false);
  const [wandScope, setWandScope] = useState<WandScopeMode>('contiguous');
  const [tolerance, setTolerance] = useState<number>(36);
  const [featherPx, setFeatherPx] = useState<number>(2);
  const [isRemovingBg, setIsRemovingBg] = useState<boolean>(false);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [maskRevision, setMaskRevision] = useState<number>(0);

  // Transforms & Filters
  const [rotationDeg, setRotationDeg] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [effects, setEffects] = useState<ImageEffectsState>({ ...DEFAULT_EFFECTS });

  // Export settings
  const [jpegQuality, setJpegQuality] = useState<number>(92);
  const [exportBackdropColor, setExportBackdropColor] = useState<string>('#090D16');
  const [svgExportMode, setSvgExportMode] = useState<SvgExportMode>('embedded_hires');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const loadDataUrlIntoEditor = useCallback(
    (dataUrl: string, label: string, preserveTargetDimensions: boolean = false) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = Math.max(1, img.naturalWidth || img.width || 1280);
        const h = Math.max(1, img.naturalHeight || img.height || 720);

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);

        const data = ctx.getImageData(0, 0, w, h).data;
        const initMask = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) {
          initMask[i] = data[i * 4 + 3];
        }

        sourceCanvasRef.current = off;
        origAlphaRef.current = new Uint8ClampedArray(initMask);
        alphaMaskRef.current = initMask;
        maskHistoryRef.current = [];

        setHistoryCount(0);
        setSourceLabel(label);
        setNaturalSize({ w, h });
        if (!preserveTargetDimensions) {
          setTargetWidth(w);
          setTargetHeight(h);
        }
        setPanX(0);
        setPanY(0);
        setZoomPct(100);
        setRotationDeg(0);
        setFlipH(false);
        setFlipV(false);
        setMaskRevision(r => r + 1);
      };
      img.onerror = () => {
        onNotify('Не удалось декодировать изображение для Арт-Редактора.', 'error');
      };
      img.src = dataUrl;
    },
    [onNotify]
  );

  // Initialize with a built-in studio sample on first mount
  useEffect(() => {
    const sample = createInitialSampleDataUrl();
    if (sample) {
      loadDataUrlIntoEditor(sample, 'Студийный образец (Aether Lantern)', false);
    }
  }, [loadDataUrlIntoEditor]);

  // Receive image sent from ThumbnailStudioView («Открыть в Арт-Редакторе →»)
  useEffect(() => {
    if (!incomingAsset?.dataUrl) return;
    setKeepPresetDimensionsOnLoad(false);
    loadDataUrlIntoEditor(
      incomingAsset.dataUrl,
      incomingAsset.label || 'Из 4K Превью & Арт-цех',
      false
    );
    onNotify(
      `🖼️ Изображение «${incomingAsset.label || 'Обложка'}» открыто в Арт-Редакторе!`,
      'success'
    );
  }, [incomingAsset, loadDataUrlIntoEditor, onNotify]);

  // Mouse wheel zoom on the canvas container (non-passive so page does not scroll while zooming)
  useEffect(() => {
    const el = canvasFrameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 6 : -6;
      setZoomPct(prev => Math.max(20, Math.min(250, prev + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Builds masked source canvas (Source RGB + AlphaMask with optional feathering)
  const buildMaskedSourceCanvas = useCallback((): HTMLCanvasElement | null => {
    const srcCanvas = sourceCanvasRef.current;
    const rawMask = alphaMaskRef.current;
    if (!srcCanvas || !rawMask) return null;

    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return null;

    const smoothedMask = smoothAlphaMask(rawMask, w, h, featherPx);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const oCtx = out.getContext('2d');
    if (!oCtx) return null;

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const px = imgData.data;
    for (let i = 0; i < w * h; i++) {
      px[i * 4 + 3] = smoothedMask[i];
    }
    oCtx.putImageData(imgData, 0, 0);
    return out;
  }, [featherPx]);

  // Renders complete processed output (Geometry + Filters + Vignette + Pixel Sharpen/Warmth) onto any canvas
  const renderProcessedOutput = useCallback(
    (
      destCanvas: HTMLCanvasElement,
      outWidth: number,
      outHeight: number,
      opaqueBgHex?: string
    ) => {
      const maskedSrc = buildMaskedSourceCanvas();
      if (!maskedSrc) return;

      destCanvas.width = Math.max(1, Math.round(outWidth));
      destCanvas.height = Math.max(1, Math.round(outHeight));
      const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const W = destCanvas.width;
      const H = destCanvas.height;
      ctx.clearRect(0, 0, W, H);

      if (opaqueBgHex) {
        ctx.fillStyle = opaqueBgHex;
        ctx.fillRect(0, 0, W, H);
      }

      // Compute rotated source bounding box
      const isQuarterTurn = rotationDeg % 180 !== 0;
      const rotSrcW = isQuarterTurn ? maskedSrc.height : maskedSrc.width;
      const rotSrcH = isQuarterTurn ? maskedSrc.width : maskedSrc.height;

      // Step A: Draw oriented image onto intermediate canvas cleanly
      const oriented = document.createElement('canvas');
      oriented.width = rotSrcW;
      oriented.height = rotSrcH;
      const orientCtx = oriented.getContext('2d');
      if (orientCtx) {
        orientCtx.save();
        orientCtx.translate(rotSrcW / 2, rotSrcH / 2);
        orientCtx.rotate((rotationDeg * Math.PI) / 180);
        orientCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        orientCtx.drawImage(maskedSrc, -maskedSrc.width / 2, -maskedSrc.height / 2);
        orientCtx.restore();
      }

      // Compute crop / fit + Pan & Zoom destination rect
      let baseW = W;
      let baseH = H;

      if (cropFitMode === 'cover') {
        const scale = Math.max(W / rotSrcW, H / rotSrcH);
        baseW = rotSrcW * scale;
        baseH = rotSrcH * scale;
      } else if (cropFitMode === 'contain') {
        const scale = Math.min(W / rotSrcW, H / rotSrcH);
        baseW = rotSrcW * scale;
        baseH = rotSrcH * scale;
      }

      const zoomFactor = Math.max(0.2, Math.min(2.5, zoomPct / 100));
      const drawW = baseW * zoomFactor;
      const drawH = baseH * zoomFactor;
      const targetToCanvasScale = W / Math.max(1, targetWidth);
      const drawX = (W - drawW) / 2 + panX * targetToCanvasScale;
      const drawY = (H - drawH) / 2 + panY * targetToCanvasScale;

      // Step B: CSS canvas filter pipeline (Brightness, Contrast, Saturation, Blur)
      const blurScaled = effects.blur > 0 ? Math.max(0.2, (effects.blur * Math.min(W, H)) / 900) : 0;
      ctx.save();
      ctx.filter = [
        `brightness(${effects.brightness}%)`,
        `contrast(${effects.contrast}%)`,
        `saturate(${effects.saturation}%)`,
        blurScaled > 0 ? `blur(${blurScaled.toFixed(2)}px)` : ''
      ]
        .filter(Boolean)
        .join(' ');
      ctx.drawImage(oriented, drawX, drawY, drawW, drawH);
      ctx.restore();
      ctx.filter = 'none';

      // Step C: Pixel-level 3x3 Sharpen & Warmth
      if (effects.sharpness > 0 || effects.warmth !== 0) {
        applyPixelSharpenAndWarmth(ctx, W, H, effects.sharpness, effects.warmth);
      }

      // Step D: Vignette overlay (respects source alpha when transparent backdrop unless opaque)
      if (effects.vignette > 0) {
        const strength = (effects.vignette / 100) * 0.85;
        const rad = ctx.createRadialGradient(
          W * 0.5,
          H * 0.5,
          Math.min(W, H) * 0.25,
          W * 0.5,
          H * 0.5,
          Math.max(W, H) * 0.72
        );
        rad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        rad.addColorStop(1, `rgba(2, 6, 14, ${strength.toFixed(3)})`);
        ctx.save();
        ctx.globalCompositeOperation = opaqueBgHex ? 'source-over' : 'source-atop';
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    },
    [
      buildMaskedSourceCanvas,
      rotationDeg,
      flipH,
      flipV,
      cropFitMode,
      zoomPct,
      panX,
      panY,
      targetWidth,
      effects
    ]
  );

  // Live preview render capped at <= 1280px max dimension for buttery 60fps sliders
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceCanvasRef.current) return;
    const maxPreviewSide = 1280;
    const scaleDown = Math.min(1, maxPreviewSide / Math.max(targetWidth, targetHeight, 1));
    const pw = Math.max(1, Math.round(targetWidth * scaleDown));
    const ph = Math.max(1, Math.round(targetHeight * scaleDown));
    renderProcessedOutput(canvas, pw, ph);
  }, [renderProcessedOutput, targetWidth, targetHeight, maskRevision]);

  const handleUploadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onNotify('Пожалуйста, выберите файл изображения (PNG, JPEG, WebP, SVG).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        const isBannerOrAvatarActive =
          (targetWidth === 2560 && targetHeight === 1440) ||
          (targetWidth === 800 && targetHeight === 800);
        const keepDims = keepPresetDimensionsOnLoad || isBannerOrAvatarActive;
        loadDataUrlIntoEditor(ev.target.result, file.name, keepDims);
        if (isBannerOrAvatarActive) {
          setShowSafeZones(true);
        }
        onNotify(
          keepDims
            ? `📂 Изображение «${file.name}» загружено в холст ${targetWidth}×${targetHeight} px!`
            : `📂 Изображение «${file.name}» загружено в Арт-Редактор`,
          'success'
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const pushMaskHistory = () => {
    if (!alphaMaskRef.current) return;
    maskHistoryRef.current = [
      ...maskHistoryRef.current.slice(-14),
      new Uint8ClampedArray(alphaMaskRef.current)
    ];
    setHistoryCount(maskHistoryRef.current.length);
  };

  const handleUndoMask = () => {
    if (maskHistoryRef.current.length === 0) return;
    const prev = maskHistoryRef.current[maskHistoryRef.current.length - 1];
    maskHistoryRef.current = maskHistoryRef.current.slice(0, -1);
    alphaMaskRef.current = prev;
    setHistoryCount(maskHistoryRef.current.length);
    setMaskRevision(r => r + 1);
    onNotify('↩️ Последнее изменение маски фона отменено.', 'info');
  };

  const handleRestoreOriginalMask = () => {
    if (!origAlphaRef.current) return;
    pushMaskHistory();
    alphaMaskRef.current = new Uint8ClampedArray(origAlphaRef.current);
    setMaskRevision(r => r + 1);
    onNotify('🔄 Исходный фон полностью восстановлен.', 'info');
  };

  const handleAutoRemoveBackground = () => {
    const srcCanvas = sourceCanvasRef.current;
    const curMask = alphaMaskRef.current;
    if (!srcCanvas || !curMask) return;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    setIsRemovingBg(true);
    window.requestAnimationFrame(() => {
      try {
        pushMaskHistory();
        const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
        const segmented = runAutoBackgroundSegmentation(
          imgData.data,
          curMask,
          srcCanvas.width,
          srcCanvas.height,
          tolerance
        );
        alphaMaskRef.current = segmented;
        setMaskRevision(r => r + 1);
        onNotify(
          '✂️ Фон удалён! При необходимости подправьте края «Волшебной палочкой» или ползунком Feather.',
          'success'
        );
      } finally {
        setIsRemovingBg(false);
      }
    });
  };

  // Maps a click on the displayed preview canvas back through Crop/Fit, Pan & Zoom & Rotate/Flip to exact source pixel coordinates
  const handlePreviewCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!wandActive) return;
    const preview = previewCanvasRef.current;
    const src = sourceCanvasRef.current;
    const curMask = alphaMaskRef.current;
    if (!preview || !src || !curMask) return;

    const rect = preview.getBoundingClientRect();
    const clickNormX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const clickNormY = (e.clientY - rect.top) / Math.max(1, rect.height);

    const W = preview.width;
    const H = preview.height;
    const px = clickNormX * W;
    const py = clickNormY * H;

    const isQuarter = rotationDeg % 180 !== 0;
    const rotW = isQuarter ? src.height : src.width;
    const rotH = isQuarter ? src.width : src.height;

    let baseW = W;
    let baseH = H;

    if (cropFitMode === 'cover') {
      const s = Math.max(W / rotW, H / rotH);
      baseW = rotW * s;
      baseH = rotH * s;
    } else if (cropFitMode === 'contain') {
      const s = Math.min(W / rotW, H / rotH);
      baseW = rotW * s;
      baseH = rotH * s;
    }

    const zoomFactor = Math.max(0.2, Math.min(2.5, zoomPct / 100));
    const drawW = baseW * zoomFactor;
    const drawH = baseH * zoomFactor;
    const targetToCanvasScale = W / Math.max(1, targetWidth);
    const drawX = (W - drawW) / 2 + panX * targetToCanvasScale;
    const drawY = (H - drawH) / 2 + panY * targetToCanvasScale;

    const ox = ((px - drawX) / Math.max(1, drawW)) * rotW;
    const oy = ((py - drawY) / Math.max(1, drawH)) * rotH;

    if (ox < 0 || ox >= rotW || oy < 0 || oy >= rotH) {
      onNotify('Кликните внутри области самого изображения, чтобы удалить цвет.', 'info');
      return;
    }

    // Invert rotation around center, then invert flips
    const dxRot = ox - rotW / 2;
    const dyRot = oy - rotH / 2;
    const rad = (-rotationDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    let sx = dxRot * cosA - dyRot * sinA;
    let sy = dxRot * sinA + dyRot * cosA;
    if (flipH) sx = -sx;
    if (flipV) sy = -sy;
    sx += src.width / 2;
    sy += src.height / 2;

    const ctx = src.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    pushMaskHistory();
    const imgData = ctx.getImageData(0, 0, src.width, src.height);
    const nextMask = runMagicWandRemoval(
      imgData.data,
      curMask,
      src.width,
      src.height,
      sx,
      sy,
      tolerance,
      wandScope
    );
    alphaMaskRef.current = nextMask;
    setMaskRevision(r => r + 1);
    onNotify(
      `🪄 Область удалена (${wandScope === 'contiguous' ? 'смежная' : 'весь цвет'}, допуск ${tolerance})!`,
      'success'
    );
  };

  // Drag-to-Pan handler when Magic Wand is inactive
  const startCanvasPanDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (wandActive) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const preview = previewCanvasRef.current;
    if (!preview) return;

    e.preventDefault();
    const rect = preview.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialPanX = panX;
    const initialPanY = panY;
    const scaleX = targetWidth / Math.max(1, rect.width);
    const scaleY = targetHeight / Math.max(1, rect.height);

    setIsPanning(true);

    const onMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startClientX) * scaleX;
      const dy = (moveEv.clientY - startClientY) * scaleY;
      setPanX(Math.round(initialPanX + dx));
      setPanY(Math.round(initialPanY + dy));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setIsPanning(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleTargetWidthChange = (val: number) => {
    const clamped = Math.max(32, Math.min(4096, Math.round(val) || 32));
    setTargetWidth(clamped);
    if (lockAspect) {
      const ratio = naturalSize.h / Math.max(1, naturalSize.w);
      setTargetHeight(Math.max(32, Math.min(4096, Math.round(clamped * ratio))));
    }
  };

  const handleTargetHeightChange = (val: number) => {
    const clamped = Math.max(32, Math.min(4096, Math.round(val) || 32));
    setTargetHeight(clamped);
    if (lockAspect) {
      const ratio = naturalSize.w / Math.max(1, naturalSize.h);
      setTargetWidth(Math.max(32, Math.min(4096, Math.round(clamped * ratio))));
    }
  };

  const applyPresetSize = (preset: SizePreset) => {
    setLockAspect(false);
    setKeepPresetDimensionsOnLoad(true);
    setTargetWidth(preset.w);
    setTargetHeight(preset.h);
    setPanX(0);
    setPanY(0);
    setZoomPct(100);
    if (preset.defaultFit) {
      setCropFitMode(preset.defaultFit);
    }
    if (preset.autoSafeZone) {
      setShowSafeZones(true);
    }
    onNotify(`📐 Установлен формат ${preset.label}`, 'info');
  };

  // 🎯 Одним кликом вписывает картинку в безопасную зону баннера YouTube (1546 × 423 px)
  const fitImageIntoBannerSafeZone = () => {
    const src = sourceCanvasRef.current;
    const isQuarter = rotationDeg % 180 !== 0;
    const rotW = src ? (isQuarter ? src.height : src.width) : naturalSize.w;
    const rotH = src ? (isQuarter ? src.width : src.height) : naturalSize.h;

    const bannerW = 2560;
    const bannerH = 1440;
    setLockAspect(false);
    setKeepPresetDimensionsOnLoad(true);
    setTargetWidth(bannerW);
    setTargetHeight(bannerH);
    setCropFitMode('contain');
    setShowSafeZones(true);

    const baseContainScale = Math.min(bannerW / Math.max(1, rotW), bannerH / Math.max(1, rotH));
    const safeZoneScale = Math.min(1546 / Math.max(1, rotW), 423 / Math.max(1, rotH));
    const computedZoom = Math.max(20, Math.min(250, Math.round((safeZoneScale / baseContainScale) * 100)));

    setZoomPct(computedZoom);
    setPanX(0);
    setPanY(0);
    onNotify(
      `🎯 Картинка точно вписана в безопасную зону YouTube 1546×423 px (масштаб ${computedZoom}%)!`,
      'success'
    );
  };

  // ↔️ Заполняет всю шапку YouTube (2560 × 1440 px) без пустых полей
  const fillEntireBannerCanvas = () => {
    setLockAspect(false);
    setKeepPresetDimensionsOnLoad(true);
    setTargetWidth(2560);
    setTargetHeight(1440);
    setCropFitMode('cover');
    setShowSafeZones(true);
    setZoomPct(100);
    setPanX(0);
    setPanY(0);
    onNotify('↔️ Изображение растянуто на всю шапку YouTube 2560×1440 px (Cover).', 'info');
  };

  const resetLayerPosition = () => {
    setPanX(0);
    setPanY(0);
    setZoomPct(100);
    onNotify('📍 Позиция и масштаб картинки сброшены по центру.', 'info');
  };

  const buildFullResExportCanvas = (opaqueBgHex?: string): HTMLCanvasElement => {
    const out = document.createElement('canvas');
    renderProcessedOutput(out, targetWidth, targetHeight, opaqueBgHex);
    return out;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleExportFormat = (format: 'png' | 'jpeg' | 'webp' | 'svg') => {
    if (!sourceCanvasRef.current) return;
    const baseName = `aether_art_${targetWidth}x${targetHeight}`;

    if (format === 'svg') {
      const off = buildFullResExportCanvas();
      const svgMarkup = buildSvgDocumentFromCanvas(off, svgExportMode);
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, `${baseName}.svg`);
      onNotify(
        `📥 SVG (${svgExportMode === 'vector_trace' ? 'векторный контур' : 'High-Res viewBox'}) экспортирован!`,
        'success'
      );
      return;
    }

    if (format === 'jpeg') {
      const off = buildFullResExportCanvas(exportBackdropColor || '#090D16');
      off.toBlob(
        blob => {
          if (!blob) return;
          downloadBlob(blob, `${baseName}.jpg`);
          onNotify(`📥 JPEG (${targetWidth}×${targetHeight}, качество ${jpegQuality}%) скачан!`, 'success');
        },
        'image/jpeg',
        Math.max(0.7, Math.min(1, jpegQuality / 100))
      );
      return;
    }

    const off = buildFullResExportCanvas();
    const mime = format === 'webp' ? 'image/webp' : 'image/png';
    const ext = format === 'webp' ? 'webp' : 'png';
    off.toBlob(
      blob => {
        if (!blob) return;
        downloadBlob(blob, `${baseName}.${ext}`);
        onNotify(
          `📥 ${ext.toUpperCase()} (${targetWidth}×${targetHeight}, прозрачный фон) скачан!`,
          'success'
        );
      },
      mime,
      0.95
    );
  };

  const handleReturnToThumbnailCoverA = () => {
    if (!onApplyToThumbnailCoverA || !sourceCanvasRef.current) return;
    const off = buildFullResExportCanvas();
    const url = off.toDataURL('image/png');
    onApplyToThumbnailCoverA(url);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Верхний заголовок и быстрая панель загрузки / возврата */}
      <div className="aether-surface rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border border-cyan-400/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/25 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <ImageIcon className="w-5 h-5 text-cyan-300" />
            </span>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[#f8fafc]">
              🖼️ Арт-Редактор &amp; Удаление фона
            </h2>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/35 text-cyan-300">
              Offline Canvas Engine
            </span>
          </div>
          <p className="text-xs text-white/60">
            Удаление фона в 1 клик + Волшебная палочка, обрезка, цветокоррекция, резкость и экспорт в PNG / JPEG / WebP / SVG.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onApplyToThumbnailCoverA && (
            <button
              type="button"
              onClick={handleReturnToThumbnailCoverA}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/40 text-amber-300 text-xs font-bold flex items-center gap-2 cursor-pointer transition"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Применить к Обложке A</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleUploadFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] btn-primary-action px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Загрузить изображение</span>
          </button>
        </div>
      </div>

      {/* Основная рабочая сетка 12 колонок */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ЛЕВАЯ КОЛОНКА (5/12): Инструменты фона, ресайз, фильтры и экспорт */}
        <div className="lg:col-span-5 space-y-5 min-w-0">
          {/* 1. УДАЛЕНИЕ ФОНА И ВОЛШЕБНАЯ ПАЛОЧКА */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="aether-surface rounded-2xl p-5 space-y-4 border border-emerald-400/20"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2">
                <Scissors className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Маска и удаление фона</span>
              </span>
              <span className="text-[10px] font-mono text-white/55 tabular-nums">
                История: {historyCount}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleAutoRemoveBackground}
                disabled={isRemovingBg}
                className="min-h-[44px] btn-primary-action px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Scissors className="w-4 h-4 shrink-0" />
                <span>{isRemovingBg ? 'Сегментация...' : '✂️ Удалить фон'}</span>
              </button>

              <button
                type="button"
                aria-pressed={wandActive}
                onClick={() => setWandActive(prev => !prev)}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border cursor-pointer transition ${
                  wandActive
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_24px_rgba(250,204,21,0.4)]'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] border-amber-400/35 text-amber-300'
                }`}
              >
                <Wand2 className="w-4 h-4 shrink-0" />
                <span>{wandActive ? 'Палочка: ВКЛ (клик)' : '🪄 Волшебная палочка'}</span>
              </button>
            </div>

            {wandActive && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 space-y-2">
                <div className="text-[11px] font-semibold text-amber-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>Кликните по цвету фона на холсте справа, чтобы сделать его прозрачным.</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWandScope('contiguous')}
                    className={`flex-1 min-h-[34px] rounded-lg text-[11px] font-bold px-2.5 py-1 border cursor-pointer ${
                      wandScope === 'contiguous'
                        ? 'bg-amber-400/25 border-amber-300 text-amber-200'
                        : 'bg-[#090D16]/70 border-white/[0.08] text-white/60'
                    }`}
                  >
                    Смежная область
                  </button>
                  <button
                    type="button"
                    onClick={() => setWandScope('global')}
                    className={`flex-1 min-h-[34px] rounded-lg text-[11px] font-bold px-2.5 py-1 border cursor-pointer ${
                      wandScope === 'global'
                        ? 'bg-amber-400/25 border-amber-300 text-amber-200'
                        : 'bg-[#090D16]/70 border-white/[0.08] text-white/60'
                    }`}
                  >
                    Весь похожий цвет
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#090D16]/75 border border-white/[0.08] rounded-xl p-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/75 font-semibold">Допуск (Tolerance)</span>
                  <span className="font-mono font-bold text-emerald-300 tabular-nums">{tolerance}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={1}
                  value={tolerance}
                  onChange={e => setTolerance(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/75 font-semibold">Сглаживание (Feather)</span>
                  <span className="font-mono font-bold text-cyan-300 tabular-nums">{featherPx} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={featherPx}
                  onChange={e => setFeatherPx(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndoMask}
                disabled={historyCount === 0}
                className="flex-1 min-h-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white/80 disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Отменить шаг</span>
              </button>
              <button
                type="button"
                onClick={handleRestoreOriginalMask}
                className="flex-1 min-h-[40px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white/80 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Восстановить фон</span>
              </button>
            </div>
          </motion.div>

          {/* 2. РЕСАЙЗ, ОБРЕЗКА И ТРАНСФОРМАЦИЯ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.04 }}
            className="aether-surface rounded-2xl p-5 space-y-4 border border-white/[0.08]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Размер и кадрирование</span>
              </span>
              <span className="text-[10px] font-mono text-white/55 tabular-nums">
                Исходник: {naturalSize.w}×{naturalSize.h}
              </span>
            </div>

            {/* Поля ширины / высоты + замок пропорций */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-white/55 uppercase font-semibold block">
                  Ширина (px)
                </label>
                <input
                  type="number"
                  min={32}
                  max={4096}
                  value={targetWidth}
                  onChange={e => handleTargetWidthChange(Number(e.target.value))}
                  className="w-full min-h-[42px] bg-[#090D16] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#f8fafc] tabular-nums outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="button"
                aria-pressed={lockAspect}
                onClick={() => setLockAspect(prev => !prev)}
                title={lockAspect ? 'Пропорции заблокированы' : 'Свободные пропорции'}
                className={`min-h-[42px] min-w-[44px] px-3 rounded-xl border flex items-center justify-center cursor-pointer transition ${
                  lockAspect
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-[#090D16] border-white/[0.1] text-white/50 hover:text-white'
                }`}
              >
                {lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>

              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-white/55 uppercase font-semibold block">
                  Высота (px)
                </label>
                <input
                  type="number"
                  min={32}
                  max={4096}
                  value={targetHeight}
                  onChange={e => handleTargetHeightChange(Number(e.target.value))}
                  className="w-full min-h-[42px] bg-[#090D16] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#f8fafc] tabular-nums outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="space-y-2 bg-[#090D16]/70 border border-white/[0.08] rounded-xl p-3">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>🔗 Сохранять пропорции: {lockAspect ? 'ВКЛ' : 'ВЫКЛ'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setKeepPresetDimensionsOnLoad(false);
                    setLockAspect(true);
                    setTargetWidth(naturalSize.w);
                    setTargetHeight(naturalSize.h);
                    setPanX(0);
                    setPanY(0);
                    setZoomPct(100);
                  }}
                  className="text-[10px] font-mono text-cyan-300 hover:underline cursor-pointer"
                >
                  По размеру фото ({naturalSize.w}×{naturalSize.h})
                </button>
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/55 uppercase font-semibold block">
                  Режим вписывания изображения в холст:
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      {
                        id: 'contain',
                        label: 'Вписать с прозрачными полями (Contain / Transparent)'
                      },
                      { id: 'cover', label: 'Заполнить весь холст (Cover)' },
                      { id: 'stretch', label: 'Растянуть точно по пикселям (Stretch)' }
                    ] as Array<{ id: CropFitMode; label: string }>
                  ).map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setCropFitMode(mode.id)}
                      className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-left border cursor-pointer transition ${
                        cropFitMode === mode.id
                          ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                          : 'bg-[#090D16]/75 border-white/[0.08] text-white/60 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 1. ОФИЦИАЛЬНЫЕ ПРЕСЕТЫ РАЗМЕРОВ YOUTUBE (Брендинг YouTube-канала) */}
            <div className="space-y-2 bg-gradient-to-br from-rose-500/[0.07] via-[#090D16]/80 to-amber-500/[0.06] border border-amber-400/25 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>📺 Брендинг YouTube-канала</span>
                </span>
                <span className="text-[10px] font-mono text-white/55">Официальные спецификации</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {YOUTUBE_BRANDING_PRESETS.map(preset => {
                  const isActive = targetWidth === preset.w && targetHeight === preset.h;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPresetSize(preset)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-[11px] font-bold text-left border cursor-pointer transition flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-[#090D16] border-2 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.25)]'
                          : 'bg-[#090D16]/85 border-white/[0.08] text-white/75 hover:text-white hover:border-white/25'
                      }`}
                    >
                      <span className="truncate">{preset.label}</span>
                      <span className="text-[10px] font-mono opacity-80 shrink-0 tabular-nums">
                        {preset.w}×{preset.h}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Переключатель сетки безопасных зон YouTube */}
              <button
                type="button"
                aria-pressed={showSafeZones}
                onClick={() => setShowSafeZones(prev => !prev)}
                className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 cursor-pointer transition ${
                  showSafeZones
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.2)]'
                    : 'bg-[#090D16]/85 border-white/[0.1] text-white/70 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1.5 text-left">
                  <Eye className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span>📐 Показать сетку безопасных зон YouTube</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 shrink-0">
                  {showSafeZones ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Дополнительные форматы (Shorts / Стикеры / Аватар) */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-white/55 uppercase font-semibold block">
                Дополнительные форматы:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXTRA_SIZE_PRESETS.map(preset => {
                  const isActive = targetWidth === preset.w && targetHeight === preset.h;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPresetSize(preset)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold font-mono tabular-nums border cursor-pointer transition ${
                        isActive
                          ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                          : 'bg-[#090D16]/80 border-white/[0.08] text-white/70 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Поворот и отражение */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRotationDeg(r => (r + 270) % 360)}
                className="min-h-[38px] rounded-xl bg-[#090D16]/80 hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-semibold text-white/80 flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> -90°
              </button>
              <button
                type="button"
                onClick={() => setRotationDeg(r => (r + 90) % 360)}
                className="min-h-[38px] rounded-xl bg-[#090D16]/80 hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-semibold text-white/80 flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" /> +90°
              </button>
              <button
                type="button"
                onClick={() => setFlipH(v => !v)}
                className={`min-h-[38px] rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                  flipH
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-[#090D16]/80 border-white/[0.08] text-white/80'
                }`}
              >
                <FlipHorizontal className="w-3.5 h-3.5" /> Flip H
              </button>
              <button
                type="button"
                onClick={() => setFlipV(v => !v)}
                className={`min-h-[38px] rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                  flipV
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-[#090D16]/80 border-white/[0.08] text-white/80'
                }`}
              >
                <FlipVertical className="w-3.5 h-3.5" /> Flip V
              </button>
            </div>
          </motion.div>

          {/* 3. ВИЗУАЛЬНЫЕ ЭФФЕКТЫ И ЦВЕТОКОРРЕКЦИЯ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.08 }}
            className="aether-surface rounded-2xl p-5 space-y-4 border border-amber-400/20"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Визуальные эффекты и цветокоррекция</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setEffects({ ...DEFAULT_EFFECTS });
                  setRotationDeg(0);
                  setFlipH(false);
                  setFlipV(false);
                }}
                className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
              >
                Сбросить эффекты
              </button>
            </div>

            {/* 1-клик пресеты фильтров */}
            <div className="grid grid-cols-2 gap-2">
              {FILTER_PRESETS.map(fp => (
                <button
                  key={fp.id}
                  type="button"
                  onClick={() => setEffects({ ...fp.effects })}
                  className={`min-h-[40px] px-3 py-2 rounded-xl bg-gradient-to-r ${fp.accent} border text-xs font-bold text-left flex items-center justify-between cursor-pointer hover:brightness-110 transition`}
                >
                  <span>{fp.label}</span>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-80" />
                </button>
              ))}
            </div>

            {/* Ползунки */}
            <div className="space-y-3 bg-[#090D16]/75 border border-white/[0.08] rounded-xl p-3.5">
              {(
                [
                  { key: 'brightness', label: 'Яркость', min: 50, max: 160, step: 1, unit: '%' },
                  { key: 'contrast', label: 'Контраст', min: 50, max: 170, step: 1, unit: '%' },
                  { key: 'saturation', label: 'Насыщенность', min: 0, max: 200, step: 1, unit: '%' },
                  { key: 'warmth', label: 'Теплота (Warmth)', min: -50, max: 50, step: 1, unit: '' },
                  { key: 'sharpness', label: 'Резкость / Чёткость', min: 0, max: 100, step: 1, unit: '%' },
                  { key: 'vignette', label: 'Виньетка', min: 0, max: 100, step: 1, unit: '%' },
                  { key: 'blur', label: 'Размытие (Blur)', min: 0, max: 20, step: 0.5, unit: 'px' }
                ] as const
              ).map(slider => (
                <div key={slider.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/80 font-semibold">{slider.label}</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {effects[slider.key]}
                      {slider.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={effects[slider.key]}
                    onChange={e =>
                      setEffects(prev => ({ ...prev, [slider.key]: Number(e.target.value) }))
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (7/12): ХОЛСТ С ШАХМАТНОЙ СЕТКОЙ + МУЛЬТИФОРМАТНЫЙ ЭКСПОРТ */}
        <div className="lg:col-span-7 space-y-5 min-w-0">
          {/* Интерактивный холст предпросмотра на шахматной сетке прозрачности */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUploadFile(file);
            }}
            className={`aether-surface rounded-2xl p-5 space-y-4 border transition ${
              isDragOver ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/[0.08]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] shrink-0" />
                <span className="text-xs font-bold text-[#f8fafc] truncate">{sourceLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-amber-300 bg-[#090D16] border border-white/[0.1] px-2.5 py-0.5 rounded-full tabular-nums">
                  {targetWidth} × {targetHeight} px
                </span>
                <span className="text-[11px] font-mono text-white/60 bg-[#090D16] border border-white/[0.1] px-2.5 py-0.5 rounded-full">
                  {cropFitMode.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Checkerboard Canvas Frame + Interactive Safe Zone Overlay */}
            <div
              ref={canvasFrameRef}
              className="relative w-full rounded-2xl overflow-hidden border border-white/[0.12] shadow-2xl flex items-center justify-center min-h-[340px] max-h-[560px] p-3 select-none"
              style={{
                backgroundColor: '#131B2E',
                backgroundImage:
                  'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: `${Math.max(120, Math.round((500 * targetWidth) / Math.max(1, targetHeight)))}px`,
                  aspectRatio: `${targetWidth} / ${targetHeight}`
                }}
                className="relative rounded-lg overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.65)]"
              >
                <canvas
                  ref={previewCanvasRef}
                  onClick={handlePreviewCanvasClick}
                  onPointerDown={startCanvasPanDrag}
                  className={`w-full h-full block touch-none ${
                    wandActive
                      ? 'cursor-crosshair ring-2 ring-amber-400/80'
                      : isPanning
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                  }`}
                />

                {/* ИНТЕРАКТИВНЫЙ UI ОВЕРЛЕЙ БЕЗОПАСНЫХ ЗОН YOUTUBE (никогда не попадает в экспорт) */}
                {showSafeZones && (
                  <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                    {targetWidth === targetHeight ? (
                      /* АВАТАРКА КАНАЛА (1:1 круг диаметром 100%) */
                      <svg
                        viewBox="0 0 800 800"
                        preserveAspectRatio="none"
                        className="w-full h-full"
                      >
                        <defs>
                          <mask id="yt-avatar-circle-cut">
                            <rect x="0" y="0" width="800" height="800" fill="white" />
                            <circle cx="400" cy="400" r="396" fill="black" />
                          </mask>
                        </defs>
                        <rect
                          x="0"
                          y="0"
                          width="800"
                          height="800"
                          fill="rgba(2, 6, 18, 0.72)"
                          mask="url(#yt-avatar-circle-cut)"
                        />
                        <circle
                          cx="400"
                          cy="400"
                          r="395"
                          fill="none"
                          stroke="#FACC15"
                          strokeWidth="4"
                          strokeDasharray="16 10"
                        />
                        <circle
                          cx="400"
                          cy="400"
                          r="389"
                          fill="none"
                          stroke="rgba(34, 211, 238, 0.75)"
                          strokeWidth="2"
                        />
                        <rect
                          x="150"
                          y="734"
                          width="500"
                          height="44"
                          rx="10"
                          fill="rgba(9, 13, 22, 0.88)"
                          stroke="#FACC15"
                          strokeWidth="2"
                        />
                        <text
                          x="400"
                          y="762"
                          textAnchor="middle"
                          fill="#FDE047"
                          fontSize="20"
                          fontWeight="800"
                          fontFamily="Montserrat, Inter, sans-serif"
                        >
                          АВАТАРКА ({targetWidth}×{targetHeight}) • Углы обрежутся кругом
                        </text>
                      </svg>
                    ) : (
                      /* БАННЕР КАНАЛА YOUTUBE (2560 × 1440: Safe 1546×423, Desktop 2560×423, TV Full) */
                      <>
                        {/* Верхняя область (Только ТВ) */}
                        <div
                          style={{ height: '35.3125%' }}
                          className="absolute top-0 left-0 right-0 bg-[#020612]/65 border-b border-dashed border-white/30 flex items-center justify-center px-2"
                        >
                          <span className="bg-[#090D16]/85 border border-white/20 text-white/80 text-[10px] font-bold px-2.5 py-0.5 rounded-md text-center">
                            Только ТВ (обрезается на ПК и телефонах)
                          </span>
                        </div>

                        {/* Нижняя область (Только ТВ) */}
                        <div
                          style={{ height: '35.3125%' }}
                          className="absolute bottom-0 left-0 right-0 bg-[#020612]/65 border-t border-dashed border-white/30 flex items-center justify-center px-2"
                        >
                          <span className="bg-[#090D16]/85 border border-white/20 text-white/80 text-[10px] font-bold px-2.5 py-0.5 rounded-md text-center">
                            Только ТВ (обрезается на ПК и телефонах)
                          </span>
                        </div>

                        {/* Левая и правая боковые полосы Десктопа (2560 × 423 px) */}
                        <div
                          style={{ top: '35.3125%', height: '29.375%', width: '19.8047%' }}
                          className="absolute left-0 bg-cyan-950/40 border-r border-dashed border-cyan-300/60 flex flex-col items-center justify-center px-1 gap-1"
                        >
                          <span className="bg-[#090D16]/85 border border-cyan-400/40 text-cyan-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-center">
                            DESKTOP MAX
                          </span>
                          <span className="text-[9px] font-semibold text-cyan-200/90 text-center leading-tight">
                            Только ПК / Планшет
                          </span>
                        </div>

                        <div
                          style={{ top: '35.3125%', height: '29.375%', width: '19.8047%' }}
                          className="absolute right-0 bg-cyan-950/40 border-l border-dashed border-cyan-300/60 flex flex-col items-center justify-center px-1 gap-1"
                        >
                          <span className="bg-[#090D16]/85 border border-cyan-400/40 text-cyan-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-center">
                            DESKTOP MAX
                          </span>
                          <span className="text-[9px] font-semibold text-cyan-200/90 text-center leading-tight">
                            Только ПК / Планшет
                          </span>
                        </div>

                        {/* Центральная безопасная зона 1546 × 423 px (Телефоны + ПК) */}
                        <div
                          style={{
                            top: '35.3125%',
                            height: '29.375%',
                            left: '19.8047%',
                            width: '60.3906%'
                          }}
                          className="absolute border-2 border-dashed border-[#FACC15] shadow-[inset_0_0_24px_rgba(34,211,238,0.22),0_0_18px_rgba(250,204,21,0.35)] flex items-end justify-center p-1.5"
                        >
                          <span className="bg-[#090D16]/90 border border-[#FACC15]/80 text-[#FDE047] text-[9.5px] sm:text-[10px] font-extrabold px-2.5 py-0.5 rounded-md text-center leading-snug shadow-lg">
                            SAFE ZONE (1546×423): Вся ключевая композиция, лицо, логотип и надписи должны быть здесь — видно на телефонах и ПК
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {wandActive ? (
                <div className="pointer-events-none absolute top-3 left-3 z-20 bg-[#090D16]/90 border border-amber-400/70 text-amber-200 text-[11px] font-bold px-3 py-1 rounded-lg shadow-lg">
                  🪄 Режим палочки активен — кликните по фону
                </div>
              ) : (
                <div className="pointer-events-none absolute top-3 left-3 z-20 bg-[#090D16]/85 border border-white/15 text-white/75 text-[10.5px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <Move className="w-3 h-3 text-cyan-300" />
                  <span>Тяните картинку мышью • Колёсико = Zoom</span>
                </div>
              )}
            </div>

            {/* КОМПАКТНАЯ ПАНЕЛЬ УПРАВЛЕНИЯ ПОЛОЖЕНИЕМ СЛОЯ (Pan & Zoom + Вписать в 1546×423) */}
            <div className="bg-[#090D16]/85 border border-white/[0.08] rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#f8fafc]">
                  <ZoomIn className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>🔍 Масштаб картинки (Zoom: 20% – 250%)</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums">
                  <span className="text-white/60">
                    X:{panX}px • Y:{panY}px
                  </span>
                  <span className="text-amber-300 font-bold bg-amber-500/10 border border-amber-400/30 px-2 py-0.5 rounded-md">
                    {zoomPct}%
                  </span>
                </div>
              </div>

              <input
                type="range"
                min={20}
                max={250}
                step={1}
                value={zoomPct}
                onChange={e => setZoomPct(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={fitImageIntoBannerSafeZone}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-amber-500/20 hover:brightness-110 border border-amber-400/50 text-[#FDE047] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Target className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>🎯 Вписать в безопасную зону (1546×423)</span>
                </button>

                <button
                  type="button"
                  onClick={fillEntireBannerCanvas}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-cyan-400/35 text-cyan-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <span>↔️ Заполнить всю шапку (2560×1440)</span>
                </button>

                <button
                  type="button"
                  onClick={resetLayerPosition}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.1] text-white/75 text-[11px] font-semibold cursor-pointer transition ml-auto"
                >
                  Сбросить позицию
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/55">
              <span>Перетащите сюда файл изображения (Drag &amp; Drop) или загрузите кнопкой сверху</span>
              <span className="font-mono">
                Поворот: {rotationDeg}° {flipH ? '• Flip H' : ''} {flipV ? '• Flip V' : ''}
              </span>
            </div>
          </div>

          {/* 4. МУЛЬТИФОРМАТНЫЙ ЭКСПОРТ (PNG / JPEG / WebP / SVG) */}
          <div className="aether-surface rounded-2xl p-5 space-y-4 border border-cyan-400/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Экспорт в нужном формате</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-300 tabular-nums">
                Финал: {targetWidth}×{targetHeight} px
              </span>
            </div>

            {/* Настройки JPEG (фон + качество) и SVG режима */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#090D16]/75 border border-white/[0.08] rounded-xl p-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/75 font-semibold">Качество JPEG</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">{jpegQuality}%</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={100}
                  step={1}
                  value={jpegQuality}
                  onChange={e => setJpegQuality(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-white/75 font-semibold block">
                  Заливка фона для JPEG
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={exportBackdropColor}
                    onChange={e => setExportBackdropColor(e.target.value)}
                    className="w-9 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-white/75 uppercase">{exportBackdropColor}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-white/75 font-semibold block">
                  Режим SVG
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSvgExportMode('embedded_hires')}
                    className={`flex-1 min-h-[34px] rounded-lg text-[10px] font-bold border cursor-pointer ${
                      svgExportMode === 'embedded_hires'
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-[#090D16] border-white/[0.08] text-white/60'
                    }`}
                  >
                    HD viewBox
                  </button>
                  <button
                    type="button"
                    onClick={() => setSvgExportMode('vector_trace')}
                    className={`flex-1 min-h-[34px] rounded-lg text-[10px] font-bold border cursor-pointer ${
                      svgExportMode === 'vector_trace'
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-[#090D16] border-white/[0.08] text-white/60'
                    }`}
                  >
                    Vector &lt;path&gt;
                  </button>
                </div>
              </div>
            </div>

            {/* 4 кнопки скачивания форматов */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleExportFormat('png')}
                className="min-h-[48px] btn-primary-action px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Скачать PNG (с прозрачным фоном)</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportFormat('jpeg')}
                className="min-h-[48px] bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/40 text-amber-200 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Download className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Скачать JPEG ({jpegQuality}%)</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportFormat('webp')}
                className="min-h-[48px] bg-white/[0.06] hover:bg-white/[0.12] border border-emerald-400/40 text-emerald-200 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Скачать WebP</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportFormat('svg')}
                className="min-h-[48px] bg-white/[0.06] hover:bg-white/[0.12] border border-cyan-400/40 text-cyan-200 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Скачать SVG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
