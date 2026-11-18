/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Download,
  RefreshCw,
  Camera,
  Eye,
  Copy,
  Check,
  Columns,
  Smartphone,
  Film,
  Contrast,
  Layers,
  Wand2,
  ZoomIn,
  X,
  Grid,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Upload,
  Zap,
  KeyRound,
  SlidersHorizontal,
  Type,
  RotateCcw,
  Move,
  ChevronDown,
  Image as ImageIcon,
  ArrowRight,
  Sun,
  AlignCenterHorizontal,
  Paintbrush,
  Tag
} from 'lucide-react';
import {
  CornerPositionPresetId,
  DEFAULT_BADGE_CAPSULES,
  DEFAULT_BG_ADJUST,
  LINE_COLOR_SWATCHES,
  SPLASH_COLOR_SWATCHES,
  SPLASH_SHAPE_OPTIONS,
  SlotBgAdjustConfig,
  SplashColorPresetId,
  SplashShapeId,
  YOUTUBE_CINEMA_BG_ADJUST,
  buildVertical3DFill,
  drawUnifiedGrungeSplash,
  legacyPresetToSplashColor,
  renderAdjustedBackgroundToCanvas,
  resolveSplashColorPalette,
  splitProjectTitleIntoTwoLines
} from '../utils/thumbnailPresetsAndEffects';

declare global {
  interface Window {
    selectedMasterThumbnail?: string;
  }
}

interface ThumbnailStudioViewProps {
  thumbTitle: string;
  onThumbTitleChange: (title: string) => void;
  thumbBadge: string;
  onThumbBadgeChange: (badge: string) => void;
  externalFontStyle?: ThumbnailFontStyleId | null;
  onConsumeExternalFontStyle?: () => void;
  externalCoverAImageUrl?: string | null;
  onConsumeExternalCoverAImage?: () => void;
  onSendToArtEditor?: (imageDataUrl: string, slotLabel: string) => void;
  youtubeMockTitle?: string;
  scriptContext?: string;
  manifestThumbnailSlots?: { A?: string; B?: string; C?: string } | null;
  endScreenSafeZone?: string;
  manifestDurationBadge?: string;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const CF_ACCOUNT_ID_STORAGE_KEY = 'aether_cf_account_id';
const CF_API_TOKEN_STORAGE_KEY = 'aether_cf_api_token';
const AI_HORDE_BASE_URL = 'https://aihorde.net/api/v2';
const AI_HORDE_ANON_KEY = '0000000000';

export class FluxGenerationError extends Error {
  status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'FluxGenerationError';
    this.status = status;
  }
}

/**
 * Загружает изображение через fetch -> blob -> URL.createObjectURL (с автоматическим прокси-fallback),
 * чтобы HTML5 Canvas 4K экспорт (3840x2160) никогда не падал с ошибкой CORS tainted canvas.
 */
async function fetchImageAsBlobObjectUrl(
  rawUrl: string,
  cropTo16x9: boolean = false
): Promise<string> {
  let blob: Blob;

  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    const res = await fetch(rawUrl);
    blob = await res.blob();
  } else {
    try {
      const directRes = await fetch(rawUrl, { mode: 'cors' });
      if (!directRes.ok) {
        throw new Error(`HTTP ${directRes.status}`);
      }
      blob = await directRes.blob();
    } catch {
      const proxyRes = await fetch(
        `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`
      );
      if (!proxyRes.ok) {
        throw new Error(`Не удалось загрузить изображение (${proxyRes.status})`);
      }
      blob = await proxyRes.blob();
    }
  }

  const rawObjectUrl = URL.createObjectURL(blob);
  if (!cropTo16x9) {
    return rawObjectUrl;
  }

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Ошибка декодирования изображения'));
      img.src = rawObjectUrl;
    });

    const targetW = 1344;
    const targetH = 768;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawObjectUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCoverImageToCanvas(
      ctx,
      img,
      img.naturalWidth || targetW,
      img.naturalHeight || targetH,
      targetW,
      targetH,
      1
    );

    const croppedBlob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.94)
    );
    if (croppedBlob) {
      URL.revokeObjectURL(rawObjectUrl);
      return URL.createObjectURL(croppedBlob);
    }
    return rawObjectUrl;
  } catch {
    return rawObjectUrl;
  }
}

/**
 * Генерация 4 чистых 16:9 обложек без водяных знаков через бесплатный AI Horde API (Flux.1-Schnell)
 * 1) POST /api/v2/generate/async (apikey: 0000000000, Flux.1-Schnell, n: 4, 1344x768; авто-адаптация 704x384 при KudosUpfront)
 * 2) Polling GET /api/v2/generate/check/{id} каждые 3 секунды до done === true
 * 3) GET /api/v2/generate/status/{id} -> generations[].img -> fetch -> blob -> URL.createObjectURL
 */
export async function generateViaAiHordeFlux(
  promptText: string,
  options?: {
    onProgress?: (statusText: string, buttonText?: string) => void;
    signal?: AbortSignal;
  }
): Promise<{ images: string[]; modelUsed: string }> {
  const submitJob = async (width: number, height: number) => {
    const res = await fetch(`${AI_HORDE_BASE_URL}/generate/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: AI_HORDE_ANON_KEY,
        'Client-Agent': 'AetherCombine:1.0:studio'
      },
      body: JSON.stringify({
        prompt: promptText,
        params: {
          sampler_name: 'k_euler',
          cfg_scale: 1,
          steps: 4,
          width,
          height,
          n: 4
        },
        models: ['Flux.1-Schnell', 'Flux.1-Schnell fp8 (Compact)'],
        nsfw: false,
        censor_nsfw: true,
        r2: true
      }),
      signal: options?.signal
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      rc?: string;
    };
    return { res, data };
  };

  let requestedWidth = 1344;
  let requestedHeight = 768;
  let { res: submitRes, data: submitData } = await submitJob(requestedWidth, requestedHeight);

  if (
    (!submitRes.ok || !submitData.id) &&
    (submitRes.status === 403 || submitData.rc === 'KudosUpfront' || /kudos/i.test(submitData.message || ''))
  ) {
    requestedWidth = 704;
    requestedHeight = 384;
    options?.onProgress?.(
      'Анонимный лимит AI Horde для 1344×768 — переключаемся на бесплатный 16:9 (704×384 → 1344×768)...',
      'Запуск AI Horde (16:9)...'
    );
    const retry = await submitJob(requestedWidth, requestedHeight);
    submitRes = retry.res;
    submitData = retry.data;
  }

  if (!submitRes.ok || !submitData.id) {
    throw new FluxGenerationError(
      submitData.message || `AI Horde отклонил запрос (${submitRes.status})`,
      submitRes.status
    );
  }

  const jobId = submitData.id;
  options?.onProgress?.(
    `AI Horde задача создана (ID ${jobId.slice(0, 8)}), опрос каждые 3с...`,
    'Очередь AI Horde...'
  );

  const maxWaitMs = 5 * 60 * 1000;
  const startedAt = Date.now();

  while (true) {
    if (options?.signal?.aborted) {
      throw new FluxGenerationError('Генерация отменена пользователем', 499);
    }
    if (Date.now() - startedAt > maxWaitMs) {
      throw new FluxGenerationError(
        'Превышено время ожидания очереди AI Horde (5 мин). Попробуйте снова или укажите Cloudflare токен.',
        504
      );
    }

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        options?.signal?.removeEventListener('abort', onAbort);
        resolve();
      }, 3000);
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new FluxGenerationError('Генерация отменена пользователем', 499));
      };
      options?.signal?.addEventListener('abort', onAbort, { once: true });
    });

    const checkRes = await fetch(`${AI_HORDE_BASE_URL}/generate/check/${encodeURIComponent(jobId)}`, {
      headers: {
        'Client-Agent': 'AetherCombine:1.0:studio'
      },
      signal: options?.signal
    });

    if (!checkRes.ok) {
      throw new FluxGenerationError(`Ошибка проверки статуса AI Horde (${checkRes.status})`, checkRes.status);
    }

    const checkData = (await checkRes.json().catch(() => ({}))) as {
      done?: boolean;
      faulted?: boolean;
      is_possible?: boolean;
      finished?: number;
      processing?: number;
      waiting?: number;
      queue_position?: number;
      wait_time?: number;
    };

    if (checkData.faulted) {
      throw new FluxGenerationError('AI Horde воркер вернул faulted при генерации.', 502);
    }

    if (checkData.is_possible === false) {
      throw new FluxGenerationError('Сейчас нет свободных воркеров Flux.1-Schnell на AI Horde.', 503);
    }

    const qPos = typeof checkData.queue_position === 'number' ? `#${checkData.queue_position}` : 'в работе';
    const eta = typeof checkData.wait_time === 'number' ? `~${checkData.wait_time}с` : '...';
    const doneCnt = checkData.finished ?? 0;
    options?.onProgress?.(
      `AI Horde (Flux.1-Schnell) • Очередь: ${qPos} • Осталось: ${eta} • Готово ${doneCnt}/4`,
      `Очередь ${qPos} • ${eta} (${doneCnt}/4)`
    );

    if (checkData.done === true) {
      break;
    }
  }

  options?.onProgress?.(
    'Забираем 4 готовых кадра (1344×768) из AI Horde...',
    'Загрузка 4 кадров...'
  );

  const statusRes = await fetch(`${AI_HORDE_BASE_URL}/generate/status/${encodeURIComponent(jobId)}`, {
    headers: {
      'Client-Agent': 'AetherCombine:1.0:studio'
    },
    signal: options?.signal
  });

  if (!statusRes.ok) {
    throw new FluxGenerationError(`Ошибка получения результатов AI Horde (${statusRes.status})`, statusRes.status);
  }

  const statusData = (await statusRes.json().catch(() => ({}))) as {
    generations?: Array<{ img?: string; model?: string }>;
  };

  const rawUrls = (statusData.generations || [])
    .map(g => g.img)
    .filter((u): u is string => Boolean(u && u.trim()));

  if (!rawUrls.length) {
    throw new FluxGenerationError('AI Horde завершился без изображений.', 502);
  }

  const needsUpscaleTo1344 = requestedWidth < 1344;
  const blobUrls = await Promise.all(
    rawUrls.slice(0, 4).map(url => fetchImageAsBlobObjectUrl(url, needsUpscaleTo1344))
  );

  return {
    images: blobUrls,
    modelUsed: 'Flux.1 AI Horde (2×2) • 16:9'
  };
}

/**
 * Генерация 4 обложек без очереди через Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
 */
export async function generateViaCloudflareFlux(
  promptText: string,
  accountId: string,
  apiToken: string,
  signal?: AbortSignal
): Promise<{ images: string[]; modelUsed: string }> {
  const response = await fetch('/api/cloudflare/flux', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountId,
      apiToken,
      prompt: promptText,
      count: 4
    }),
    signal
  });

  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    statusCode?: number;
    modelUsed?: string;
    images?: string[];
    error?: string;
  };

  if (!response.ok || !result.ok || !Array.isArray(result.images) || !result.images.length) {
    throw new FluxGenerationError(
      result.error || `Ошибка Cloudflare Workers AI (${response.status})`,
      result.statusCode || response.status
    );
  }

  const blobUrls = await Promise.all(
    result.images.slice(0, 4).map(imgUrl => fetchImageAsBlobObjectUrl(imgUrl, true))
  );

  return {
    images: blobUrls,
    modelUsed: 'Cloudflare Workers AI • @cf/black-forest-labs/flux-1-schnell'
  };
}

/**
 * 2. Императивная функция рендеринга сетки 2x2 и логики выбора кадра (доступна для вызова с DOM-контейнером)
 */
export function renderThumbnailsGrid(
  imagesArray: string[],
  containerElement: HTMLElement | null,
  onSelectCallback?: (imgSrc: string, index: number) => void
): void {
  if (!containerElement) return;
  containerElement.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-3 w-full my-4';

  imagesArray.forEach((imgSrc, index) => {
    const card = document.createElement('div');
    card.className =
      'relative group rounded-xl overflow-hidden border-2 border-slate-700/60 bg-slate-900 cursor-pointer transition-all duration-200 hover:border-cyan-400/80 hover:scale-[1.02]';
    card.dataset.index = String(index);

    card.innerHTML = `
      <img src="${imgSrc}" alt="Вариант превью ${index + 1}" class="w-full aspect-video object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
        <span class="text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded">Вариант #${index + 1}</span>
        <a href="${imgSrc}" download="thumbnail_${index + 1}.jpg" class="text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-2 py-1 rounded shadow">Скачать</a>
      </div>
      <div class="selection-indicator hidden absolute top-2 right-2 bg-cyan-500 text-black text-xs font-bold rounded-full p-1 shadow-lg">
        ✓
      </div>
    `;

    card.addEventListener('click', e => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName.toLowerCase() === 'a') return;

      grid.querySelectorAll('.grid > div').forEach(c => {
        c.classList.remove('border-cyan-400', 'ring-2', 'ring-cyan-400/50');
        c.classList.add('border-slate-700/60');
        c.querySelector('.selection-indicator')?.classList.add('hidden');
      });

      card.classList.remove('border-slate-700/60');
      card.classList.add('border-cyan-400', 'ring-2', 'ring-cyan-400/50');
      card.querySelector('.selection-indicator')?.classList.remove('hidden');

      window.selectedMasterThumbnail = imgSrc;
      if (onSelectCallback) {
        onSelectCallback(imgSrc, index);
      }
    });

    grid.appendChild(card);
  });

  containerElement.appendChild(grid);
}

const LOCAL_SCENE_LABELS = [
  'Глубокая ночная метель с частицами',
  'Тёплое янтарное свечение очага',
  'Ледяное северное сияние',
  'Холодный рассветный туман'
] as const;

function drawCoverImageToCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  zoom: number = 1,
  offsetXRatio: number = 0,
  offsetYRatio: number = 0
): void {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const baseScale = Math.max(destW / safeSrcW, destH / safeSrcH) * zoom;
  const drawW = safeSrcW * baseScale;
  const drawH = safeSrcH * baseScale;
  const x = (destW - drawW) / 2 + offsetXRatio * destW;
  const y = (destH - drawH) / 2 + offsetYRatio * destH;
  ctx.drawImage(source, x, y, drawW, drawH);
}

// Генерация 4 кинематографических 16:9 фонов (1920x1080) средствами HTML5 Canvas
function renderProcedural16x9ArtworkDataUrl(
  stylePreset: string,
  promptText: string,
  variantIndex: number = 0
): string {
  const c = document.createElement('canvas');
  c.width = 1920;
  c.height = 1080;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const seed = Array.from(promptText || 'aether').reduce(
    (acc, ch, i) => acc + ch.charCodeAt(0) * (i + 3),
    17
  );
  const themeIdx = variantIndex % 4;

  // Хелпер горного хребта на горизонте
  const drawMountainLayer = (
    baseY: number,
    amplitude: number,
    freq: number,
    phase: number,
    fillStyle: string | CanvasGradient
  ) => {
    ctx.beginPath();
    ctx.moveTo(0, c.height);
    for (let x = 0; x <= c.width; x += 24) {
      const ridge =
        Math.sin(x * freq + phase) * amplitude +
        Math.cos(x * freq * 2.3 + phase * 1.7) * (amplitude * 0.42) +
        Math.sin(x * freq * 5.1 + seed * 0.01) * (amplitude * 0.15);
      ctx.lineTo(x, baseY - Math.abs(ridge));
    }
    ctx.lineTo(c.width, c.height);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  };

  if (themeIdx === 0) {
    // 1. Глубокая ночная метель с частицами
    const sky = ctx.createLinearGradient(0, 0, c.width * 0.3, c.height);
    sky.addColorStop(0, '#020612');
    sky.addColorStop(0.5, '#0b1830');
    sky.addColorStop(1, '#040a16');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, c.width, c.height);

    const moonGlow = ctx.createRadialGradient(1320, 310, 20, 1320, 310, 720);
    moonGlow.addColorStop(0, 'rgba(56, 189, 248, 0.36)');
    moonGlow.addColorStop(0.45, 'rgba(14, 165, 233, 0.14)');
    moonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, c.width, c.height);

    drawMountainLayer(890, 210, 0.0032, 0.8, '#081326');
    drawMountainLayer(970, 150, 0.0046, 2.4, '#050c1a');

    // Полосы ветра и метели
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.16)';
    for (let i = 0; i < 160; i++) {
      const sx = ((i * 211 + seed) % (c.width + 400)) - 200;
      const sy = (i * 97 + seed * 3) % c.height;
      const len = 35 + ((i * 19) % 90);
      ctx.lineWidth = 1 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len * 1.4, sy + len * 0.45);
      ctx.stroke();
    }
    // Боке-снежинки
    for (let i = 0; i < 110; i++) {
      const px = (i * 173 + seed * 7) % c.width;
      const py = (i * 131 + seed * 5) % c.height;
      const r = 1.5 + ((i * 7) % 8);
      ctx.fillStyle = `rgba(224, 242, 254, ${0.12 + (i % 5) * 0.08})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (themeIdx === 1) {
    // 2. Тёплое янтарное свечение очага
    const bg = ctx.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, '#0a0504');
    bg.addColorStop(0.5, '#1c0d07');
    bg.addColorStop(1, '#080403');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);

    const hearthX = c.width * 0.65;
    const hearthY = c.height * 0.62;
    const core = ctx.createRadialGradient(hearthX, hearthY, 30, hearthX, hearthY, 820);
    core.addColorStop(0, 'rgba(251, 191, 36, 0.72)');
    core.addColorStop(0.28, 'rgba(245, 158, 11, 0.42)');
    core.addColorStop(0.6, 'rgba(194, 65, 12, 0.16)');
    core.addColorStop(1, 'transparent');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, c.width, c.height);

    // Холодный контрастный отблеск слева (окно/метель снаружи)
    const rim = ctx.createRadialGradient(180, 260, 10, 180, 260, 560);
    rim.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    rim.addColorStop(1, 'transparent');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, c.width, c.height);

    // Силуэт уступа/оконной рамы
    ctx.fillStyle = 'rgba(8, 4, 3, 0.78)';
    ctx.fillRect(0, 880, c.width, 200);

    // Восходящие искры очага
    for (let i = 0; i < 140; i++) {
      const px = hearthX + Math.sin(i * 1.9 + seed) * (120 + (i % 7) * 85);
      const py = c.height - ((i * 89 + seed * 3) % 920);
      const r = 1.5 + (i % 5);
      ctx.fillStyle =
        i % 3 === 0 ? 'rgba(253, 224, 71, 0.75)' : 'rgba(251, 146, 60, 0.52)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (themeIdx === 2) {
    // 3. Ледяное северное сияние
    const polar = ctx.createLinearGradient(0, 0, 0, c.height);
    polar.addColorStop(0, '#020813');
    polar.addColorStop(0.55, '#071d2c');
    polar.addColorStop(1, '#030b14');
    ctx.fillStyle = polar;
    ctx.fillRect(0, 0, c.width, c.height);

    // Звёздное небо
    for (let i = 0; i < 160; i++) {
      const sx = (i * 229 + seed * 11) % c.width;
      const sy = (i * 71 + seed * 7) % (c.height * 0.65);
      ctx.fillStyle = `rgba(226, 232, 240, ${0.25 + (i % 4) * 0.18})`;
      ctx.fillRect(sx, sy, (i % 3) + 1, (i % 3) + 1);
    }

    // Волны северного сияния
    const auroraBands = [
      { y: 270, c1: 'rgba(16, 185, 129, 0.48)', c2: 'rgba(6, 182, 212, 0.08)', amp: 95 },
      { y: 360, c1: 'rgba(34, 211, 238, 0.42)', c2: 'rgba(139, 92, 246, 0.08)', amp: 120 },
      { y: 210, c1: 'rgba(52, 211, 153, 0.30)', c2: 'rgba(56, 189, 248, 0.04)', amp: 70 }
    ];
    auroraBands.forEach((band, bIdx) => {
      const grad = ctx.createLinearGradient(0, band.y - 160, 0, band.y + 240);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.45, band.c1);
      grad.addColorStop(1, band.c2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, band.y + 220);
      for (let x = 0; x <= c.width; x += 32) {
        const y =
          band.y +
          Math.sin(x * 0.0032 + bIdx * 1.4) * band.amp +
          Math.cos(x * 0.007 - bIdx) * 35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(c.width, band.y + 260);
      ctx.closePath();
      ctx.fill();
    });

    drawMountainLayer(930, 175, 0.0038, 1.2, '#05101c');
    drawMountainLayer(1015, 95, 0.0052, 3.1, '#030811');
  } else {
    // 4. Холодный рассветный туман
    const dawn = ctx.createLinearGradient(0, 0, c.width * 0.4, c.height);
    dawn.addColorStop(0, '#070d19');
    dawn.addColorStop(0.45, '#16283f');
    dawn.addColorStop(0.8, '#263e59');
    dawn.addColorStop(1, '#09111d');
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, c.width, c.height);

    // Рассветный холодный луч света
    const sunGlow = ctx.createRadialGradient(1380, 420, 30, 1380, 420, 920);
    sunGlow.addColorStop(0, 'rgba(186, 230, 253, 0.42)');
    sunGlow.addColorStop(0.35, 'rgba(148, 163, 184, 0.18)');
    sunGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, c.width, c.height);

    drawMountainLayer(810, 190, 0.0029, 0.4, '#132238');
    // Слои стелющегося утреннего тумана
    for (let m = 0; m < 4; m++) {
      const fogY = 660 + m * 95;
      const fog = ctx.createLinearGradient(0, fogY - 90, 0, fogY + 120);
      fog.addColorStop(0, 'transparent');
      fog.addColorStop(0.5, `rgba(203, 213, 225, ${0.14 + m * 0.03})`);
      fog.addColorStop(1, 'transparent');
      ctx.fillStyle = fog;
      ctx.fillRect(0, fogY - 90, c.width, 210);
    }
    drawMountainLayer(970, 135, 0.0044, 2.2, '#08101c');
  }

  // Стилевой оттенок под пресет проекта
  if (stylePreset === 'truecrime_contrast') {
    const crimeGlow = ctx.createRadialGradient(c.width * 0.72, c.height * 0.35, 40, c.width * 0.72, c.height * 0.35, 760);
    crimeGlow.addColorStop(0, 'rgba(239, 68, 68, 0.18)');
    crimeGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = crimeGlow;
    ctx.fillRect(0, 0, c.width, c.height);
  } else if (stylePreset === 'scifi_neon') {
    const neonGlow = ctx.createRadialGradient(c.width * 0.65, c.height * 0.5, 40, c.width * 0.65, c.height * 0.5, 700);
    neonGlow.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
    neonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = neonGlow;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  // Кинематографическая виньетка (улучшает читаемость белого текста слева внизу)
  const vignette = ctx.createLinearGradient(0, 0, c.width * 0.65, c.height);
  vignette.addColorStop(0, 'rgba(2, 6, 14, 0.42)');
  vignette.addColorStop(0.6, 'rgba(2, 6, 14, 0.1)');
  vignette.addColorStop(1, 'rgba(2, 6, 14, 0.75)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, c.width, c.height);

  return c.toDataURL('image/jpeg', 0.94);
}


export type ThumbnailFontStyleId =
  | 'cinematic_sans'
  | 'gold_ice_magic'
  | 'royal_gold_laurels'
  | 'medieval_serif'
  | 'minimal_clean';

export interface HookTextLayout {
  xPct: number;
  yPct: number;
  topScalePct: number;
  bottomScalePct: number;
  autoFitBottomToTop: boolean;
  blockTiltDeg: number;
  lineSpacingPct: number;
}

interface HookBoundingBoxPct {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

const DEFAULT_HOOK_LAYOUT: HookTextLayout = {
  xPct: 50,
  yPct: 76,
  topScalePct: 100,
  bottomScalePct: 100,
  autoFitBottomToTop: true,
  blockTiltDeg: -2,
  lineSpacingPct: 100
};

export type ThumbnailSlotId = 'A' | 'B' | 'C';

export interface ThumbnailSlotConfig {
  topText: string;
  topColor: string;
  bottomText: string;
  bottomColor: string;
  splashShape: SplashShapeId;
  splashColor: string;
  splashPaddingPct: number;
  splashShadowPct: number;
  badgesEnabled: boolean;
  badgeTexts: [string, string, string];
  badgeScalePct: number;
  hookLayout: HookTextLayout;
  bgAdjust: SlotBgAdjustConfig;
}

interface PersistedSlotState {
  topText?: string;
  topColor?: string;
  bottomText?: string;
  bottomColor?: string;
  splashShape?: SplashShapeId;
  splashColor?: string;
  splashPaddingPct?: number;
  splashShadowPct?: number;
  badgesEnabled?: boolean;
  badgeTexts?: string[];
  badgeScalePct?: number;
  hookLayout?: Partial<HookTextLayout>;
  bgAdjust?: Partial<SlotBgAdjustConfig>;
  // Обратная совместимость миграции v1/v2
  title?: string;
  bottomLine?: string;
  splashPreset?: SplashColorPresetId;
  splashCustomColor?: string;
}

const THUMB_ABC_SLOTS_STORAGE_KEY = 'aether_thumb_abc_slots_v2';
const THUMB_ABC_SLOTS_LEGACY_KEY = 'aether_thumb_abc_slots_v1';

const VALID_SPLASH_SHAPES = new Set<SplashShapeId>([
  'monolith_bristle',
  'jagged_splash',
  'bottom_slash',
  'double_strokes',
  'distressed_grunge',
  'tapered_speed',
  'none'
]);

const clampBgAdjust = (raw?: Partial<SlotBgAdjustConfig> | null): SlotBgAdjustConfig => ({
  contrastPct:
    typeof raw?.contrastPct === 'number'
      ? Math.max(80, Math.min(165, Math.round(raw.contrastPct)))
      : 100,
  brightnessPct:
    typeof raw?.brightnessPct === 'number'
      ? Math.max(85, Math.min(135, Math.round(raw.brightnessPct)))
      : 100,
  vibrancePct:
    typeof raw?.vibrancePct === 'number'
      ? Math.max(90, Math.min(125, Math.round(raw.vibrancePct)))
      : 100
});

const createDefaultSlotConfig = (
  slot: ThumbnailSlotId,
  projectTitleSeed: string
): ThumbnailSlotConfig => {
  const split = splitProjectTitleIntoTwoLines(projectTitleSeed);
  const defaultSplashColor =
    slot === 'B' ? '#18181B' : slot === 'C' ? '#D97706' : '#E10613';
  const defaultSplashShape: SplashShapeId =
    slot === 'B' ? 'double_strokes' : slot === 'C' ? 'tapered_speed' : 'monolith_bristle';
  return {
    topText: split.line1,
    topColor: '#FFFFFF',
    bottomText: split.line2,
    bottomColor: '#FFD600',
    splashShape: defaultSplashShape,
    splashColor: defaultSplashColor,
    splashPaddingPct: 100,
    splashShadowPct: 100,
    badgesEnabled: true,
    badgeTexts: [...DEFAULT_BADGE_CAPSULES],
    badgeScalePct: 100,
    hookLayout: { ...DEFAULT_HOOK_LAYOUT },
    bgAdjust: { ...DEFAULT_BG_ADJUST }
  };
};

const hydrateSlotConfig = (
  slot: ThumbnailSlotId,
  projectTitleSeed: string,
  raw?: PersistedSlotState | null
): ThumbnailSlotConfig => {
  const base = createDefaultSlotConfig(slot, projectTitleSeed);
  if (!raw || typeof raw !== 'object') return base;

  const migratedTop =
    typeof raw.topText === 'string'
      ? raw.topText
      : typeof raw.title === 'string'
        ? raw.title.toUpperCase()
        : base.topText;
  const migratedBottom =
    typeof raw.bottomText === 'string'
      ? raw.bottomText
      : typeof raw.bottomLine === 'string'
        ? raw.bottomLine.toUpperCase()
        : base.bottomText;

  const normalizedBadges: [string, string, string] = [
    typeof raw.badgeTexts?.[0] === 'string' ? raw.badgeTexts[0] : base.badgeTexts[0],
    typeof raw.badgeTexts?.[1] === 'string' ? raw.badgeTexts[1] : base.badgeTexts[1],
    typeof raw.badgeTexts?.[2] === 'string' ? raw.badgeTexts[2] : base.badgeTexts[2]
  ];

  const resolvedShape: SplashShapeId =
    raw.splashShape && VALID_SPLASH_SHAPES.has(raw.splashShape)
      ? raw.splashShape
      : raw.splashPreset === 'none'
        ? 'none'
        : raw.splashPreset
          ? 'monolith_bristle'
          : base.splashShape;

  const resolvedColor =
    typeof raw.splashColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.splashColor)
      ? raw.splashColor.toUpperCase()
      : raw.splashPreset || raw.splashCustomColor
        ? legacyPresetToSplashColor(raw.splashPreset, raw.splashCustomColor)
        : base.splashColor;

  const hl = raw.hookLayout || {};
  return {
    ...base,
    topText: migratedTop,
    topColor: typeof raw.topColor === 'string' && raw.topColor.trim() ? raw.topColor : base.topColor,
    bottomText: migratedBottom,
    bottomColor:
      typeof raw.bottomColor === 'string' && raw.bottomColor.trim()
        ? raw.bottomColor
        : base.bottomColor,
    splashShape: resolvedShape,
    splashColor: resolvedColor,
    splashPaddingPct:
      typeof raw.splashPaddingPct === 'number'
        ? Math.max(50, Math.min(160, raw.splashPaddingPct))
        : base.splashPaddingPct,
    splashShadowPct:
      typeof raw.splashShadowPct === 'number'
        ? Math.max(0, Math.min(160, raw.splashShadowPct))
        : base.splashShadowPct,
    badgesEnabled: typeof raw.badgesEnabled === 'boolean' ? raw.badgesEnabled : base.badgesEnabled,
    badgeTexts: normalizedBadges,
    badgeScalePct:
      typeof raw.badgeScalePct === 'number'
        ? Math.max(60, Math.min(150, raw.badgeScalePct))
        : base.badgeScalePct,
    hookLayout: {
      xPct:
        typeof hl.xPct === 'number'
          ? Math.max(6, Math.min(94, hl.xPct))
          : DEFAULT_HOOK_LAYOUT.xPct,
      yPct:
        typeof hl.yPct === 'number'
          ? Math.max(8, Math.min(92, hl.yPct))
          : DEFAULT_HOOK_LAYOUT.yPct,
      topScalePct:
        typeof hl.topScalePct === 'number'
          ? Math.max(40, Math.min(180, hl.topScalePct))
          : DEFAULT_HOOK_LAYOUT.topScalePct,
      bottomScalePct:
        typeof hl.bottomScalePct === 'number'
          ? Math.max(40, Math.min(180, hl.bottomScalePct))
          : DEFAULT_HOOK_LAYOUT.bottomScalePct,
      autoFitBottomToTop:
        typeof hl.autoFitBottomToTop === 'boolean'
          ? hl.autoFitBottomToTop
          : DEFAULT_HOOK_LAYOUT.autoFitBottomToTop,
      blockTiltDeg:
        typeof hl.blockTiltDeg === 'number'
          ? Math.max(-6, Math.min(6, hl.blockTiltDeg))
          : DEFAULT_HOOK_LAYOUT.blockTiltDeg,
      lineSpacingPct:
        typeof hl.lineSpacingPct === 'number'
          ? Math.max(70, Math.min(160, hl.lineSpacingPct))
          : DEFAULT_HOOK_LAYOUT.lineSpacingPct
    },
    bgAdjust: clampBgAdjust(raw.bgAdjust)
  };
};

const formatBytesLabel = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 КБ';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  }
  return `${Math.round(bytes / 1024)} КБ`;
};

const buildImpactCanvasFont = (fontSizePx: number): string => {
  const safePx = Math.max(1, Math.round(fontSizePx));
  const antonLoaded =
    typeof document !== 'undefined' &&
    Boolean(document.fonts?.check?.(`400 ${Math.min(48, safePx)}px "Anton"`));
  if (antonLoaded) {
    return `400 ${safePx}px "Anton", "Montserrat", Impact, "Arial Black", sans-serif`;
  }
  return `900 ${safePx}px "Montserrat", "Anton", Impact, "Arial Black", sans-serif`;
};

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  thumbTitle,
  onThumbTitleChange,
  thumbBadge: _thumbBadge,
  onThumbBadgeChange: _onThumbBadgeChange,
  externalFontStyle,
  onConsumeExternalFontStyle,
  externalCoverAImageUrl,
  onConsumeExternalCoverAImage,
  onSendToArtEditor,
  youtubeMockTitle,
  scriptContext,
  manifestThumbnailSlots,
  endScreenSafeZone = '05:14-05:24',
  manifestDurationBadge,
  onNotify
}) => {
  const [showEndScreenSafeZone, setShowEndScreenSafeZone] = useState<boolean>(true);
  const slotFilenames: Record<ThumbnailSlotId, string> = {
    A: manifestThumbnailSlots?.A || 'thumbnail_4k_3840x2160_A.jpg',
    B: manifestThumbnailSlots?.B || 'thumbnail_4k_3840x2160_B.jpg',
    C: manifestThumbnailSlots?.C || 'thumbnail_4k_3840x2160_C.jpg'
  };
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedCanvasARef = useRef<HTMLCanvasElement | null>(null);
  const feedCanvasBRef = useRef<HTMLCanvasElement | null>(null);
  const feedCanvasCRef = useRef<HTMLCanvasElement | null>(null);
  const mobileFeedCanvasARef = useRef<HTMLCanvasElement | null>(null);
  const mobileFeedCanvasBRef = useRef<HTMLCanvasElement | null>(null);
  const mobileFeedCanvasCRef = useRef<HTMLCanvasElement | null>(null);

  const [activeSlot, setActiveSlot] = useState<ThumbnailSlotId>('A');
  const [slotImages, setSlotImages] = useState<Record<ThumbnailSlotId, HTMLImageElement | null>>({
    A: null,
    B: null,
    C: null
  });

  const projectTitleSeed = (youtubeMockTitle || thumbTitle || '').trim();
  const lastSyncedExternalTitleRef = useRef<string>(thumbTitle);

  const [slotConfigs, setSlotConfigs] = useState<Record<ThumbnailSlotId, ThumbnailSlotConfig>>(() => {
    let parsed: Partial<Record<ThumbnailSlotId, PersistedSlotState>> | null = null;
    try {
      const rawV2 = localStorage.getItem(THUMB_ABC_SLOTS_STORAGE_KEY);
      if (rawV2) {
        parsed = JSON.parse(rawV2) as Partial<Record<ThumbnailSlotId, PersistedSlotState>>;
      } else {
        const rawV1 = localStorage.getItem(THUMB_ABC_SLOTS_LEGACY_KEY);
        if (rawV1) {
          parsed = JSON.parse(rawV1) as Partial<Record<ThumbnailSlotId, PersistedSlotState>>;
        }
      }
    } catch {
      parsed = null;
    }

    const cfgA = hydrateSlotConfig('A', projectTitleSeed, parsed?.A);
    const cfgB = hydrateSlotConfig('B', projectTitleSeed, parsed?.B);
    const cfgC = hydrateSlotConfig('C', projectTitleSeed, parsed?.C);

    if (!parsed?.A?.topText && thumbTitle.trim()) {
      const split = splitProjectTitleIntoTwoLines(thumbTitle);
      cfgA.topText = split.line1;
      cfgA.bottomText = split.line2;
    }

    return { A: cfgA, B: cfgB, C: cfgC };
  });

  // Односторонняя безопасная синхронизация при внешнем изменении thumbTitle (без цикла ввода)
  useEffect(() => {
    if (thumbTitle === lastSyncedExternalTitleRef.current) return;
    lastSyncedExternalTitleRef.current = thumbTitle;
    const split = splitProjectTitleIntoTwoLines(thumbTitle);
    setSlotConfigs(prev => ({
      ...prev,
      A: {
        ...prev.A,
        topText: split.line1,
        bottomText: split.line2
      }
    }));
  }, [thumbTitle]);

  useEffect(() => {
    try {
      localStorage.setItem(THUMB_ABC_SLOTS_STORAGE_KEY, JSON.stringify(slotConfigs));
    } catch {
      // ignore quota errors
    }
  }, [slotConfigs]);

  const updateSlotConfig = useCallback(
    (slot: ThumbnailSlotId, updater: (prev: ThumbnailSlotConfig) => ThumbnailSlotConfig) => {
      setSlotConfigs(prev => ({
        ...prev,
        [slot]: updater(prev[slot])
      }));
    },
    []
  );

  const activeConfig = slotConfigs[activeSlot];
  const imgA = slotImages.A;

  useEffect(() => {
    if (externalFontStyle) {
      onConsumeExternalFontStyle?.();
    }
  }, [externalFontStyle, onConsumeExternalFontStyle]);

  useEffect(() => {
    if (!externalCoverAImageUrl) return;
    const editedImg = new Image();
    editedImg.onload = () => {
      setSlotImages(prev => ({ ...prev, A: editedImg }));
      window.selectedMasterThumbnail = externalCoverAImageUrl;
      onConsumeExternalCoverAImage?.();
    };
    editedImg.src = externalCoverAImageUrl;
  }, [externalCoverAImageUrl, onConsumeExternalCoverAImage]);

  const [activeHookBox, setActiveHookBox] = useState<HookBoundingBoxPct | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<ThumbnailSlotId | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<ThumbnailSlotId | null>(null);
  const [fontsReadyTick, setFontsReadyTick] = useState<number>(0);

  // Локальная подготовка разрешения, 3x3 резкости базового кадра и мультиформатный экспорт
  const [baseSharpenPct, setBaseSharpenPct] = useState<number>(0);
  const [baseResolutionPreset, setBaseResolutionPreset] = useState<
    'original' | '1920x1080' | '2560x1440' | '3840x2160'
  >('original');
  const [isExportingFormat, setIsExportingFormat] = useState<string | null>(null);
  const [batchExportStatus, setBatchExportStatus] = useState<string>('');
  const [lastExportReport, setLastExportReport] = useState<
    Record<
      ThumbnailSlotId,
      { formatLabel: string; filename: string; sizeText: string } | null
    >
  >({ A: null, B: null, C: null });
  const [showCopyMenu, setShowCopyMenu] = useState<boolean>(false);

  // Сетка 2x2 (4 чистых 16:9 варианта обложки без водяных знаков: AI Horde / Cloudflare Flux.1-Schnell)
  const [batchVariants, setBatchVariants] = useState<string[]>(() => [
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_0', 0),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_1', 1),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_2', 2),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_3', 3)
  ]);
  const [selectedMasterVariantIdx, setSelectedMasterVariantIdx] = useState<number>(0);
  const [attachedToYoutubeIdx, setAttachedToYoutubeIdx] = useState<number | null>(0);
  const [zoomedVariantIdx, setZoomedVariantIdx] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatusText, setGenerationStatusText] = useState<string>('');
  const [buttonQueueStatus, setButtonQueueStatus] = useState<string>('');
  const [generatingTargetSlot, setGeneratingTargetSlot] = useState<ThumbnailSlotId | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [variantLabels, setVariantLabels] = useState<string[]>([...LOCAL_SCENE_LABELS]);
  const [isSlicingLocalMedia, setIsSlicingLocalMedia] = useState<boolean>(false);
  const localMediaInputRef = useRef<HTMLInputElement | null>(null);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const generationAbortRef = useRef<AbortController | null>(null);

  // Опциональные настройки Cloudflare Workers AI (сохраняются в localStorage)
  const [cfAccountId, setCfAccountId] = useState<string>(() => {
    try {
      return localStorage.getItem(CF_ACCOUNT_ID_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [cfApiToken, setCfApiToken] = useState<string>(() => {
    try {
      return localStorage.getItem(CF_API_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [showCfSettings, setShowCfSettings] = useState<boolean>(() => {
    try {
      return Boolean(
        localStorage.getItem(CF_ACCOUNT_ID_STORAGE_KEY) ||
          localStorage.getItem(CF_API_TOKEN_STORAGE_KEY)
      );
    } catch {
      return false;
    }
  });

  const isCloudflareConfigured = Boolean(cfAccountId.trim() && cfApiToken.trim());

  const updateBatchVariantsSafely = useCallback((nextUrls: string[]) => {
    const prevToRevoke = activeBlobUrlsRef.current.filter(
      u => u.startsWith('blob:') && !nextUrls.includes(u)
    );
    activeBlobUrlsRef.current = nextUrls.filter(u => u.startsWith('blob:'));
    setBatchVariants(nextUrls);
    if (prevToRevoke.length > 0) {
      window.setTimeout(() => {
        prevToRevoke.forEach(u => URL.revokeObjectURL(u));
      }, 1000);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CF_ACCOUNT_ID_STORAGE_KEY, cfAccountId.trim());
    } catch {
      // ignore storage quota errors
    }
  }, [cfAccountId]);

  useEffect(() => {
    try {
      localStorage.setItem(CF_API_TOKEN_STORAGE_KEY, cfApiToken.trim());
    } catch {
      // ignore storage quota errors
    }
  }, [cfApiToken]);

  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
      activeBlobUrlsRef.current.forEach(u => {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, []);

  // Режим сравнения A/B/C в ленте YouTube и Ч/Б контрастный фильтр силуэтов
  const [compareFeedEnabled, setCompareFeedEnabled] = useState<boolean>(false);
  const [feedViewportMode, setFeedViewportMode] = useState<'both' | 'desktop' | 'mobile'>('both');
  const [bwContrastFilter, setBwContrastFilter] = useState<boolean>(false);

  // Оверлей интерфейса YouTube (таймкод, аватарка, мобильный масштаб 160x90)
  const [showYoutubeOverlay, setShowYoutubeOverlay] = useState<boolean>(true);
  const [youtubeDurationBadge, setYoutubeDurationBadge] = useState<string>('3:00:00');
  const [youtubeChannelName] = useState<string>('Aether Documentary 4K');
  const [youtubeVideoHeading, setYoutubeVideoHeading] = useState<string>(
    youtubeMockTitle || thumbTitle || '4K Documentary Release'
  );

  useEffect(() => {
    if (youtubeMockTitle) {
      setYoutubeVideoHeading(youtubeMockTitle);
    }
  }, [youtubeMockTitle]);

  // 1. Авто-экстрактор лучшего кадра в честном 4K (3840x2160) по секунде
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [seekTimeSec, setSeekTimeSec] = useState<number>(0);

  // 2. Генерация 16:9 без водяных знаков (AI Horde Flux.1-Schnell 1344x768 / Cloudflare Workers AI)
  const [promptStylePreset, setPromptStylePreset] = useState<
    'mystery_dark' | 'ambient_4k' | 'truecrime_contrast' | 'scifi_neon'
  >('mystery_dark');
  const [customFluxPrompt, setCustomFluxPrompt] = useState<string>('');
  const [isGeneratingCovers, setIsGeneratingCovers] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showVideoExtractor, setShowVideoExtractor] = useState<boolean>(false);
  const [showPromptGenerator, setShowPromptGenerator] = useState<boolean>(false);

  // Предзагрузка Google Fonts Anton + Montserrat:wght@900 для 100% идентичности Canvas и UI
  useEffect(() => {
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts) {
      Promise.allSettled([
        document.fonts.load('400 72px "Anton"'),
        document.fonts.load('900 72px "Montserrat"'),
        document.fonts.load('800 24px "Montserrat"')
      ]).then(() => {
        if (!cancelled) {
          setFontsReadyTick(t => t + 1);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopySlotSettingsTo = (targetSlot: ThumbnailSlotId) => {
    if (targetSlot === activeSlot) return;
    const sourceCfg = slotConfigs[activeSlot];
    const clonedCfg: ThumbnailSlotConfig = {
      ...sourceCfg,
      badgeTexts: [...sourceCfg.badgeTexts] as [string, string, string],
      hookLayout: { ...sourceCfg.hookLayout },
      bgAdjust: { ...sourceCfg.bgAdjust }
    };
    if (targetSlot === 'A') {
      const combined = [clonedCfg.topText, clonedCfg.bottomText].filter(Boolean).join(' ').trim();
      lastSyncedExternalTitleRef.current = combined;
      onThumbTitleChange(combined);
    }
    setSlotConfigs(prev => ({
      ...prev,
      [targetSlot]: clonedCfg
    }));
    const sourceImg = slotImages[activeSlot] || slotImages.A;
    if (sourceImg) {
      setSlotImages(prev => ({
        ...prev,
        [targetSlot]: sourceImg
      }));
    }
    setShowCopyMenu(false);
    setActiveSlot(targetSlot);
    onNotify(`📋 Настройки и фон слота ${activeSlot} скопированы в Вариант ${targetSlot}!`, 'success');
  };

  // Автогенератор визуального промпта на английском языке
  const generatedCoverPrompt = (() => {
    const rawContext = (
      scriptContext ||
      [activeConfig.topText, activeConfig.bottomText].filter(Boolean).join(' ') ||
      thumbTitle ||
      'dramatic historical documentary scene'
    )
      .replace(/[а-яёА-ЯЁ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const topicHint =
      rawContext.length > 5
        ? rawContext.slice(0, 110)
        : 'cinematic historical documentary mystery, dramatic lighting';

    const styleMap = {
      mystery_dark:
        'High-CTR YouTube documentary thumbnail, cinematic dark mystery atmosphere, dramatic chiaroscuro, volumetric fog, shadowy silhouette in background, negative space for bold typography, 35mm f/1.4 lens, 8k photorealistic',
      ambient_4k:
        'Ultra-cozy 4K ambient loop thumbnail, warm amber glow contrasting against deep blue twilight storm outside window, soft volumetric light, cinematic color grading, Kodachrome 64 aesthetic, 8k resolution',
      truecrime_contrast:
        'True crime investigative YouTube thumbnail, high-contrast split composition, classified dossier archive lighting, cold cyan rim lighting, intense dramatic shadows, ultra sharp focus, rule of thirds',
      scifi_neon:
        'Anomalous signal documentary thumbnail, atmospheric dust particles in light beam, anamorphic lens flare, high contrast silhouette, 8k realism'
    };

    const hookWords = [activeConfig.topText, activeConfig.bottomText]
      .filter(Boolean)
      .join(' ')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');

    const hookClause = hookWords
      ? `Composition focus for hook: "${hookWords.toUpperCase()}" | `
      : 'Pure clean artwork without embedded text overlays | ';

    return `${styleMap[promptStylePreset]} | Subject context: "${topicHint}" | ${hookClause}Clean 16:9 composition without text or watermarks, clear silhouette readability on mobile 160x90px`;
  })();

  const activePromptText = customFluxPrompt.trim() || generatedCoverPrompt;

  const updateSlotLines = (
    slot: ThumbnailSlotId,
    nextTop: string,
    nextBottom: string
  ) => {
    updateSlotConfig(slot, prev => ({
      ...prev,
      topText: nextTop,
      bottomText: nextBottom
    }));
    if (slot === 'A') {
      const combined = [nextTop.trim(), nextBottom.trim()].filter(Boolean).join(' ').trim();
      lastSyncedExternalTitleRef.current = combined;
      onThumbTitleChange(combined);
    }
  };

  // Интерактивное перетаскивание мышкой и пальцем для 2-строчного блока заголовка
  const startHookDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, slot: ThumbnailSlotId) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const canvasEl = mainCanvasRef.current;
      if (!canvasEl) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = canvasEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialLayout = slotConfigs[slot].hookLayout;

      setDraggingSlot(slot);

      const onPointerMove = (moveEv: PointerEvent) => {
        const dxPct = ((moveEv.clientX - startX) / Math.max(1, rect.width)) * 100;
        const dyPct = ((moveEv.clientY - startY) / Math.max(1, rect.height)) * 100;
        const nextX = Math.max(6, Math.min(94, Number((initialLayout.xPct + dxPct).toFixed(1))));
        const nextY = Math.max(8, Math.min(92, Number((initialLayout.yPct + dyPct).toFixed(1))));
        updateSlotConfig(slot, prev => ({
          ...prev,
          hookLayout: { ...prev.hookLayout, xPct: nextX, yPct: nextY }
        }));
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        setDraggingSlot(null);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [slotConfigs, updateSlotConfig]
  );

  // Отрисовка обложки «Documentary Impact + Grunge Splash» на Canvas (320x180, 1280x720 или 3840x2160)
  const drawCoverOnCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      image: HTMLImageElement | null,
      cfg: ThumbnailSlotConfig,
      fallbackLabel?: string,
      baseSharpenPercent: number = 0
    ): HookBoundingBoxPct | null => {
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const w = canvas.width;
      const h = canvas.height;
      const scale = w / 1280;

      ctx.clearRect(0, 0, w, h);

      if (image) {
        renderAdjustedBackgroundToCanvas(
          ctx,
          image,
          w,
          h,
          cfg.bgAdjust || DEFAULT_BG_ADJUST,
          baseSharpenPercent,
          drawCoverImageToCanvas
        );
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#090d16');
        bgGrad.addColorStop(0.5, '#111c33');
        bgGrad.addColorStop(1, '#060911');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const radial = ctx.createRadialGradient(
          w * 0.62,
          h * 0.42,
          20 * scale,
          w * 0.62,
          h * 0.42,
          440 * scale
        );
        radial.addColorStop(0, 'rgba(245, 158, 11, 0.24)');
        radial.addColorStop(0.6, 'rgba(56, 189, 248, 0.08)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${Math.round(20 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          fallbackLabel
            ? `${fallbackLabel} — нажмите «Flux.1 AI Horde (2×2)»`
            : 'Нажмите «Flux.1 AI Horde (2×2)» или выберите кадр ниже',
          w / 2,
          h * 0.45
        );
      }

      const topUpper = (cfg.topText || '').trim().toUpperCase();
      const bottomUpper = (cfg.bottomText || '').trim().toUpperCase();
      const hasHeadline = topUpper.length > 0 || bottomUpper.length > 0;

      // Лёгкая кинематографическая виньетка под зоной заголовка для контраста
      if (hasHeadline) {
        const rawVx = (cfg.hookLayout.xPct / 100) * w;
        const rawVy = (cfg.hookLayout.yPct / 100) * h;
        const vignette = ctx.createRadialGradient(
          rawVx,
          rawVy,
          40 * scale,
          rawVx,
          rawVy,
          560 * scale
        );
        vignette.addColorStop(0, 'rgba(4, 7, 15, 0.46)');
        vignette.addColorStop(0.65, 'rgba(4, 7, 15, 0.16)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
      }

      // 1. ВЕРХНИЕ КАПСУЛЫ-БЕЙДЖИ (Правый верхний угол)
      const activeBadges = cfg.badgesEnabled
        ? cfg.badgeTexts.map(t => (t || '').trim().toUpperCase()).filter(Boolean)
        : [];

      if (activeBadges.length > 0) {
        const badgeUserScale = Math.max(0.6, Math.min(1.5, (cfg.badgeScalePct ?? 100) / 100));
        const bScale = scale * badgeUserScale;
        const badgeFontPx = 14 * bScale;
        const badgeFontFamily = '"Montserrat", "Inter", sans-serif';
        const baseTrackingPx = 2.0 * bScale;

        const measureTrackedWidth = (text: string, trackingPx: number): number => {
          const chars = Array.from(text);
          if (chars.length === 0) return 0;
          const glyphsW = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
          return glyphsW + Math.max(0, chars.length - 1) * trackingPx;
        };

        const drawTrackedCenteredText = (
          text: string,
          centerXPos: number,
          centerYPos: number,
          trackingPx: number
        ) => {
          const chars = Array.from(text);
          if (chars.length === 0) return;
          const totalW = measureTrackedWidth(text, trackingPx);
          let charCursor = centerXPos - totalW / 2;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          for (let cIdx = 0; cIdx < chars.length; cIdx++) {
            const ch = chars[cIdx];
            const cw = ctx.measureText(ch).width;
            ctx.fillText(ch, charCursor, centerYPos);
            charCursor += cw + trackingPx;
          }
        };

        ctx.font = `800 ${Math.max(1, Math.round(badgeFontPx))}px ${badgeFontFamily}`;

        const horizontalPad = 36 * bScale;
        const badgeGap = 12 * bScale;
        const badgeH = 42 * bScale;
        const rawWidths = activeBadges.map(lbl =>
          Math.max(106 * bScale, measureTrackedWidth(lbl, baseTrackingPx) + horizontalPad)
        );
        const totalRawW =
          rawWidths.reduce((sum, bw) => sum + bw, 0) +
          badgeGap * Math.max(0, activeBadges.length - 1);
        const maxAvailableW = w - 64 * scale;
        const fitFactor = totalRawW > maxAvailableW ? maxAvailableW / totalRawW : 1;

        if (fitFactor < 1) {
          ctx.font = `800 ${Math.max(1, Math.round(badgeFontPx * fitFactor))}px ${badgeFontFamily}`;
        }

        const effectiveH = badgeH * fitFactor;
        const effectiveGap = badgeGap * fitFactor;
        const effectiveTracking = baseTrackingPx * fitFactor;
        const widths = rawWidths.map(bw => bw * fitFactor);
        const topY = 28 * scale;

        let cursorX = w - 32 * scale;
        for (let i = activeBadges.length - 1; i >= 0; i--) {
          const bw = widths[i];
          const bx = cursorX - bw;
          const label = activeBadges[i];

          ctx.save();
          ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = Math.max(1.5, 2 * bScale * fitFactor);
          ctx.beginPath();
          ctx.roundRect(bx, topY, bw, effectiveH, 8 * bScale * fitFactor);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FACC15';
          drawTrackedCenteredText(label, bx + bw / 2, topY + effectiveH * 0.52, effectiveTracking);
          ctx.restore();

          cursorX = bx - effectiveGap;
        }
      }

      if (!hasHeadline) {
        return null;
      }

      // 2. ЕДИНЫЙ СТИЛЬ «DOCUMENTARY IMPACT + GRUNGE SPLASH» (2 независимые строки)
      const hl = cfg.hookLayout;
      const maxSafeW = w * 0.82;
      let fontSize1 = topUpper ? 88 * scale * (hl.topScalePct / 100) : 0;
      let line1W = 0;

      if (topUpper) {
        ctx.font = buildImpactCanvasFont(fontSize1);
        line1W = ctx.measureText(topUpper).width;
        if (line1W > maxSafeW) {
          fontSize1 = fontSize1 * (maxSafeW / Math.max(1, line1W));
          ctx.font = buildImpactCanvasFont(fontSize1);
          line1W = ctx.measureText(topUpper).width;
        }
      }

      let fontSize2 = bottomUpper ? 88 * scale * (hl.bottomScalePct / 100) : 0;
      let line2W = 0;

      if (bottomUpper) {
        if (hl.autoFitBottomToTop && topUpper && line1W > 0) {
          const refSize = 100 * scale;
          ctx.font = buildImpactCanvasFont(refSize);
          const refW = Math.max(1, ctx.measureText(bottomUpper).width);
          fontSize2 = Math.max(28 * scale, Math.min(200 * scale, refSize * (line1W / refW)));
        }
        ctx.font = buildImpactCanvasFont(fontSize2);
        line2W = ctx.measureText(bottomUpper).width;
        if (line2W > maxSafeW) {
          fontSize2 = fontSize2 * (maxSafeW / Math.max(1, line2W));
          ctx.font = buildImpactCanvasFont(fontSize2);
          line2W = ctx.measureText(bottomUpper).width;
        }
      }

      const capH1 = topUpper ? fontSize1 * 0.78 : 0;
      const capH2 = bottomUpper ? fontSize2 * 0.78 : 0;
      const avgFs = topUpper && bottomUpper ? (fontSize1 + fontSize2) * 0.5 : Math.max(fontSize1, fontSize2);
      const lineGap =
        topUpper && bottomUpper
          ? Math.max(8 * scale, avgFs * 0.16 * (hl.lineSpacingPct / 100))
          : 0;
      const totalTextH = capH1 + lineGap + capH2;
      const skewOverhang = Math.max(fontSize1, fontSize2) * 0.16;
      const contentW = Math.max(line1W, line2W) + skewOverhang;
      const splashPadMult = Math.max(0.5, Math.min(1.6, (cfg.splashPaddingPct ?? 100) / 100));

      const estPadX = Math.max(48 * scale, contentW * 0.14) * splashPadMult;
      const estPadY = Math.max(22 * scale, totalTextH * 0.18) * splashPadMult;
      const estBoxW = contentW + estPadX * 2 + 24 * scale;
      const estBoxH = totalTextH + estPadY * 2 + 14 * scale;

      const rawCx = (Math.max(6, Math.min(94, hl.xPct)) / 100) * w;
      const rawCy = (Math.max(8, Math.min(92, hl.yPct)) / 100) * h;
      const edgeMargin = 24 * scale;
      const drawCx =
        estBoxW + edgeMargin * 2 < w
          ? Math.max(estBoxW / 2 + edgeMargin, Math.min(w - estBoxW / 2 - edgeMargin, rawCx))
          : w / 2;
      const drawCy =
        estBoxH + edgeMargin * 2 < h
          ? Math.max(estBoxH / 2 + edgeMargin, Math.min(h - estBoxH / 2 - edgeMargin, rawCy))
          : h / 2;

      const tiltRad = (Math.max(-6, Math.min(6, hl.blockTiltDeg)) * Math.PI) / 180;
      const skewXSlope = Math.tan((-10 * Math.PI) / 180);
      const topYCenter = -totalTextH / 2 + capH1 / 2;
      const bottomYCenter = topUpper
        ? -totalTextH / 2 + capH1 + lineGap + capH2 / 2
        : 0;

      ctx.save();
      ctx.translate(drawCx, drawCy);
      ctx.rotate(tiltRad);

      // Процедурная векторная гранж-подложка (6 форм кисти + None) с детерминированным зерном
      const splashBounds = drawUnifiedGrungeSplash(ctx, {
        shape: cfg.splashShape || 'monolith_bristle',
        colorHex: cfg.splashColor || '#E10613',
        paddingPct: cfg.splashPaddingPct ?? 100,
        shadowPct: cfg.splashShadowPct ?? 100,
        contentW,
        totalTextH,
        hasTop: Boolean(topUpper),
        topYCenter,
        topW: line1W + fontSize1 * 0.14,
        topH: capH1,
        hasBottom: Boolean(bottomUpper),
        bottomYCenter,
        bottomW: line2W + fontSize2 * 0.14,
        bottomH: capH2,
        scale,
        seedText: `${topUpper}_${bottomUpper}`
      });
      const finalW = Math.max(contentW + 40 * scale, splashBounds.splashW);
      const finalH = Math.max(totalTextH + 30 * scale, splashBounds.splashH);

      const drawDocumentaryImpactLine = (
        text: string,
        fontSizePx: number,
        lineCenterY: number,
        hexColor: string,
        useSubtle3DGradient: boolean
      ) => {
        const fontStr = buildImpactCanvasFont(fontSizePx);
        const strokeWidth = Math.max(3, fontSizePx * 0.135);
        const hardShadowOffX = Math.max(2, fontSizePx * 0.055);
        const hardShadowOffY = Math.max(3, fontSizePx * 0.08);

        ctx.save();
        ctx.translate(0, lineCenterY);
        ctx.transform(1, 0, skewXSlope, 1, 0, 0);
        ctx.font = fontStr;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.miterLimit = 2;

        // 1. Жёсткая смещённая тень (Hard Offset Drop Shadow)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(text, hardShadowOffX, hardShadowOffY);
        ctx.fillText(text, hardShadowOffX, hardShadowOffY);

        // 2. Плотная чёрная обводка с мягким контуром подъёма
        ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
        ctx.shadowBlur = 10 * scale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * scale;
        ctx.strokeStyle = '#05070C';
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(text, 0, 0);

        // 3. Чистая заливка (верх — насыщенный плотный цвет, низ — с лёгким 3D градиентом)
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = buildVertical3DFill(
          ctx,
          hexColor,
          -fontSizePx * 0.42,
          fontSizePx * 0.42,
          useSubtle3DGradient
        );
        ctx.fillText(text, 0, 0);
        ctx.restore();
      };

      if (topUpper) {
        drawDocumentaryImpactLine(topUpper, fontSize1, topYCenter, cfg.topColor || '#FFFFFF', false);
      }
      if (bottomUpper) {
        drawDocumentaryImpactLine(
          bottomUpper,
          fontSize2,
          bottomYCenter,
          cfg.bottomColor || '#FFD600',
          true
        );
      }

      ctx.restore();

      const rawLeft = Math.max(0, drawCx - finalW / 2);
      const rawTop = Math.max(0, drawCy - finalH / 2);
      const rawRight = Math.min(w, drawCx + finalW / 2);
      const rawBottom = Math.min(h, drawCy + finalH / 2);

      return {
        leftPct: (rawLeft / w) * 100,
        topPct: (rawTop / h) * 100,
        widthPct: ((rawRight - rawLeft) / w) * 100,
        heightPct: ((rawBottom - rawTop) / h) * 100
      };
    },
    []
  );

  const renderSlotToCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      slot: ThumbnailSlotId,
      fallbackLabel?: string
    ): HookBoundingBoxPct | null => {
      const cfg = slotConfigs[slot];
      const img = slotImages[slot] || slotImages.A;
      return drawCoverOnCanvas(canvas, img, cfg, fallbackLabel, baseSharpenPct);
    },
    [drawCoverOnCanvas, slotConfigs, slotImages, baseSharpenPct]
  );

  const renderAllCanvases = useCallback(() => {
    const nextBox = renderSlotToCanvas(
      mainCanvasRef.current,
      activeSlot,
      `Вариант ${activeSlot}`
    );
    setActiveHookBox(prev => {
      if (!prev && !nextBox) return prev;
      if (
        prev &&
        nextBox &&
        Math.abs(prev.leftPct - nextBox.leftPct) < 0.05 &&
        Math.abs(prev.topPct - nextBox.topPct) < 0.05 &&
        Math.abs(prev.widthPct - nextBox.widthPct) < 0.05 &&
        Math.abs(prev.heightPct - nextBox.heightPct) < 0.05
      ) {
        return prev;
      }
      return nextBox;
    });

    renderSlotToCanvas(mobileCanvasRef.current, activeSlot);

    if (compareFeedEnabled) {
      renderSlotToCanvas(feedCanvasARef.current, 'A', 'Вариант A');
      renderSlotToCanvas(feedCanvasBRef.current, 'B', 'Вариант B');
      renderSlotToCanvas(feedCanvasCRef.current, 'C', 'Вариант C');
      renderSlotToCanvas(mobileFeedCanvasARef.current, 'A');
      renderSlotToCanvas(mobileFeedCanvasBRef.current, 'B');
      renderSlotToCanvas(mobileFeedCanvasCRef.current, 'C');
    }
  }, [renderSlotToCanvas, activeSlot, compareFeedEnabled, fontsReadyTick, feedViewportMode]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  // Загружаем первый мастер-кадр из 2x2 сетки при старте и сохраняем в window.selectedMasterThumbnail
  useEffect(() => {
    if (!imgA && batchVariants[0]) {
      window.selectedMasterThumbnail = batchVariants[0];
      const initImg = new Image();
      initImg.onload = () => setSlotImages(prev => ({ ...prev, A: initImg }));
      initImg.src = batchVariants[0];
    }
  }, [imgA, batchVariants]);

  // Выбор любого из 4-х вариантов сетки 2x2 как «Выбранный мастер-кадр»
  const handleSelectBatchVariant = (idx: number, targetSlot: ThumbnailSlotId = activeSlot) => {
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    window.selectedMasterThumbnail = url;

    const selectedImage = new Image();
    selectedImage.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: selectedImage }));
      onNotify(
        `✨ Вариант #${idx + 1} установлен на Вариант ${targetSlot}!`,
        'success'
      );
    };
    selectedImage.src = url;
  };

  // Кнопка «📥 Скачать мастер-кадр» (экспорт в честном 4K PNG со стилем активного слота)
  const handleDownloadVariantFromGrid = (idx: number) => {
    const url = batchVariants[idx];
    if (!url) return;
    const cfg = slotConfigs[activeSlot];
    const tempImg = new Image();
    tempImg.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 3840;
      offscreen.height = 2160;
      drawCoverOnCanvas(offscreen, tempImg, cfg, undefined, baseSharpenPct);
      const link = document.createElement('a');
      link.download = `thumbnail_4k_${idx + 1}.png`;
      link.href = offscreen.toDataURL('image/png');
      link.click();
      onNotify(`📥 Вариант #${idx + 1} (4K PNG thumbnail_4k_${idx + 1}.png) скачан на устройство!`, 'success');
    };
    tempImg.src = url;
  };



  // Кнопка «Привязать к YouTube релизу»
  const handleAttachToYoutubeRelease = (idx: number) => {
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    setAttachedToYoutubeIdx(idx);
    window.selectedMasterThumbnail = url;
    try {
      localStorage.setItem(
        'youtube_release_thumbnail',
        JSON.stringify({
          variantIndex: idx + 1,
          titleHook: [slotConfigs.A.topText, slotConfigs.A.bottomText]
            .filter(Boolean)
            .join(' ')
            .trim(),
          badges: slotConfigs.A.badgesEnabled ? slotConfigs.A.badgeTexts : [],
          attachedAt: new Date().toISOString()
        })
      );
    } catch {
      // ignore storage quota errors
    }
    handleSelectBatchVariant(idx, activeSlot);
    onNotify(
      `🚀 Мастер-кадр #${idx + 1} успешно привязан к YouTube релизу (Слот ${activeSlot})!`,
      'success'
    );
  };

  // Автономная генерация 4-х 4K кадров на Canvas (локальный бесплатный генератор)
  const handleGenerateProceduralBatchFallback = (targetSlot: ThumbnailSlotId = activeSlot) => {
    const fallbackUrls = [0, 1, 2, 3].map(idx =>
      renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, idx)
    );
    updateBatchVariantsSafely(fallbackUrls);
    setVariantLabels([...LOCAL_SCENE_LABELS]);
    setSelectedMasterVariantIdx(0);
    setLastModelUsed('HTML5 Canvas 4K (локальный генератор)');
    setGenerationError(null);
    window.selectedMasterThumbnail = fallbackUrls[0];

    const fallbackImg = new Image();
    fallbackImg.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: fallbackImg }));
      onNotify(`🎨 Сгенерированы 4 локальных 4K фона (16:9) для Варианта ${targetSlot}!`, 'success');
    };
    fallbackImg.src = fallbackUrls[0];
  };

  // Нарезка 4 вариантов 16:9 превью из загруженного пользователем видео (.mp4/.mov/.webm) или арта (.png/.jpg)
  const handleSliceLocalMediaToGrid = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isVideo =
      file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
    const isImage =
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

    if (!isVideo && !isImage) {
      onNotify('Поддерживаются видео (.mp4, .mov, .webm) и изображения (.png, .jpg, .webp).', 'error');
      return;
    }

    setIsSlicingLocalMedia(true);
    setGenerationError(null);

    try {
      if (isVideo) {
        const objectUrl = URL.createObjectURL(file);
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(objectUrl);
        setVideoFileName(file.name);

        const tempVideo = document.createElement('video');
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.preload = 'auto';
        tempVideo.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Таймаут загрузки видео')), 15000);
          tempVideo.onloadedmetadata = () => {
            window.clearTimeout(timer);
            resolve();
          };
          tempVideo.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('Не удалось декодировать видеофайл в браузере'));
          };
        });

        const dur = Number.isFinite(tempVideo.duration) && tempVideo.duration > 0 ? tempVideo.duration : 8;
        const fractions = [0.12, 0.36, 0.62, 0.85];
        const slicedUrls: string[] = [];
        const slicedLabels: string[] = [];

        for (let i = 0; i < 4; i++) {
          const targetSec = Math.min(Math.max(0.1, dur * fractions[i]), Math.max(0.2, dur - 0.1));
          await new Promise<void>(resolve => {
            const seekTimer = window.setTimeout(() => resolve(), 3500);
            tempVideo.onseeked = () => {
              window.clearTimeout(seekTimer);
              resolve();
            };
            tempVideo.currentTime = targetSec;
          });

          const offscreen = document.createElement('canvas');
          offscreen.width = 1920;
          offscreen.height = 1080;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            drawCoverImageToCanvas(
              ctx,
              tempVideo,
              tempVideo.videoWidth || 1920,
              tempVideo.videoHeight || 1080,
              1920,
              1080,
              1
            );
            slicedUrls.push(offscreen.toDataURL('image/jpeg', 0.94));
            slicedLabels.push(`Кадр @ ${targetSec.toFixed(1)}с`);
          }
        }

        if (!slicedUrls.length) {
          throw new Error('Не удалось извлечь кадры из видео');
        }

        while (slicedUrls.length < 4) {
          slicedUrls.push(slicedUrls[0]);
          slicedLabels.push(`Кадр #${slicedUrls.length}`);
        }

        updateBatchVariantsSafely(slicedUrls);
        setVariantLabels(slicedLabels);
        setSelectedMasterVariantIdx(0);
        setLastModelUsed(`Видео-нарезка (${file.name})`);
        window.selectedMasterThumbnail = slicedUrls[0];

        const firstImg = new Image();
        firstImg.onload = () => setSlotImages(prev => ({ ...prev, [activeSlot]: firstImg }));
        firstImg.src = slicedUrls[0];

        onNotify(`🎬 Из видео «${file.name}» нарезано 4 варианта превью (16:9) в сетку 2×2!`, 'success');
      } else {
        const objectUrl = URL.createObjectURL(file);
        const srcImg = new Image();
        await new Promise<void>((resolve, reject) => {
          srcImg.onload = () => resolve();
          srcImg.onerror = () => reject(new Error('Не удалось прочитать изображение'));
          srcImg.src = objectUrl;
        });

        const crops = [
          { label: 'Оригинальный кадр 16:9', zoom: 1.0, ox: 0, oy: 0, filter: 'none', tint: '' },
          { label: 'Крупный фокус (1.24×)', zoom: 1.24, ox: -0.04, oy: -0.02, filter: 'contrast(1.12) saturate(1.1)', tint: '' },
          { label: 'Холодный Mystery-грейд', zoom: 1.14, ox: 0.05, oy: 0.02, filter: 'contrast(1.18) brightness(0.92)', tint: 'rgba(14, 165, 233, 0.16)' },
          { label: 'Янтарный драматик HDR', zoom: 1.18, ox: 0, oy: 0.03, filter: 'contrast(1.22) saturate(1.2)', tint: 'rgba(245, 158, 11, 0.16)' }
        ];

        const slicedUrls = crops.map(cfg => {
          const offscreen = document.createElement('canvas');
          offscreen.width = 1920;
          offscreen.height = 1080;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return '';
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.filter = cfg.filter;
          drawCoverImageToCanvas(
            ctx,
            srcImg,
            srcImg.naturalWidth || 1920,
            srcImg.naturalHeight || 1080,
            1920,
            1080,
            cfg.zoom,
            cfg.ox,
            cfg.oy
          );
          ctx.filter = 'none';
          if (cfg.tint) {
            ctx.fillStyle = cfg.tint;
            ctx.fillRect(0, 0, 1920, 1080);
          }
          const vig = ctx.createLinearGradient(0, 0, 1920 * 0.55, 1080);
          vig.addColorStop(0, 'rgba(2, 6, 14, 0.25)');
          vig.addColorStop(1, 'rgba(2, 6, 14, 0.55)');
          ctx.fillStyle = vig;
          ctx.fillRect(0, 0, 1920, 1080);
          return offscreen.toDataURL('image/jpeg', 0.94);
        });

        URL.revokeObjectURL(objectUrl);

        updateBatchVariantsSafely(slicedUrls);
        setVariantLabels(crops.map(c => c.label));
        setSelectedMasterVariantIdx(0);
        setLastModelUsed(`Арт-нарезка (${file.name})`);
        window.selectedMasterThumbnail = slicedUrls[0];

        const firstImg = new Image();
        firstImg.onload = () => setSlotImages(prev => ({ ...prev, [activeSlot]: firstImg }));
        firstImg.src = slicedUrls[0];

        onNotify(`🖼️ Из изображения «${file.name}» созданы 4 варианта превью (16:9) в сетку 2×2!`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка обработки локального файла';
      onNotify(msg, 'error');
    } finally {
      setIsSlicingLocalMedia(false);
    }
  };

  // ============================================================================
  // ПАКЕТНАЯ ГЕНЕРАЦИЯ 4 ЧИСТЫХ 16:9 ОБЛОЖЕК БЕЗ ВОДЯНЫХ ЗНАКОВ
  // ============================================================================
  const handleGenerateFluxCover = async (targetSlot: ThumbnailSlotId = activeSlot) => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsGeneratingCovers(true);
    setGeneratingTargetSlot(targetSlot);
    setGenerationError(null);
    setButtonQueueStatus(isCloudflareConfigured ? 'Генерация Cloudflare...' : 'Запрос в AI Horde...');
    setGenerationStatusText(
      isCloudflareConfigured
        ? 'Мгновенная генерация 4 вариантов через Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)...'
        : 'Отправка задачи в AI Horde (Flux.1-Schnell • 1344×768)...'
    );

    try {
      const result = isCloudflareConfigured
        ? await generateViaCloudflareFlux(
            activePromptText,
            cfAccountId.trim(),
            cfApiToken.trim(),
            controller.signal
          )
        : await generateViaAiHordeFlux(activePromptText, {
            signal: controller.signal,
            onProgress: (msg, shortText) => {
              setGenerationStatusText(msg);
              if (shortText) setButtonQueueStatus(shortText);
            }
          });

      const paddedUrls: string[] = [];
      for (let i = 0; i < 4; i++) {
        paddedUrls.push(
          result.images[i] ||
            result.images[0] ||
            renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, i)
        );
      }

      updateBatchVariantsSafely(paddedUrls);
      setVariantLabels(['Flux #1 (1344×768)', 'Flux #2 (1344×768)', 'Flux #3 (1344×768)', 'Flux #4 (1344×768)']);
      setSelectedMasterVariantIdx(0);
      setLastModelUsed(result.modelUsed);
      window.selectedMasterThumbnail = paddedUrls[0];

      const generatedImg = new Image();
      generatedImg.onload = () => {
        setSlotImages(prev => ({ ...prev, [targetSlot]: generatedImg }));
        setActiveSlot(targetSlot);
        onNotify(
          `🎨 4 чистые 16:9 обложки сгенерированы (${result.modelUsed}) и установлены в Вариант ${targetSlot}!`,
          'success'
        );
      };
      generatedImg.src = paddedUrls[0];
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Не удалось сгенерировать обложки через Flux.1-Schnell.';
      setGenerationError(msg);
      if (err instanceof FluxGenerationError && err.status === 499) {
        onNotify(msg, 'info');
      } else {
        onNotify(msg, 'error');
      }
    } finally {
      setIsGeneratingCovers(false);
      setGeneratingTargetSlot(null);
      setGenerationStatusText('');
      setButtonQueueStatus('');
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
    }
  };

  const handleCancelGeneration = () => {
    generationAbortRef.current?.abort();
  };

  const handleLoadImageForSlot = (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: ThumbnailSlotId
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          setSlotImages(prev => ({ ...prev, [slot]: img }));
          if (slot === 'A') {
            window.selectedMasterThumbnail = result;
          }
          onNotify(`Изображение загружено в Вариант ${slot}!`, 'success');
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Авто-экстрактор стоп-кадра из готового видео в честном 4K по таймкоду секунды
  const handleSelectVideoForExtraction = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFileName(file.name);
    setSeekTimeSec(0);
    onNotify(`Видео «${file.name}» загружено в 4K экстрактор стоп-кадров!`, 'success');
    e.target.value = '';
  };

  const handleSeekVideo = (sec: number) => {
    const clamped = Math.max(0, Math.min(videoDuration || 3600, sec));
    setSeekTimeSec(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const capture4KKeyframe = (targetSlot: ThumbnailSlotId | 'download') => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      onNotify('Сначала выберите видеофайл для захвата 4K стоп-кадра!', 'error');
      return;
    }

    const offscreen4K = document.createElement('canvas');
    offscreen4K.width = 3840;
    offscreen4K.height = 2160;
    const ctx = offscreen4K.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, 3840, 2160);

    const dataUrl = offscreen4K.toDataURL('image/jpeg', 0.96);

    if (targetSlot === 'download') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `keyframe_4k_3840x2160_${Math.round(seekTimeSec)}s.jpg`;
      a.click();
      onNotify(
        `📸 Честный 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) скачан!`,
        'success'
      );
      return;
    }

    const capturedImg = new Image();
    capturedImg.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: capturedImg }));
      setActiveSlot(targetSlot);
      if (targetSlot === 'A') {
        window.selectedMasterThumbnail = dataUrl;
      }
      onNotify(
        `📸 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) установлен на Вариант ${targetSlot}!`,
        'success'
      );
    };
    capturedImg.src = dataUrl;
  };

  // Локальное приведение базового изображения к целевому разрешению (1920x1080, 2560x1440, 3840x2160)
  const resampleBaseSlotToResolution = (targetW: number, targetH: number) => {
    const presetKey = `${targetW}x${targetH}` as '1920x1080' | '2560x1440' | '3840x2160';
    const resampleSingleImage = (
      srcImg: HTMLImageElement | null,
      onDone: (img: HTMLImageElement, url: string) => void
    ) => {
      if (!srcImg) return;
      const off = document.createElement('canvas');
      off.width = targetW;
      off.height = targetH;
      const ctx = off.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      drawCoverImageToCanvas(
        ctx,
        srcImg,
        srcImg.naturalWidth || targetW,
        srcImg.naturalHeight || targetH,
        targetW,
        targetH,
        1
      );
      const dataUrl = off.toDataURL('image/png');
      const nextImg = new Image();
      nextImg.onload = () => onDone(nextImg, dataUrl);
      nextImg.src = dataUrl;
    };

    const targetImg = slotImages[activeSlot] || slotImages.A;
    if (!targetImg) {
      onNotify('Сначала выберите или загрузите базовый кадр для изменения разрешения.', 'info');
      return;
    }

    const slotToUpdate: ThumbnailSlotId = slotImages[activeSlot] ? activeSlot : 'A';
    resampleSingleImage(targetImg, (nextImg, url) => {
      setSlotImages(prev => ({ ...prev, [slotToUpdate]: nextImg }));
      if (slotToUpdate === 'A') {
        window.selectedMasterThumbnail = url;
      }
      setBaseResolutionPreset(presetKey);
      onNotify(
        `🔍 Кадр Варианта ${slotToUpdate} приведён к ${targetW}×${targetH} px (High-Quality Canvas)`,
        'success'
      );
    });
  };

  // Сборка полноразмерного 4K Canvas (3840x2160) с резкой базой + векторными титрами и бейджами
  const buildFullResThumbnailCanvas = (slot: ThumbnailSlotId): HTMLCanvasElement => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 3840;
    offscreen.height = 2160;
    renderSlotToCanvas(offscreen, slot);
    return offscreen;
  };

  // Пересэмплирование собранного 4K Canvas на 1280x720 с высоким сглаживанием (imageSmoothingQuality = 'high')
  const buildDownsampled720pCanvas = (
    source4K: HTMLCanvasElement,
    quantizeForCompactPng: boolean = false
  ): HTMLCanvasElement => {
    const hd = document.createElement('canvas');
    hd.width = 1280;
    hd.height = 720;
    const ctx = hd.getContext('2d', { willReadFrequently: quantizeForCompactPng });
    if (!ctx) return hd;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source4K, 0, 0, 1280, 720);

    // Лёгкое 6-битное квантование каналов для максимально компактного PNG без потери резкости контуров
    if (quantizeForCompactPng) {
      try {
        const imgData = ctx.getImageData(0, 0, 1280, 720);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[i] & 0xf8;
          d[i + 1] = d[i + 1] & 0xf8;
          d[i + 2] = d[i + 2] & 0xf8;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // ignore if unavailable
      }
    }
    return hd;
  };

  const canvasToBlobAsync = (
    canvas: HTMLCanvasElement,
    mime: 'image/jpeg' | 'image/png',
    quality?: number
  ): Promise<Blob | null> =>
    new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), mime, quality);
    });

  // Бинарный подбор JPEG-качества строго <= 1.95 МБ для требований YouTube
  const compressCanvasToYouTubeJpeg = async (
    canvas: HTMLCanvasElement,
    initialQuality: number = 0.95
  ): Promise<{ blob: Blob; quality: number } | null> => {
    const MAX_YT_THUMB_BYTES = Math.floor(1.95 * 1024 * 1024);

    let bestBlob = await canvasToBlobAsync(canvas, 'image/jpeg', initialQuality);
    let bestQ = initialQuality;

    if (!bestBlob || bestBlob.size > MAX_YT_THUMB_BYTES) {
      let low = 0.2;
      let high = Math.min(0.94, initialQuality);
      bestBlob = null;
      for (let step = 0; step < 8; step++) {
        const mid = Number(((low + high) / 2).toFixed(3));
        const candidate = await canvasToBlobAsync(canvas, 'image/jpeg', mid);
        if (!candidate) break;
        if (candidate.size <= MAX_YT_THUMB_BYTES) {
          bestBlob = candidate;
          bestQ = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      if (!bestBlob) {
        bestBlob = await canvasToBlobAsync(canvas, 'image/jpeg', 0.15);
        bestQ = 0.15;
      }
    }

    return bestBlob ? { blob: bestBlob, quality: bestQ } : null;
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1800);
  };

  // Мультиформатный экспорт для слотов A, B, C:
  // 1) 4k_jpg (3840x2160 JPEG q=0.95)
  // 2) 4k_png (3840x2160 PNG lossless)
  // 3) 720p_jpg (1280x720 JPEG high smoothing <= 1.95 МБ)
  // 4) 720p_png (1280x720 PNG high smoothing + лёгкое квантование)
  const exportSlotInFormat = async (
    slot: ThumbnailSlotId,
    format: '4k_jpg' | '4k_png' | '720p_jpg' | '720p_png'
  ) => {
    if (isExportingFormat) return;
    setIsExportingFormat(`${slot}_${format}`);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 16));
      const full4K = buildFullResThumbnailCanvas(slot);

      let blob: Blob | null = null;
      let filename = '';
      let formatLabel = '';

      if (format === '4k_jpg') {
        filename = `thumbnail_4k_3840x2160_${slot}.jpg`;
        formatLabel = '4K JPEG';
        blob = await canvasToBlobAsync(full4K, 'image/jpeg', 0.95);
      } else if (format === '4k_png') {
        filename = `thumbnail_4k_3840x2160_${slot}.png`;
        formatLabel = '4K PNG';
        blob = await canvasToBlobAsync(full4K, 'image/png');
      } else if (format === '720p_jpg') {
        filename = `thumbnail_720p_1280x720_${slot}.jpg`;
        formatLabel = '720p JPEG';
        const hd = buildDownsampled720pCanvas(full4K, false);
        const compressed = await compressCanvasToYouTubeJpeg(hd, 0.94);
        blob = compressed?.blob || null;
      } else {
        filename = `thumbnail_720p_1280x720_${slot}.png`;
        formatLabel = '720p PNG';
        const hdQuant = buildDownsampled720pCanvas(full4K, true);
        blob = await canvasToBlobAsync(hdQuant, 'image/png');
      }

      if (!blob) {
        onNotify(`Не удалось экспортировать ${formatLabel} для слота ${slot}.`, 'error');
        return;
      }

      const sizeText = formatBytesLabel(blob.size);
      triggerBlobDownload(blob, filename);
      setLastExportReport(prev => ({
        ...prev,
        [slot]: { formatLabel, filename, sizeText }
      }));
      onNotify(`✅ ${filename} скачан • ${sizeText}`, 'success');
    } finally {
      setIsExportingFormat(null);
    }
  };

  // Пакетный экспорт всех 3 вариантов (< 2 МБ YouTube JPEG)
  const downloadAll3CoversYouTube2Mb = async () => {
    if (isExportingFormat) return;
    setIsExportingFormat('batch_all');
    const slots: ThumbnailSlotId[] = ['A', 'B', 'C'];
    const summaryParts: string[] = [];

    try {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        setBatchExportStatus(`Рендер 4K и сжатие ${slot} (${i + 1}/3)...`);
        await new Promise(resolve => window.setTimeout(resolve, 25));

        const offscreen = buildFullResThumbnailCanvas(slot);
        const result = await compressCanvasToYouTubeJpeg(offscreen);
        if (result) {
          triggerBlobDownload(result.blob, slotFilenames[slot]);
          summaryParts.push(`${slot}: ${formatBytesLabel(result.blob.size)}`);
          if (i < slots.length - 1) {
            await new Promise(resolve => window.setTimeout(resolve, 180));
          }
        }
      }

      if (summaryParts.length === 3) {
        onNotify(
          `📦 Все 3 обложки A/B/C скачаны для YouTube (${summaryParts.join(' • ')})`,
          'success'
        );
      } else {
        onNotify('Часть обложек не удалось экспортировать.', 'error');
      }
    } finally {
      setBatchExportStatus('');
      setIsExportingFormat(null);
    }
  };

  // Передача чистого арта или скомпонованного кадра в модуль «🖼️ Арт-Редактор & Фон»
  const handleOpenSlotInArtEditor = (slot: ThumbnailSlotId) => {
    if (!onSendToArtEditor) return;
    const rawImg = slotImages[slot] || slotImages.A;
    let exportDataUrl = '';
    if (rawImg && rawImg.naturalWidth > 0 && rawImg.naturalHeight > 0) {
      const off = document.createElement('canvas');
      off.width = rawImg.naturalWidth;
      off.height = rawImg.naturalHeight;
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.drawImage(rawImg, 0, 0, off.width, off.height);
        exportDataUrl = off.toDataURL('image/png');
      }
    }
    if (!exportDataUrl) {
      const offscreen = buildFullResThumbnailCanvas(slot);
      exportDataUrl = offscreen.toDataURL('image/png');
    }
    if (!exportDataUrl) {
      onNotify('Сначала выберите или сгенерируйте обложку для передачи в Арт-Редактор.', 'info');
      return;
    }
    onSendToArtEditor(exportDataUrl, `Вариант ${slot} (4K Превью)`);
  };

  // Кнопка «📋 Скопировать промпт для веб-генератора»
  const copyCoverPromptForWebGenerator = () => {
    navigator.clipboard.writeText(activePromptText);
    setCopiedPrompt(true);
    onNotify(
      '📋 Промпт скопирован для вставки в веб-генератор (Leonardo.ai / Midjourney / Kling)!',
      'success'
    );
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* МОДАЛЬНОЕ ОКНО УВЕЛИЧЕНИЯ ВАРИАНТА ОБЛОЖКИ («🔍 Увеличить») */}
      {zoomedVariantIdx !== null && batchVariants[zoomedVariantIdx] && (
        <div
          className="fixed inset-0 z-50 bg-[#080c14]/90 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setZoomedVariantIdx(null)}
        >
          <div
            className="aether-surface rounded-2xl max-w-5xl w-full p-5 space-y-4 border border-cyan-400/40 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <ZoomIn className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-[#f8fafc] uppercase tracking-wider">
                  Детальный просмотр • Вариант #{zoomedVariantIdx + 1} (Flux.1-Schnell • 16:9)
                </h3>
                {selectedMasterVariantIdx === zoomedVariantIdx && (
                  <span className="text-[11px] font-mono font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 px-2.5 py-0.5 rounded-full">
                    ✓ Выбранный мастер-кадр
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomedVariantIdx(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aether-preview-frame">
              <div className="aspect-video w-full rounded-[15px] overflow-hidden bg-[#080c14]">
                <img
                  src={batchVariants[zoomedVariantIdx]}
                  alt={`Flux.1-Schnell Variant ${zoomedVariantIdx + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  handleAttachToYoutubeRelease(zoomedVariantIdx);
                  setZoomedVariantIdx(null);
                }}
                className="min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-cyan-400/40 text-cyan-300 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>Привязать к YouTube релизу</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadVariantFromGrid(zoomedVariantIdx)}
                className="min-h-[44px] btn-primary-action px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>📥 Скачать мастер-кадр (3840×2160)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ВЕРХНЯЯ ПАНЕЛЬ: НАСТРОЙКИ 4K ПРЕВЬЮ + ХОЛСТ ПРЕДПРОСМОТРА С YOUTUBE UI OVERLAY И A/B ТЕСТЕРОМ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Левая колонка (5/12): Переключатель A / B / C, настройки активного слота и пакетный экспорт */}
        <div className="lg:col-span-5 aether-surface rounded-2xl p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
            <div>
              <h2 className="text-base font-bold text-[#f8fafc] flex items-center gap-2 tracking-tight">
                <Sparkles className="text-emerald-400 w-5 h-5 shrink-0" />
                <span>4K Превью &amp; A/B/C Тест</span>
              </h2>
              <p className="text-[11px] text-white/55 mt-0.5">
                3 независимых обложки 3840×2160 • Drag &amp; Drop заголовка
              </p>
            </div>
            <span
              className={`text-[11px] font-mono shrink-0 ${
                isCloudflareConfigured ? 'text-amber-300' : 'text-emerald-300/85'
              }`}
            >
              {isCloudflareConfigured ? 'Cloudflare Flux • 16:9' : 'Flux.1 AI Horde • 16:9'}
            </span>
          </div>

          {/* 1. КОМПАКТНАЯ ГРУППА ТРЁХ СЛОТОВ (🅰️ Вариант A / 🅱️ Вариант B / 🅲 Вариант C) + КОПИРОВАНИЕ */}
          <div className="aether-card rounded-2xl p-3 space-y-2.5 border border-white/[0.1] bg-[#080c14]/75">
            <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Слоты A/B/C тестирования">
              {(
                [
                  { id: 'A', emoji: '🅰️', label: 'Вариант A', accent: 'amber' },
                  { id: 'B', emoji: '🅱️', label: 'Вариант B', accent: 'emerald' },
                  { id: 'C', emoji: '🅲', label: 'Вариант C', accent: 'cyan' }
                ] as const
              ).map(tab => {
                const isSelected = activeSlot === tab.id;
                const hasOwnImage = Boolean(slotImages[tab.id]);
                return (
                  <button
                    key={`slot-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setActiveSlot(tab.id);
                      setShowCopyMenu(false);
                    }}
                    className={`relative min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 border cursor-pointer overflow-hidden transition ${
                      isSelected
                        ? tab.accent === 'amber'
                          ? 'border-amber-400/65 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.18)]'
                          : tab.accent === 'emerald'
                            ? 'border-emerald-400/65 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.18)]'
                            : 'border-cyan-400/65 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.18)]'
                        : 'bg-[#0b0f19]/80 border-white/[0.08] text-white/65 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeAbcSlotTab"
                        className={`absolute inset-0 -z-0 ${
                          tab.accent === 'amber'
                            ? 'bg-amber-500/15'
                            : tab.accent === 'emerald'
                              ? 'bg-emerald-500/15'
                              : 'bg-cyan-500/15'
                        }`}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1 whitespace-nowrap">
                      <span>{tab.emoji}</span>
                      <span>{tab.label}</span>
                    </span>
                    <span className="relative z-10 text-[9.5px] font-mono text-white/50 truncate max-w-full">
                      {tab.id === 'A'
                        ? slotImages.A
                          ? 'свой фон'
                          : 'пусто'
                        : hasOwnImage
                          ? 'свой фон'
                          : 'общий с A'}
                    </span>
                    <span
                      className="relative z-10 text-[8.5px] font-mono text-amber-200/75 truncate max-w-full px-1"
                      title={slotFilenames[tab.id]}
                    >
                      {slotFilenames[tab.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[10.5px] font-mono text-white/55 truncate">
                Слот <strong className="text-[#f8fafc]">{activeSlot}</strong> •{' '}
                <code className="text-amber-300">{slotFilenames[activeSlot]}</code>
              </span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCopyMenu(prev => !prev)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-semibold text-amber-300 flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>📋 Скопировать настройки в...</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showCopyMenu ? 'rotate-180' : ''}`}
                  />
                </button>

                {showCopyMenu && (
                  <div className="absolute right-0 mt-1.5 z-30 w-52 rounded-xl bg-[#0b0f19]/95 backdrop-blur-xl border border-white/[0.14] shadow-2xl p-1.5 space-y-1">
                    {(['A', 'B', 'C'] as const)
                      .filter(target => target !== activeSlot)
                      .map(target => (
                        <button
                          key={`copy-to-${target}`}
                          type="button"
                          onClick={() => handleCopySlotSettingsTo(target)}
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-lg text-left text-xs font-semibold text-[#f8fafc] hover:bg-white/[0.09] flex items-center justify-between cursor-pointer"
                        >
                          <span>Скопировать в Вариант {target}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Пакетная генерация 2x2 (4 варианта 16:9 без водяных знаков) */}
          <div className="aether-card rounded-2xl p-4 space-y-3 border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-[#0f1623]/90 to-cyan-500/[0.05]">
            <div className="flex items-center justify-between text-[11px] gap-2">
              <span className="font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-1.5">
                {isCloudflareConfigured ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                {isCloudflareConfigured
                  ? 'Cloudflare Flux (2×2)'
                  : 'Flux.1 AI Horde (2×2)'}
              </span>
              <span className="font-mono text-[10px] text-white/55">
                1344×768 → 4K UHD
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleGenerateFluxCover(activeSlot)}
                disabled={isGeneratingCovers}
                className="flex-1 min-w-[180px] min-h-[44px] btn-primary-action py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isGeneratingCovers && generatingTargetSlot === activeSlot ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Wand2 className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">
                  {isGeneratingCovers && generatingTargetSlot === activeSlot
                    ? buttonQueueStatus || 'Ожидание...'
                    : `Flux.1 (2×2) → Слот ${activeSlot}`}
                </span>
              </button>

              {(['A', 'B', 'C'] as const).map(target => (
                <button
                  key={`flux-slot-${target}`}
                  type="button"
                  disabled={isGeneratingCovers}
                  onClick={() => handleGenerateFluxCover(target)}
                  title={`Сгенерировать 2×2 фон сразу в Вариант ${target}`}
                  className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-60 transition ${
                    activeSlot === target
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-white/75'
                  }`}
                >
                  → {target}
                </button>
              ))}
            </div>

            {isGeneratingCovers && (
              <div className="bg-[#080c14]/90 border border-cyan-500/35 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-cyan-300 truncate">
                  {generationStatusText || 'Генерация Flux.1-Schnell...'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="min-h-[32px] text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 px-2.5 py-1 rounded-lg shrink-0 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Аккордеон настроек Cloudflare Workers AI (localStorage) */}
            <div className="pt-1.5 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowCfSettings(prev => !prev)}
                className="w-full min-h-[44px] flex items-center justify-between text-[11px] text-white/70 hover:text-amber-300 font-semibold px-2 rounded-xl hover:bg-white/[0.03] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Параметры API Cloudflare Workers AI (без очереди)</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-white/55">
                  <span>{isCloudflareConfigured ? 'ACTIVE' : 'OPTIONAL'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showCfSettings ? 'rotate-180 text-amber-400' : ''
                    }`}
                  />
                </span>
              </button>

              {showCfSettings && (
                <div className="mt-2 space-y-2.5 bg-[#080c14]/90 border border-white/[0.08] rounded-xl p-3.5">
                  <div>
                    <label className="text-[10px] text-white/55 uppercase block mb-1">
                      Cloudflare Account ID:
                    </label>
                    <input
                      type="text"
                      value={cfAccountId}
                      onChange={e => setCfAccountId(e.target.value)}
                      placeholder="Например: 8a1b2c3d4e5f67890..."
                      className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-[#f8fafc] outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/55 uppercase block mb-1">
                      Cloudflare API Token (Workers AI):
                    </label>
                    <input
                      type="password"
                      value={cfApiToken}
                      onChange={e => setCfApiToken(e.target.value)}
                      placeholder="Bearer API Token"
                      className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-[#f8fafc] outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10px] text-white/55 leading-tight font-mono">
                      localStorage • @cf/black-forest-labs/flux-1-schnell
                    </span>
                    {(cfAccountId || cfApiToken) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCfAccountId('');
                          setCfApiToken('');
                          onNotify('Ключи Cloudflare очищены — активен бесплатный AI Horde.', 'info');
                        }}
                        className="text-[10px] text-rose-300 hover:text-rose-200 underline shrink-0 cursor-pointer"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {generationError && (
              <div
                role="alert"
                className="w-full rounded-xl px-3.5 py-2.5 text-xs space-y-2 border bg-rose-950/80 border-rose-500/60 text-rose-200"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="flex-1 min-w-0">
                    <p
                      title={generationError}
                      className="text-[11px] font-semibold leading-snug line-clamp-2 text-rose-200"
                    >
                      {generationError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGenerationError(null)}
                    className="text-[10px] text-white/55 hover:text-white shrink-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerateProceduralBatchFallback(activeSlot)}
                  className="min-h-[38px] bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-100 font-semibold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                >
                  🎨 Сгенерировать 4 локальных 4K фона (Canvas 2×2)
                </button>
              </div>
            )}
          </div>

          {/* Кнопки режимов предпросмотра: YouTube UI, Сравнить A/B/C в ленте, Ч/Б контраст */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowYoutubeOverlay(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[125px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer ${
                showYoutubeOverlay
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Eye className="w-4 h-4 shrink-0" />
                <span className="truncate">YouTube UI</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {showYoutubeOverlay ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCompareFeedEnabled(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[175px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer ${
                compareFeedEnabled
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_22px_rgba(245,158,11,0.22)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/75 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Columns className="w-4 h-4 shrink-0" />
                <span className="truncate">👁️ Сравнить A / B / C в ленте</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {compareFeedEnabled ? 'FEED' : '1x'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBwContrastFilter(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[125px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer ${
                bwContrastFilter
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Contrast className="w-4 h-4 shrink-0" />
                <span className="truncate">Ч/Б Контраст</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {bwContrastFilter ? 'B&W' : 'RGB'}
              </span>
            </button>
          </div>

          {/* ЕДИНЫЙ ART-EDITOR: DOCUMENTARY IMPACT + GRUNGE SPLASH (Слот A / B / C) */}
          <div className="aether-card rounded-2xl p-4 space-y-4 border border-white/[0.08] bg-[#0b0f19]/90 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Type className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] block truncate">
                    Documentary Impact + Grunge Splash
                  </span>
                  <span className="text-[10px] font-mono text-white/50 block">
                    Anton / Montserrat 900 • 3840×2160 Canvas • Слот {activeSlot}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const split = splitProjectTitleIntoTwoLines(youtubeMockTitle || thumbTitle || '');
                  updateSlotLines(activeSlot, split.line1, split.line2);
                  onNotify(`Заголовок слота ${activeSlot} обновлён из названия проекта.`, 'info');
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#111827]/90 hover:bg-white/[0.08] border border-white/[0.08] text-[10.5px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer transition"
                title="Разделить текущее название проекта из студии на Строку 1 и Строку 2"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Из проекта</span>
              </button>
            </div>

            {/* Загрузка собственного фона слота */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-white/60">
                  Свой фон для Варианта {activeSlot}:
                </label>
                {activeSlot !== 'A' && slotImages[activeSlot] && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlotImages(prev => ({ ...prev, [activeSlot]: null }));
                      onNotify(`Фон Варианта ${activeSlot} сброшен на общий фон Слота A.`, 'info');
                    }}
                    className="text-[10px] text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                  >
                    Использовать фон A
                  </button>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleLoadImageForSlot(e, activeSlot)}
                className="w-full text-xs text-white/60 file:mr-3 file:min-h-[36px] file:py-1.5 file:px-3 file:rounded-xl file:border file:border-white/[0.1] file:text-xs file:font-bold file:bg-[#111827] file:text-amber-300 hover:file:bg-white/[0.1] cursor-pointer"
              />
            </div>

            {/* БЛОК «СТРОКА 1 (ВЕРХНЯЯ)» */}
            <div className="rounded-xl p-3.5 space-y-2.5 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#f8fafc]">
                  СТРОКА 1 (ВЕРХНЯЯ)
                </span>
                {activeConfig.topText.length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateSlotLines(activeSlot, '', activeConfig.bottomText)}
                    className="text-[10px] text-white/50 hover:text-rose-300 underline cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>

              <input
                type="text"
                value={activeConfig.topText}
                onChange={e =>
                  updateSlotLines(activeSlot, e.target.value.toUpperCase(), activeConfig.bottomText)
                }
                placeholder="ВЕРХНЯЯ СТРОКА (UPPERCASE)"
                className="w-full min-h-[40px] bg-[#0b0f19] border border-white/[0.08] focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-[#f8fafc] outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {LINE_COLOR_SWATCHES.map(swatch => {
                    const isSelected =
                      activeConfig.topColor.toUpperCase() === swatch.id.toUpperCase();
                    return (
                      <motion.button
                        key={`top-swatch-${swatch.id}`}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() =>
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            topColor: swatch.id
                          }))
                        }
                        title={swatch.label}
                        className={`min-h-[28px] px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer transition ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 text-[#f8fafc]'
                            : 'border-white/[0.08] bg-[#0b0f19]/90 text-white/65 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                          style={{ backgroundColor: swatch.id }}
                        />
                        <span>{swatch.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <label className="min-h-[28px] px-2 py-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f19]/90 flex items-center gap-1.5 cursor-pointer text-[10px] text-white/75">
                  <input
                    type="color"
                    value={activeConfig.topColor}
                    onChange={e =>
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        topColor: e.target.value
                      }))
                    }
                    aria-label="Цвет Строки 1"
                    className="w-4 h-4 bg-transparent border-0 cursor-pointer p-0"
                  />
                  <span className="font-mono">{activeConfig.topColor.toUpperCase()}</span>
                </label>
              </div>

              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/75 font-semibold">Размер Строки 1</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {activeConfig.hookLayout.topScalePct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={180}
                  step={2}
                  value={activeConfig.hookLayout.topScalePct}
                  onChange={e => {
                    const val = Number(e.target.value);
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      hookLayout: { ...prev.hookLayout, topScalePct: val }
                    }));
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* БЛОК «СТРОКА 2 (НИЖНЯЯ)» */}
            <div className="rounded-xl p-3.5 space-y-2.5 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFD600]">
                  СТРОКА 2 (НИЖНЯЯ)
                </span>
                {activeConfig.bottomText.length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateSlotLines(activeSlot, activeConfig.topText, '')}
                    className="text-[10px] text-white/50 hover:text-rose-300 underline cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>

              <input
                type="text"
                value={activeConfig.bottomText}
                onChange={e =>
                  updateSlotLines(activeSlot, activeConfig.topText, e.target.value.toUpperCase())
                }
                placeholder="НИЖНЯЯ СТРОКА (UPPERCASE)"
                className="w-full min-h-[40px] bg-[#0b0f19] border border-white/[0.08] focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-[#FFD600] outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    LINE_COLOR_SWATCHES[1],
                    LINE_COLOR_SWATCHES[0],
                    LINE_COLOR_SWATCHES[2],
                    LINE_COLOR_SWATCHES[3],
                    LINE_COLOR_SWATCHES[4]
                  ].map(swatch => {
                    const isSelected =
                      activeConfig.bottomColor.toUpperCase() === swatch.id.toUpperCase();
                    return (
                      <motion.button
                        key={`bottom-swatch-${swatch.id}`}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() =>
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            bottomColor: swatch.id
                          }))
                        }
                        title={swatch.label}
                        className={`min-h-[28px] px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer transition ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 text-[#f8fafc]'
                            : 'border-white/[0.08] bg-[#0b0f19]/90 text-white/65 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                          style={{ backgroundColor: swatch.id }}
                        />
                        <span>{swatch.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <label className="min-h-[28px] px-2 py-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f19]/90 flex items-center gap-1.5 cursor-pointer text-[10px] text-white/75">
                  <input
                    type="color"
                    value={activeConfig.bottomColor}
                    onChange={e =>
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        bottomColor: e.target.value
                      }))
                    }
                    aria-label="Цвет Строки 2"
                    className="w-4 h-4 bg-transparent border-0 cursor-pointer p-0"
                  />
                  <span className="font-mono">{activeConfig.bottomColor.toUpperCase()}</span>
                </label>
              </div>

              <div className="space-y-2 pt-0.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/75 font-semibold">
                      Размер Строки 2{' '}
                      {activeConfig.hookLayout.autoFitBottomToTop && (
                        <span className="text-[10px] font-mono text-amber-300/80">(Auto-Fit)</span>
                      )}
                    </span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.hookLayout.bottomScalePct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={180}
                    step={2}
                    value={activeConfig.hookLayout.bottomScalePct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        hookLayout: {
                          ...prev.hookLayout,
                          bottomScalePct: val,
                          autoFitBottomToTop: false
                        }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      hookLayout: {
                        ...prev.hookLayout,
                        autoFitBottomToTop: !prev.hookLayout.autoFitBottomToTop
                      }
                    }))
                  }
                  className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition ${
                    activeConfig.hookLayout.autoFitBottomToTop
                      ? 'bg-amber-500/20 border-amber-400/60 text-[#FDE047]'
                      : 'bg-[#0b0f19]/90 border-white/[0.08] text-white/70 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <AlignCenterHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span>Выровнять ширину строк (Auto-Fit)</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40">
                    {activeConfig.hookLayout.autoFitBottomToTop ? 'ON' : 'OFF'}
                  </span>
                </motion.button>
              </div>
            </div>

            {/* ПОЗИЦИОНИРОВАНИЕ НА КАДРЕ, НАКЛОН И ЕДИНАЯ ГРАНЖ-ПОДЛОЖКА (SPLASH) */}
            <div className="rounded-xl p-3.5 space-y-3 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Композиция и Гранж-подложка</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      hookLayout: { ...DEFAULT_HOOK_LAYOUT }
                    }))
                  }
                  className="text-[10.5px] font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  Сбросить позицию
                </button>
              </div>

              {/* Быстрый переключатель угла размещения заголовка */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/55 font-semibold block">
                  Угол размещения заголовка:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'top_left', label: 'Левый верхний угол', x: 25, y: 24 },
                      { id: 'bottom_left', label: 'Левый нижний угол', x: 25, y: 76 },
                      { id: 'bottom_right', label: 'Правый нижний угол', x: 75, y: 76 }
                    ] as Array<{
                      id: CornerPositionPresetId;
                      label: string;
                      x: number;
                      y: number;
                    }>
                  ).map(corner => {
                    const isActive =
                      Math.abs(activeConfig.hookLayout.xPct - corner.x) <= 4 &&
                      Math.abs(activeConfig.hookLayout.yPct - corner.y) <= 4;
                    return (
                      <motion.button
                        key={corner.id}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() =>
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            hookLayout: {
                              ...prev.hookLayout,
                              xPct: corner.x,
                              yPct: corner.y
                            }
                          }))
                        }
                        className={`min-h-[38px] px-2 py-1.5 rounded-xl border text-[10px] font-bold leading-tight text-center cursor-pointer transition ${
                          isActive
                            ? 'bg-cyan-500/20 border-cyan-400/65 text-cyan-200'
                            : 'bg-[#0b0f19]/90 border-white/[0.08] text-white/70 hover:text-white'
                        }`}
                      >
                        {corner.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Слайдеры сдвига X, Y, наклона блока (-6..+6 deg) и межстрочного интервала */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-white/75 font-semibold">Сдвиг по X</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {Math.round(activeConfig.hookLayout.xPct)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={94}
                    step={0.5}
                    value={activeConfig.hookLayout.xPct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        hookLayout: { ...prev.hookLayout, xPct: val }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-white/75 font-semibold">Сдвиг по Y</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {Math.round(activeConfig.hookLayout.yPct)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={92}
                    step={0.5}
                    value={activeConfig.hookLayout.yPct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        hookLayout: { ...prev.hookLayout, yPct: val }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-white/75 font-semibold">Угол наклона блока</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.hookLayout.blockTiltDeg > 0 ? '+' : ''}
                      {activeConfig.hookLayout.blockTiltDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-6}
                    max={6}
                    step={0.5}
                    value={activeConfig.hookLayout.blockTiltDeg}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        hookLayout: { ...prev.hookLayout, blockTiltDeg: val }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-white/75 font-semibold">Межстрочный интервал</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.hookLayout.lineSpacingPct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={160}
                    step={2}
                    value={activeConfig.hookLayout.lineSpacingPct}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        hookLayout: { ...prev.hookLayout, lineSpacingPct: val }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* НАСТРОЙКИ ПОДЛОЖКИ КИСТИ (SPLASH / BRUSH BACKGROUND) */}
              <div className="pt-3 border-t border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-1.5">
                    <Paintbrush className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Подложка под заголовком (Brush / Splash):</span>
                  </span>
                  <span className="text-[10px] font-mono text-white/55">
                    {SPLASH_SHAPE_OPTIONS.find(s => s.id === activeConfig.splashShape)?.subtitle || 'Monolith Bristle'}
                  </span>
                </div>

                {/* Визуальный селектор из 6 форм гранж-подложки + Без подложки */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {SPLASH_SHAPE_OPTIONS.map(opt => {
                    const isSelected = activeConfig.splashShape === opt.id;
                    const resolvedPal = resolveSplashColorPalette(activeConfig.splashColor);
                    const strokeFill = opt.id === 'none' ? '#334155' : resolvedPal.mainColor;
                    const strokeEdge = opt.id === 'none' ? '#1E293B' : resolvedPal.edgeColor;
                    const isWideSpan = opt.id === 'none';

                    return (
                      <motion.button
                        key={`splash-shape-${opt.id}`}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() =>
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            splashShape: opt.id
                          }))
                        }
                        className={`min-h-[64px] p-2 rounded-xl border text-left flex flex-col justify-between gap-1.5 cursor-pointer transition ${
                          isWideSpan ? 'col-span-2 sm:col-span-3 flex-row items-center min-h-[40px]' : ''
                        } ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 text-[#FDE047] shadow-[0_0_16px_rgba(245,158,11,0.16)]'
                            : 'border-white/[0.08] bg-[#0b0f19]/90 text-white/75 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <div
                          className={`${
                            isWideSpan ? 'w-14 h-5 shrink-0' : 'w-full h-7'
                          } rounded-lg bg-[#070a12] border border-white/[0.06] flex items-center justify-center overflow-hidden px-1.5`}
                        >
                          <svg
                            viewBox="0 0 120 36"
                            className="w-full h-full"
                            aria-hidden="true"
                          >
                            <defs>
                              <linearGradient id={`grad-${activeSlot}-${opt.id}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor={strokeFill} />
                                <stop offset="100%" stopColor={strokeEdge} />
                              </linearGradient>
                            </defs>
                            {opt.id === 'monolith_bristle' && (
                              <g fill={`url(#grad-${activeSlot}-${opt.id})`}>
                                <path d="M12,7 Q60,5 108,8 L116,11 L107,14 L115,18 L106,22 L114,26 L108,29 Q60,31 12,28 L5,25 L13,21 L4,17 L13,13 L6,10 Z" />
                                <rect x="3" y="12" width="12" height="2" rx="1" opacity="0.85" />
                                <rect x="105" y="21" width="12" height="2" rx="1" opacity="0.85" />
                              </g>
                            )}
                            {opt.id === 'jagged_splash' && (
                              <g fill={`url(#grad-${activeSlot}-${opt.id})`}>
                                <path d="M14,9 L32,4 L45,9 L68,3 L86,8 L108,5 L117,12 L103,16 L118,22 L101,27 L111,31 L84,28 L66,33 L42,27 L20,31 L6,25 L16,20 L3,14 L17,11 Z" />
                                <ellipse cx="114" cy="7" rx="3.5" ry="1.2" transform="rotate(-14 114 7)" />
                                <ellipse cx="7" cy="30" rx="4" ry="1.3" transform="rotate(-10 7 30)" />
                              </g>
                            )}
                            {opt.id === 'bottom_slash' && (
                              <g>
                                <rect x="24" y="6" width="72" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
                                <path
                                  d="M14,22 Q60,18 112,17 L104,23 L114,27 Q62,31 16,30 L7,26 Z"
                                  fill={`url(#grad-${activeSlot}-${opt.id})`}
                                />
                              </g>
                            )}
                            {opt.id === 'double_strokes' && (
                              <g fill={`url(#grad-${activeSlot}-${opt.id})`}>
                                <path d="M10,6 Q52,4 94,7 L101,10 L93,13 L99,15 Q52,17 10,15 L5,12 L11,9 Z" />
                                <path d="M22,20 Q64,18 109,21 L116,24 L108,27 L114,30 Q64,32 22,30 L16,27 L23,23 Z" />
                              </g>
                            )}
                            {opt.id === 'distressed_grunge' && (
                              <g>
                                <path
                                  d="M11,8 Q60,4 109,9 L115,13 L106,18 L114,24 L106,29 Q60,32 12,28 L5,23 L13,18 L6,12 Z"
                                  fill={`url(#grad-${activeSlot}-${opt.id})`}
                                />
                                <path d="M24,13 Q52,11 76,14" stroke="#070a12" strokeWidth="2.4" strokeLinecap="round" />
                                <path d="M46,24 Q78,22 96,25" stroke="#070a12" strokeWidth="2.2" strokeLinecap="round" />
                              </g>
                            )}
                            {opt.id === 'tapered_speed' && (
                              <g fill={`url(#grad-${activeSlot}-${opt.id})`}>
                                <path d="M7,5 Q56,6 106,13 L118,16 L104,18 L116,21 L100,23 Q54,29 8,31 L3,25 L10,18 L3,11 Z" />
                                <rect x="98" y="12" width="19" height="1.5" rx="0.75" opacity="0.8" />
                                <rect x="101" y="22" width="16" height="1.5" rx="0.75" opacity="0.8" />
                              </g>
                            )}
                            {opt.id === 'none' && (
                              <g stroke="#64748b" strokeWidth="1.6" strokeDasharray="3 3" fill="none">
                                <rect x="14" y="8" width="92" height="20" rx="4" />
                                <line x1="18" y1="26" x2="102" y2="10" stroke="#94a3b8" strokeDasharray="none" />
                              </g>
                            )}
                          </svg>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="text-[10.5px] font-bold leading-tight block truncate">
                            {opt.label}
                          </span>
                          <span className="text-[9px] font-mono opacity-65 block truncate">
                            {opt.subtitle}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Палитра цветов + HTML5 Color Picker с авто-расчётом объёмного градиента */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                      Цвет и градиент подложки:
                    </span>
                    <label className="min-h-[28px] px-2.5 py-0.5 rounded-lg border border-white/[0.08] bg-[#0b0f19]/90 flex items-center gap-1.5 cursor-pointer text-[10px] text-white/80 hover:border-amber-400/50 transition">
                      <input
                        type="color"
                        value={activeConfig.splashColor}
                        onChange={e => {
                          const hex = e.target.value.toUpperCase();
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            splashShape:
                              prev.splashShape === 'none' ? 'monolith_bristle' : prev.splashShape,
                            splashColor: hex
                          }));
                        }}
                        aria-label="Свой цвет подложки"
                        className="w-4 h-4 bg-transparent border-0 cursor-pointer p-0"
                      />
                      <span className="font-mono font-semibold">{activeConfig.splashColor}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {SPLASH_COLOR_SWATCHES.map(swatch => {
                      const isSelected =
                        activeConfig.splashColor.toUpperCase() === swatch.mainColor.toUpperCase();
                      return (
                        <motion.button
                          key={`splash-swatch-${swatch.id}`}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() =>
                            updateSlotConfig(activeSlot, prev => ({
                              ...prev,
                              splashShape:
                                prev.splashShape === 'none' ? 'monolith_bristle' : prev.splashShape,
                              splashColor: swatch.mainColor
                            }))
                          }
                          className={`min-h-[30px] px-2.5 py-1 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/20 text-[#FDE047]'
                              : 'border-white/[0.08] bg-[#0b0f19]/90 text-white/75 hover:text-white'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-sm border border-white/25 shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${swatch.mainColor}, ${swatch.edgeColor})`
                            }}
                          />
                          <span>{swatch.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Слайдеры отступа мазка и интенсивности тёмной тени подложки */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-white/75 font-semibold">Отступ / Ширина мазка</span>
                      <span className="font-mono font-bold text-amber-300 tabular-nums">
                        {activeConfig.splashPaddingPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={160}
                      step={2}
                      value={activeConfig.splashPaddingPct}
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSlotConfig(activeSlot, prev => ({ ...prev, splashPaddingPct: val }));
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1 bg-[#0b0f19]/75 border border-white/[0.06] rounded-xl p-2.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-white/75 font-semibold">Тёмная тень подложки</span>
                      <span className="font-mono font-bold text-amber-300 tabular-nums">
                        {activeConfig.splashShadowPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={160}
                      step={2}
                      value={activeConfig.splashShadowPct}
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSlotConfig(activeSlot, prev => ({ ...prev, splashShadowPct: val }));
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ВЕРХНИЕ КАПСУЛЫ-БЕЙДЖИ (ПРАВЫЙ ВЕРХНИЙ УГОЛ) */}
            <div className="rounded-xl p-3.5 space-y-2.5 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Верхние капсулы-бейджи ({activeSlot})</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      badgesEnabled: !prev.badgesEnabled
                    }))
                  }
                  className={`min-h-[30px] px-3 py-1 rounded-lg border text-[10.5px] font-bold cursor-pointer transition ${
                    activeConfig.badgesEnabled
                      ? 'bg-[#090D16] border-[#F59E0B] text-[#FACC15]'
                      : 'bg-[#0b0f19] border-white/[0.08] text-white/55 hover:text-white'
                  }`}
                >
                  {activeConfig.badgesEnabled ? 'Вкл' : 'Выкл'}
                </button>
              </div>

              {activeConfig.badgesEnabled && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[0, 1, 2].map(badgeIdx => (
                      <input
                        key={`badge-input-${activeSlot}-${badgeIdx}`}
                        type="text"
                        value={activeConfig.badgeTexts[badgeIdx]}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          updateSlotConfig(activeSlot, prev => {
                            const nextTexts: [string, string, string] = [...prev.badgeTexts] as [
                              string,
                              string,
                              string
                            ];
                            nextTexts[badgeIdx] = val;
                            return { ...prev, badgeTexts: nextTexts };
                          });
                        }}
                        placeholder={`Бейдж #${badgeIdx + 1}`}
                        className="w-full min-h-[36px] bg-[#0b0f19] border border-amber-400/35 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-[10.5px] font-extrabold tracking-wider uppercase text-[#FACC15] outline-none"
                      />
                    ))}
                  </div>

                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-white/70 font-semibold">Размер бейджей</span>
                      <span className="font-mono font-bold text-[#FACC15] tabular-nums">
                        {activeConfig.badgeScalePct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={150}
                      step={2}
                      value={activeConfig.badgeScalePct}
                      onChange={e => {
                        const val = Number(e.target.value);
                        updateSlotConfig(activeSlot, prev => ({ ...prev, badgeScalePct: val }));
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ЛОКАЛЬНЫЙ КОНТРОЛЬ КОНТРАСТА И «СОЧНОСТИ» КАДРА + РЕСАЙЗ И ЧЁТКОСТЬ (100% HTML5 Canvas) */}
          <div className="aether-card rounded-2xl p-4 space-y-3.5 border border-cyan-400/25 bg-[#0b0f19]/85">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>🔍 Разрешение и чёткость холста</span>
              </span>
              <span className="text-[10px] font-mono text-white/55">100% локально Canvas</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: '1920x1080', w: 1920, h: 1080, tag: 'Full HD' },
                  { id: '2560x1440', w: 2560, h: 1440, tag: '2K QHD' },
                  { id: '3840x2160', w: 3840, h: 2160, tag: '4K UHD' }
                ] as const
              ).map(res => {
                const isSelected = baseResolutionPreset === res.id;
                return (
                  <button
                    key={`thumb-res-${res.id}`}
                    type="button"
                    onClick={() => resampleBaseSlotToResolution(res.w, res.h)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl border text-[10.5px] font-mono font-bold flex flex-col items-center justify-center cursor-pointer transition ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.2)]'
                        : 'bg-[#111827] border-white/[0.08] text-white/75 hover:text-white hover:border-cyan-400/40'
                    }`}
                  >
                    <span className="tabular-nums">{res.w}×{res.h}</span>
                    <span className="text-[9px] font-sans text-white/50">{res.tag}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/80 font-semibold">
                  Резкость / микроконтраст базового кадра
                </span>
                <span className="font-mono font-bold text-cyan-300 tabular-nums">
                  {baseSharpenPct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={baseSharpenPct}
                onChange={e => setBaseSharpenPct(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Блок «☀️ Контраст и яркость кадра» (YouTube Contrast & Punch Engine) */}
            <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#f8fafc] flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>☀️ Контраст и яркость кадра</span>
                </span>
                <span className="text-[10px] font-mono text-amber-300/90">
                  Слот {activeSlot}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      bgAdjust: { ...YOUTUBE_CINEMA_BG_ADJUST }
                    }));
                    onNotify(
                      `⚡ Кино-контраст YouTube применён к Слоту ${activeSlot} (128% / 106% / 110%)`,
                      'success'
                    );
                  }}
                  className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:brightness-110 border border-amber-400/50 text-[#FDE047] text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>⚡ Кино-контраст YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      bgAdjust: { ...DEFAULT_BG_ADJUST }
                    }));
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#111827]/85 hover:bg-white/[0.08] border border-white/[0.1] text-white/75 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>↺ Сброс</span>
                </button>
              </div>

              <div className="space-y-2 bg-[#111827]/75 border border-white/[0.06] rounded-xl p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/80 font-semibold">
                      Контраст (Глубина теней и света)
                    </span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.bgAdjust.contrastPct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={165}
                    step="any"
                    value={activeConfig.bgAdjust.contrastPct}
                    onChange={e => {
                      const snapped = Math.max(
                        80,
                        Math.min(165, Math.round(Number(e.target.value) / 5) * 5)
                      );
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        bgAdjust: { ...prev.bgAdjust, contrastPct: snapped }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/80 font-semibold">
                      Яркость и подсветка бликов
                    </span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.bgAdjust.brightnessPct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={85}
                    max={135}
                    step="any"
                    value={activeConfig.bgAdjust.brightnessPct}
                    onChange={e => {
                      const snapped = Math.max(
                        85,
                        Math.min(135, Math.round(Number(e.target.value) / 5) * 5)
                      );
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        bgAdjust: { ...prev.bgAdjust, brightnessPct: snapped }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/80 font-semibold">
                      Мягкая сочность (Vibrance)
                    </span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      {activeConfig.bgAdjust.vibrancePct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={90}
                    max={125}
                    step="any"
                    value={activeConfig.bgAdjust.vibrancePct}
                    onChange={e => {
                      const snapped = Math.max(
                        90,
                        Math.min(125, Math.round(Number(e.target.value) / 5) * 5)
                      );
                      updateSlotConfig(activeSlot, prev => ({
                        ...prev,
                        bgAdjust: { ...prev.bgAdjust, vibrancePct: snapped }
                      }));
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <p className="text-[10px] text-white/50 leading-tight pt-0.5">
                  Применяется 100% локально на Canvas только к фону слота {activeSlot} — заголовки и бейджи сохраняют исходную чёткость.
                </p>
              </div>
            </div>
          </div>

          {/* Мультиформатный экспорт для слота A/B/C: 4K (3840x2160) & 720p (1280x720) в JPEG и PNG */}
          <div className="aether-card rounded-2xl p-3.5 space-y-2.5 border border-white/[0.08] bg-[#0b0f19]/90 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#f8fafc]">
                📥 Экспорт обложки • Слот {activeSlot}
              </span>
              {lastExportReport[activeSlot] && (
                <span
                  title={lastExportReport[activeSlot]?.filename}
                  className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-400/35 px-2 py-0.5 rounded-md tabular-nums"
                >
                  {lastExportReport[activeSlot]?.formatLabel}: {lastExportReport[activeSlot]?.sizeText}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={Boolean(isExportingFormat)}
                onClick={() => void exportSlotInFormat(activeSlot, '4k_jpg')}
                title={`Скачать thumbnail_4k_3840x2160_${activeSlot}.jpg (JPEG 95%)`}
                className="w-full min-h-[44px] btn-primary-action py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>4K JPEG (3840×2160)</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExportingFormat)}
                onClick={() => void exportSlotInFormat(activeSlot, '4k_png')}
                title={`Скачать thumbnail_4k_3840x2160_${activeSlot}.png (PNG без потерь)`}
                className="w-full min-h-[44px] bg-[#111827] hover:bg-white/[0.08] border border-amber-400/45 text-[#FDE047] font-bold py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>4K PNG (3840×2160)</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExportingFormat)}
                onClick={() => void exportSlotInFormat(activeSlot, '720p_jpg')}
                title={`Скачать thumbnail_720p_1280x720_${activeSlot}.jpg (< 1.95 МБ для YouTube)`}
                className="w-full min-h-[44px] bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:brightness-110 border border-emerald-400/45 text-emerald-200 font-bold py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>720p JPEG (1280×720)</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExportingFormat)}
                onClick={() => void exportSlotInFormat(activeSlot, '720p_png')}
                title={`Скачать thumbnail_720p_1280x720_${activeSlot}.png (компактный HD PNG)`}
                className="w-full min-h-[44px] bg-[#111827] hover:bg-white/[0.08] border border-cyan-400/40 text-cyan-200 font-bold py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span>720p PNG (1280×720)</span>
              </button>
            </div>

            <button
              type="button"
              disabled={Boolean(isExportingFormat)}
              onClick={() => void downloadAll3CoversYouTube2Mb()}
              className="w-full min-h-[44px] bg-gradient-to-r from-amber-400/20 via-emerald-500/15 to-cyan-500/20 hover:brightness-110 border border-amber-400/55 text-[#FDE047] font-extrabold py-2 px-4 rounded-xl text-[11.5px] flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
            >
              {isExportingFormat === 'batch_all' && batchExportStatus ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
              ) : (
                <Download className="w-4 h-4 text-amber-300 shrink-0" />
              )}
              <span>
                {batchExportStatus || '📦 Скачать все 3 обложки A/B/C для YouTube (< 2 МБ)'}
              </span>
            </button>

            {onSendToArtEditor && (
              <button
                type="button"
                onClick={() => handleOpenSlotInArtEditor(activeSlot)}
                className="w-full min-h-[42px] bg-white/[0.05] hover:bg-white/[0.1] border border-cyan-400/40 text-cyan-200 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Открыть Вариант {activeSlot} в Арт-Редакторе</span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Правая зона (7/12): 4K Холст активного слота A/B/C или Сравнение A / B / C в ленте YouTube */}
        <div className="lg:col-span-7 aether-surface rounded-2xl p-4 sm:p-6 space-y-5 flex flex-col justify-between min-w-0">
          {!compareFeedEnabled ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        activeSlot === 'A'
                          ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                          : activeSlot === 'B'
                            ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                            : 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]'
                      }`}
                    />
                    <span>
                      Вариант {activeSlot} — Мастер #{selectedMasterVariantIdx + 1}{' '}
                      {bwContrastFilter ? '(B&W Контраст)' : ''}
                    </span>
                    {attachedToYoutubeIdx === selectedMasterVariantIdx && (
                      <span className="text-[10px] bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono">
                        ✓ YouTube Release
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {onSendToArtEditor && (
                      <button
                        type="button"
                        onClick={() => handleOpenSlotInArtEditor(activeSlot)}
                        className="text-[10.5px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/35 px-2.5 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition"
                      >
                        <span>Открыть в Арт-Редакторе</span>
                        <ArrowRight className="w-3 h-3 shrink-0" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEndScreenSafeZone(prev => !prev)}
                      className={`text-[10.5px] font-mono font-bold px-2.5 py-0.5 rounded-full border cursor-pointer transition ${
                        showEndScreenSafeZone
                          ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                          : 'bg-white/[0.04] border-white/[0.08] text-white/55 hover:text-white'
                      }`}
                      title="Переключить направляющую безопасной зоны YouTube End Screen"
                    >
                      End Screen: {endScreenSafeZone || '05:14-05:24'} {showEndScreenSafeZone ? 'ON' : 'OFF'}
                    </button>
                    <span className="text-[11px] font-mono text-white/55 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full">
                      3840×2160 • 16:9
                    </span>
                  </div>
                </div>

                {/* Интерактивный 4K холст активного слота с Drag & Drop */}
                <div className="aether-preview-frame group/previewActive">
                  <div className="relative w-full aspect-video rounded-[15px] overflow-hidden bg-[#05080f]">
                    <canvas
                      ref={mainCanvasRef}
                      width={1280}
                      height={720}
                      className={`w-full h-full object-contain transition-all duration-200 ${
                        bwContrastFilter ? 'grayscale contrast-125' : ''
                      }`}
                    />

                    {activeHookBox && (
                      <div
                        role="button"
                        aria-label={`Перетащить заголовок варианта ${activeSlot}`}
                        title="Зажмите и перетащите текст-хук в любую точку кадра"
                        onPointerDown={e => startHookDrag(e, activeSlot)}
                        onPointerEnter={() => setHoveredSlot(activeSlot)}
                        onPointerLeave={() =>
                          setHoveredSlot(prev => (prev === activeSlot ? null : prev))
                        }
                        style={{
                          left: `${activeHookBox.leftPct}%`,
                          top: `${activeHookBox.topPct}%`,
                          width: `${activeHookBox.widthPct}%`,
                          height: `${activeHookBox.heightPct}%`
                        }}
                        className={`absolute z-20 touch-none select-none rounded-lg transition-all duration-150 ${
                          draggingSlot === activeSlot
                            ? 'cursor-grabbing border-[1.5px] border-dashed border-amber-300 bg-amber-300/10 shadow-[0_0_20px_rgba(251,191,36,0.25)]'
                            : hoveredSlot === activeSlot
                              ? 'cursor-grab border-[1.5px] border-dashed border-amber-300/85 bg-amber-300/5'
                              : 'cursor-grab border border-dashed border-transparent group-hover/previewActive:border-white/20'
                        }`}
                      />
                    )}

                    {/* End Screen Safe-Zone Guide Overlay (05:14-05:24) */}
                    {showEndScreenSafeZone && (
                      <div className="pointer-events-none absolute inset-0 z-10">
                        {/* Безопасная рамка отступов 5% */}
                        <div className="absolute inset-[5%] border border-dashed border-emerald-400/35 rounded-lg" />
                        {/* Зона карточек YouTube End Screen (правая/нижняя часть для финала 05:14-05:24) */}
                        <div className="absolute right-[6%] bottom-[16%] w-[30%] h-[30%] rounded-lg border border-dashed border-cyan-300/65 bg-cyan-500/10 flex flex-col items-center justify-center text-center p-1">
                          <span className="text-[9px] font-mono font-bold text-cyan-200 uppercase">
                            End Screen Card
                          </span>
                          <span className="text-[8px] font-mono text-cyan-300/80">
                            {endScreenSafeZone || '05:14-05:24'}
                          </span>
                        </div>
                        <div className="absolute left-[6%] bottom-[16%] w-[30%] h-[30%] rounded-lg border border-dashed border-cyan-300/45 bg-cyan-500/5 flex flex-col items-center justify-center text-center p-1">
                          <span className="text-[9px] font-mono font-bold text-cyan-200/85 uppercase">
                            Next Video Slot
                          </span>
                        </div>
                        <div className="absolute top-2.5 left-2.5 bg-[#0b0f19]/85 backdrop-blur-md border border-emerald-400/40 text-emerald-300 font-mono text-[9.5px] px-2 py-0.5 rounded-md">
                          Safe-Zone • End Screen {endScreenSafeZone || '05:14-05:24'}
                        </div>
                      </div>
                    )}

                    {showYoutubeOverlay && (
                      <>
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-0 group-hover/previewActive:opacity-100 transition-opacity duration-300">
                          <div className="border-r border-b border-white/10" />
                          <div className="border-r border-b border-white/10" />
                          <div className="border-b border-white/10" />
                          <div className="border-r border-b border-white/10" />
                          <div className="border-r border-b border-white/10" />
                          <div className="border-b border-white/10" />
                          <div className="border-r border-white/10" />
                          <div className="border-r border-white/10" />
                          <div />
                        </div>

                        <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-[#f8fafc] font-mono font-bold text-xs px-2 py-0.5 rounded-md shadow-md border border-white/15">
                          {manifestDurationBadge || youtubeDurationBadge || '3:00:00'}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {activeHookBox && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/55 px-1">
                    <span className="flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Перетащите заголовок Варианта {activeSlot} мышью или пальцем по кадру</span>
                    </span>
                    <span className="font-mono text-amber-300/90 tabular-nums">
                      X:{Math.round(activeConfig.hookLayout.xPct)}% • Y:
                      {Math.round(activeConfig.hookLayout.yPct)}% • S1:{activeConfig.hookLayout.topScalePct}% / S2:{activeConfig.hookLayout.bottomScalePct}%
                    </span>
                  </div>
                )}

                {showYoutubeOverlay && (
                  <div className="flex items-start gap-3 pt-1 px-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black font-mono text-xs shrink-0 shadow-md">
                      4K
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <input
                        type="text"
                        value={youtubeVideoHeading}
                        onChange={e => setYoutubeVideoHeading(e.target.value)}
                        className="w-full bg-transparent text-sm font-bold text-[#f8fafc] outline-none focus:border-b focus:border-emerald-400 truncate"
                      />
                      <div className="text-xs text-white/55 flex items-center gap-1.5 flex-wrap">
                        <span>{youtubeChannelName}</span>
                        <span className="text-[10px] bg-white/10 text-white/80 px-1.5 rounded-full">✓</span>
                        <span className="font-mono text-[11px]">• 428K views • 2h ago • Слот {activeSlot}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* РЕЖИМ СРАВНЕНИЯ «👁️ Сравнить A / B / C в ленте» (Desktop 16:9 + Mobile Scale) */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-2">
                    <Columns className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Сравнение A / B / C в ленте YouTube</span>
                  </h3>
                  <p className="text-[11px] text-white/55 mt-0.5">
                    Нажмите на любую карточку, чтобы перейти к редактированию слота
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-[#080c14]/90 border border-white/[0.08] rounded-xl p-1">
                  {(
                    [
                      { id: 'both', label: 'Все форматы' },
                      { id: 'desktop', label: 'Десктоп 16:9' },
                      { id: 'mobile', label: 'Мобильный' }
                    ] as const
                  ).map(mode => (
                    <button
                      key={`feed-mode-${mode.id}`}
                      type="button"
                      onClick={() => setFeedViewportMode(mode.id)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer transition ${
                        feedViewportMode === mode.id
                          ? 'bg-amber-400/20 text-amber-200 border border-amber-400/45'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1. Десктопная лента YouTube (сетка 16:9) */}
              {(feedViewportMode === 'both' || feedViewportMode === 'desktop') && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-bold uppercase tracking-wider text-white/80">
                      🖥️ Десктопная лента YouTube (16:9)
                    </span>
                    <span className="font-mono text-[10px]">Desktop Home Feed Grid</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {(
                      [
                        {
                          slot: 'A' as const,
                          ref: feedCanvasARef,
                          badge: '🅰️ Вариант A',
                          borderActive: 'border-amber-400/70 ring-1 ring-amber-400/35'
                        },
                        {
                          slot: 'B' as const,
                          ref: feedCanvasBRef,
                          badge: '🅱️ Вариант B',
                          borderActive: 'border-emerald-400/70 ring-1 ring-emerald-400/35'
                        },
                        {
                          slot: 'C' as const,
                          ref: feedCanvasCRef,
                          badge: '🅲 Вариант C',
                          borderActive: 'border-cyan-400/70 ring-1 ring-cyan-400/35'
                        }
                      ]
                    ).map(item => {
                      const isCurrent = activeSlot === item.slot;
                      return (
                        <div
                          key={`desktop-feed-card-${item.slot}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveSlot(item.slot)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveSlot(item.slot);
                            }
                          }}
                          className={`rounded-2xl p-2.5 bg-[#080c14]/85 border transition cursor-pointer space-y-2.5 ${
                            isCurrent
                              ? item.borderActive
                              : 'border-white/[0.08] hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10.5px] font-bold">
                            <span className="text-[#f8fafc]">{item.badge}</span>
                            <span className="font-mono text-white/50">
                              {isCurrent ? 'ACTIVE' : 'Клик → Ред.'}
                            </span>
                          </div>
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/[0.08]">
                            <canvas
                              ref={item.ref}
                              width={640}
                              height={360}
                              className={`w-full h-full object-cover ${
                                bwContrastFilter ? 'grayscale contrast-125' : ''
                              }`}
                            />
                            <div className="pointer-events-none absolute bottom-1.5 right-1.5 bg-black/90 text-white font-mono font-bold text-[10px] px-1.5 py-0.5 rounded">
                              {youtubeDurationBadge || '3:00:00'}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 pt-0.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black font-mono text-[9px] shrink-0">
                              4K
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#f8fafc] line-clamp-2 leading-snug">
                                {youtubeVideoHeading}
                              </p>
                              <p className="text-[10.5px] text-white/50 truncate mt-0.5">
                                {youtubeChannelName} • 428K views
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Мобильная лента YouTube (масштаб смартфона ~160x90) */}
              {(feedViewportMode === 'both' || feedViewportMode === 'mobile') && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-bold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Мобильная лента YouTube (реальный масштаб)</span>
                    </span>
                    <span className="font-mono text-[10px]">160×90 px Readability</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(
                      [
                        { slot: 'A' as const, ref: mobileFeedCanvasARef, tag: '🅰️ A' },
                        { slot: 'B' as const, ref: mobileFeedCanvasBRef, tag: '🅱️ B' },
                        { slot: 'C' as const, ref: mobileFeedCanvasCRef, tag: '🅲 C' }
                      ]
                    ).map(item => (
                      <button
                        key={`mobile-feed-card-${item.slot}`}
                        type="button"
                        onClick={() => setActiveSlot(item.slot)}
                        className={`text-left rounded-2xl p-2.5 bg-[#090d16]/95 border flex items-center gap-3 cursor-pointer transition ${
                          activeSlot === item.slot
                            ? 'border-amber-400/60 bg-amber-500/[0.06]'
                            : 'border-white/[0.08] hover:border-white/25'
                        }`}
                      >
                        <div className="relative w-[144px] h-[81px] sm:w-[160px] sm:h-[90px] rounded-lg overflow-hidden bg-black border border-white/15 shrink-0">
                          <canvas
                            ref={item.ref}
                            width={320}
                            height={180}
                            className={`w-full h-full block ${
                              bwContrastFilter ? 'grayscale contrast-125' : ''
                            }`}
                          />
                          <div className="pointer-events-none absolute bottom-1 right-1 bg-black/90 text-white font-mono text-[9px] font-bold px-1 rounded">
                            {youtubeDurationBadge || '3:00:00'}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <span className="text-[10.5px] font-mono font-bold text-amber-300 block">
                            {item.tag} •{' '}
                            {slotConfigs[item.slot].badgesEnabled
                              ? slotConfigs[item.slot].badgeTexts.filter(b => b.trim()).length
                              : 0}{' '}
                            бейдж(а)
                          </span>
                          <p className="text-[11px] font-semibold text-[#f8fafc] line-clamp-2 leading-tight">
                            {youtubeVideoHeading}
                          </p>
                          <p className="text-[10px] text-white/45 truncate">
                            {slotConfigs[item.slot].topText || '(Без текста)'}
                            {slotConfigs[item.slot].bottomText
                              ? ` + ${slotConfigs[item.slot].bottomText}`
                              : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* НИЖНЯЯ ПАНЕЛЬ ХОЛСТА: МОБИЛЬНЫЙ МАСШТАБ АКТИВНОГО СЛОТА (160x90 PX) И ТАЙМКОД */}
          <div className="aether-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-4">
              <div className="relative w-[160px] h-[90px] rounded-xl overflow-hidden border border-white/15 bg-black shrink-0 shadow-lg">
                <canvas
                  ref={mobileCanvasRef}
                  width={320}
                  height={180}
                  className={`w-[160px] h-[90px] block ${
                    bwContrastFilter ? 'grayscale contrast-125' : ''
                  }`}
                />
                <div className="pointer-events-none absolute bottom-1 right-1 bg-black/90 text-white font-mono text-[9px] font-bold px-1 rounded">
                  {youtubeDurationBadge || '3:00:00'}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-[#f8fafc] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Мобильный масштаб • Слот {activeSlot} (160×90 px)</span>
                </span>
                <p className="text-xs text-white/55 max-w-md leading-relaxed">
                  Контроль читаемости заголовка, верхнего ряда бейджей и таймкода{' '}
                  <code className="font-mono text-amber-300">{youtubeDurationBadge}</code> в ленте смартфона.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/55">Таймкод:</span>
              <input
                type="text"
                value={youtubeDurationBadge}
                onChange={e => setYoutubeDurationBadge(e.target.value)}
                className="w-24 min-h-[40px] bg-[#080c14] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* СЕТКА 2x2 FLUX.1-SCHNELL */}
      <div className="aether-surface rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <Grid className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-[#f8fafc] uppercase tracking-wider">
                Галерея сцен и обложек 2×2 (Flux.1 • 16:9)
              </h3>
              <p className="text-xs text-white/55">
                Выберите любую карточку для установки в мастер-слот (`window.selectedMasterThumbnail`)
                {lastModelUsed ? ` • ${lastModelUsed}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={localMediaInputRef}
              type="file"
              accept="video/*,image/png,image/jpeg,image/webp,.mp4,.mov,.webm,.png,.jpg,.jpeg"
              onChange={handleSliceLocalMediaToGrid}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => localMediaInputRef.current?.click()}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-amber-400/40 text-amber-300 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSlicingLocalMedia ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Кадр из локального видео/арта</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateProceduralBatchFallback(activeSlot)}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#f8fafc] font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <span>🎨 4 локальных фона</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateFluxCover(activeSlot)}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="min-h-[44px] btn-primary-action px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isGeneratingCovers ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>
                {isGeneratingCovers
                  ? buttonQueueStatus || 'Ожидание AI Horde...'
                  : isCloudflareConfigured
                    ? 'Cloudflare Flux (2×2)'
                    : 'Flux.1 AI Horde (2×2)'}
              </span>
            </button>
          </div>
        </div>

        {generationError && (
          <div
            role="alert"
            className="w-full max-w-md rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 border bg-rose-950/75 border-rose-500/60 text-rose-200"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span title={generationError} className="truncate font-semibold">
                {generationError}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGenerationError(null)}
              className="text-[11px] text-white/55 hover:text-white shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Индикатор и 4 анимированных скелетона на время запроса */}
        {isGeneratingCovers || isSlicingLocalMedia ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2.5 py-2 text-xs font-bold text-cyan-300">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="font-mono">
                {isSlicingLocalMedia
                  ? 'Нарезка 4 вариантов превью (16:9) из локального видео/арта...'
                  : generationStatusText || 'Генерация 4 чистых 16:9 обложек (Flux.1-Schnell)...'}
              </span>
              {isGeneratingCovers && (
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="min-h-[36px] bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/50 text-rose-200 px-3 py-1 rounded-lg text-[11px] cursor-pointer"
                >
                  Отменить
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full my-4">
              {[0, 1, 2, 3].map(skeletonIdx => (
                <div
                  key={`skeleton-${skeletonIdx}`}
                  className="aspect-video w-full rounded-2xl bg-[#080c14]/90 border border-white/[0.08] animate-pulse flex flex-col items-center justify-center gap-2 p-4"
                >
                  <Wand2 className="w-6 h-6 text-cyan-400/60 animate-bounce" />
                  <span className="text-[11px] font-mono text-white/55 text-center">
                    {isSlicingLocalMedia
                      ? `Подготовка кадра #${skeletonIdx + 1}...`
                      : `Flux.1-Schnell 1344×768 • Вариант #${skeletonIdx + 1}...`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div id="flux-thumbnails-grid-container" className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full my-4">
            {batchVariants.map((imgSrc, index) => {
              const isMaster = selectedMasterVariantIdx === index;
              const isAttached = attachedToYoutubeIdx === index;
              const sceneLabel = variantLabels[index] || `Вариант #${index + 1}`;

              return (
                <div
                  key={`grid-variant-${index}`}
                  data-index={index}
                  onClick={e => {
                    const target = e.target as HTMLElement | null;
                    if (target && target.tagName.toLowerCase() === 'a') return;
                    handleSelectBatchVariant(index, activeSlot);
                  }}
                  className={`scene-card-interactive relative group rounded-2xl overflow-hidden border bg-[#080c14]/90 cursor-pointer flex flex-col justify-between ${
                    isMaster
                      ? 'border-cyan-400 ring-2 ring-cyan-400/40 shadow-[0_12px_32px_-8px_rgba(6,182,212,0.45)]'
                      : 'border-white/[0.08] hover:border-cyan-400/60'
                  }`}
                >
                  <div className="relative w-full aspect-video overflow-hidden">
                    <img
                      src={imgSrc}
                      alt={`${sceneLabel} (${index + 1})`}
                      className={`w-full aspect-video object-cover ${
                        bwContrastFilter ? 'grayscale contrast-125' : ''
                      }`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                      <span className="text-xs font-mono font-semibold text-white bg-black/70 px-2.5 py-1 rounded-lg truncate max-w-[55%]">
                        {sceneLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setZoomedVariantIdx(index);
                          }}
                          className="min-h-[36px] text-xs bg-slate-900/90 hover:bg-black text-cyan-300 border border-cyan-400/40 font-bold px-2.5 py-1 rounded-lg shadow cursor-pointer"
                        >
                          🔍 Увеличить
                        </button>
                        <a
                          href={imgSrc}
                          download={`thumbnail_${index + 1}.jpg`}
                          onClick={e => e.stopPropagation()}
                          className="min-h-[36px] flex items-center text-xs bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg shadow"
                        >
                          Скачать
                        </a>
                      </div>
                    </div>
                    <div
                      className={`selection-indicator ${
                        isMaster ? '' : 'hidden'
                      } absolute top-2.5 right-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg`}
                    >
                      ✓
                    </div>
                  </div>

                  {/* Панель действий под выбранной карточкой */}
                  <div className="p-3 bg-[#0f1623]/90 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs min-w-0">
                      <span className="font-mono font-bold text-[#f8fafc] shrink-0">#{index + 1}</span>
                      <span className="text-[11px] text-white/55 truncate max-w-[180px]" title={sceneLabel}>
                        {sceneLabel}
                      </span>
                      {isMaster && (
                        <span className="text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-400/35 px-2 py-0.5 rounded-full shrink-0">
                          MASTER
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setZoomedVariantIdx(index);
                        }}
                        aria-label={`Увеличить вариант #${index + 1}`}
                        title="Увеличить кадр"
                        className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-cyan-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDownloadVariantFromGrid(index);
                        }}
                        className="min-h-[40px] btn-primary-action py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>📥 Скачать 4K</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleAttachToYoutubeRelease(index);
                        }}
                        className={`min-h-[40px] font-bold py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5 cursor-pointer border ${
                          isAttached
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-cyan-300'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {isAttached ? '✓ В релизе' : 'В релиз'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ВТОРОСТЕПЕННЫЕ ИНСТРУМЕНТЫ ПОД ПЛАВНЫМИ АККОРДЕОНАМИ (УСТРАНЕНИЕ ВИЗУАЛЬНОГО ШУМА) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* АККОРДЕОН 1: АВТО-ЭКСТРАКТОР СТОП-КАДРА ИЗ ГОТОВОГО ВИДЕО В ЧЕСТНОМ 4K ПО ТАЙМКОДУ СЕКУНДЫ */}
        <div className="aether-surface rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowVideoExtractor(prev => !prev)}
            className="w-full min-h-[56px] p-4 sm:p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#f8fafc] truncate">
                  1. Авто-экстрактор 4K стоп-кадра из видео
                </h3>
                <p className="text-[11px] text-white/55 truncate">
                  Точный захват кадра по секунде в честном разрешении 3840×2160
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-amber-300/85">
                3840×2160
              </span>
              <ChevronDown
                className={`w-4 h-4 text-white/60 transition-transform duration-200 ${
                  showVideoExtractor ? 'rotate-180 text-amber-400' : ''
                }`}
              />
            </div>
          </button>

          {showVideoExtractor && (
            <div className="px-5 pb-5 pt-2 border-t border-white/[0.08] space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleSelectVideoForExtraction}
                  className="text-xs text-white/60 file:mr-3 file:min-h-[40px] file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gradient-to-r file:from-amber-400 file:to-orange-500 file:text-slate-950 cursor-pointer"
                />
                {videoFileName && (
                  <span className="text-[11px] font-mono text-emerald-300 truncate max-w-xs">
                    Файл: {videoFileName}
                  </span>
                )}
              </div>

              {videoUrl ? (
                <div className="space-y-3">
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/[0.1]">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      onLoadedMetadata={e => {
                        setVideoDuration(e.currentTarget.duration || 10);
                      }}
                      className="w-full h-full object-contain"
                      controls
                      muted
                    />
                  </div>

                  <div className="bg-[#080c14]/80 border border-white/[0.08] rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#f8fafc] font-semibold">
                        Таймкод секунды стоп-кадра:
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={videoDuration || 3600}
                          step={0.1}
                          value={seekTimeSec}
                          onChange={e => handleSeekVideo(Number(e.target.value) || 0)}
                          className="w-20 min-h-[38px] bg-[#0f1623] border border-amber-400/40 rounded-lg px-2 py-1 text-xs font-mono text-amber-300 text-center outline-none"
                        />
                        <span className="text-[11px] font-mono text-white/55">
                          / {videoDuration.toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={videoDuration || 10}
                      step={0.05}
                      value={seekTimeSec}
                      onChange={e => handleSeekVideo(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('A')}
                        className="min-h-[44px] btn-artistic-premium py-2 px-2.5 rounded-xl text-xs cursor-pointer"
                      >
                        📸 В Слот A (4K)
                      </button>
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('B')}
                        className="min-h-[44px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold py-2 px-2.5 rounded-xl text-xs cursor-pointer"
                      >
                        📸 В Слот B (4K)
                      </button>
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('C')}
                        className="min-h-[44px] bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-bold py-2 px-2.5 rounded-xl text-xs cursor-pointer"
                      >
                        📸 В Слот C (4K)
                      </button>
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('download')}
                        className="min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#f8fafc] font-semibold py-2 px-2.5 rounded-xl text-xs cursor-pointer"
                      >
                        💾 Скачать 4K
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#080c14]/70 border border-dashed border-white/[0.1] rounded-xl p-6 text-center space-y-1">
                  <Film className="w-7 h-7 text-amber-400/70 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-[#f8fafc]">
                    Загрузите видеофайл (.mp4 / .mov / .webm) для авто-экстракта 4K стоп-кадра
                  </p>
                  <p className="text-[11px] text-white/55">
                    Точный выбор секунды и мгновенный захват кадра в 3840×2160 без потери четкости
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* АККОРДЕОН 2: ГЕНЕРАТОР ВИЗУАЛЬНОГО ПРОМПТА (FLUX.1 / MIDJOURNEY / LEONARDO) */}
        <div className="aether-surface rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPromptGenerator(prev => !prev)}
            className="w-full min-h-[56px] p-4 sm:p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#f8fafc] truncate">
                  2. Конструктор визуального промпта (Flux.1 / Midjourney)
                </h3>
                <p className="text-[11px] text-white/55 truncate">
                  Пресеты атмосферы и тонкая настройка English-промпта 16:9
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-emerald-300/85">
                PROMPT LAB
              </span>
              <ChevronDown
                className={`w-4 h-4 text-white/60 transition-transform duration-200 ${
                  showPromptGenerator ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </div>
          </button>

          {showPromptGenerator && (
            <div className="px-5 pb-5 pt-2 border-t border-white/[0.08] space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-white/55 uppercase block">
                  Визуальный стиль (пилюли-пресеты):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'mystery_dark', label: '🕵️ Dark Mystery (Chiaroscuro)' },
                    { id: 'ambient_4k', label: '❄️ Cozy Ambient 4K (Огонь vs Лёд)' },
                    { id: 'truecrime_contrast', label: '📁 True Crime (Гриф SECRET)' },
                    { id: 'scifi_neon', label: '📡 Anomalous Signal (Неон)' }
                  ].map(preset => {
                    const active = promptStylePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setPromptStylePreset(
                            preset.id as
                              | 'mystery_dark'
                              | 'ambient_4k'
                              | 'truecrime_contrast'
                              | 'scifi_neon'
                          );
                          setCustomFluxPrompt('');
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-left border cursor-pointer ${
                          active
                            ? 'btn-artistic-premium'
                            : 'bg-[#080c14]/80 border-white/[0.08] text-white/70 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-white/55 uppercase block">
                  Промпт для Flux.1-Schnell (1344×768 / 16:9):
                </label>
                <textarea
                  rows={4}
                  value={activePromptText}
                  onChange={e => setCustomFluxPrompt(e.target.value)}
                  className="w-full bg-[#080c14]/90 border border-white/[0.1] focus:border-emerald-400 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleGenerateFluxCover(activeSlot)}
                  disabled={isGeneratingCovers}
                  className="min-h-[44px] btn-primary-action py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>
                    {isGeneratingCovers
                      ? buttonQueueStatus || 'Ожидание AI Horde...'
                      : 'Сгенерировать 2×2 по промпту'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={copyCoverPromptForWebGenerator}
                  className="min-h-[44px] btn-artistic-premium py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-4 h-4" /> Промпт скопирован!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> 📋 Скопировать промпт
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
