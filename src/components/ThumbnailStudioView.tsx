/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  KeyRound
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
 * Генерация 4 чистых 16:9 обложек (1344x768) через бесплатный AI Horde API (Flux.1-Schnell)
 * 1) POST /api/v2/generate/async (apikey: 0000000000, Flux.1-Schnell, n: 4, 1344x768)
 * 2) Polling GET /api/v2/generate/check/{id} каждые 3 секунды до done === true
 * 3) GET /api/v2/generate/status/{id} -> generations[].img -> fetch -> blob -> ObjectURL
 */
export async function generateViaAiHordeFlux(
  promptText: string,
  options?: {
    onProgress?: (statusText: string) => void;
    signal?: AbortSignal;
  }
): Promise<{ images: string[]; modelUsed: string }> {
  const submitRes = await fetch(`${AI_HORDE_BASE_URL}/generate/async`, {
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
        width: 1344,
        height: 768,
        n: 4
      },
      models: ['Flux.1-Schnell'],
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      n: 4
    }),
    signal: options?.signal
  });

  const submitData = (await submitRes.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    rc?: string;
  };

  if (!submitRes.ok || !submitData.id) {
    throw new FluxGenerationError(
      submitData.message || `AI Horde отклонил запрос (${submitRes.status})`,
      submitRes.status
    );
  }

  const jobId = submitData.id;
  options?.onProgress?.(`AI Horde задача создана (ID ${jobId.slice(0, 8)}), ждём воркера...`);

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
    options?.onProgress?.(`AI Horde (Flux.1-Schnell) • Очередь: ${qPos} • Осталось: ${eta} • Готово ${doneCnt}/4`);

    if (checkData.done === true) {
      break;
    }
  }

  options?.onProgress?.('Забираем 4 готовых кадра (1344×768) из AI Horde...');

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

  const blobUrls = await Promise.all(rawUrls.slice(0, 4).map(url => fetchImageAsBlobObjectUrl(url, false)));

  return {
    images: blobUrls,
    modelUsed: 'AI Horde • Flux.1-Schnell (1344×768)'
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

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  thumbTitle,
  onThumbTitleChange,
  thumbBadge,
  onThumbBadgeChange,
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
  const [badgeB] = useState<string>('ambience');

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

    const hookWords = (thumbTitle || 'DO NOT PLAY!')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');

    return `${styleMap[promptStylePreset]} | Subject context: "${topicHint}" | Thumbnail Hook (max 3 words): "${hookWords.toUpperCase()}" | Clean 16:9 composition without watermarks, clear silhouette readability on mobile 160x90px`;
  })();

  const activePromptText = customFluxPrompt.trim() || generatedCoverPrompt;

  // Ограничение короткого текст-хука на обложку (до 3 слов)
  const handleThumbHookChange = (val: string) => {
    const words = val.trimStart().split(/\s+/);
    if (words.length > 3) {
      onThumbTitleChange(words.slice(0, 3).join(' '));
      onNotify('Thumbnail Hook ограничен максимум 3 словами для максимального CTR!', 'info');
    } else {
      onThumbTitleChange(val);
    }
  };

  // Отрисовка обложки на выбранном Canvas (1280x720 или 3840x2160) без водяных знаков
  const drawCoverOnCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      image: HTMLImageElement | null,
      titleText: string,
      badgeType: string,
      variantLabel?: string
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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
            ? `${variantLabel} — нажмите «Сгенерировать 4 варианта (Flux.1-Schnell 16:9)»`
            : 'Нажмите «Сгенерировать 4 варианта (Flux.1-Schnell 16:9)» или выберите кадр ниже',
          w / 2,
          h * 0.45
        );
      }

      const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.86)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      if (badgeType !== 'none') {
        const bw = 200 * scale;
        const bh = 44 * scale;
        const bx = w - bw - 32 * scale;
        const by = 28 * scale;

        ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 9 * scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${Math.round(14 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        let bText = '4K ULTRA HD';
        if (badgeType === 'ambience') bText = 'AMBIENCE 60FPS';
        if (badgeType === '10h') bText = '10 HOURS LOOP';
        ctx.fillText(bText, bx + bw / 2, by + bh * 0.63);
      }

      const shortHook = (titleText || 'DO NOT PLAY!')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .toUpperCase();

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(72 * scale)}px Inter, "Bebas Neue", sans-serif`;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 16 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 6 * scale;
      ctx.strokeText(shortHook, 48 * scale, h - 58 * scale);
      ctx.fillText(shortHook, 48 * scale, h - 58 * scale);
      ctx.shadowBlur = 0;
    },
    []
  );

  const renderAllCanvases = useCallback(() => {
    drawCoverOnCanvas(canvasARef.current, imgA, thumbTitle, thumbBadge, 'Обложка A');
    drawCoverOnCanvas(canvasBRef.current, imgB || imgA, titleB, badgeB, 'Обложка B');
    drawCoverOnCanvas(mobileCanvasRef.current, imgA, thumbTitle, thumbBadge);
  }, [drawCoverOnCanvas, imgA, imgB, thumbTitle, thumbBadge, titleB, badgeB]);

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

  // Кнопка «📥 Скачать мастер-кадр»
  const handleDownloadVariantFromGrid = (idx: number) => {
    const url = batchVariants[idx];
    if (!url) return;
    const tempImg = new Image();
    tempImg.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 3840;
      offscreen.height = 2160;
      drawCoverOnCanvas(offscreen, tempImg, thumbTitle, thumbBadge);
      const link = document.createElement('a');
      link.download = `thumbnail_${idx + 1}.jpg`;
      link.href = offscreen.toDataURL('image/jpeg', 0.96);
      link.click();
      onNotify(`📥 Вариант #${idx + 1} (thumbnail_${idx + 1}.jpg) скачан на устройство!`, 'success');
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
    setGenerationError(null);
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
            onProgress: msg => setGenerationStatusText(msg)
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
          `🎨 4 чистые 16:9 обложки сгенерированы (${result.modelUsed})!`,
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
      setGenerationStatusText('');
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

  // Кнопка «📥 Скачать 4K обложку»
  const downloadCover4K = (slot: 'A' | 'B') => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 3840;
    offscreen.height = 2160;
    if (slot === 'A') {
      drawCoverOnCanvas(offscreen, imgA, thumbTitle, thumbBadge);
    } else {
      drawCoverOnCanvas(offscreen, imgB || imgA, titleB, badgeB);
    }
    const link = document.createElement('a');
    link.download = `thumbnail_4k_3840x2160_${slot}.jpg`;
    link.href = offscreen.toDataURL('image/jpeg', 0.96);
    link.click();
    onNotify(`📥 4K обложка ${slot} (3840×2160 без водяных знаков) скачана!`, 'success');
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

  const wordCountHookA = (thumbTitle || 'DO NOT PLAY!').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* МОДАЛЬНОЕ ОКНО УВЕЛИЧЕНИЯ ВАРИАНТА ОБЛОЖКИ («🔍 Увеличить») */}
      {zoomedVariantIdx !== null && batchVariants[zoomedVariantIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomedVariantIdx(null)}
        >
          <div
            className="bg-[#111622] border-2 border-cyan-400 rounded-2xl max-w-5xl w-full p-5 space-y-4 shadow-[0_0_25px_rgba(0,242,254,0.35)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <ZoomIn className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Детальный просмотр • Вариант #{zoomedVariantIdx + 1} (Flux.1-Schnell • 16:9)
                </h3>
                {selectedMasterVariantIdx === zoomedVariantIdx && (
                  <span className="text-[11px] font-bold bg-cyan-500 text-black px-2.5 py-0.5 rounded-lg">
                    ✓ Выбранный мастер-кадр
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomedVariantIdx(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-700 bg-black">
              <img
                src={batchVariants[zoomedVariantIdx]}
                alt={`Flux.1-Schnell Variant ${zoomedVariantIdx + 1}`}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  handleAttachToYoutubeRelease(zoomedVariantIdx);
                  setZoomedVariantIdx(null);
                }}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>Привязать к YouTube релизу</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadVariantFromGrid(zoomedVariantIdx)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>📥 Скачать мастер-кадр</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ВЕРХНЯЯ ПАНЕЛЬ: НАСТРОЙКИ 4K ПРЕВЬЮ + ХОЛСТ ПРЕДПРОСМОТРА С YOUTUBE UI OVERLAY И A/B ТЕСТЕРОМ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая колонка: Настройки Обложки A / B, AI Horde / Cloudflare Flux.1-Schnell и переключатели */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="text-emerald-400 w-5 h-5" /> 4K Превью &amp; Арт-цех (Flux.1-Schnell • 16:9)
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isCloudflareConfigured
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {isCloudflareConfigured ? 'CF Instant • 2×2' : 'AI Horde • 1344×768'}
            </span>
          </div>

          {/* Пакетная генерация 2x2 (4 варианта 16:9 без водяных знаков) */}
          <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-[#0b0f17] border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-emerald-300 uppercase flex items-center gap-1.5">
                {isCloudflareConfigured ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {isCloudflareConfigured
                  ? 'Cloudflare Workers AI (Flux.1-Schnell):'
                  : 'AI Horde (Flux.1-Schnell Free):'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                4 кадра • 1344×768 • No Watermark
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleGenerateFluxCover('A')}
                disabled={isGeneratingCovers}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-md shadow-emerald-500/20 disabled:opacity-60"
              >
                {isGeneratingCovers ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Flux 2×2 → A</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateFluxCover('B')}
                disabled={isGeneratingCovers}
                className="bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Flux 2×2 → B</span>
              </button>
            </div>

            {isGeneratingCovers && (
              <div className="bg-slate-950/80 border border-cyan-500/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-cyan-300 truncate">
                  {generationStatusText || 'Генерация Flux.1-Schnell...'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 px-2 py-0.5 rounded shrink-0 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            )}

            {/* Настройки опционального Cloudflare Workers AI (localStorage) */}
            <div className="pt-1 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowCfSettings(prev => !prev)}
                className="w-full flex items-center justify-between text-[11px] text-slate-300 hover:text-amber-300 font-semibold py-1 cursor-pointer transition"
              >
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  Cloudflare Workers AI (опционально, без очереди)
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {isCloudflareConfigured ? 'ACTIVE' : showCfSettings ? '▲' : '▼'}
                </span>
              </button>

              {showCfSettings && (
                <div className="mt-2 space-y-2 bg-[#0b0f17] border border-slate-800 rounded-xl p-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Cloudflare Account ID:
                    </label>
                    <input
                      type="text"
                      value={cfAccountId}
                      onChange={e => setCfAccountId(e.target.value)}
                      placeholder="Например: 8a1b2c3d4e5f67890..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Cloudflare API Token (Workers AI):
                    </label>
                    <input
                      type="password"
                      value={cfApiToken}
                      onChange={e => setCfApiToken(e.target.value)}
                      placeholder="Bearer API Token"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Хранится в localStorage. Модель: <code>@cf/black-forest-labs/flux-1-schnell</code>
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
                className="w-full max-w-md max-h-24 overflow-hidden text-ellipsis rounded-xl px-3 py-2 text-xs space-y-1 border bg-rose-950/80 border-rose-500/70 text-rose-200"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="flex-1 min-w-0">
                    <p
                      title={generationError}
                      className="text-[11px] font-semibold leading-snug line-clamp-2 overflow-hidden text-ellipsis text-rose-200"
                    >
                      {generationError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGenerationError(null)}
                    className="text-[10px] text-slate-400 hover:text-white shrink-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerateProceduralBatchFallback('A')}
                  className="bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-100 font-semibold px-2 py-0.5 rounded text-[10px] cursor-pointer transition"
                >
                  🎨 Сгенерировать 4 локальных 4K фона (Canvas 2×2)
                </button>
              </div>
            )}
          </div>

          {/* Переключатели: YouTube UI Grid, A/B-тестер и Ч/Б фильтр контрастности */}
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setShowYoutubeOverlay(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                showYoutubeOverlay
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Eye className="w-4 h-4" /> Оверлей интерфейса YouTube (3:00:00 + Аватарка)
              </span>
              <span className="text-[10px] font-mono">{showYoutubeOverlay ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAbModeEnabled(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                abModeEnabled
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Columns className="w-4 h-4" /> A/B-тестер двух вариантов обложек
              </span>
              <span className="text-[10px] font-mono">{abModeEnabled ? 'A vs B' : 'SINGLE'}</span>
            </button>

            <button
              type="button"
              onClick={() => setBwContrastFilter(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                bwContrastFilter
                  ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Contrast className="w-4 h-4" /> Ч/Б фильтр проверки контрастности
              </span>
              <span className="text-[10px] font-mono">{bwContrastFilter ? 'B&W 125%' : 'COLOR'}</span>
            </button>
          </div>

          {/* Настройки Обложки A */}
          <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-bold uppercase text-amber-400 block">
              Вариант A (Основная обложка)
            </span>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Загрузить свой арт (Обложка A):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleLoadImageForSlot(e, 'A')}
                className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400 uppercase">
                  Короткий текст-хук на обложку (Thumbnail Hook: до 3 слов):
                </label>
                <span className="text-[10px] font-mono text-amber-300">
                  {wordCountHookA}/3 слов
                </span>
              </div>
              <input
                type="text"
                value={thumbTitle}
                onChange={e => handleThumbHookChange(e.target.value)}
                placeholder="DO NOT PLAY!"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Кинематографичный бейдж A:
              </label>
              <select
                value={thumbBadge}
                onChange={e => onThumbBadgeChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              >
                <option value="4k_gold">4K ULTRA HD • GOLD</option>
                <option value="ambience">AMBIENCE • 60FPS</option>
                <option value="10h">10 HOURS LOOP</option>
                <option value="none">Без бейджа (Clean)</option>
              </select>
            </div>
          </div>

          {/* Настройки Обложки B (если включен A/B-тестер) */}
          {abModeEnabled && (
            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-bold uppercase text-emerald-400 block">
                Вариант B (Конкурентный тест A/B)
              </span>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Исходный арт (Обложка B):
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleLoadImageForSlot(e, 'B')}
                  className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Thumbnail Hook B (до 3 слов):
                </label>
                <input
                  type="text"
                  value={titleB}
                  onChange={e => {
                    const words = e.target.value.trimStart().split(/\s+/);
                    setTitleB(words.length > 3 ? words.slice(0, 3).join(' ') : e.target.value);
                  }}
                  placeholder="SEALED 50 YEARS"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Кнопка «📥 Скачать 4K обложку» */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => downloadCover4K('A')}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-4 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <Download className="w-4 h-4" /> 📥 Скачать 4K обложку (3840×2160)
            </button>
            {abModeEnabled && (
              <button
                type="button"
                onClick={() => downloadCover4K('B')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" /> 📥 Скачать 4K обложку (Вариант B)
              </button>
            )}
          </div>
        </div>

        {/* Правая область (2 колонки): Холст A (или A vs B) + YouTube UI Overlay + Мобильный масштаб 160x90 px */}
        <div className="lg:col-span-2 bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div className={`grid gap-4 ${abModeEnabled ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* ХОЛСТ ОБЛОЖКИ A */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400 uppercase flex items-center gap-2">
                  <span>
                    Обложка A — Мастер-кадр #{selectedMasterVariantIdx + 1}{' '}
                    {bwContrastFilter ? '(Ч/Б Фильтр Контраста)' : ''}
                  </span>
                  {attachedToYoutubeIdx === selectedMasterVariantIdx && (
                    <span className="text-[10px] bg-cyan-500/15 border border-cyan-400/60 text-cyan-300 px-2 py-0.5 rounded font-mono">
                      ✓ Привязан к YouTube релизу
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  16:9 • Watermark-Free 4K
                </span>
              </div>

              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black shadow-2xl">
                <canvas
                  ref={canvasARef}
                  width={1280}
                  height={720}
                  className={`w-full h-full object-contain transition-all duration-200 ${
                    bwContrastFilter ? 'grayscale contrast-125' : ''
                  }`}
                />

                {showYoutubeOverlay && (
                  <>
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-b border-white/15" />
                      <div className="border-r border-white/15" />
                      <div className="border-r border-white/15" />
                      <div />
                    </div>

                    <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-white font-mono font-bold text-xs px-2 py-0.5 rounded shadow-md border border-white/10">
                      {youtubeDurationBadge || '3:00:00'}
                    </div>
                  </>
                )}
              </div>

              {showYoutubeOverlay && (
                <div className="flex items-start gap-3 pt-1 px-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-md">
                    4K
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <input
                      type="text"
                      value={youtubeVideoHeading}
                      onChange={e => setYoutubeVideoHeading(e.target.value)}
                      className="w-full bg-transparent text-sm font-bold text-slate-100 outline-none focus:border-b focus:border-amber-400 truncate"
                    />
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span>{youtubeChannelName}</span>
                      <span className="text-[10px] bg-slate-700 text-slate-200 px-1 rounded">✓</span>
                      <span>• 428K views • 2 hours ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ХОЛСТ ОБЛОЖКИ B */}
            {abModeEnabled && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 uppercase">
                    Обложка B {bwContrastFilter ? '(Ч/Б Фильтр Контраста)' : ''}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">A/B Comparison</span>
                </div>

                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-emerald-500/40 bg-black shadow-2xl">
                  <canvas
                    ref={canvasBRef}
                    width={1280}
                    height={720}
                    className={`w-full h-full object-contain transition-all duration-200 ${
                      bwContrastFilter ? 'grayscale contrast-125' : ''
                    }`}
                  />

                  {showYoutubeOverlay && (
                    <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-white font-mono font-bold text-xs px-2 py-0.5 rounded shadow-md border border-white/10">
                      {youtubeDurationBadge || '3:00:00'}
                    </div>
                  )}
                </div>

                {showYoutubeOverlay && (
                  <div className="flex items-start gap-3 pt-1 px-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-md">
                      4K
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {youtubeVideoHeading}
                      </p>
                      <div className="text-xs text-slate-400">
                        {youtubeChannelName} ✓ • Variant B (A/B Readability Test)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* НИЖНЯЯ ПАНЕЛЬ ХОЛСТА: МОБИЛЬНЫЙ МАСШТАБ (160x90 PX) */}
          <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-[160px] h-[90px] rounded-lg overflow-hidden border border-amber-500/50 bg-black shrink-0 shadow-lg">
                <canvas
                  ref={mobileCanvasRef}
                  width={160}
                  height={90}
                  className={`w-[160px] h-[90px] block ${
                    bwContrastFilter ? 'grayscale contrast-125' : ''
                  }`}
                />
                <div className="pointer-events-none absolute bottom-1 right-1 bg-black/90 text-white font-mono text-[9px] font-bold px-1 rounded">
                  {youtubeDurationBadge || '3:00:00'}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Мобильный масштаб YouTube (160×90 px)
                </span>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  Проверка читаемости Thumbnail Hook (до 3 слов), аватарки и таймкода{' '}
                  <code>{youtubeDurationBadge}</code> в правом нижнем углу на экране смартфона.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Таймкод:</span>
              <input
                type="text"
                value={youtubeDurationBadge}
                onChange={e => setYoutubeDurationBadge(e.target.value)}
                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-amber-300 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* СЕТКА 2x2 FLUX.1-SCHNELL (grid grid-cols-2 gap-3 w-full my-4) */}
      <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Grid className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Сетка 2×2 обложек без водяных знаков (Flux.1-Schnell • 1344×768)
              </h3>
              <p className="text-xs text-slate-400">
                Кликните по любой из 4-х карточек для выбора мастер-обложки (`window.selectedMasterThumbnail`)
                {lastModelUsed ? ` • Движок: ${lastModelUsed}` : ''}
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
              className="bg-slate-800 hover:bg-slate-700 border border-amber-500/50 text-amber-300 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition disabled:opacity-60"
            >
              {isSlicingLocalMedia ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Взять кадр из локального видео/арта</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateProceduralBatchFallback('A')}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition disabled:opacity-60"
            >
              <span>🎨 4 локальных фона</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateFluxCover('A')}
              disabled={isGeneratingCovers || isSlicingLocalMedia}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-lg shadow-cyan-500/20 disabled:opacity-60"
            >
              {isGeneratingCovers ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>
                {isCloudflareConfigured
                  ? 'Сгенерировать 4 обложки (Cloudflare Flux)'
                  : 'Сгенерировать 4 обложки (AI Horde Flux 1344×768)'}
              </span>
            </button>
          </div>
        </div>

        {generationError && (
          <div
            role="alert"
            className="w-full max-w-md max-h-24 overflow-hidden text-ellipsis rounded-xl px-3.5 py-2 text-xs flex items-center justify-between gap-2 border bg-rose-950/75 border-rose-500/60 text-rose-200"
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
              className="text-[11px] text-slate-400 hover:text-white shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Индикатор и 4 анимированных скелетона на время запроса к AI Horde / Cloudflare / нарезки медиа */}
        {isGeneratingCovers || isSlicingLocalMedia ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2.5 py-2 text-xs font-bold text-cyan-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>
                {isSlicingLocalMedia
                  ? 'Нарезка 4 вариантов превью (16:9) из локального видео/арта...'
                  : generationStatusText || 'Генерация 4 чистых 16:9 обложек (Flux.1-Schnell)...'}
              </span>
              {isGeneratingCovers && (
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/50 text-rose-200 px-2.5 py-0.5 rounded-lg text-[11px] cursor-pointer"
                >
                  Отменить
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 w-full my-4">
              {[0, 1, 2, 3].map(skeletonIdx => (
                <div
                  key={`skeleton-${skeletonIdx}`}
                  className="aspect-video w-full rounded-xl bg-slate-900/90 border-2 border-slate-700/60 animate-pulse flex flex-col items-center justify-center gap-2 p-4"
                >
                  <Wand2 className="w-6 h-6 text-cyan-400/60 animate-bounce" />
                  <span className="text-[11px] font-mono text-slate-400 text-center">
                    {isSlicingLocalMedia
                      ? `Подготовка кадра #${skeletonIdx + 1}...`
                      : `Flux.1-Schnell 1344×768 • Вариант #${skeletonIdx + 1}...`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Контейнер превью: 2 колонки на 2 строки (grid grid-cols-2 gap-3 w-full my-4) */
          <div id="imagen-thumbnails-grid-container" className="grid grid-cols-2 gap-3 w-full my-4">
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
                  className={`relative group rounded-xl overflow-hidden border-2 bg-slate-900 cursor-pointer transition-all duration-200 hover:border-cyan-400/80 hover:scale-[1.02] flex flex-col justify-between ${
                    isMaster
                      ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_15px_rgba(0,242,254,0.4)]'
                      : 'border-slate-700/60'
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                      <span className="text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded truncate max-w-[60%]">
                        {sceneLabel}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setZoomedVariantIdx(index);
                          }}
                          className="text-xs bg-slate-900/90 hover:bg-black text-cyan-300 border border-cyan-400/40 font-bold px-2 py-1 rounded shadow cursor-pointer"
                        >
                          🔍 Увеличить
                        </button>
                        <a
                          href={imgSrc}
                          download={`thumbnail_${index + 1}.jpg`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-2 py-1 rounded shadow"
                        >
                          Скачать
                        </a>
                      </div>
                    </div>
                    <div
                      className={`selection-indicator ${
                        isMaster ? '' : 'hidden'
                      } absolute top-2 right-2 bg-cyan-500 text-black text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg`}
                    >
                      ✓
                    </div>
                  </div>

                  {/* Панель действий под выбранной карточкой */}
                  <div className="p-2.5 bg-[#0b0f17] border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <span className="font-bold text-slate-200 shrink-0">#{index + 1}</span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[180px]" title={sceneLabel}>
                        {sceneLabel}
                      </span>
                      {isMaster && (
                        <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 px-2 py-0.5 rounded shrink-0">
                          Мастер-кадр
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDownloadVariantFromGrid(index);
                        }}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-1.5 px-2.5 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition"
                      >
                        <Download className="w-3 h-3" />
                        <span>📥 Скачать мастер-кадр</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleAttachToYoutubeRelease(index);
                        }}
                        className={`font-bold py-1.5 px-2.5 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition border ${
                          isAttached
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-slate-800 hover:bg-slate-700 border-cyan-400/40 text-cyan-300'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {isAttached ? '✓ Привязано к релизу' : 'Привязать к YouTube релизу'}
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

      {/* НИЖНИЕ МОДУЛИ: 1. АВТО-ЭКСТРАКТОР 4K КАДРА ПО СЕКУНДЕ & 2. ГЕНЕРАТОР ПРОМПТА IMAGEN 4 / MIDJOURNEY / LEONARDO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. АВТО-ЭКСТРАКТОР СТОП-КАДРА ИЗ ГОТОВОГО ВИДЕО В ЧЕСТНОМ 4K ПО ТАЙМКОДУ СЕКУНДЫ */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                1. Авто-экстрактор 4K-кадра из видео по секунде (3840×2160)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
              3840×2160 UHD
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="file"
                accept="video/*"
                onChange={handleSelectVideoForExtraction}
                className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
              />
              {videoFileName && (
                <span className="text-[11px] font-mono text-emerald-300 truncate max-w-xs">
                  Файл: {videoFileName}
                </span>
              )}
            </div>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
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

                <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-semibold">
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
                        className="w-20 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-xs font-mono text-amber-300 text-center outline-none"
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        / {videoDuration.toFixed(1)} сек
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
                    className="w-full accent-amber-500 cursor-pointer"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => capture4KKeyframe('A')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      📸 В Обложку A (4K)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAbModeEnabled(true);
                        capture4KKeyframe('B');
                      }}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      📸 В Обложку B (4K)
                    </button>
                    <button
                      type="button"
                      onClick={() => capture4KKeyframe('download')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      💾 Скачать 4K кадр
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0f17] border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-400 space-y-1">
                <Film className="w-7 h-7 text-amber-400/70 mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-300">
                  Загрузите видеофайл (.mp4 / .mov / .webm) для авто-экстракта 4K стоп-кадра
                </p>
                <p className="text-[11px] text-slate-500">
                  Точный выбор секунды и мгновенный захват кадра в 3840×2160 без потери четкости
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 2. ВИЗУАЛЬНЫЙ ПРОМПТ ДЛЯ FLUX.1-SCHNELL / AI HORDE / CLOUDFLARE WORKERS AI */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  2. Генератор визуального промпта (Flux.1-Schnell / Midjourney / Leonardo.ai)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
                16:9 English Prompt
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase block">
                Визуальный стиль (Свет, план, атмосфера):
              </label>
              <select
                value={promptStylePreset}
                onChange={e => {
                  setPromptStylePreset(
                    e.target.value as
                      | 'mystery_dark'
                      | 'ambient_4k'
                      | 'truecrime_contrast'
                      | 'scifi_neon'
                  );
                  setCustomFluxPrompt('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-amber-300 font-semibold outline-none focus:border-amber-500"
              >
                <option value="mystery_dark">
                  🕵️ Dark Mystery (Высокий контраст, фокус на улике, chiaroscuro)
                </option>
                <option value="ambient_4k">
                  ❄️ Cozy Ambient 4K (Тёплый свет внутри vs ледяная стихия)
                </option>
                <option value="truecrime_contrast">
                  📁 Investigative / True Crime (Драматический свет, гриф SECRET)
                </option>
                <option value="scifi_neon">
                  📡 Anomalous Signal (Осциллограф, объёмные лучи в темноте)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase block">
                Промпт для Flux.1-Schnell (AI Horde 1344×768 / Cloudflare Workers AI):
              </label>
              <textarea
                rows={5}
                value={activePromptText}
                onChange={e => setCustomFluxPrompt(e.target.value)}
                className="w-full bg-[#0b0f17] border border-slate-800 focus:border-indigo-400 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleGenerateFluxCover('A')}
              disabled={isGeneratingCovers}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-60"
            >
              <Wand2 className="w-4 h-4" />
              <span>
                {isCloudflareConfigured
                  ? 'Сгенерировать 2×2 (Cloudflare Flux)'
                  : 'Сгенерировать 2×2 (AI Horde Flux 1344×768)'}
              </span>
            </button>

            <button
              type="button"
              onClick={copyCoverPromptForWebGenerator}
              className="bg-gradient-to-r from-indigo-500 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-slate-950 font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-500/20"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-4 h-4" /> Промпт скопирован!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> 📋 Скопировать промпт для веб-генератора
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
