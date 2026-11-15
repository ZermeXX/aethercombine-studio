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
  Type,
  Flame,
  RotateCcw,
  Move,
  ChevronDown,
  Image as ImageIcon,
  ArrowRight
} from 'lucide-react';

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

export type CinematicBadgeId =
  | '4k_ultra_hd'
  | 'documentary'
  | 'true_story'
  | 'full_story'
  | 'untold_history'
  | 'lost_archives'
  | 'real_footage'
  | 'deep_dive'
  | 'no_ads'
  | '3_hours'
  | 'no_ads_seamless'
  | 'ambience_asmr'
  | 'deep_sleep'
  | 'cozy_fireplace'
  | 'winter_nights'
  | 'rain_and_thunder'
  | 'study_and_focus';

export interface CinematicBadgeOption {
  id: CinematicBadgeId;
  label: string;
}

const HISTOVIVA_BADGE_OPTIONS: CinematicBadgeOption[] = [
  { id: '4k_ultra_hd', label: '4K ULTRA HD' },
  { id: 'documentary', label: 'DOCUMENTARY' },
  { id: 'true_story', label: 'TRUE STORY' },
  { id: 'full_story', label: 'FULL STORY' },
  { id: 'untold_history', label: 'UNTOLD HISTORY' },
  { id: 'lost_archives', label: 'LOST ARCHIVES' },
  { id: 'real_footage', label: 'REAL FOOTAGE' },
  { id: 'deep_dive', label: 'DEEP DIVE' },
  { id: 'no_ads', label: 'NO ADS' }
];

const AMBIENT_BADGE_OPTIONS: CinematicBadgeOption[] = [
  { id: '3_hours', label: '3 HOURS' },
  { id: 'no_ads_seamless', label: 'NO ADS • SEAMLESS' },
  { id: 'ambience_asmr', label: 'AMBIENCE • ASMR' },
  { id: 'deep_sleep', label: 'DEEP SLEEP' },
  { id: 'cozy_fireplace', label: 'COZY FIREPLACE' },
  { id: 'winter_nights', label: 'WINTER NIGHTS' },
  { id: 'rain_and_thunder', label: 'RAIN & THUNDER' },
  { id: 'study_and_focus', label: 'STUDY & FOCUS' }
];

const CINEMATIC_BADGE_OPTIONS: CinematicBadgeOption[] = [
  ...HISTOVIVA_BADGE_OPTIONS,
  ...AMBIENT_BADGE_OPTIONS
];

const BADGE_LABEL_BY_ID: Record<CinematicBadgeId, string> = CINEMATIC_BADGE_OPTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.label;
    return acc;
  },
  {} as Record<CinematicBadgeId, string>
);

const VALID_BADGE_IDS = new Set<string>(CINEMATIC_BADGE_OPTIONS.map(b => b.id));

function parseBadgeIds(raw: string): CinematicBadgeId[] {
  if (!raw || raw.trim().toLowerCase() === 'none') return [];
  const normalized = raw
    .split(',')
    .map(s => {
      const trimmed = s.trim();
      if (trimmed === '4k_gold') return '4k_ultra_hd';
      if (trimmed === 'archive_file') return 'lost_archives';
      if (trimmed === 'classified_doc') return 'true_story';
      return trimmed;
    })
    .filter((s): s is CinematicBadgeId => VALID_BADGE_IDS.has(s));
  return Array.from(new Set(normalized)).slice(0, 3);
}

export type ThumbnailFontStyleId =
  | 'cinematic_sans'
  | 'gold_ice_magic'
  | 'royal_gold_laurels'
  | 'medieval_serif'
  | 'minimal_clean';

interface FontStyleOption {
  id: ThumbnailFontStyleId;
  label: string;
  subtitle: string;
  previewFontFamily: string;
}

const FONT_STYLE_OPTIONS: FontStyleOption[] = [
  {
    id: 'cinematic_sans',
    label: 'Cinematic Sans (Montserrat / Impact)',
    subtitle: 'Современный жирный гротеск',
    previewFontFamily: '"Montserrat", Impact, sans-serif'
  },
  {
    id: 'gold_ice_magic',
    label: 'Gold & Ice Magic (Cinzel + Frost)',
    subtitle: '3D-золото сверху (#FFE58F → #B86B00) и морозный лёд с инеем снизу (#FFFFFF → #5B9BD5)',
    previewFontFamily: '"Cinzel", "Cinzel Decorative", serif'
  },
  {
    id: 'royal_gold_laurels',
    label: 'Royal Gold Serif + Laurels (Cinzel Decorative)',
    subtitle: 'Золотой градиент #F6D365 → #C59B27 и лавровые ветви',
    previewFontFamily: '"Cinzel Decorative", "Cinzel", serif'
  },
  {
    id: 'medieval_serif',
    label: 'Medieval Story Serif (Cormorant Garamond Bold)',
    subtitle: 'Атмосферный книжный / исторический шрифт с мягким свечением',
    previewFontFamily: '"Cormorant Garamond", Georgia, serif'
  },
  {
    id: 'minimal_clean',
    label: 'Minimal Clean (Inter / Bebas Neue)',
    subtitle: 'Строгий минималистичный стиль',
    previewFontFamily: '"Bebas Neue", "Inter", sans-serif'
  }
];

export interface HookTextLayout {
  xPct: number;
  yPct: number;
  fontScalePct: number;
}

interface HookBoundingBoxPct {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

const DEFAULT_HOOK_LAYOUT: HookTextLayout = {
  xPct: 50,
  yPct: 80,
  fontScalePct: 100
};

function splitHookLines(rawText: string, balanceTwoLinesOnSpace: boolean): string[] {
  const trimmed = (rawText || '').replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];

  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  if (!balanceTwoLinesOnSpace) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [trimmed];
  if (words.length === 2) return [words[0], words[1]];

  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const leftLen = words.slice(0, i).join(' ').length;
    const rightLen = words.slice(i).join(' ').length;
    const diff = Math.abs(leftLen - rightLen);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

function drawSparkleStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  glowColor: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = radius * 1.1;

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.25);
  halo.addColorStop(0, color);
  halo.addColorStop(0.45, glowColor);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();

  const inner = radius * 0.19;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(inner * 0.4, -inner * 0.4, radius, 0);
  ctx.quadraticCurveTo(inner * 0.4, inner * 0.4, 0, radius);
  ctx.quadraticCurveTo(-inner * 0.4, inner * 0.4, -radius, 0);
  ctx.quadraticCurveTo(-inner * 0.4, -inner * 0.4, 0, -radius);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotationRad: number,
  alpha: number,
  scale: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#E8F7FF';
  ctx.shadowColor = 'rgba(130, 210, 255, 0.85)';
  ctx.shadowBlur = 10 * scale;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, 1.8 * scale);

  for (let arm = 0; arm < 6; arm++) {
    ctx.save();
    ctx.rotate((arm * Math.PI) / 3);

    // Main branch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius);
    ctx.stroke();

    // Outer V-barb
    const b1 = radius * 0.64;
    const b1Len = radius * 0.28;
    ctx.beginPath();
    ctx.moveTo(-b1Len * 0.65, -b1 - b1Len * 0.55);
    ctx.lineTo(0, -b1);
    ctx.lineTo(b1Len * 0.65, -b1 - b1Len * 0.55);
    ctx.stroke();

    // Inner V-barb
    const b2 = radius * 0.36;
    const b2Len = radius * 0.2;
    ctx.beginPath();
    ctx.moveTo(-b2Len * 0.65, -b2 - b2Len * 0.55);
    ctx.lineTo(0, -b2);
    ctx.lineTo(b2Len * 0.65, -b2 - b2Len * 0.55);
    ctx.stroke();

    ctx.restore();
  }

  // Tiny bright core dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, radius * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoldenMagicSwirl(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  span: number,
  side: -1 | 1,
  scale: number
): void {
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(side, 1);

  const grad = ctx.createLinearGradient(0, -span * 0.45, span * 0.9, span * 0.45);
  grad.addColorStop(0, '#FFF8D6');
  grad.addColorStop(0.45, '#FFE58F');
  grad.addColorStop(0.85, '#F5A623');
  grad.addColorStop(1, 'rgba(245, 166, 35, 0)');

  ctx.shadowColor = 'rgba(255, 195, 65, 0.85)';
  ctx.shadowBlur = 14 * scale;
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';

  // Primary curling flourish ribbon
  ctx.lineWidth = Math.max(1.2, 2.8 * scale);
  ctx.beginPath();
  ctx.moveTo(0, -span * 0.14);
  ctx.bezierCurveTo(
    span * 0.42,
    -span * 0.56,
    span * 0.88,
    -span * 0.15,
    span * 0.64,
    span * 0.22
  );
  ctx.bezierCurveTo(
    span * 0.48,
    span * 0.44,
    span * 0.24,
    span * 0.24,
    span * 0.42,
    span * 0.06
  );
  ctx.stroke();

  // Secondary delicate arc
  ctx.lineWidth = Math.max(0.9, 1.5 * scale);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(span * 0.08, span * 0.06);
  ctx.quadraticCurveTo(span * 0.52, -span * 0.28, span * 0.94, -span * 0.08);
  ctx.stroke();

  // Golden magic dust dots along the swirl
  const dustPts = [
    { x: span * 0.22, y: -span * 0.34, r: 2.3 },
    { x: span * 0.54, y: -span * 0.36, r: 1.8 },
    { x: span * 0.78, y: -span * 0.02, r: 2.5 },
    { x: span * 0.52, y: span * 0.28, r: 1.7 },
    { x: span * 0.88, y: -span * 0.24, r: 1.5 }
  ];
  ctx.fillStyle = '#FFF3B0';
  for (const pt of dustPts) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1, pt.r * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMagicGlowAndSnowflakes(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  maxLineW: number,
  blockH: number,
  fontSize: number,
  scale: number,
  fontScale: number
): void {
  const effScale = scale * fontScale;
  const halfW = maxLineW / 2;

  ctx.save();

  // 1. Soft warm gold + cool ice dual aura behind the title
  const goldAura = ctx.createRadialGradient(
    centerX,
    centerY - blockH * 0.22,
    10 * effScale,
    centerX,
    centerY - blockH * 0.22,
    Math.max(halfW * 1.15, 160 * effScale)
  );
  goldAura.addColorStop(0, 'rgba(255, 200, 75, 0.24)');
  goldAura.addColorStop(0.55, 'rgba(245, 166, 35, 0.08)');
  goldAura.addColorStop(1, 'transparent');
  ctx.fillStyle = goldAura;
  ctx.fillRect(
    centerX - halfW * 1.4 - 120 * effScale,
    centerY - blockH - 80 * effScale,
    maxLineW * 1.4 + 240 * effScale,
    blockH * 1.4 + 120 * effScale
  );

  const iceAura = ctx.createRadialGradient(
    centerX,
    centerY + blockH * 0.26,
    10 * effScale,
    centerX,
    centerY + blockH * 0.26,
    Math.max(halfW * 1.15, 160 * effScale)
  );
  iceAura.addColorStop(0, 'rgba(140, 215, 255, 0.22)');
  iceAura.addColorStop(0.55, 'rgba(91, 155, 213, 0.08)');
  iceAura.addColorStop(1, 'transparent');
  ctx.fillStyle = iceAura;
  ctx.fillRect(
    centerX - halfW * 1.4 - 120 * effScale,
    centerY - 40 * effScale,
    maxLineW * 1.4 + 240 * effScale,
    blockH * 1.4 + 120 * effScale
  );

  // 2. Golden light swirls flanking the left & right edges
  const swirlSpan = Math.max(66 * effScale, fontSize * 1.05);
  drawGoldenMagicSwirl(ctx, centerX - halfW - 14 * effScale, centerY - blockH * 0.14, swirlSpan, -1, effScale);
  drawGoldenMagicSwirl(ctx, centerX + halfW + 14 * effScale, centerY - blockH * 0.14, swirlSpan, 1, effScale);

  // 3. Detailed snowflakes flanking left & right of the text
  const snowOffsetX = halfW + 34 * effScale;
  drawSnowflake(ctx, centerX - snowOffsetX, centerY + blockH * 0.22, 18 * effScale, 0.22, 0.92, effScale);
  drawSnowflake(ctx, centerX - snowOffsetX - 38 * effScale, centerY - blockH * 0.04, 11 * effScale, 0.65, 0.72, effScale);
  drawSnowflake(ctx, centerX + snowOffsetX, centerY + blockH * 0.22, 18 * effScale, -0.22, 0.92, effScale);
  drawSnowflake(ctx, centerX + snowOffsetX + 38 * effScale, centerY - blockH * 0.04, 11 * effScale, -0.65, 0.72, effScale);

  // 4. Warm gold & icy white sparkle star flares
  drawSparkleStar(ctx, centerX - halfW - 22 * effScale, centerY - blockH * 0.36, 15 * effScale, '#FFF9DB', 'rgba(255, 210, 80, 0.9)');
  drawSparkleStar(ctx, centerX + halfW + 22 * effScale, centerY - blockH * 0.36, 15 * effScale, '#FFF9DB', 'rgba(255, 210, 80, 0.9)');
  drawSparkleStar(ctx, centerX - halfW * 0.68, centerY - blockH * 0.48, 9 * effScale, '#FFE58F', 'rgba(245, 166, 35, 0.8)');
  drawSparkleStar(ctx, centerX + halfW * 0.72, centerY + blockH * 0.44, 10 * effScale, '#FFFFFF', 'rgba(140, 215, 255, 0.85)');
  drawSparkleStar(ctx, centerX - halfW - 58 * effScale, centerY + blockH * 0.34, 11 * effScale, '#E0F4FF', 'rgba(130, 210, 255, 0.85)');
  drawSparkleStar(ctx, centerX + halfW + 58 * effScale, centerY + blockH * 0.34, 11 * effScale, '#E0F4FF', 'rgba(130, 210, 255, 0.85)');

  ctx.restore();
}

function drawGoldenLaurelBranch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  height: number,
  side: -1 | 1,
  scale: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(side, 1);

  const grad = ctx.createLinearGradient(0, -height * 0.52, 0, height * 0.52);
  grad.addColorStop(0, '#FFF3B0');
  grad.addColorStop(0.42, '#F6D365');
  grad.addColorStop(1, '#C59B27');

  ctx.shadowColor = 'rgba(246, 211, 101, 0.48)';
  ctx.shadowBlur = 10 * scale;

  // Изогнутый стебель ветви
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(1.5, 2.6 * scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-height * 0.16, height * 0.48);
  ctx.quadraticCurveTo(height * 0.22, height * 0.04, -height * 0.06, -height * 0.48);
  ctx.stroke();

  // Листья лавра вдоль дуги (внешние и внутренние)
  const leafCount = 6;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const inv = 1 - t;
    const p0x = -height * 0.16;
    const p0y = height * 0.48;
    const p1x = height * 0.22;
    const p1y = height * 0.04;
    const p2x = -height * 0.06;
    const p2y = -height * 0.48;

    const sx = inv * inv * p0x + 2 * inv * t * p1x + t * t * p2x;
    const sy = inv * inv * p0y + 2 * inv * t * p1y + t * t * p2y;

    const leafLen = height * (0.18 - t * 0.04);
    const leafW = leafLen * 0.42;

    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(dir === 1 ? -0.58 + t * 0.22 : -2.18 + t * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(leafLen * 0.52, -leafW, leafLen, 0);
      ctx.quadraticCurveTo(leafLen * 0.52, leafW, 0, 0);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(15, 10, 4, 0.85)';
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawGoldenCandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottomY: number,
  height: number,
  scale: number
): void {
  ctx.save();
  const flameCenterY = bottomY - height * 0.72;

  // Тёплое свечение пламени свечи
  const halo = ctx.createRadialGradient(
    cx,
    flameCenterY,
    2 * scale,
    cx,
    flameCenterY,
    height * 0.95
  );
  halo.addColorStop(0, 'rgba(254, 240, 138, 0.75)');
  halo.addColorStop(0.35, 'rgba(246, 211, 101, 0.34)');
  halo.addColorStop(0.7, 'rgba(197, 155, 39, 0.12)');
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, flameCenterY, height * 0.95, 0, Math.PI * 2);
  ctx.fill();

  // Основание свечи (блюдце / подсвечник)
  const plateW = height * 0.44;
  const plateGrad = ctx.createLinearGradient(cx - plateW, bottomY, cx + plateW, bottomY);
  plateGrad.addColorStop(0, '#92400E');
  plateGrad.addColorStop(0.5, '#F6D365');
  plateGrad.addColorStop(1, '#92400E');
  ctx.fillStyle = plateGrad;
  ctx.strokeStyle = 'rgba(12, 8, 3, 0.9)';
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.beginPath();
  ctx.roundRect(cx - plateW, bottomY - 4 * scale, plateW * 2, 5 * scale, 2.5 * scale);
  ctx.fill();
  ctx.stroke();

  // Восковой цилиндр свечи
  const bodyW = height * 0.24;
  const bodyH = height * 0.48;
  const bodyTop = bottomY - 4 * scale - bodyH;
  const bodyGrad = ctx.createLinearGradient(cx - bodyW / 2, bodyTop, cx + bodyW / 2, bottomY);
  bodyGrad.addColorStop(0, '#FFFBEB');
  bodyGrad.addColorStop(0.45, '#F6D365');
  bodyGrad.addColorStop(1, '#B45309');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(cx - bodyW / 2, bodyTop, bodyW, bodyH, 3 * scale);
  ctx.fill();
  ctx.stroke();

  // Фитиль
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(cx, bodyTop);
  ctx.lineTo(cx, bodyTop - height * 0.09);
  ctx.stroke();

  // Внешнее пламя
  const flameBottom = bodyTop - height * 0.06;
  const flameTop = flameBottom - height * 0.36;
  const flameW = height * 0.14;
  const flameGrad = ctx.createLinearGradient(cx, flameTop, cx, flameBottom);
  flameGrad.addColorStop(0, '#FEF08A');
  flameGrad.addColorStop(0.55, '#F59E0B');
  flameGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(cx, flameTop);
  ctx.bezierCurveTo(
    cx + flameW,
    flameBottom - height * 0.14,
    cx + flameW * 0.85,
    flameBottom,
    cx,
    flameBottom
  );
  ctx.bezierCurveTo(
    cx - flameW * 0.85,
    flameBottom,
    cx - flameW,
    flameBottom - height * 0.14,
    cx,
    flameTop
  );
  ctx.closePath();
  ctx.fill();

  // Ядро пламени
  ctx.fillStyle = '#FFFBEB';
  ctx.beginPath();
  ctx.ellipse(
    cx,
    flameBottom - height * 0.1,
    flameW * 0.36,
    height * 0.09,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  thumbTitle,
  onThumbTitleChange,
  thumbBadge,
  onThumbBadgeChange,
  externalFontStyle,
  onConsumeExternalFontStyle,
  externalCoverAImageUrl,
  onConsumeExternalCoverAImage,
  onSendToArtEditor,
  youtubeMockTitle,
  scriptContext,
  onNotify
}) => {
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imgA, setImgA] = useState<HTMLImageElement | null>(null);
  const [imgB, setImgB] = useState<HTMLImageElement | null>(null);
  const [titleB, setTitleB] = useState<string>('SEALED 50 YEARS');
  const [badgesB, setBadgesB] = useState<CinematicBadgeId[]>([
    '3_hours',
    'no_ads_seamless',
    'deep_sleep'
  ]);
  const [fontStyle, setFontStyle] = useState<ThumbnailFontStyleId>('cinematic_sans');

  useEffect(() => {
    if (externalFontStyle) {
      setFontStyle(externalFontStyle);
      onConsumeExternalFontStyle?.();
    }
  }, [externalFontStyle, onConsumeExternalFontStyle]);

  useEffect(() => {
    if (!externalCoverAImageUrl) return;
    const editedImg = new Image();
    editedImg.onload = () => {
      setImgA(editedImg);
      window.selectedMasterThumbnail = externalCoverAImageUrl;
      onConsumeExternalCoverAImage?.();
    };
    editedImg.src = externalCoverAImageUrl;
  }, [externalCoverAImageUrl, onConsumeExternalCoverAImage]);

  const [royalDecorEnabled, setRoyalDecorEnabled] = useState<boolean>(true);
  const [magicDecorEnabled, setMagicDecorEnabled] = useState<boolean>(true);
  const [hookLayoutA, setHookLayoutA] = useState<HookTextLayout>({ ...DEFAULT_HOOK_LAYOUT });
  const [hookLayoutB, setHookLayoutB] = useState<HookTextLayout>({ ...DEFAULT_HOOK_LAYOUT });
  const [hookBoxA, setHookBoxA] = useState<HookBoundingBoxPct | null>(null);
  const [hookBoxB, setHookBoxB] = useState<HookBoundingBoxPct | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<'A' | 'B' | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<'A' | 'B' | null>(null);
  const [fontsReadyTick, setFontsReadyTick] = useState<number>(0);

  const selectedBadgesA = parseBadgeIds(thumbBadge);

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
  const [generatingTargetSlot, setGeneratingTargetSlot] = useState<'A' | 'B' | null>(null);
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

  // Режим A/B тестирования и Ч/Б контрастный фильтр силуэтов
  const [abModeEnabled, setAbModeEnabled] = useState<boolean>(false);
  const [bwContrastFilter, setBwContrastFilter] = useState<boolean>(false);

  // Оверлей интерфейса YouTube (таймкод 3:00:00, аватарка, мобильный масштаб 160x90)
  const [showYoutubeOverlay, setShowYoutubeOverlay] = useState<boolean>(true);
  const [youtubeDurationBadge, setYoutubeDurationBadge] = useState<string>('3:00:00');
  const [youtubeChannelName] = useState<string>('Aether Documentary 4K');
  const [youtubeVideoHeading, setYoutubeVideoHeading] = useState<string>(
    youtubeMockTitle ||
      'The Classified Alpine Tape: Why This Station Was Sealed in 24 Hours (4K Documentary)'
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

  useEffect(() => {
    let cancelled = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      Promise.allSettled([
        document.fonts.load('900 64px "Montserrat"'),
        document.fonts.load('900 64px "Cinzel Decorative"'),
        document.fonts.load('900 64px "Cinzel"'),
        document.fonts.load('800 64px "Cinzel"'),
        document.fonts.load('700 64px "Cinzel"'),
        document.fonts.load('700 64px "Cormorant Garamond"'),
        document.fonts.load('700 64px "Bebas Neue"'),
        document.fonts.load('800 24px "Inter"'),
        document.fonts.load('800 24px "Montserrat"'),
        document.fonts.load('700 24px "Inter"')
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

  const toggleBadgeA = (badgeId: CinematicBadgeId) => {
    const exists = selectedBadgesA.includes(badgeId);
    let next: CinematicBadgeId[];
    if (exists) {
      next = selectedBadgesA.filter(id => id !== badgeId);
    } else {
      if (selectedBadgesA.length >= 3) {
        onNotify('Максимум 3 бейджа', 'info');
        return;
      }
      next = [...selectedBadgesA, badgeId];
    }
    onThumbBadgeChange(next.length > 0 ? next.join(',') : 'none');
  };

  const toggleBadgeB = (badgeId: CinematicBadgeId) => {
    if (badgesB.includes(badgeId)) {
      setBadgesB(prev => prev.filter(id => id !== badgeId));
      return;
    }
    if (badgesB.length >= 3) {
      onNotify('Максимум 3 бейджа', 'info');
      return;
    }
    setBadgesB(prev => [...prev, badgeId]);
  };

  // Автогенератор визуального промпта на английском языке
  const generatedCoverPrompt = (() => {
    const rawContext = (scriptContext || thumbTitle || 'abandoned alpine weather station mystery')
      .replace(/[а-яёА-ЯЁ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const topicHint =
      rawContext.length > 5
        ? rawContext.slice(0, 110)
        : 'classified alpine weather station anomaly, sealed bunker magnetic tape recording';

    const styleMap = {
      mystery_dark:
        'High-CTR YouTube documentary thumbnail, cinematic dark mystery atmosphere, extreme foreground focus on vintage reel-to-reel tape recorder glowing red indicator in snow, shadowy silhouette in background, negative space on left for bold English typography, dramatic chiaroscuro, volumetric fog, 35mm f/1.4 lens, 8k photorealistic',
      ambient_4k:
        'Ultra-cozy 4K ambient loop thumbnail, warm fireplace embers contrasting against deep blue arctic blizzard outside window, hyper-detailed snow crystals, soft volumetric warm light, cinematic color grading, Kodachrome 64 aesthetic, 8k resolution',
      truecrime_contrast:
        'True crime investigative YouTube thumbnail, high-contrast split composition, classified dossier folder with red TOP SECRET stamp on metal table, cold cyan rim lighting, intense dramatic shadows, ultra sharp focus, rule of thirds',
      scifi_neon:
        'Anomalous signal documentary thumbnail, glowing green oscilloscope waveform spiking in dark bunker, atmospheric dust particles in light beam, anamorphic lens flare, high contrast silhouette, 8k octane render realism'
    };

    const trimmedTitle = (thumbTitle || '').trim();
    const hookWords = trimmedTitle
      ? trimmedTitle.split(/\s+/).slice(0, 3).join(' ')
      : '';

    const hookClause = hookWords
      ? `Thumbnail Hook (max 3 words): "${hookWords.toUpperCase()}" | `
      : 'Pure clean artwork without embedded text overlays | ';

    return `${styleMap[promptStylePreset]} | Subject context: "${topicHint}" | ${hookClause}Clean 16:9 composition without watermarks, clear silhouette readability on mobile 160x90px`;
  })();

  const activePromptText = customFluxPrompt.trim() || generatedCoverPrompt;

  // Свободный ввод текста-хука без авто-обрезки (поддерживает Enter для переноса на 2 строки)
  const handleThumbHookChange = (val: string) => {
    onThumbTitleChange(val);
  };

  // Интерактивное перетаскивание мышкой и пальцем исключительно для заголовка (текста-хука)
  const startHookDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, slot: 'A' | 'B') => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const canvasEl = slot === 'A' ? canvasARef.current : canvasBRef.current;
      if (!canvasEl) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = canvasEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialLayout = slot === 'A' ? hookLayoutA : hookLayoutB;
      const setLayout = slot === 'A' ? setHookLayoutA : setHookLayoutB;

      setDraggingSlot(slot);

      const onPointerMove = (moveEv: PointerEvent) => {
        const dxPct = ((moveEv.clientX - startX) / Math.max(1, rect.width)) * 100;
        const dyPct = ((moveEv.clientY - startY) / Math.max(1, rect.height)) * 100;
        const nextX = Math.max(4, Math.min(96, Number((initialLayout.xPct + dxPct).toFixed(2))));
        const nextY = Math.max(6, Math.min(94, Number((initialLayout.yPct + dyPct).toFixed(2))));
        setLayout(prev => ({ ...prev, xPct: nextX, yPct: nextY }));
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
    [hookLayoutA, hookLayoutB]
  );

  // Отрисовка обложки на выбранном Canvas (320x180, 1280x720 или 3840x2160) без водяных знаков
  const drawCoverOnCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      image: HTMLImageElement | null,
      titleText: string,
      activeBadges: CinematicBadgeId[],
      activeFontStyle: ThumbnailFontStyleId,
      showRoyalDecor: boolean,
      showMagicDecor: boolean,
      hookLayout: HookTextLayout,
      variantLabel?: string
    ): HookBoundingBoxPct | null => {
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const w = canvas.width;
      const h = canvas.height;
      const scale = w / 1280;

      ctx.clearRect(0, 0, w, h);

      if (image) {
        drawCoverImageToCanvas(
          ctx,
          image,
          image.naturalWidth || w,
          image.naturalHeight || h,
          w,
          h,
          1
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
        radial.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
        radial.addColorStop(0.6, 'rgba(56, 189, 248, 0.08)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${Math.round(20 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          variantLabel
            ? `${variantLabel} — нажмите «Flux.1 AI Horde (2×2)»`
            : 'Нажмите «Flux.1 AI Horde (2×2)» или выберите кадр ниже',
          w / 2,
          h * 0.45
        );
      }

      const hookLines = splitHookLines(titleText, activeFontStyle === 'gold_ice_magic');
      const hasHook = hookLines.length > 0;
      const centerX = (Math.max(4, Math.min(96, hookLayout.xPct)) / 100) * w;
      const centerY = (Math.max(6, Math.min(94, hookLayout.yPct)) / 100) * h;
      const fontScale = Math.max(0.6, Math.min(1.5, hookLayout.fontScalePct / 100));

      // Затемнение/контрастная подложка под текст рисуется ТОЛЬКО если текст-хук не пустой
      if (hasHook) {
        if (hookLayout.yPct >= 55) {
          const grad = ctx.createLinearGradient(0, h * 0.48, 0, h);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.84)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, h * 0.48, w, h * 0.52);
        } else {
          const softSpot = ctx.createRadialGradient(
            centerX,
            centerY,
            40 * scale,
            centerX,
            centerY,
            480 * scale * fontScale
          );
          softSpot.addColorStop(0, 'rgba(2, 6, 14, 0.58)');
          softSpot.addColorStop(0.65, 'rgba(2, 6, 14, 0.22)');
          softSpot.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = softSpot;
          ctx.fillRect(0, 0, w, h);
        }
      }

      // Жёстко закреплённый блок бейджей (1..3 шт.) в верхнем правом углу в аккуратном горизонтальном ряду.
      // Бейджи полностью отвязаны от селектора шрифтов: всегда единый строгий жирный гротеск (Inter / Montserrat, 800, uppercase, чёткий трекинг).
      const badgesToDraw = activeBadges
        .map(id => BADGE_LABEL_BY_ID[id])
        .filter((lbl): lbl is string => Boolean(lbl))
        .map(lbl => lbl.toUpperCase())
        .slice(0, 3);

      if (badgesToDraw.length > 0) {
        const badgeFontPx = 13.5 * scale;
        const badgeFontFamily = '"Montserrat", "Inter", sans-serif';
        const badgeFontWeight = '800';
        const baseTrackingPx = 1.4 * scale;

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

        ctx.font = `${badgeFontWeight} ${Math.max(1, Math.round(badgeFontPx))}px ${badgeFontFamily}`;

        const horizontalPad = 36 * scale;
        const badgeGap = 12 * scale;
        const badgeH = 42 * scale;
        const rawWidths = badgesToDraw.map(lbl =>
          Math.max(112 * scale, measureTrackedWidth(lbl, baseTrackingPx) + horizontalPad)
        );
        const totalRawW =
          rawWidths.reduce((sum, bw) => sum + bw, 0) +
          badgeGap * Math.max(0, badgesToDraw.length - 1);
        const maxAvailableW = w - 64 * scale;
        const fitFactor = totalRawW > maxAvailableW ? maxAvailableW / totalRawW : 1;

        if (fitFactor < 1) {
          ctx.font = `${badgeFontWeight} ${Math.max(1, Math.round(badgeFontPx * fitFactor))}px ${badgeFontFamily}`;
        }

        const effectiveH = badgeH * fitFactor;
        const effectiveGap = badgeGap * fitFactor;
        const effectiveTracking = baseTrackingPx * fitFactor;
        const widths = rawWidths.map(bw => bw * fitFactor);
        const topY = 28 * scale;

        let cursorX = w - 32 * scale;
        for (let i = badgesToDraw.length - 1; i >= 0; i--) {
          const bw = widths[i];
          const bx = cursorX - bw;
          const label = badgesToDraw[i];

          ctx.save();
          ctx.fillStyle = 'rgba(9, 13, 22, 0.90)';
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = Math.max(1.5, 2 * scale);
          ctx.beginPath();
          ctx.roundRect(bx, topY, bw, effectiveH, 9 * scale);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FDE047';
          drawTrackedCenteredText(label, bx + bw / 2, topY + effectiveH * 0.52, effectiveTracking);
          ctx.restore();

          cursorX = bx - effectiveGap;
        }
      }

      // Отрисовка текста-хука (с точным сохранением введённого текста, переносами и координатами x/y)
      if (!hasHook) {
        return null;
      }

      let returnBox: HookBoundingBoxPct | null = null;
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';

      if (activeFontStyle === 'gold_ice_magic') {
        let fontSize = 80 * scale * fontScale;
        const maxTextW = w * 0.88;
        const buildFontStr = (fs: number) =>
          `900 ${Math.max(1, Math.round(fs))}px "Cinzel", "Cinzel Decorative", Georgia, serif`;

        ctx.font = buildFontStr(fontSize);
        let maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        if (maxLineW > maxTextW) {
          fontSize = fontSize * (maxTextW / maxLineW);
          ctx.font = buildFontStr(fontSize);
          maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        }

        const fontStr = buildFontStr(fontSize);
        const lineHeight = fontSize * 1.12;
        const capHeight = fontSize * 0.72;
        const visualSpan = (hookLines.length - 1) * lineHeight + capHeight;
        const topOfCaps = centerY - visualSpan / 2;
        const firstBaselineY = topOfCaps + capHeight;

        if (showMagicDecor) {
          drawMagicGlowAndSnowflakes(
            ctx,
            centerX,
            centerY,
            maxLineW,
            visualSpan,
            fontSize,
            scale,
            fontScale
          );
        }

        const effScale = scale * fontScale;

        hookLines.forEach((line, lineIdx) => {
          const baselineY = firstBaselineY + lineIdx * lineHeight;
          const isTopGoldLine = lineIdx === 0;

          if (isTopGoldLine) {
            // 1. 3D-экструзия для тёплого золотого текста
            const depthSteps = 5;
            for (let d = depthSteps; d >= 1; d--) {
              ctx.save();
              ctx.font = fontStr;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.lineJoin = 'round';
              if (d === depthSteps) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
                ctx.shadowBlur = 18 * effScale;
                ctx.shadowOffsetY = 5 * effScale;
              } else {
                ctx.shadowBlur = 0;
              }
              ctx.strokeStyle = '#291102';
              ctx.lineWidth = Math.max(2, 9.5 * effScale);
              const ox = d * 0.45 * effScale;
              const oy = d * 1.15 * effScale;
              ctx.strokeText(line, centerX + ox, baselineY + oy);
              ctx.fillStyle = '#3B1903';
              ctx.fillText(line, centerX + ox, baselineY + oy);
              ctx.restore();
            }

            // 2. Тёмно-коричневая обводка и тёплое золотое свечение
            ctx.save();
            ctx.font = fontStr;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(255, 190, 55, 0.78)';
            ctx.shadowBlur = 24 * effScale;
            ctx.strokeStyle = '#3A1B02';
            ctx.lineWidth = Math.max(2, 9 * effScale);
            ctx.strokeText(line, centerX, baselineY);
            ctx.restore();

            // 3. Тёплый золотой 3D-градиент (#FFE58F -> #F5A623 -> #B86B00)
            ctx.save();
            ctx.font = fontStr;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            const goldGrad = ctx.createLinearGradient(
              0,
              baselineY - fontSize * 0.78,
              0,
              baselineY + fontSize * 0.1
            );
            goldGrad.addColorStop(0.0, '#FFF7CC');
            goldGrad.addColorStop(0.2, '#FFE58F');
            goldGrad.addColorStop(0.56, '#F5A623');
            goldGrad.addColorStop(0.9, '#B86B00');
            goldGrad.addColorStop(1.0, '#8A4800');
            ctx.fillStyle = goldGrad;
            ctx.fillText(line, centerX, baselineY);
            ctx.restore();
          } else {
            // Нижняя строка: морозный ледяной градиент (#FFFFFF -> #BCE6FF -> #5B9BD5) + холодная синяя обводка + фактура инея
            const lineW = ctx.measureText(line).width;

            // 1. 3D-экструзия в глубокий арктический синий
            const depthSteps = 5;
            for (let d = depthSteps; d >= 1; d--) {
              ctx.save();
              ctx.font = fontStr;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.lineJoin = 'round';
              if (d === depthSteps) {
                ctx.shadowColor = 'rgba(2, 12, 28, 0.94)';
                ctx.shadowBlur = 18 * effScale;
                ctx.shadowOffsetY = 5 * effScale;
              } else {
                ctx.shadowBlur = 0;
              }
              ctx.strokeStyle = '#091E3A';
              ctx.lineWidth = Math.max(2, 9.5 * effScale);
              const ox = d * 0.45 * effScale;
              const oy = d * 1.15 * effScale;
              ctx.strokeText(line, centerX + ox, baselineY + oy);
              ctx.fillStyle = '#0D2B4F';
              ctx.fillText(line, centerX + ox, baselineY + oy);
              ctx.restore();
            }

            // 2. Холодная синяя обводка + ледяное свечение
            ctx.save();
            ctx.font = fontStr;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(120, 210, 255, 0.82)';
            ctx.shadowBlur = 24 * effScale;
            ctx.strokeStyle = '#123A68';
            ctx.lineWidth = Math.max(2, 9 * effScale);
            ctx.strokeText(line, centerX, baselineY);
            ctx.restore();

            // 3. Ледяной градиент + фактура инея на offscreen canvas
            const padX = Math.ceil(36 * effScale);
            const padY = Math.ceil(32 * effScale);
            const boxW = Math.max(8, Math.ceil(lineW + padX * 2));
            const boxH = Math.max(8, Math.ceil(fontSize * 1.25 + padY * 2));
            const off = document.createElement('canvas');
            off.width = boxW;
            off.height = boxH;
            const octx = off.getContext('2d');

            if (octx) {
              const localCx = boxW / 2;
              const localBaselineY = padY + fontSize * 0.92;
              octx.font = fontStr;
              octx.textAlign = 'center';
              octx.textBaseline = 'alphabetic';

              const iceGrad = octx.createLinearGradient(
                0,
                localBaselineY - fontSize * 0.78,
                0,
                localBaselineY + fontSize * 0.1
              );
              iceGrad.addColorStop(0.0, '#FFFFFF');
              iceGrad.addColorStop(0.4, '#BCE6FF');
              iceGrad.addColorStop(0.82, '#5B9BD5');
              iceGrad.addColorStop(1.0, '#3C7AB8');
              octx.fillStyle = iceGrad;
              octx.fillText(line, localCx, localBaselineY);

              // Клиппинг фактуры инея строго внутрь букв
              octx.globalCompositeOperation = 'source-atop';

              const facetSeed = Array.from(line).reduce(
                (acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 7),
                41
              );
              const facetCount = Math.max(14, Math.round(lineW / Math.max(8, 18 * effScale)));
              for (let f = 0; f < facetCount; f++) {
                const fx = padX + ((f * 73 + facetSeed * 13) % Math.max(10, Math.round(lineW)));
                const fy = padY + ((f * 37 + facetSeed * 5) % Math.max(10, Math.round(fontSize * 0.95)));
                const fw = (14 + (f % 5) * 8) * effScale;
                const fh = (18 + (f % 4) * 9) * effScale;
                octx.fillStyle =
                  f % 2 === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(125, 211, 252, 0.22)';
                octx.beginPath();
                octx.moveTo(fx, fy);
                octx.lineTo(fx + fw, fy - fh * 0.35);
                octx.lineTo(fx + fw * 0.45, fy + fh);
                octx.closePath();
                octx.fill();
              }

              const speckCount = Math.min(
                360,
                Math.max(80, Math.round((lineW * fontSize) / Math.max(12, 110 * effScale * effScale)))
              );
              for (let s = 0; s < speckCount; s++) {
                const sx = padX + ((s * 137 + facetSeed * 19) % Math.max(10, Math.round(lineW)));
                const sy = padY + ((s * 67 + facetSeed * 11) % Math.max(10, Math.round(fontSize * 0.96)));
                const sr = (0.7 + (s % 4) * 0.45) * effScale;
                octx.fillStyle =
                  s % 3 === 0 ? 'rgba(255, 255, 255, 0.65)' : 'rgba(210, 240, 255, 0.45)';
                octx.beginPath();
                octx.arc(sx, sy, sr, 0, Math.PI * 2);
                octx.fill();
              }

              octx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
              octx.lineWidth = Math.max(0.7, 1.1 * effScale);
              const veinCount = Math.max(8, Math.round(lineW / Math.max(12, 34 * effScale)));
              for (let v = 0; v < veinCount; v++) {
                const vx = padX + ((v * 97 + facetSeed * 23) % Math.max(10, Math.round(lineW)));
                const vy = localBaselineY - fontSize * (0.1 + ((v * 17) % 60) / 100);
                const len = (8 + (v % 4) * 6) * effScale;
                const ang = ((v % 6) - 2.5) * 0.45;
                octx.beginPath();
                octx.moveTo(vx, vy);
                octx.lineTo(vx + Math.cos(ang) * len, vy + Math.sin(ang) * len);
                octx.lineTo(
                  vx + Math.cos(ang + 0.5) * len * 1.4,
                  vy + Math.sin(ang + 0.5) * len * 1.4
                );
                octx.stroke();
              }

              ctx.drawImage(off, centerX - localCx, baselineY - localBaselineY);
            } else {
              const iceFallback = ctx.createLinearGradient(
                0,
                baselineY - fontSize * 0.78,
                0,
                baselineY + fontSize * 0.1
              );
              iceFallback.addColorStop(0.0, '#FFFFFF');
              iceFallback.addColorStop(0.45, '#BCE6FF');
              iceFallback.addColorStop(1.0, '#5B9BD5');
              ctx.fillStyle = iceFallback;
              ctx.fillText(line, centerX, baselineY);
            }
          }
        });

        const padX = 20 * effScale;
        const padY = 14 * effScale;
        const rawLeft = Math.max(0, centerX - maxLineW / 2 - padX);
        const rawTop = Math.max(0, topOfCaps - padY);
        const rawRight = Math.min(w, centerX + maxLineW / 2 + padX);
        const rawBottom = Math.min(h, topOfCaps + visualSpan + padY);
        returnBox = {
          leftPct: (rawLeft / w) * 100,
          topPct: (rawTop / h) * 100,
          widthPct: ((rawRight - rawLeft) / w) * 100,
          heightPct: ((rawBottom - rawTop) / h) * 100
        };
      } else if (activeFontStyle === 'royal_gold_laurels') {
        let fontSize = 68 * scale * fontScale;
        const decorReserve = showRoyalDecor ? 190 * scale * fontScale : 32 * scale;
        const maxTextW = Math.max(160 * scale, w - 120 * scale - decorReserve);
        const buildFontStr = (fs: number) =>
          `900 ${Math.max(1, Math.round(fs))}px "Cinzel Decorative", "Cinzel", Georgia, serif`;

        ctx.font = buildFontStr(fontSize);
        let maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        if (maxLineW > maxTextW) {
          fontSize = fontSize * (maxTextW / maxLineW);
          ctx.font = buildFontStr(fontSize);
          maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        }

        const lineHeight = fontSize * 1.14;
        const capHeight = fontSize * 0.72;
        const visualSpan = (hookLines.length - 1) * lineHeight + capHeight;
        const topOfCaps = centerY - visualSpan / 2;
        const firstBaselineY = topOfCaps + capHeight;

        if (showRoyalDecor) {
          const effScale = scale * fontScale;
          drawGoldenLaurelBranch(
            ctx,
            centerX - maxLineW / 2 - 42 * effScale,
            centerY,
            Math.max(fontSize * 1.16, visualSpan * 1.08),
            -1,
            effScale
          );
          drawGoldenLaurelBranch(
            ctx,
            centerX + maxLineW / 2 + 42 * effScale,
            centerY,
            Math.max(fontSize * 1.16, visualSpan * 1.08),
            1,
            effScale
          );
          drawGoldenCandle(
            ctx,
            centerX,
            topOfCaps - 12 * effScale,
            fontSize * 0.88,
            effScale
          );
        }

        hookLines.forEach((line, idx) => {
          const baselineY = firstBaselineY + idx * lineHeight;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.96)';
          ctx.shadowBlur = 20 * scale;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 5 * scale;
          ctx.strokeStyle = 'rgba(10, 6, 2, 0.96)';
          ctx.lineWidth = Math.max(2, 10 * scale * fontScale);
          ctx.strokeText(line, centerX, baselineY);

          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          const goldGrad = ctx.createLinearGradient(0, baselineY - fontSize * 0.88, 0, baselineY + 6 * scale);
          goldGrad.addColorStop(0, '#FFF5B8');
          goldGrad.addColorStop(0.45, '#F6D365');
          goldGrad.addColorStop(0.78, '#D4AF37');
          goldGrad.addColorStop(1, '#C59B27');
          ctx.fillStyle = goldGrad;
          ctx.fillText(line, centerX, baselineY);
          ctx.restore();
        });

        const padX = 20 * scale * fontScale;
        const padY = 14 * scale * fontScale;
        const rawLeft = Math.max(0, centerX - maxLineW / 2 - padX);
        const rawTop = Math.max(0, topOfCaps - padY);
        const rawRight = Math.min(w, centerX + maxLineW / 2 + padX);
        const rawBottom = Math.min(h, topOfCaps + visualSpan + padY);
        returnBox = {
          leftPct: (rawLeft / w) * 100,
          topPct: (rawTop / h) * 100,
          widthPct: ((rawRight - rawLeft) / w) * 100,
          heightPct: ((rawBottom - rawTop) / h) * 100
        };
      } else if (activeFontStyle === 'medieval_serif') {
        let fontSize = 76 * scale * fontScale;
        const maxTextW = w * 0.88;
        const buildFontStr = (fs: number) =>
          `700 ${Math.max(1, Math.round(fs))}px "Cormorant Garamond", "Cinzel", Georgia, serif`;

        ctx.font = buildFontStr(fontSize);
        let maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        if (maxLineW > maxTextW) {
          fontSize = fontSize * (maxTextW / maxLineW);
          ctx.font = buildFontStr(fontSize);
          maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        }

        const lineHeight = fontSize * 1.1;
        const capHeight = fontSize * 0.7;
        const visualSpan = (hookLines.length - 1) * lineHeight + capHeight;
        const topOfCaps = centerY - visualSpan / 2;
        const firstBaselineY = topOfCaps + capHeight;

        hookLines.forEach((line, idx) => {
          const baselineY = firstBaselineY + idx * lineHeight;
          ctx.save();
          ctx.shadowColor = 'rgba(245, 158, 11, 0.65)';
          ctx.shadowBlur = 24 * scale;
          ctx.strokeStyle = 'rgba(10, 7, 4, 0.94)';
          ctx.lineWidth = Math.max(2, 6 * scale * fontScale);
          ctx.strokeText(line, centerX, baselineY);

          const parchmentGrad = ctx.createLinearGradient(0, baselineY - fontSize * 0.85, 0, baselineY);
          parchmentGrad.addColorStop(0, '#FFFBEB');
          parchmentGrad.addColorStop(1, '#FDE68A');
          ctx.fillStyle = parchmentGrad;
          ctx.fillText(line, centerX, baselineY);
          ctx.restore();
        });

        const padX = 20 * scale * fontScale;
        const padY = 14 * scale * fontScale;
        const rawLeft = Math.max(0, centerX - maxLineW / 2 - padX);
        const rawTop = Math.max(0, topOfCaps - padY);
        const rawRight = Math.min(w, centerX + maxLineW / 2 + padX);
        const rawBottom = Math.min(h, topOfCaps + visualSpan + padY);
        returnBox = {
          leftPct: (rawLeft / w) * 100,
          topPct: (rawTop / h) * 100,
          widthPct: ((rawRight - rawLeft) / w) * 100,
          heightPct: ((rawBottom - rawTop) / h) * 100
        };
      } else if (activeFontStyle === 'minimal_clean') {
        let fontSize = 78 * scale * fontScale;
        const maxTextW = w * 0.88;
        const buildFontStr = (fs: number) =>
          `700 ${Math.max(1, Math.round(fs))}px "Bebas Neue", "Inter", sans-serif`;

        ctx.font = buildFontStr(fontSize);
        let maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        if (maxLineW > maxTextW) {
          fontSize = fontSize * (maxTextW / maxLineW);
          ctx.font = buildFontStr(fontSize);
          maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        }

        const lineHeight = fontSize * 1.08;
        const capHeight = fontSize * 0.72;
        const visualSpan = (hookLines.length - 1) * lineHeight + capHeight;
        const topOfCaps = centerY - visualSpan / 2;
        const firstBaselineY = topOfCaps + capHeight;

        hookLines.forEach((line, idx) => {
          const baselineY = firstBaselineY + idx * lineHeight;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
          ctx.shadowBlur = 12 * scale;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
          ctx.lineWidth = Math.max(1.5, 4.5 * scale * fontScale);
          ctx.strokeText(line, centerX, baselineY);

          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(line, centerX, baselineY);
          ctx.restore();
        });

        const padX = 20 * scale * fontScale;
        const padY = 14 * scale * fontScale;
        const rawLeft = Math.max(0, centerX - maxLineW / 2 - padX);
        const rawTop = Math.max(0, topOfCaps - padY);
        const rawRight = Math.min(w, centerX + maxLineW / 2 + padX);
        const rawBottom = Math.min(h, topOfCaps + visualSpan + padY);
        returnBox = {
          leftPct: (rawLeft / w) * 100,
          topPct: (rawTop / h) * 100,
          widthPct: ((rawRight - rawLeft) / w) * 100,
          heightPct: ((rawBottom - rawTop) / h) * 100
        };
      } else {
        // Cinematic Sans (Montserrat / Impact)
        let fontSize = 72 * scale * fontScale;
        const maxTextW = w * 0.88;
        const buildFontStr = (fs: number) =>
          `900 ${Math.max(1, Math.round(fs))}px "Montserrat", Impact, "Arial Black", sans-serif`;

        ctx.font = buildFontStr(fontSize);
        let maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        if (maxLineW > maxTextW) {
          fontSize = fontSize * (maxTextW / maxLineW);
          ctx.font = buildFontStr(fontSize);
          maxLineW = Math.max(...hookLines.map(line => ctx.measureText(line).width));
        }

        const lineHeight = fontSize * 1.12;
        const capHeight = fontSize * 0.72;
        const visualSpan = (hookLines.length - 1) * lineHeight + capHeight;
        const topOfCaps = centerY - visualSpan / 2;
        const firstBaselineY = topOfCaps + capHeight;

        hookLines.forEach((line, idx) => {
          const baselineY = firstBaselineY + idx * lineHeight;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 18 * scale;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
          ctx.lineWidth = Math.max(2, 7 * scale * fontScale);
          ctx.strokeText(line, centerX, baselineY);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(line, centerX, baselineY);
          ctx.restore();
        });

        const padX = 20 * scale * fontScale;
        const padY = 14 * scale * fontScale;
        const rawLeft = Math.max(0, centerX - maxLineW / 2 - padX);
        const rawTop = Math.max(0, topOfCaps - padY);
        const rawRight = Math.min(w, centerX + maxLineW / 2 + padX);
        const rawBottom = Math.min(h, topOfCaps + visualSpan + padY);
        returnBox = {
          leftPct: (rawLeft / w) * 100,
          topPct: (rawTop / h) * 100,
          widthPct: ((rawRight - rawLeft) / w) * 100,
          heightPct: ((rawBottom - rawTop) / h) * 100
        };
      }

      ctx.restore();
      return returnBox;
    },
    []
  );

  const renderAllCanvases = useCallback(() => {
    const nextBoxA = drawCoverOnCanvas(
      canvasARef.current,
      imgA,
      thumbTitle,
      selectedBadgesA,
      fontStyle,
      royalDecorEnabled,
      magicDecorEnabled,
      hookLayoutA,
      'Обложка A'
    );
    setHookBoxA(prev => {
      if (!prev && !nextBoxA) return prev;
      if (
        prev &&
        nextBoxA &&
        Math.abs(prev.leftPct - nextBoxA.leftPct) < 0.05 &&
        Math.abs(prev.topPct - nextBoxA.topPct) < 0.05 &&
        Math.abs(prev.widthPct - nextBoxA.widthPct) < 0.05 &&
        Math.abs(prev.heightPct - nextBoxA.heightPct) < 0.05
      ) {
        return prev;
      }
      return nextBoxA;
    });

    const nextBoxB = drawCoverOnCanvas(
      canvasBRef.current,
      imgB || imgA,
      titleB,
      badgesB,
      fontStyle,
      royalDecorEnabled,
      magicDecorEnabled,
      hookLayoutB,
      'Обложка B'
    );
    setHookBoxB(prev => {
      if (!prev && !nextBoxB) return prev;
      if (
        prev &&
        nextBoxB &&
        Math.abs(prev.leftPct - nextBoxB.leftPct) < 0.05 &&
        Math.abs(prev.topPct - nextBoxB.topPct) < 0.05 &&
        Math.abs(prev.widthPct - nextBoxB.widthPct) < 0.05 &&
        Math.abs(prev.heightPct - nextBoxB.heightPct) < 0.05
      ) {
        return prev;
      }
      return nextBoxB;
    });

    drawCoverOnCanvas(
      mobileCanvasRef.current,
      imgA,
      thumbTitle,
      selectedBadgesA,
      fontStyle,
      royalDecorEnabled,
      magicDecorEnabled,
      hookLayoutA
    );
  }, [
    drawCoverOnCanvas,
    imgA,
    imgB,
    thumbTitle,
    selectedBadgesA,
    titleB,
    badgesB,
    fontStyle,
    royalDecorEnabled,
    magicDecorEnabled,
    hookLayoutA,
    hookLayoutB,
    abModeEnabled,
    fontsReadyTick
  ]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  // Загружаем первый мастер-кадр из 2x2 сетки при старте и сохраняем в window.selectedMasterThumbnail
  useEffect(() => {
    if (!imgA && batchVariants[0]) {
      window.selectedMasterThumbnail = batchVariants[0];
      const initImg = new Image();
      initImg.onload = () => setImgA(initImg);
      initImg.src = batchVariants[0];
    }
  }, [imgA, batchVariants]);

  // Выбор любого из 4-х вариантов сетки 2x2 как «Выбранный мастер-кадр»
  const handleSelectBatchVariant = (idx: number, targetSlot: 'A' | 'B' = 'A') => {
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    window.selectedMasterThumbnail = url;

    const selectedImage = new Image();
    selectedImage.onload = () => {
      if (targetSlot === 'A') {
        setImgA(selectedImage);
      } else {
        setAbModeEnabled(true);
        setImgB(selectedImage);
      }
      onNotify(
        `✨ Вариант #${idx + 1} сохранен как selectedMasterThumbnail и установлен на Обложку ${targetSlot}!`,
        'success'
      );
    };
    selectedImage.src = url;
  };

  // Кнопка «📥 Скачать мастер-кадр» (экспорт в честном 4K PNG)
  const handleDownloadVariantFromGrid = (idx: number) => {
    const url = batchVariants[idx];
    if (!url) return;
    const tempImg = new Image();
    tempImg.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 3840;
      offscreen.height = 2160;
      drawCoverOnCanvas(
        offscreen,
        tempImg,
        thumbTitle,
        selectedBadgesA,
        fontStyle,
        royalDecorEnabled,
        magicDecorEnabled,
        hookLayoutA
      );
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
          titleHook: thumbTitle,
          badge: thumbBadge,
          attachedAt: new Date().toISOString()
        })
      );
    } catch {
      // ignore storage quota errors
    }
    handleSelectBatchVariant(idx, 'A');
    onNotify(
      `🚀 Мастер-кадр #${idx + 1} успешно привязан к YouTube релизу (window.selectedMasterThumbnail)!`,
      'success'
    );
  };

  // Автономная генерация 4-х 4K кадров на Canvas (локальный бесплатный генератор)
  const handleGenerateProceduralBatchFallback = (targetSlot: 'A' | 'B' = 'A') => {
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
      if (targetSlot === 'A') setImgA(fallbackImg);
      else {
        setAbModeEnabled(true);
        setImgB(fallbackImg);
      }
      onNotify('🎨 Сгенерированы 4 локальных 4K фона (16:9) в сетку 2×2!', 'success');
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
        firstImg.onload = () => setImgA(firstImg);
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
        firstImg.onload = () => setImgA(firstImg);
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
  // Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell) если заполнены ключи,
  // иначе бесплатный AI Horde API (Flux.1-Schnell, 1344x768, поллинг каждые 3 сек)
  // ============================================================================
  const handleGenerateFluxCover = async (targetSlot: 'A' | 'B' = 'A') => {
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
        if (targetSlot === 'A') setImgA(generatedImg);
        else {
          setAbModeEnabled(true);
          setImgB(generatedImg);
        }
        onNotify(
          `🎨 4 чистые 16:9 обложки сгенерированы (${result.modelUsed}) и установлены в Обложку ${targetSlot}!`,
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
    slot: 'A' | 'B'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          if (slot === 'A') setImgA(img);
          else setImgB(img);
          onNotify(`Изображение загружено в Обложку ${slot}!`, 'success');
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

  const capture4KKeyframe = (targetSlot: 'A' | 'B' | 'download') => {
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
      if (targetSlot === 'A') {
        setImgA(capturedImg);
      } else {
        setImgB(capturedImg);
      }
      onNotify(
        `📸 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) установлен на Обложку ${targetSlot}!`,
        'success'
      );
    };
    capturedImg.src = dataUrl;
  };

  // Кнопка «📥 Скачать 4K обложку» (финальный экспорт 3840×2160 PNG с сохранёнными x/y и масштабом)
  const downloadCover4K = (slot: 'A' | 'B') => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 3840;
    offscreen.height = 2160;
    if (slot === 'A') {
      drawCoverOnCanvas(
        offscreen,
        imgA,
        thumbTitle,
        selectedBadgesA,
        fontStyle,
        royalDecorEnabled,
        magicDecorEnabled,
        hookLayoutA
      );
    } else {
      drawCoverOnCanvas(
        offscreen,
        imgB || imgA,
        titleB,
        badgesB,
        fontStyle,
        royalDecorEnabled,
        magicDecorEnabled,
        hookLayoutB
      );
    }
    const link = document.createElement('a');
    link.download = `thumbnail_4k_3840x2160_${slot}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
    onNotify(`📥 4K обложка ${slot} (3840×2160 PNG без водяных знаков) скачана!`, 'success');
  };

  // Передача чистого арта или скомпонованного кадра в модуль «🖼️ Арт-Редактор & Фон»
  const handleOpenSlotInArtEditor = (slot: 'A' | 'B') => {
    if (!onSendToArtEditor) return;
    const rawImg = slot === 'A' ? imgA : imgB || imgA;
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
      const canvas = slot === 'A' ? canvasARef.current : canvasBRef.current;
      if (canvas) {
        exportDataUrl = canvas.toDataURL('image/png');
      }
    }
    if (!exportDataUrl) {
      onNotify('Сначала выберите или сгенерируйте обложку для передачи в Арт-Редактор.', 'info');
      return;
    }
    onSendToArtEditor(exportDataUrl, slot === 'A' ? 'Обложка A (4K Превью)' : 'Обложка B (4K Превью)');
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

  const lineCountHookA = splitHookLines(thumbTitle, fontStyle === 'gold_ice_magic').length;
  const lineCountHookB = splitHookLines(titleB, fontStyle === 'gold_ice_magic').length;

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
        {/* Левая колонка (5/12): Настройки Обложки A / B, AI Horde / Cloudflare Flux.1-Schnell и пилюли-переключатели */}
        <div className="lg:col-span-5 aether-surface rounded-2xl p-5 sm:p-6 space-y-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
            <div>
              <h2 className="text-base font-bold text-[#f8fafc] flex items-center gap-2 tracking-tight">
                <Sparkles className="text-emerald-400 w-5 h-5 shrink-0" />
                <span>4K Превью &amp; Арт-цех</span>
              </h2>
              <p className="text-[11px] text-white/55 mt-0.5">
                Интерактивный холст 3840×2160 • Drag &amp; Drop заголовка
              </p>
            </div>
            <span
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border shrink-0 ${
                isCloudflareConfigured
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
              }`}
            >
              {isCloudflareConfigured ? 'Cloudflare Flux • 16:9' : 'Flux.1 AI Horde • 16:9'}
            </span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleGenerateFluxCover('A')}
                disabled={isGeneratingCovers}
                className="min-h-[44px] btn-primary-action py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isGeneratingCovers && generatingTargetSlot === 'A' ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Wand2 className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">
                  {isGeneratingCovers && generatingTargetSlot === 'A'
                    ? buttonQueueStatus || 'Ожидание...'
                    : 'Flux.1 (2×2) → Обложка A'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateFluxCover('B')}
                disabled={isGeneratingCovers}
                className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-emerald-400/35 text-emerald-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isGeneratingCovers && generatingTargetSlot === 'B' ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Wand2 className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">
                  {isGeneratingCovers && generatingTargetSlot === 'B'
                    ? buttonQueueStatus || 'Ожидание...'
                    : 'Flux.1 (2×2) → Обложка B'}
                </span>
              </button>
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

            {/* Компактный блок ошибки генерации */}
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
                  onClick={() => handleGenerateProceduralBatchFallback('A')}
                  className="min-h-[38px] bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-100 font-semibold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                >
                  🎨 Сгенерировать 4 локальных 4K фона (Canvas 2×2)
                </button>
              </div>
            )}
          </div>

          {/* Пилюли-переключатели режимов предпросмотра: YouTube UI Grid, A/B-тестер и Ч/Б фильтр контрастности */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowYoutubeOverlay(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                showYoutubeOverlay
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Eye className="w-4 h-4 shrink-0" />
                <span className="truncate">YouTube UI</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {showYoutubeOverlay ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbModeEnabled(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                abModeEnabled
                  ? 'bg-amber-500/15 border-amber-400/50 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Columns className="w-4 h-4 shrink-0" />
                <span className="truncate">A/B-тестер</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {abModeEnabled ? 'A vs B' : '1x'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBwContrastFilter(prev => !prev)}
              className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                bwContrastFilter
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                  : 'bg-[#080c14]/70 border-white/[0.08] text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Contrast className="w-4 h-4 shrink-0" />
                <span className="truncate">Ч/Б Контраст</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30">
                {bwContrastFilter ? 'B&W' : 'RGB'}
              </span>
            </button>
          </div>

          {/* Стиль шрифта и декоративные эффекты (современные пилюли-переключатели с янтарно-золотым акцентом) */}
          <div className="aether-card rounded-2xl p-4 space-y-3 border border-amber-400/20">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="thumb-font-style-select"
                className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2"
              >
                <Type className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Стиль шрифта заголовка</span>
              </label>
              <span className="text-[10px] font-mono text-amber-300/90 bg-amber-500/10 border border-amber-400/25 px-2 py-0.5 rounded-full">
                3840×2160 Canvas
              </span>
            </div>

            {/* Скрытый синхронизированный select для обратной совместимости */}
            <select
              id="thumb-font-style-select"
              value={fontStyle}
              onChange={e => setFontStyle(e.target.value as ThumbnailFontStyleId)}
              className="sr-only"
              aria-label="Шрифт и декор заголовка"
            >
              {FONT_STYLE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Интерактивные пилюли-переключатели стилей шрифта со скользящим индикатором */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FONT_STYLE_OPTIONS.map(opt => {
                const isSelected = fontStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontStyle(opt.id)}
                    className={`relative min-h-[44px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between gap-2 cursor-pointer overflow-hidden border ${
                      isSelected
                        ? 'text-slate-950 border-amber-300/60 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)]'
                        : 'bg-[#080c14]/75 border-white/[0.08] text-white/75 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeThumbFontPill"
                        className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 -z-0"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 truncate">{opt.label}</span>
                    {opt.id === 'gold_ice_magic' && (
                      <Sparkles
                        className={`relative z-10 w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-slate-950' : 'text-amber-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-white/55 leading-relaxed">
              {FONT_STYLE_OPTIONS.find(o => o.id === fontStyle)?.subtitle}
            </p>

            {fontStyle === 'gold_ice_magic' && (
              <button
                type="button"
                onClick={() => setMagicDecorEnabled(prev => !prev)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                  magicDecorEnabled
                    ? 'bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'bg-[#080c14]/75 border-white/[0.08] text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 text-left">
                  <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>Магическое сияние и снежинки (завитки, блики, иней)</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 shrink-0">
                  {magicDecorEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {fontStyle === 'royal_gold_laurels' && (
              <button
                type="button"
                onClick={() => setRoyalDecorEnabled(prev => !prev)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                  royalDecorEnabled
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-[#080c14]/75 border-white/[0.08] text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 text-left">
                  <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Декор: свеча сверху + золотые лавры по бокам</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 shrink-0">
                  {royalDecorEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
          </div>

          {/* Настройки Обложки A */}
          <div className="aether-card rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Вариант A (Основная обложка)
              </span>
              <span className="text-[10px] font-mono text-white/55">SLOT A</span>
            </div>

            <div>
              <label className="text-[11px] text-white/55 block mb-1.5">
                Загрузить свой арт (Обложка A):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleLoadImageForSlot(e, 'A')}
                className="w-full text-xs text-white/60 file:mr-3 file:min-h-[38px] file:py-1.5 file:px-3.5 file:rounded-xl file:border file:border-white/[0.1] file:text-xs file:font-bold file:bg-white/[0.06] file:text-amber-300 hover:file:bg-white/[0.12] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-white/55">
                  Текст-хук A (Enter — на 2 строки):
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-amber-300 tabular-nums">
                    {lineCountHookA} {lineCountHookA === 1 ? 'строка' : 'строки'}
                  </span>
                  {thumbTitle.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onThumbTitleChange('')}
                      className="text-[10px] text-white/55 hover:text-rose-300 underline cursor-pointer"
                      title="Очистить текст-хук (оставить чистый арт)"
                    >
                      Очистить
                    </button>
                  )}
                </div>
              </div>
              <textarea
                rows={2}
                value={thumbTitle}
                onChange={e => handleThumbHookChange(e.target.value)}
                placeholder="Введите заголовок (Enter для 2-й строки, пусто = чистый арт)"
                className="w-full bg-[#080c14]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-[#f8fafc] font-bold outline-none focus:border-amber-400 resize-none leading-snug"
              />
            </div>

            {/* Размер шрифта и позиция текста-хука A */}
            <div className="bg-[#080c14]/75 border border-white/[0.08] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#f8fafc] font-semibold">Размер шрифта A:</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-white/55 tabular-nums">
                    X:{Math.round(hookLayoutA.xPct)}% Y:{Math.round(hookLayoutA.yPct)}%
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300 tabular-nums">
                    {hookLayoutA.fontScalePct}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={60}
                max={150}
                step={1}
                value={hookLayoutA.fontScalePct}
                onChange={e => {
                  const val = Number(e.target.value);
                  setHookLayoutA(prev => ({ ...prev, fontScalePct: val }));
                }}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-white/55">
                  60% – 150% • Drag &amp; Drop на превью
                </span>
                <button
                  type="button"
                  onClick={() => setHookLayoutA({ ...DEFAULT_HOOK_LAYOUT })}
                  className="min-h-[38px] text-[11px] font-semibold text-amber-300 hover:text-amber-200 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить позицию текста</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-white/55">
                  Кинематографичные бейджи A (верхний правый угол, до 3):
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-amber-300 tabular-nums">
                    {selectedBadgesA.length}/3
                  </span>
                  {selectedBadgesA.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onThumbBadgeChange('none')}
                      className="text-[10px] text-white/55 hover:text-rose-300 underline cursor-pointer"
                    >
                      Сброс
                    </button>
                  )}
                </div>
              </div>

              {/* Категория 1: Документальные / Исторические (@Histoviva) */}
              <div className="space-y-1.5 bg-[#080c14]/60 border border-white/[0.06] rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 block">
                  🏛️ Документальные / Исторические (@Histoviva)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {HISTOVIVA_BADGE_OPTIONS.map(badge => {
                    const isActive = selectedBadgesA.includes(badge.id);
                    return (
                      <button
                        key={`badge-a-${badge.id}`}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => toggleBadgeA(badge.id)}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold tracking-wider uppercase border cursor-pointer whitespace-nowrap flex items-center justify-center transition ${
                          isActive
                            ? 'bg-[#090D16] border-2 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.28)]'
                            : 'bg-[#080c14]/80 border-white/[0.08] text-white/65 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Категория 2: Эмбиент / Многочасовой Луп */}
              <div className="space-y-1.5 bg-[#080c14]/60 border border-white/[0.06] rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/90 block">
                  🌙 Эмбиент / Многочасовой Луп
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AMBIENT_BADGE_OPTIONS.map(badge => {
                    const isActive = selectedBadgesA.includes(badge.id);
                    return (
                      <button
                        key={`badge-a-${badge.id}`}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => toggleBadgeA(badge.id)}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold tracking-wider uppercase border cursor-pointer whitespace-nowrap flex items-center justify-center transition ${
                          isActive
                            ? 'bg-[#090D16] border-2 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.28)]'
                            : 'bg-[#080c14]/80 border-white/[0.08] text-white/65 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Настройки Обложки B (если включен A/B-тестер) */}
          {abModeEnabled && (
            <div className="aether-card rounded-2xl p-4 space-y-3.5 border border-emerald-400/25">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Вариант B (Конкурентный тест A/B)
                </span>
                <span className="text-[10px] font-mono text-white/55">SLOT B</span>
              </div>

              <div>
                <label className="text-[11px] text-white/55 block mb-1.5">
                  Исходный арт (Обложка B):
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleLoadImageForSlot(e, 'B')}
                  className="w-full text-xs text-white/60 file:mr-3 file:min-h-[38px] file:py-1.5 file:px-3.5 file:rounded-xl file:border file:border-white/[0.1] file:text-xs file:font-bold file:bg-white/[0.06] file:text-emerald-300 hover:file:bg-white/[0.12] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] text-white/55">
                    Текст-хук B (Enter — на 2 строки):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-300 tabular-nums">
                      {lineCountHookB} {lineCountHookB === 1 ? 'строка' : 'строки'}
                    </span>
                    {titleB.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTitleB('')}
                        className="text-[10px] text-white/55 hover:text-rose-300 underline cursor-pointer"
                        title="Очистить текст-хук B (оставить чистый арт)"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={titleB}
                  onChange={e => setTitleB(e.target.value)}
                  placeholder="Введите заголовок B (Enter для 2-й строки, пусто = чистый арт)"
                  className="w-full bg-[#080c14]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-[#f8fafc] font-bold outline-none focus:border-emerald-400 resize-none leading-snug"
                />
              </div>

              {/* Размер шрифта и позиция текста-хука B */}
              <div className="bg-[#080c14]/75 border border-white/[0.08] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#f8fafc] font-semibold">Размер шрифта B:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white/55 tabular-nums">
                      X:{Math.round(hookLayoutB.xPct)}% Y:{Math.round(hookLayoutB.yPct)}%
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-300 tabular-nums">
                      {hookLayoutB.fontScalePct}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={60}
                  max={150}
                  step={1}
                  value={hookLayoutB.fontScalePct}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setHookLayoutB(prev => ({ ...prev, fontScalePct: val }));
                  }}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-white/55">
                    60% – 150% • Drag &amp; Drop на превью B
                  </span>
                  <button
                    type="button"
                    onClick={() => setHookLayoutB({ ...DEFAULT_HOOK_LAYOUT })}
                    className="min-h-[38px] text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сбросить позицию текста</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-white/55">
                    Кинематографичные бейджи B (до 3):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-emerald-300 tabular-nums">
                      {badgesB.length}/3
                    </span>
                    {badgesB.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBadgesB([])}
                        className="text-[10px] text-white/55 hover:text-rose-300 underline cursor-pointer"
                      >
                        Сброс
                      </button>
                    )}
                  </div>
                </div>

                {/* Категория 1: Документальные / Исторические (@Histoviva) */}
                <div className="space-y-1.5 bg-[#080c14]/60 border border-white/[0.06] rounded-xl p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 block">
                    🏛️ Документальные / Исторические (@Histoviva)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {HISTOVIVA_BADGE_OPTIONS.map(badge => {
                      const isActive = badgesB.includes(badge.id);
                      return (
                        <button
                          key={`badge-b-${badge.id}`}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => toggleBadgeB(badge.id)}
                          className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold tracking-wider uppercase border cursor-pointer whitespace-nowrap flex items-center justify-center transition ${
                            isActive
                              ? 'bg-[#090D16] border-2 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.28)]'
                              : 'bg-[#080c14]/80 border-white/[0.08] text-white/65 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {badge.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Категория 2: Эмбиент / Многочасовой Луп */}
                <div className="space-y-1.5 bg-[#080c14]/60 border border-white/[0.06] rounded-xl p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/90 block">
                    🌙 Эмбиент / Многочасовой Луп
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {AMBIENT_BADGE_OPTIONS.map(badge => {
                      const isActive = badgesB.includes(badge.id);
                      return (
                        <button
                          key={`badge-b-${badge.id}`}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => toggleBadgeB(badge.id)}
                          className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-extrabold tracking-wider uppercase border cursor-pointer whitespace-nowrap flex items-center justify-center transition ${
                            isActive
                              ? 'bg-[#090D16] border-2 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.28)]'
                              : 'bg-[#080c14]/80 border-white/[0.08] text-white/65 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {badge.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Главный экшен: экспорт 4K обложки и передача в Арт-Редактор */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => downloadCover4K('A')}
              className="w-full min-h-[48px] btn-primary-action py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>📥 Экспорт 4K обложки A (3840×2160 PNG)</span>
            </button>
            {onSendToArtEditor && (
              <div className={`grid gap-2 ${abModeEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  type="button"
                  onClick={() => handleOpenSlotInArtEditor('A')}
                  className="w-full min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-cyan-400/40 text-cyan-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Открыть A в Арт-Редакторе</span>
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                </button>
                {abModeEnabled && (
                  <button
                    type="button"
                    onClick={() => handleOpenSlotInArtEditor('B')}
                    className="w-full min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-emerald-400/40 text-emerald-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Открыть B в Арт-Редакторе</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  </button>
                )}
              </div>
            )}
            {abModeEnabled && (
              <button
                type="button"
                onClick={() => downloadCover4K('B')}
                className="w-full min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-emerald-400/40 text-emerald-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>📥 Экспорт 4K обложки B (3840×2160 PNG)</span>
              </button>
            )}
          </div>
        </div>

        {/* Правая зона (7/12): 4K Холст A (или A vs B) в аккуратной рамке с бликом + Мобильный масштаб 160x90 px */}
        <div className="lg:col-span-7 aether-surface rounded-2xl p-5 sm:p-6 space-y-5 flex flex-col justify-between min-w-0">
          <div className={`grid gap-5 ${abModeEnabled ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
            {/* ХОЛСТ ОБЛОЖКИ A */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                  <span>
                    Обложка A — Мастер #{selectedMasterVariantIdx + 1}{' '}
                    {bwContrastFilter ? '(B&W Контраст)' : ''}
                  </span>
                  {attachedToYoutubeIdx === selectedMasterVariantIdx && (
                    <span className="text-[10px] bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono">
                      ✓ YouTube Release
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {onSendToArtEditor && (
                    <button
                      type="button"
                      onClick={() => handleOpenSlotInArtEditor('A')}
                      className="text-[10.5px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/35 px-2.5 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition"
                    >
                      <span>Открыть в Арт-Редакторе</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </button>
                  )}
                  <span className="text-[11px] font-mono text-white/55 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full">
                    3840×2160 • 16:9
                  </span>
                </div>
              </div>

              {/* Рамка с тонким бликом по краю и плавным появлением элементов управления */}
              <div className="aether-preview-frame group/previewA">
                <div className="relative w-full aspect-video rounded-[15px] overflow-hidden bg-[#05080f]">
                  <canvas
                    ref={canvasARef}
                    width={1280}
                    height={720}
                    className={`w-full h-full object-contain transition-all duration-200 ${
                      bwContrastFilter ? 'grayscale contrast-125' : ''
                    }`}
                  />

                  {/* Интерактивное перетаскивание ТОЛЬКО основного заголовка (текста-хука A) */}
                  {hookBoxA && (
                    <div
                      role="button"
                      aria-label="Перетащить заголовок обложки A"
                      title="Зажмите и перетащите текст-хук в любую точку кадра"
                      onPointerDown={e => startHookDrag(e, 'A')}
                      onPointerEnter={() => setHoveredSlot('A')}
                      onPointerLeave={() => setHoveredSlot(prev => (prev === 'A' ? null : prev))}
                      style={{
                        left: `${hookBoxA.leftPct}%`,
                        top: `${hookBoxA.topPct}%`,
                        width: `${hookBoxA.widthPct}%`,
                        height: `${hookBoxA.heightPct}%`
                      }}
                      className={`absolute z-20 touch-none select-none rounded-lg transition-all duration-150 ${
                        draggingSlot === 'A'
                          ? 'cursor-grabbing border-[1.5px] border-dashed border-amber-300 bg-amber-300/10 shadow-[0_0_20px_rgba(251,191,36,0.25)]'
                          : hoveredSlot === 'A'
                          ? 'cursor-grab border-[1.5px] border-dashed border-amber-300/85 bg-amber-300/5'
                          : 'cursor-grab border border-dashed border-transparent group-hover/previewA:border-white/20'
                      }`}
                    />
                  )}

                  {showYoutubeOverlay && (
                    <>
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-0 group-hover/previewA:opacity-100 transition-opacity duration-300">
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
                        {youtubeDurationBadge || '3:00:00'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {hookBoxA && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/55 px-1">
                  <span className="flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Перетащите заголовок мышью или пальцем по кадру</span>
                  </span>
                  <span className="font-mono text-amber-300/90 tabular-nums">
                    X:{Math.round(hookLayoutA.xPct)}% • Y:{Math.round(hookLayoutA.yPct)}% • {hookLayoutA.fontScalePct}%
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
                      <span className="font-mono text-[11px]">• 428K views • 2h ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ХОЛСТ ОБЛОЖКИ B */}
            {abModeEnabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-300 uppercase tracking-wider">
                    Обложка B {bwContrastFilter ? '(B&W Контраст)' : ''}
                  </span>
                  <span className="text-[11px] font-mono text-white/55">A/B Comparison</span>
                </div>

                <div className="aether-preview-frame group/previewB">
                  <div className="relative w-full aspect-video rounded-[15px] overflow-hidden bg-[#05080f]">
                    <canvas
                      ref={canvasBRef}
                      width={1280}
                      height={720}
                      className={`w-full h-full object-contain transition-all duration-200 ${
                        bwContrastFilter ? 'grayscale contrast-125' : ''
                      }`}
                    />

                    {/* Интерактивное перетаскивание ТОЛЬКО основного заголовка (текста-хука B) */}
                    {hookBoxB && (
                      <div
                        role="button"
                        aria-label="Перетащить заголовок обложки B"
                        title="Зажмите и перетащите текст-хук B в любую точку кадра"
                        onPointerDown={e => startHookDrag(e, 'B')}
                        onPointerEnter={() => setHoveredSlot('B')}
                        onPointerLeave={() => setHoveredSlot(prev => (prev === 'B' ? null : prev))}
                        style={{
                          left: `${hookBoxB.leftPct}%`,
                          top: `${hookBoxB.topPct}%`,
                          width: `${hookBoxB.widthPct}%`,
                          height: `${hookBoxB.heightPct}%`
                        }}
                        className={`absolute z-20 touch-none select-none rounded-lg transition-all duration-150 ${
                          draggingSlot === 'B'
                            ? 'cursor-grabbing border-[1.5px] border-dashed border-emerald-300 bg-emerald-300/10'
                            : hoveredSlot === 'B'
                            ? 'cursor-grab border-[1.5px] border-dashed border-emerald-300/85 bg-emerald-300/5'
                            : 'cursor-grab border border-dashed border-transparent group-hover/previewB:border-white/20'
                        }`}
                      />
                    )}

                    {showYoutubeOverlay && (
                      <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-[#f8fafc] font-mono font-bold text-xs px-2 py-0.5 rounded-md shadow-md border border-white/15">
                        {youtubeDurationBadge || '3:00:00'}
                      </div>
                    )}
                  </div>
                </div>

                {hookBoxB && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/55 px-1">
                    <span className="flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Перетащите заголовок B мышью или пальцем</span>
                    </span>
                    <span className="font-mono text-emerald-300/90 tabular-nums">
                      X:{Math.round(hookLayoutB.xPct)}% • Y:{Math.round(hookLayoutB.yPct)}% • {hookLayoutB.fontScalePct}%
                    </span>
                  </div>
                )}

                {showYoutubeOverlay && (
                  <div className="flex items-start gap-3 pt-1 px-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 font-black font-mono text-xs shrink-0 shadow-md">
                      4K
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#f8fafc] truncate">
                        {youtubeVideoHeading}
                      </p>
                      <div className="text-xs text-white/55">
                        {youtubeChannelName} ✓ • Variant B (A/B Readability Test)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* НИЖНЯЯ ПАНЕЛЬ ХОЛСТА: МОБИЛЬНЫЙ МАСШТАБ (160x90 PX) */}
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
                  <span>Мобильный масштаб YouTube (160×90 px)</span>
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
              onClick={() => handleGenerateProceduralBatchFallback('A')}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#f8fafc] font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <span>🎨 4 локальных фона</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateFluxCover('A')}
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
                    handleSelectBatchVariant(index, 'A');
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

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDownloadVariantFromGrid(index);
                        }}
                        className="min-h-[38px] btn-primary-action py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5 cursor-pointer"
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
                        className={`min-h-[38px] font-bold py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5 cursor-pointer border ${
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
            className="w-full min-h-[56px] p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.02]"
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
              <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-400/30 text-amber-300 px-2.5 py-0.5 rounded-full">
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('A')}
                        className="min-h-[44px] btn-artistic-premium py-2 px-3 rounded-xl text-xs cursor-pointer"
                      >
                        📸 В Обложку A (4K)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAbModeEnabled(true);
                          capture4KKeyframe('B');
                        }}
                        className="min-h-[44px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold py-2 px-3 rounded-xl text-xs cursor-pointer"
                      >
                        📸 В Обложку B (4K)
                      </button>
                      <button
                        type="button"
                        onClick={() => capture4KKeyframe('download')}
                        className="min-h-[44px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#f8fafc] font-semibold py-2 px-3 rounded-xl text-xs cursor-pointer"
                      >
                        💾 Скачать 4K кадр
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
            className="w-full min-h-[56px] p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.02]"
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
              <span className="text-[10px] font-mono bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-2.5 py-0.5 rounded-full">
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
                  onClick={() => handleGenerateFluxCover('A')}
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
