/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, Download, RefreshCw, Camera, Eye, Copy, Check, Columns, Smartphone,
  Film, Contrast, Layers, Wand2, ZoomIn, X, Grid, CheckCircle2, AlertTriangle,
  Link2, Upload, Zap, KeyRound, SlidersHorizontal, Type, RotateCcw, Move,
  ChevronDown, Image as ImageIcon, ArrowRight, Sun, AlignCenterHorizontal, Tag
} from 'lucide-react';
import {
  CornerPositionPresetId,
  DEFAULT_BG_ADJUST,
  LINE_COLOR_SWATCHES,
  SlotBgAdjustConfig,
  SplashColorPresetId,
  SplashShapeId,
  YOUTUBE_CINEMA_BG_ADJUST,
  buildVertical3DFill,
  legacyPresetToSplashColor,
  renderAdjustedBackgroundToCanvas,
  splitProjectTitleIntoTwoLines
} from '../utils/thumbnailPresetsAndEffects';

declare global {
  interface Window {
    selectedMasterThumbnail?: string;
  }
}

interface ThumbnailStudioViewProps {
  isolatedEditing?: boolean;
  onProjectImageRemove?: (slot:ThumbnailSlotId)=>void;
  onProjectImageData?: (slot:ThumbnailSlotId,dataUrl:string)=>void;
  onProjectImageFile?: (slot:ThumbnailSlotId,file:File)=>void;
  projectImageUrls?: Partial<Record<ThumbnailSlotId,string>>;
  initialSlots?: Partial<Record<ThumbnailSlotId, PersistedSlotState>>;
  onSlotsChange?: (slots: Record<ThumbnailSlotId, ThumbnailSlotConfig>) => void;
  thumbTitle: string;
  onThumbTitleChange: (title: string) => void;
  thumbBadge: string;
  onThumbBadgeChange: (badge: string) => void;
  externalFontStyle?: ThumbnailFontStyleId | null;
  onConsumeExternalFontStyle?: () => void;
  externalCoverAImageUrl?: string | null;
  onConsumeExternalCoverAImage?: () => void;
  externalSlotTitlePatch?: { slot: 'A' | 'B' | 'C'; title: string; nonce: number } | null;
  onConsumeExternalSlotTitlePatch?: () => void;
  onSendToArtEditor?: (imageDataUrl: string, slotLabel: string) => void;
  youtubeMockTitle?: string;
  scriptContext?: string;
  manifestThumbnailSlots?: { A?: string; B?: string; C?: string } | null;
  endScreenSafeZone?: string;
  manifestDurationBadge?: string;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const CF_ACCOUNT_ID_STORAGE_KEY = 'aether_cf_account_id';
const CF_API_TOKEN_SESSION_KEY = 'aether_cf_api_token_session';
const CF_API_TOKEN_LEGACY_KEY = 'aether_cf_api_token';
const AI_HORDE_BASE_URL = 'https://aihorde.net/api/v2';
const AI_HORDE_ANON_KEY = '0000000000';

/** P0: API-токен живёт только в sessionStorage; legacy-запись из localStorage мигрирует и стирается. */
const readCfToken = (): string => {
  try {
    const session = sessionStorage.getItem(CF_API_TOKEN_SESSION_KEY);
    if (session) return session;
    const legacy = localStorage.getItem(CF_API_TOKEN_LEGACY_KEY);
    if (legacy) {
      sessionStorage.setItem(CF_API_TOKEN_SESSION_KEY, legacy);
      localStorage.removeItem(CF_API_TOKEN_LEGACY_KEY);
      return legacy;
    }
  } catch {
    /* storage недоступен — работаем в памяти */
  }
  return '';
};

export class FluxGenerationError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'FluxGenerationError';
    this.status = status;
  }
}

/**
 Загружает изображение через fetch -> blob -> URL.createObjectURL (с прокси-fallback),
 чтобы Canvas 4K экспорт (3840x2160) не падал с CORS tainted canvas.
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
      if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
      blob = await directRes.blob();
    } catch {
      const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(rawUrl)}`);
      if (!proxyRes.ok) throw new Error(`Не удалось загрузить изображение (${proxyRes.status})`);
      blob = await proxyRes.blob();
    }
  }
  const rawObjectUrl = URL.createObjectURL(blob);
  if (!cropTo16x9) return rawObjectUrl;
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
      ctx, img, img.naturalWidth || targetW, img.naturalHeight || targetH, targetW, targetH, 1
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
 AI Horde Flux.1-Schnell: POST /generate/async -> polling /generate/check -> /generate/status.
 Авто-даунгрейд 1344x768 -> 704x384 при KudosUpfront.
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
        params: { sampler_name: 'k_euler', cfg_scale: 1, steps: 4, width, height, n: 4 },
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
    (submitRes.status === 403 ||
      submitData.rc === 'KudosUpfront' ||
      /kudos/i.test(submitData.message || ''))
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
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new FluxGenerationError('Генерация отменена пользователем', 499));
      };
      const timer = window.setTimeout(() => {
        options?.signal?.removeEventListener('abort', onAbort);
        resolve();
      }, 3000);
      options?.signal?.addEventListener('abort', onAbort, { once: true });
    });

    const checkRes = await fetch(
      `${AI_HORDE_BASE_URL}/generate/check/${encodeURIComponent(jobId)}`,
      { headers: { 'Client-Agent': 'AetherCombine:1.0:studio' }, signal: options?.signal }
    );
    if (!checkRes.ok) {
      throw new FluxGenerationError(
        `Ошибка проверки статуса AI Horde (${checkRes.status})`,
        checkRes.status
      );
    }
    const checkData = (await checkRes.json().catch(() => ({}))) as {
      done?: boolean;
      faulted?: boolean;
      is_possible?: boolean;
      finished?: number;
      queue_position?: number;
      wait_time?: number;
    };
    if (checkData.faulted) {
      throw new FluxGenerationError('AI Horde воркер вернул faulted при генерации.', 502);
    }
    if (checkData.is_possible === false) {
      throw new FluxGenerationError('Сейчас нет свободных воркеров Flux.1-Schnell на AI Horde.', 503);
    }
    const qPos =
      typeof checkData.queue_position === 'number' ? `#${checkData.queue_position}` : 'в работе';
    const eta = typeof checkData.wait_time === 'number' ? `~${checkData.wait_time}с` : '...';
    const doneCnt = checkData.finished ?? 0;
    options?.onProgress?.(
      `AI Horde (Flux.1-Schnell) • Очередь: ${qPos} • Осталось: ${eta} • Готово ${doneCnt}/4`,
      `Очередь ${qPos} • ${eta} (${doneCnt}/4)`
    );
    if (checkData.done === true) break;
  }

  options?.onProgress?.('Забираем 4 готовых кадра (1344×768) из AI Horde...', 'Загрузка 4 кадров...');
  const statusRes = await fetch(
    `${AI_HORDE_BASE_URL}/generate/status/${encodeURIComponent(jobId)}`,
    { headers: { 'Client-Agent': 'AetherCombine:1.0:studio' }, signal: options?.signal }
  );
  if (!statusRes.ok) {
    throw new FluxGenerationError(
      `Ошибка получения результатов AI Horde (${statusRes.status})`,
      statusRes.status
    );
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
  return { images: blobUrls, modelUsed: 'Flux.1 AI Horde (2×2) • 16:9' };
}

/** Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell) через серверный прокси. */
export async function generateViaCloudflareFlux(
  promptText: string,
  accountId: string,
  apiToken: string,
  signal?: AbortSignal
): Promise<{ images: string[]; modelUsed: string }> {
  const response = await fetch('/api/cloudflare/flux', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, apiToken, prompt: promptText, count: 4 }),
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

/** Императивный рендер сетки 2x2 в произвольный DOM-контейнер. */
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
      <div class="selection-indicator hidden absolute top-2 right-2 bg-cyan-500 text-black text-xs font-bold rounded-full p-1 shadow-lg">✓</div>
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
      if (onSelectCallback) onSelectCallback(imgSrc, index);
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

/** roundRect с фолбэком для Safari < 16 / старых WebView. */
function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  const native = (ctx as CanvasRenderingContext2D & { roundRect?: (...a: number[]) => void })
    .roundRect;
  if (typeof native === 'function') {
    native.call(ctx, x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 4 кинематографических 16:9 фона (1920x1080) средствами Canvas. */
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
    const rim = ctx.createRadialGradient(180, 260, 10, 180, 260, 560);
    rim.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    rim.addColorStop(1, 'transparent');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8, 4, 3, 0.78)';
    ctx.fillRect(0, 880, c.width, 200);
    for (let i = 0; i < 140; i++) {
      const px = hearthX + Math.sin(i * 1.9 + seed) * (120 + (i % 7) * 85);
      const py = c.height - ((i * 89 + seed * 3) % 920);
      const r = 1.5 + (i % 5);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(253, 224, 71, 0.75)' : 'rgba(251, 146, 60, 0.52)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (themeIdx === 2) {
    const polar = ctx.createLinearGradient(0, 0, 0, c.height);
    polar.addColorStop(0, '#020813');
    polar.addColorStop(0.55, '#071d2c');
    polar.addColorStop(1, '#030b14');
    ctx.fillStyle = polar;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 160; i++) {
      const sx = (i * 229 + seed * 11) % c.width;
      const sy = (i * 71 + seed * 7) % (c.height * 0.65);
      ctx.fillStyle = `rgba(226, 232, 240, ${0.25 + (i % 4) * 0.18})`;
      ctx.fillRect(sx, sy, (i % 3) + 1, (i % 3) + 1);
    }
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
    const dawn = ctx.createLinearGradient(0, 0, c.width * 0.4, c.height);
    dawn.addColorStop(0, '#070d19');
    dawn.addColorStop(0.45, '#16283f');
    dawn.addColorStop(0.8, '#263e59');
    dawn.addColorStop(1, '#09111d');
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, c.width, c.height);
    const sunGlow = ctx.createRadialGradient(1380, 420, 30, 1380, 420, 920);
    sunGlow.addColorStop(0, 'rgba(186, 230, 253, 0.42)');
    sunGlow.addColorStop(0.35, 'rgba(148, 163, 184, 0.18)');
    sunGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, c.width, c.height);
    drawMountainLayer(810, 190, 0.0029, 0.4, '#132238');
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

  if (stylePreset === 'truecrime_contrast') {
    const crimeGlow = ctx.createRadialGradient(
      c.width * 0.72, c.height * 0.35, 40, c.width * 0.72, c.height * 0.35, 760
    );
    crimeGlow.addColorStop(0, 'rgba(239, 68, 68, 0.18)');
    crimeGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = crimeGlow;
    ctx.fillRect(0, 0, c.width, c.height);
  } else if (stylePreset === 'scifi_neon') {
    const neonGlow = ctx.createRadialGradient(
      c.width * 0.65, c.height * 0.5, 40, c.width * 0.65, c.height * 0.5, 700
    );
    neonGlow.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
    neonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = neonGlow;
    ctx.fillRect(0, 0, c.width, c.height);
  }

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
export type BadgePosition = 'left' | 'right';
export type BadgeGroup = 'base' | 'ambience_3h';

export interface BadgePresetConfig {
  id: string;
  text: string;
  group: BadgeGroup;
}

export const BADGE_PRESETS_CONFIG: BadgePresetConfig[] = [
  { id: '4k_ultra_hd', text: '4K ULTRA HD', group: 'base' },
  { id: 'documentary', text: 'DOCUMENTARY', group: 'base' },
  { id: 'true_story', text: 'TRUE STORY', group: 'base' },
  { id: 'real_events', text: 'REAL EVENTS', group: 'base' },
  { id: 'based_on_facts', text: 'BASED ON FACTS', group: 'base' },
  { id: 'history', text: 'HISTORY', group: 'base' },
  { id: 'archive', text: 'ARCHIVE', group: 'base' },
  { id: 'full_story', text: 'FULL STORY', group: 'base' },
  { id: '3_hours', text: '3 HOURS', group: 'ambience_3h' },
  { id: 'rain_sounds', text: 'RAIN SOUNDS', group: 'ambience_3h' },
  { id: 'thunderstorm', text: 'THUNDERSTORM', group: 'ambience_3h' },
  { id: 'fireplace', text: 'FIREPLACE', group: 'ambience_3h' },
  { id: 'ocean_waves', text: 'OCEAN WAVES', group: 'ambience_3h' },
  { id: 'forest_night', text: 'FOREST NIGHT', group: 'ambience_3h' },
  { id: 'deep_sleep', text: 'DEEP SLEEP', group: 'ambience_3h' },
  { id: 'study_and_focus', text: 'STUDY & FOCUS', group: 'ambience_3h' },
  { id: 'relax', text: 'RELAX', group: 'ambience_3h' },
  { id: 'no_ads', text: 'NO ADS', group: 'ambience_3h' },
  { id: 'dark_screen', text: 'DARK SCREEN', group: 'ambience_3h' },
  { id: 'asmr', text: 'ASMR', group: 'ambience_3h' }
];

export interface BadgeItemState {
  enabled: boolean;
  position: BadgePosition;
}

const createDefaultPresetBadgesState = (): Record<string, BadgeItemState> => {
  const map: Record<string, BadgeItemState> = {};
  for (const preset of BADGE_PRESETS_CONFIG) {
    if (preset.id === '3_hours') map[preset.id] = { enabled: true, position: 'left' };
    else if (preset.id === 'no_ads') map[preset.id] = { enabled: true, position: 'right' };
    else map[preset.id] = { enabled: false, position: 'left' };
  }
  return map;
};

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
  presetBadges: Record<string, BadgeItemState>;
  customBadgeText: string;
  customBadgeEnabled: boolean;
  customBadgePosition: BadgePosition;
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
  presetBadges?: Record<string, Partial<BadgeItemState>>;
  customBadgeText?: string;
  customBadgeEnabled?: boolean;
  customBadgePosition?: BadgePosition;
  badgeTexts?: string[];
  badgePositions?: BadgePosition[];
  badgeScalePct?: number;
  hookLayout?: Partial<HookTextLayout>;
  bgAdjust?: Partial<SlotBgAdjustConfig>;
  title?: string;
  bottomLine?: string;
  splashPreset?: SplashColorPresetId;
  splashCustomColor?: string;
}

const THUMB_ABC_SLOTS_STORAGE_KEY = 'aether_thumb_abc_slots_v2';
const THUMB_ABC_SLOTS_LEGACY_KEY = 'aether_thumb_abc_slots_v1';

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
  const defaultSplashColor = slot === 'B' ? '#18181B' : slot === 'C' ? '#D97706' : '#E10613';
  return {
    topText: split.line1,
    topColor: '#FFFFFF',
    bottomText: split.line2,
    bottomColor: '#FFD600',
    splashShape: 'none',
    splashColor: defaultSplashColor,
    splashPaddingPct: 100,
    splashShadowPct: 100,
    badgesEnabled: true,
    presetBadges: createDefaultPresetBadgesState(),
    customBadgeText: '',
    customBadgeEnabled: false,
    customBadgePosition: 'left',
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

  let source = raw;
  const migratedTop =
    typeof source.topText === 'string'
      ? source.topText
      : typeof source.title === 'string'
        ? source.title.toUpperCase()
        : base.topText;
  const migratedBottom =
    typeof source.bottomText === 'string'
      ? source.bottomText
      : typeof source.bottomLine === 'string'
        ? source.bottomLine.toUpperCase()
        : base.bottomText;

  const normalizeBadgePos = (pos: unknown): BadgePosition => (pos === 'right' ? 'right' : 'left');
  const hydratedPresetBadges = createDefaultPresetBadgesState();

  if (source.presetBadges && typeof source.presetBadges === 'object') {
    for (const preset of BADGE_PRESETS_CONFIG) {
      const savedItem = source.presetBadges[preset.id];
      if (savedItem && typeof savedItem === 'object') {
        hydratedPresetBadges[preset.id] = {
          enabled: Boolean(savedItem.enabled),
          position: normalizeBadgePos(savedItem.position)
        };
      }
    }
  } else if (Array.isArray(source.badgeTexts)) {
    for (const preset of BADGE_PRESETS_CONFIG) {
      hydratedPresetBadges[preset.id] = { enabled: false, position: 'left' };
    }
    let leftoverCustom = '';
    let leftoverCustomPos: BadgePosition = 'left';
    source.badgeTexts.forEach((rawTxt, i) => {
      const upper = String(rawTxt || '').trim().toUpperCase();
      if (!upper || /^(UNCENSORED|18\+)$/.test(upper)) return;
      const pos = normalizeBadgePos(source.badgePositions?.[i]);
      const matched = BADGE_PRESETS_CONFIG.find(p => p.text === upper);
      if (matched) hydratedPresetBadges[matched.id] = { enabled: true, position: pos };
      else if (!leftoverCustom) {
        leftoverCustom = upper;
        leftoverCustomPos = pos;
      }
    });
    if (leftoverCustom && typeof source.customBadgeText !== 'string') {
      source = {
        ...source,
        customBadgeText: leftoverCustom,
        customBadgeEnabled: true,
        customBadgePosition: leftoverCustomPos
      };
    }
  }

  const resolvedColor =
    typeof source.splashColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.splashColor)
      ? source.splashColor.toUpperCase()
      : source.splashPreset || source.splashCustomColor
        ? legacyPresetToSplashColor(source.splashPreset, source.splashCustomColor)
        : base.splashColor;

  const hl = source.hookLayout || {};
  const customTextRaw = typeof source.customBadgeText === 'string' ? source.customBadgeText : '';
  const customTextClean = /^(UNCENSORED|18\+)$/.test(customTextRaw.trim().toUpperCase())
    ? ''
    : customTextRaw;

  return {
    ...base,
    topText: migratedTop,
    topColor:
      typeof source.topColor === 'string' && source.topColor.trim()
        ? source.topColor
        : base.topColor,
    bottomText: migratedBottom,
    bottomColor:
      typeof source.bottomColor === 'string' && source.bottomColor.trim()
        ? source.bottomColor
        : base.bottomColor,
    splashShape: 'none',
    splashColor: resolvedColor,
    splashPaddingPct:
      typeof source.splashPaddingPct === 'number'
        ? Math.max(50, Math.min(160, source.splashPaddingPct))
        : base.splashPaddingPct,
    splashShadowPct:
      typeof source.splashShadowPct === 'number'
        ? Math.max(0, Math.min(160, source.splashShadowPct))
        : base.splashShadowPct,
    badgesEnabled:
      typeof source.badgesEnabled === 'boolean' ? source.badgesEnabled : base.badgesEnabled,
    presetBadges: hydratedPresetBadges,
    customBadgeText: customTextClean,
    customBadgeEnabled:
      typeof source.customBadgeEnabled === 'boolean'
        ? source.customBadgeEnabled && customTextClean.trim().length > 0
        : base.customBadgeEnabled,
    customBadgePosition: normalizeBadgePos(source.customBadgePosition),
    badgeScalePct:
      typeof source.badgeScalePct === 'number'
        ? Math.max(60, Math.min(150, source.badgeScalePct))
        : base.badgeScalePct,
    hookLayout: {
      xPct: typeof hl.xPct === 'number' ? Math.max(6, Math.min(94, hl.xPct)) : DEFAULT_HOOK_LAYOUT.xPct,
      yPct: typeof hl.yPct === 'number' ? Math.max(8, Math.min(92, hl.yPct)) : DEFAULT_HOOK_LAYOUT.yPct,
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
    bgAdjust: clampBgAdjust(source.bgAdjust)
  };
};

const formatBytesLabel = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 КБ';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
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

/** Парсит "3:00:00" / "1:04" / "180:00" / "10800" в секунды. */
const parseDurationLabelToSeconds = (label?: string | null): number => {
  const raw = String(label || '').trim();
  if (!raw) return 0;
  const parts = raw.split(':').map(p => Number(p.replace(/[^\d.]/g, '')));
  if (!parts.length || parts.some(n => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

const formatClockLabel = (totalSec: number): string => {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/** YouTube разрешает End Screen только в последние 5–20 секунд ролика. */
const computeEndScreenWindow = (durationSec: number): string => {
  if (!Number.isFinite(durationSec) || durationSec < 25) return '—';
  const start = Math.max(0, durationSec - 20);
  const end = Math.max(start + 5, durationSec - 5);
  return `${formatClockLabel(start)}-${formatClockLabel(end)}`;
};

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  isolatedEditing = false,
  onProjectImageRemove,
  projectImageUrls,
  onProjectImageFile,
  onProjectImageData,
  initialSlots,
  onSlotsChange,
  thumbTitle,
  onThumbTitleChange,
  thumbBadge: _thumbBadge,
  onThumbBadgeChange: _onThumbBadgeChange,
  externalFontStyle,
  onConsumeExternalFontStyle,
  externalCoverAImageUrl,
  onConsumeExternalCoverAImage,
  externalSlotTitlePatch,
  onConsumeExternalSlotTitlePatch,
  onSendToArtEditor,
  youtubeMockTitle,
  scriptContext,
  manifestThumbnailSlots,
  endScreenSafeZone,
  manifestDurationBadge,
  onNotify
}) => {
  const [showEndScreenSafeZone, setShowEndScreenSafeZone] = useState<boolean>(true);

  useEffect(() => {
    setShowEndScreenSafeZone(true);
  }, [
    manifestThumbnailSlots?.A,
    manifestThumbnailSlots?.B,
    manifestThumbnailSlots?.C,
    endScreenSafeZone
  ]);

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
  const [badgeFilterQuery, setBadgeFilterQuery] = useState<string>('');
  const [slotImages, setSlotImages] = useState<Record<ThumbnailSlotId, HTMLImageElement | null>>({
    A: null,
    B: null,
    C: null
  });

  useEffect(()=>{
    if(!isolatedEditing)return;
    let live=true;
    for(const slot of ['A','B','C'] as const){
      const url=projectImageUrls?.[slot];
      if(!url){setSlotImages(prev=>prev[slot]?{...prev,[slot]:null}:prev);continue;}
      const img=new Image();
      img.onload=()=>{if(live)setSlotImages(prev=>({...prev,[slot]:img}));};
      img.src=url;
    }
    return()=>{live=false;};
  },[isolatedEditing,projectImageUrls]);
  const imageModuleLive=useRef(false);
  useEffect(()=>{imageModuleLive.current=true;return()=>{imageModuleLive.current=false;};},[]);
  function persistLocalImage(slot:ThumbnailSlotId,url:string):boolean{
    if(!isolatedEditing)return false;
    if(imageModuleLive.current&&onProjectImageData)onProjectImageData(slot,url);
    return true;
  }
  const projectTitleSeed = (youtubeMockTitle || thumbTitle || '').trim();
  const lastSyncedExternalTitleRef = useRef<string>(thumbTitle);

  const [slotConfigs, setSlotConfigs] = useState<Record<ThumbnailSlotId, ThumbnailSlotConfig>>(() => {
    let parsed: Partial<Record<ThumbnailSlotId, PersistedSlotState>> | null = initialSlots ?? null;
    if (!isolatedEditing) try {
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

  useEffect(() => {
    if (thumbTitle === lastSyncedExternalTitleRef.current) return;
    lastSyncedExternalTitleRef.current = thumbTitle;
    const split = splitProjectTitleIntoTwoLines(thumbTitle);
    setSlotConfigs(prev => ({
      ...prev,
      A: { ...prev.A, topText: split.line1, bottomText: split.line2 }
    }));
  }, [thumbTitle]);

  useEffect(() => {
    if (!externalSlotTitlePatch) return;
    const { slot, title } = externalSlotTitlePatch;
    const split = splitProjectTitleIntoTwoLines(title);
    setSlotConfigs(prev => ({
      ...prev,
      [slot]: { ...prev[slot], topText: split.line1, bottomText: split.line2 }
    }));
    setActiveSlot(slot);
    onConsumeExternalSlotTitlePatch?.();
  }, [externalSlotTitlePatch, onConsumeExternalSlotTitlePatch]);

  useEffect(() => {
    if (isolatedEditing) { onSlotsChange?.(slotConfigs); return; }
    try {
      localStorage.setItem(THUMB_ABC_SLOTS_STORAGE_KEY, JSON.stringify(slotConfigs));
    } catch {
      /* quota */
    }
  }, [slotConfigs, isolatedEditing, onSlotsChange]);

  const updateSlotConfig = useCallback(
    (slot: ThumbnailSlotId, updater: (prev: ThumbnailSlotConfig) => ThumbnailSlotConfig) => {
      setSlotConfigs(prev => ({ ...prev, [slot]: updater(prev[slot]) }));
    },
    []
  );

  const activeConfig = slotConfigs[activeSlot];
  const imgA = slotImages.A;

  useEffect(() => {
    if (externalFontStyle) onConsumeExternalFontStyle?.();
  }, [externalFontStyle, onConsumeExternalFontStyle]);

  useEffect(() => {
    if (!externalCoverAImageUrl) return;
    const editedImg = new Image();
    editedImg.onload = () => {
      setSlotImages(prev => ({ ...prev, A: editedImg }));
      if (!isolatedEditing) window.selectedMasterThumbnail = externalCoverAImageUrl;
      onConsumeExternalCoverAImage?.();
    };
    editedImg.src = externalCoverAImageUrl;
  }, [externalCoverAImageUrl, onConsumeExternalCoverAImage]);

  const [activeHookBox, setActiveHookBox] = useState<HookBoundingBoxPct | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<ThumbnailSlotId | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<ThumbnailSlotId | null>(null);
  const [fontsReadyTick, setFontsReadyTick] = useState<number>(0);

  const [baseSharpenPct, setBaseSharpenPct] = useState<number>(0);
  const [baseResolutionPreset, setBaseResolutionPreset] = useState<
    'original' | '1920x1080' | '2560x1440' | '3840x2160'
  >('original');
  const [isExportingFormat, setIsExportingFormat] = useState<string | null>(null);
  const [batchExportStatus, setBatchExportStatus] = useState<string>('');
  const [lastExportReport, setLastExportReport] = useState<
    Record<ThumbnailSlotId, { formatLabel: string; filename: string; sizeText: string } | null>
  >({ A: null, B: null, C: null });
  const [showCopyMenu, setShowCopyMenu] = useState<boolean>(false);

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

  const [cfAccountId, setCfAccountId] = useState<string>(() => {
    if (isolatedEditing) return '';
    try {
      return localStorage.getItem(CF_ACCOUNT_ID_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [cfApiToken, setCfApiToken] = useState<string>(() => isolatedEditing ? '' : readCfToken());
  const [showCfSettings, setShowCfSettings] = useState<boolean>(() => {
    if (isolatedEditing) return false;
    try {
      return Boolean(
        localStorage.getItem(CF_ACCOUNT_ID_STORAGE_KEY) ||
          sessionStorage.getItem(CF_API_TOKEN_SESSION_KEY)
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
    if (isolatedEditing) return;
    try {
      localStorage.setItem(CF_ACCOUNT_ID_STORAGE_KEY, cfAccountId.trim());
    } catch {
      /* quota */
    }
  }, [cfAccountId]);

  useEffect(() => {
    if (isolatedEditing) return;
    const v = cfApiToken.trim();
    try {
      if (v) sessionStorage.setItem(CF_API_TOKEN_SESSION_KEY, v);
      else sessionStorage.removeItem(CF_API_TOKEN_SESSION_KEY);
      localStorage.removeItem(CF_API_TOKEN_LEGACY_KEY);
    } catch {
      /* storage недоступен */
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

  const [compareFeedEnabled, setCompareFeedEnabled] = useState<boolean>(false);
  const [feedViewportMode, setFeedViewportMode] = useState<'both' | 'desktop' | 'mobile'>('both');
  const [bwContrastFilter, setBwContrastFilter] = useState<boolean>(false);
  const [showYoutubeOverlay, setShowYoutubeOverlay] = useState<boolean>(true);
  const [youtubeDurationBadge, setYoutubeDurationBadge] = useState<string>(
    (manifestDurationBadge || '').trim() || '3:00:00'
  );
  const [youtubeChannelName] = useState<string>('Aether Documentary 4K');
  const [youtubeVideoHeading, setYoutubeVideoHeading] = useState<string>(
    youtubeMockTitle || thumbTitle || '4K Documentary Release'
  );

  useEffect(() => {
    const next = (manifestDurationBadge || '').trim();
    if (next) setYoutubeDurationBadge(next);
  }, [manifestDurationBadge]);

  const derivedDurationSec =
    parseDurationLabelToSeconds(manifestDurationBadge || youtubeDurationBadge) || 10800;
  const effectiveEndScreenSafeZone =
    (endScreenSafeZone || '').trim() || computeEndScreenWindow(derivedDurationSec);

  useEffect(() => {
    if (youtubeMockTitle) setYoutubeVideoHeading(youtubeMockTitle);
  }, [youtubeMockTitle]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [seekTimeSec, setSeekTimeSec] = useState<number>(0);

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
    if (typeof document !== 'undefined' && document.fonts) {
      Promise.allSettled([
        document.fonts.load('400 72px "Anton"'),
        document.fonts.load('900 72px "Montserrat"'),
        document.fonts.load('800 24px "Montserrat"')
      ]).then(() => {
        if (!cancelled) setFontsReadyTick(t => t + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopySlotSettingsTo = (targetSlot: ThumbnailSlotId) => {
    if (targetSlot === activeSlot) return;
    const sourceCfg = slotConfigs[activeSlot];
    const clonedPresetBadges: Record<string, BadgeItemState> = {};
    for (const preset of BADGE_PRESETS_CONFIG) {
      const item = sourceCfg.presetBadges?.[preset.id];
      clonedPresetBadges[preset.id] = {
        enabled: Boolean(item?.enabled),
        position: item?.position === 'right' ? 'right' : 'left'
      };
    }
    const clonedCfg: ThumbnailSlotConfig = {
      ...sourceCfg,
      presetBadges: clonedPresetBadges,
      hookLayout: { ...sourceCfg.hookLayout },
      bgAdjust: { ...sourceCfg.bgAdjust }
    };
    if (targetSlot === 'A') {
      const combined = [clonedCfg.topText, clonedCfg.bottomText].filter(Boolean).join(' ').trim();
      lastSyncedExternalTitleRef.current = combined;
      onThumbTitleChange(combined);
    }
    setSlotConfigs(prev => ({ ...prev, [targetSlot]: clonedCfg }));
    const sourceImg = slotImages[activeSlot] || slotImages.A;
    if(sourceImg){
      if(isolatedEditing){
        const canvas=document.createElement('canvas');canvas.width=sourceImg.naturalWidth;canvas.height=sourceImg.naturalHeight;
        const ctx=canvas.getContext('2d');if(ctx&&canvas.width&&canvas.height){ctx.drawImage(sourceImg,0,0);persistLocalImage(targetSlot,canvas.toDataURL('image/png'));}
      }else setSlotImages(prev=>({...prev,[targetSlot]:sourceImg}));
    }
    setShowCopyMenu(false);
    setActiveSlot(targetSlot);
    onNotify(
      `📋 Настройки и фон слота ${activeSlot} скопированы в Вариант ${targetSlot}!`,
      'success'
    );
  };

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

  const updateSlotLines = (slot: ThumbnailSlotId, nextTop: string, nextBottom: string) => {
    updateSlotConfig(slot, prev => ({ ...prev, topText: nextTop, bottomText: nextBottom }));
    if (slot === 'A') {
      const combined = [nextTop.trim(), nextBottom.trim()].filter(Boolean).join(' ').trim();
      lastSyncedExternalTitleRef.current = combined;
      onThumbTitleChange(combined);
    }
  };

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
          w * 0.62, h * 0.42, 20 * scale, w * 0.62, h * 0.42, 440 * scale
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

      if (hasHeadline) {
        const rawVx = (cfg.hookLayout.xPct / 100) * w;
        const rawVy = (cfg.hookLayout.yPct / 100) * h;
        const vignette = ctx.createRadialGradient(rawVx, rawVy, 40 * scale, rawVx, rawVy, 560 * scale);
        vignette.addColorStop(0, 'rgba(4, 7, 15, 0.46)');
        vignette.addColorStop(0.65, 'rgba(4, 7, 15, 0.16)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
      }

      const activeBadgeItems: Array<{ label: string; position: BadgePosition }> = [];
      if (cfg.badgesEnabled) {
        for (const preset of BADGE_PRESETS_CONFIG) {
          const state = cfg.presetBadges?.[preset.id];
          if (state?.enabled) {
            activeBadgeItems.push({
              label: preset.text.toUpperCase(),
              position: state.position === 'right' ? 'right' : 'left'
            });
          }
        }
        const customTrimmed = (cfg.customBadgeText || '').trim().toUpperCase();
        if (cfg.customBadgeEnabled && customTrimmed.length > 0) {
          activeBadgeItems.push({
            label: customTrimmed,
            position: cfg.customBadgePosition === 'right' ? 'right' : 'left'
          });
        }
      }

      if (activeBadgeItems.length > 0) {
        const badgeUserScale = Math.max(0.6, Math.min(1.5, (cfg.badgeScalePct ?? 100) / 100));
        const badgeFontFamily = '"Montserrat", "Inter", sans-serif';
        const paddingX = 32 * scale;
        const topY = 28 * scale;
        const maxAvailableW = w - paddingX * 2;
        const maxAvailableH = h * 0.36;

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

        interface MeasuredBadge {
          label: string;
          position: BadgePosition;
          w: number;
        }
        interface BadgeRowLayout {
          left: MeasuredBadge[];
          right: MeasuredBadge[];
          y: number;
        }

        const computeBadgeLayout = (fitFactor: number) => {
          const effScale = scale * badgeUserScale * fitFactor;
          const fontPx = Math.max(8 * scale, 14 * effScale);
          const trackingPx = 2.0 * effScale;
          const horizontalPad = 34 * effScale;
          const gapX = 12 * effScale;
          const gapY = 10 * effScale;
          const badgeH = 42 * effScale;
          ctx.font = `800 ${Math.max(1, Math.round(fontPx))}px ${badgeFontFamily}`;

          const measured: MeasuredBadge[] = activeBadgeItems.map(item => ({
            label: item.label,
            position: item.position,
            w: Math.min(
              maxAvailableW,
              Math.max(96 * effScale, measureTrackedWidth(item.label, trackingPx) + horizontalPad)
            )
          }));

          const leftList = measured.filter(m => m.position === 'left');
          const rightList = measured.filter(m => m.position === 'right');
          const rows: BadgeRowLayout[] = [];
          const ensureRow = (idx: number): BadgeRowLayout => {
            while (rows.length <= idx) rows.push({ left: [], right: [], y: 0 });
            return rows[idx];
          };
          const rowUsedWidth = (r: BadgeRowLayout): number => {
            const lw = r.left.reduce((s, b) => s + b.w, 0) + gapX * Math.max(0, r.left.length - 1);
            const rw = r.right.reduce((s, b) => s + b.w, 0) + gapX * Math.max(0, r.right.length - 1);
            const midGap = r.left.length > 0 && r.right.length > 0 ? gapX : 0;
            return lw + rw + midGap;
          };

          let leftRowIdx = 0;
          for (const item of leftList) {
            let row = ensureRow(leftRowIdx);
            let currentW = rowUsedWidth(row);
            let addedW = currentW > 0 ? gapX + item.w : item.w;
            while (currentW > 0 && currentW + addedW > maxAvailableW) {
              leftRowIdx += 1;
              row = ensureRow(leftRowIdx);
              currentW = rowUsedWidth(row);
              addedW = currentW > 0 ? gapX + item.w : item.w;
            }
            row.left.push(item);
          }

          let rightRowIdx = 0;
          for (const item of rightList) {
            let row = ensureRow(rightRowIdx);
            let currentW = rowUsedWidth(row);
            let addedW = currentW > 0 ? gapX + item.w : item.w;
            while (currentW > 0 && currentW + addedW > maxAvailableW) {
              rightRowIdx += 1;
              row = ensureRow(rightRowIdx);
              currentW = rowUsedWidth(row);
              addedW = currentW > 0 ? gapX + item.w : item.w;
            }
            row.right.push(item);
          }

          rows.forEach((r, idx) => {
            r.y = topY + idx * (badgeH + gapY);
          });
          const totalH = rows.length > 0 ? rows.length * badgeH + (rows.length - 1) * gapY : 0;
          return { rows, totalH, badgeH, gapX, trackingPx, effScale };
        };

        let fitFactor = 1;
        let layout = computeBadgeLayout(fitFactor);
        if (layout.totalH > maxAvailableH && layout.totalH > 0) {
          fitFactor = Math.max(0.45, maxAvailableH / layout.totalH);
          layout = computeBadgeLayout(fitFactor);
        }

        const drawBadgeCapsule = (label: string, bx: number, by: number, bw: number) => {
          ctx.save();
          ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = Math.max(1.5, 2 * layout.effScale);
          pathRoundRect(ctx, bx, by, bw, layout.badgeH, 8 * layout.effScale);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#FACC15';
          drawTrackedCenteredText(label, bx + bw / 2, by + layout.badgeH * 0.52, layout.trackingPx);
          ctx.restore();
        };

        for (const row of layout.rows) {
          let leftCursorX = paddingX;
          for (const item of row.left) {
            drawBadgeCapsule(item.label, leftCursorX, row.y, item.w);
            leftCursorX += item.w + layout.gapX;
          }
          let rightEdgeX = w - paddingX;
          for (let i = row.right.length - 1; i >= 0; i--) {
            const item = row.right[i];
            const bx = rightEdgeX - item.w;
            drawBadgeCapsule(item.label, bx, row.y, item.w);
            rightEdgeX = bx - layout.gapX;
          }
        }
      }

      if (!hasHeadline) return null;

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
      const avgFs =
        topUpper && bottomUpper ? (fontSize1 + fontSize2) * 0.5 : Math.max(fontSize1, fontSize2);
      const lineGap =
        topUpper && bottomUpper ? Math.max(8 * scale, avgFs * 0.16 * (hl.lineSpacingPct / 100)) : 0;
      const totalTextH = capH1 + lineGap + capH2;
      const skewOverhang = Math.max(fontSize1, fontSize2) * 0.16;
      const contentW = Math.max(line1W, line2W) + skewOverhang;
      const estBoxW = contentW + 40 * scale;
      const estBoxH = totalTextH + 30 * scale;
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
      const bottomYCenter = topUpper ? -totalTextH / 2 + capH1 + lineGap + capH2 / 2 : 0;

      ctx.save();
      ctx.translate(drawCx, drawCy);
      ctx.rotate(tiltRad);
      const finalW = estBoxW;
      const finalH = estBoxH;

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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(text, hardShadowOffX, hardShadowOffY);
        ctx.fillText(text, hardShadowOffX, hardShadowOffY);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
        ctx.shadowBlur = 10 * scale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * scale;
        ctx.strokeStyle = '#05070C';
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(text, 0, 0);
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
    const nextBox = renderSlotToCanvas(mainCanvasRef.current, activeSlot, `Вариант ${activeSlot}`);
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

  useEffect(() => {
    if (!isolatedEditing && !imgA && batchVariants[0]) {
      if (!isolatedEditing) window.selectedMasterThumbnail = batchVariants[0];
      const initImg = new Image();
      initImg.onload = () => setSlotImages(prev => ({ ...prev, A: initImg }));
      initImg.src = batchVariants[0];
    }
  }, [imgA, batchVariants, isolatedEditing]);

  const handleSelectBatchVariant = (idx: number, targetSlot: ThumbnailSlotId = activeSlot) => {
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    if(persistLocalImage(targetSlot,url))return;
    if (!isolatedEditing) window.selectedMasterThumbnail = url;
    const selectedImage = new Image();
    selectedImage.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: selectedImage }));
      onNotify(`✨ Вариант #${idx + 1} установлен на Вариант ${targetSlot}!`, 'success');
    };
    selectedImage.src = url;
  };

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
      onNotify(
        `📥 Вариант #${idx + 1} (4K PNG thumbnail_4k_${idx + 1}.png) скачан на устройство!`,
        'success'
      );
    };
    tempImg.src = url;
  };

  const handleAttachToYoutubeRelease = (idx: number) => {
    if (isolatedEditing) { onNotify('Global release attachment disabled in isolated preview', 'info'); return; }
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    setAttachedToYoutubeIdx(idx);
    if (!isolatedEditing) window.selectedMasterThumbnail = url;
    try {
      localStorage.setItem(
        'youtube_release_thumbnail',
        JSON.stringify({
          variantIndex: idx + 1,
          titleHook: [slotConfigs.A.topText, slotConfigs.A.bottomText]
            .filter(Boolean)
            .join(' ')
            .trim(),
          badges: slotConfigs.A.badgesEnabled
            ? [
                ...BADGE_PRESETS_CONFIG.filter(
                  p => slotConfigs.A.presetBadges?.[p.id]?.enabled
                ).map(p => p.text),
                ...(slotConfigs.A.customBadgeEnabled && slotConfigs.A.customBadgeText.trim()
                  ? [slotConfigs.A.customBadgeText.trim().toUpperCase()]
                  : [])
              ]
            : [],
          attachedAt: new Date().toISOString()
        })
      );
    } catch {
      /* quota */
    }
    handleSelectBatchVariant(idx, activeSlot);
    onNotify(
      `🚀 Мастер-кадр #${idx + 1} успешно привязан к YouTube релизу (Слот ${activeSlot})!`,
      'success'
    );
  };

  const handleGenerateProceduralBatchFallback = (targetSlot: ThumbnailSlotId = activeSlot) => {
    const fallbackUrls = [0, 1, 2, 3].map(idx =>
      renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, idx)
    );
    updateBatchVariantsSafely(fallbackUrls);
    setVariantLabels([...LOCAL_SCENE_LABELS]);
    setSelectedMasterVariantIdx(0);
    setLastModelUsed('HTML5 Canvas 4K (локальный генератор)');
    setGenerationError(null);
    if (!isolatedEditing) window.selectedMasterThumbnail = fallbackUrls[0];
    if(persistLocalImage(targetSlot,fallbackUrls[0]))return;
    const fallbackImg = new Image();
    fallbackImg.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: fallbackImg }));
      onNotify(`🎨 Сгенерированы 4 локальных 4K фона (16:9) для Варианта ${targetSlot}!`, 'success');
    };
    fallbackImg.src = fallbackUrls[0];
  };

  const handleSliceLocalMediaToGrid = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
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
        const dur =
          Number.isFinite(tempVideo.duration) && tempVideo.duration > 0 ? tempVideo.duration : 8;
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
        if (!slicedUrls.length) throw new Error('Не удалось извлечь кадры из видео');
        while (slicedUrls.length < 4) {
          slicedUrls.push(slicedUrls[0]);
          slicedLabels.push(`Кадр #${slicedUrls.length}`);
        }
        updateBatchVariantsSafely(slicedUrls);
        setVariantLabels(slicedLabels);
        setSelectedMasterVariantIdx(0);
        setLastModelUsed(`Видео-нарезка (${file.name})`);
        if (!isolatedEditing) window.selectedMasterThumbnail = slicedUrls[0];
        const firstImg = new Image();
        firstImg.onload = () => {if(!persistLocalImage(activeSlot,slicedUrls[0]))setSlotImages(prev=>({...prev,[activeSlot]:firstImg}));};
        firstImg.src = slicedUrls[0];
        onNotify(
          `🎬 Из видео «${file.name}» нарезано 4 варианта превью (16:9) в сетку 2×2!`,
          'success'
        );
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
          {
            label: 'Крупный фокус (1.24×)',
            zoom: 1.24,
            ox: -0.04,
            oy: -0.02,
            filter: 'contrast(1.12) saturate(1.1)',
            tint: ''
          },
          {
            label: 'Холодный Mystery-грейд',
            zoom: 1.14,
            ox: 0.05,
            oy: 0.02,
            filter: 'contrast(1.18) brightness(0.92)',
            tint: 'rgba(14, 165, 233, 0.16)'
          },
          {
            label: 'Янтарный драматик HDR',
            zoom: 1.18,
            ox: 0,
            oy: 0.03,
            filter: 'contrast(1.22) saturate(1.2)',
            tint: 'rgba(245, 158, 11, 0.16)'
          }
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
        if (!isolatedEditing) window.selectedMasterThumbnail = slicedUrls[0];
        const firstImg = new Image();
        firstImg.onload = () => {if(!persistLocalImage(activeSlot,slicedUrls[0]))setSlotImages(prev=>({...prev,[activeSlot]:firstImg}));};
        firstImg.src = slicedUrls[0];
        onNotify(
          `🖼️ Из изображения «${file.name}» созданы 4 варианта превью (16:9) в сетку 2×2!`,
          'success'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка обработки локального файла';
      onNotify(msg, 'error');
    } finally {
      setIsSlicingLocalMedia(false);
    }
  };

  const handleGenerateFluxCover = async (targetSlot: ThumbnailSlotId = activeSlot) => {
    if (isolatedEditing) { onNotify('External generation disabled in isolated preview', 'info'); return; }
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
      setVariantLabels([
        'Flux #1 (1344×768)',
        'Flux #2 (1344×768)',
        'Flux #3 (1344×768)',
        'Flux #4 (1344×768)'
      ]);
      setSelectedMasterVariantIdx(0);
      setLastModelUsed(result.modelUsed);
      if (!isolatedEditing) window.selectedMasterThumbnail = paddedUrls[0];
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
      if (err instanceof FluxGenerationError && err.status === 499) onNotify(msg, 'info');
      else onNotify(msg, 'error');
    } finally {
      setIsGeneratingCovers(false);
      setGeneratingTargetSlot(null);
      setGenerationStatusText('');
      setButtonQueueStatus('');
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
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
    if(isolatedEditing&&onProjectImageFile){e.target.value='';onProjectImageFile(slot,file);return;}
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          setSlotImages(prev => ({ ...prev, [slot]: img }));
          if (slot === 'A') if (!isolatedEditing) window.selectedMasterThumbnail = result;
          onNotify(`Изображение загружено в Вариант ${slot}!`, 'success');
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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
    if (videoRef.current) videoRef.current.currentTime = clamped;
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
    if(persistLocalImage(targetSlot,dataUrl))return;
    const capturedImg = new Image();
    capturedImg.onload = () => {
      setSlotImages(prev => ({ ...prev, [targetSlot]: capturedImg }));
      setActiveSlot(targetSlot);
      if (targetSlot === 'A') if (!isolatedEditing) window.selectedMasterThumbnail = dataUrl;
      onNotify(
        `📸 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) установлен на Вариант ${targetSlot}!`,
        'success'
      );
    };
    capturedImg.src = dataUrl;
  };

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
      if(persistLocalImage(slotToUpdate,url)){setBaseResolutionPreset(presetKey);return;}
      setSlotImages(prev => ({ ...prev, [slotToUpdate]: nextImg }));
      if (slotToUpdate === 'A') if (!isolatedEditing) window.selectedMasterThumbnail = url;
      setBaseResolutionPreset(presetKey);
      onNotify(
        `🔍 Кадр Варианта ${slotToUpdate} приведён к ${targetW}×${targetH} px (High-Quality Canvas)`,
        'success'
      );
    });
  };

  const buildFullResThumbnailCanvas = (slot: ThumbnailSlotId): HTMLCanvasElement => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 3840;
    offscreen.height = 2160;
    renderSlotToCanvas(offscreen, slot);
    return offscreen;
  };

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
        /* unavailable */
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
      setLastExportReport(prev => ({ ...prev, [slot]: { formatLabel, filename, sizeText } }));
      onNotify(`✅ ${filename} скачан • ${sizeText}`, 'success');
    } finally {
      setIsExportingFormat(null);
    }
  };

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

  const copyCoverPromptForWebGenerator = () => {
    navigator.clipboard.writeText(activePromptText);
    setCopiedPrompt(true);
    onNotify(
      '📋 Промпт скопирован для вставки в веб-генератор (Leonardo.ai / Midjourney / Kling)!',
      'success'
    );
    window.setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const enabledPresetsCount = BADGE_PRESETS_CONFIG.filter(
    p => activeConfig.presetBadges?.[p.id]?.enabled
  ).length;
  const normalizedFilter = badgeFilterQuery.trim().toUpperCase();
  const baseGroupPresets = BADGE_PRESETS_CONFIG.filter(
    p => p.group === 'base' && (!normalizedFilter || p.text.includes(normalizedFilter))
  );
  const ambienceGroupPresets = BADGE_PRESETS_CONFIG.filter(
    p => p.group === 'ambience_3h' && (!normalizedFilter || p.text.includes(normalizedFilter))
  );

  const renderPresetCard = (preset: BadgePresetConfig) => {
    const itemState = activeConfig.presetBadges?.[preset.id] || {
      enabled: false,
      position: 'left' as BadgePosition
    };
    const isEnabled = Boolean(itemState.enabled);
    const pos: BadgePosition = itemState.position === 'right' ? 'right' : 'left';
    return (
      <div
        key={`badge-preset-${activeSlot}-${preset.id}`}
        className={`rounded-xl p-2 bg-[#090D16] border transition space-y-1.5 ${
          isEnabled
            ? 'border-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.14)]'
            : 'border-white/[0.08] opacity-85 hover:opacity-100'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={`text-[10px] font-extrabold uppercase tracking-wider truncate ${
              isEnabled ? 'text-[#FACC15]' : 'text-white/75'
            }`}
            title={preset.text}
          >
            {preset.text}
          </span>
          <button
            type="button"
            aria-pressed={isEnabled}
            onClick={() =>
              updateSlotConfig(activeSlot, prev => {
                const cur = prev.presetBadges?.[preset.id] || {
                  enabled: false,
                  position: 'left' as BadgePosition
                };
                return {
                  ...prev,
                  presetBadges: {
                    ...prev.presetBadges,
                    [preset.id]: { ...cur, enabled: !cur.enabled }
                  }
                };
              })
            }
            className={`min-h-[24px] px-2 py-0.5 rounded-md border text-[9.5px] font-bold shrink-0 cursor-pointer transition ${
              isEnabled
                ? 'bg-amber-400/20 border-amber-400/70 text-[#FACC15]'
                : 'bg-[#0b0f19] border-white/[0.1] text-white/50 hover:text-white'
            }`}
          >
            {isEnabled ? 'Вкл' : 'Выкл'}
          </button>
        </div>
        <div
          role="group"
          aria-label={`Позиция бейджа ${preset.text}`}
          className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0b0f19] border border-white/[0.06]"
        >
          {([{ value: 'left', label: 'Слева' }, { value: 'right', label: 'Справа' }] as const).map(
            opt => {
              const isSelected = pos === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    updateSlotConfig(activeSlot, prev => {
                      const cur = prev.presetBadges?.[preset.id] || {
                        enabled: false,
                        position: 'left' as BadgePosition
                      };
                      return {
                        ...prev,
                        presetBadges: {
                          ...prev.presetBadges,
                          [preset.id]: { ...cur, position: opt.value }
                        }
                      };
                    })
                  }
                  className={`min-h-[24px] px-1.5 py-0.5 rounded-md text-[9.5px] font-bold cursor-pointer transition ${
                    isSelected
                      ? 'bg-amber-400/20 border border-amber-400/60 text-[#FACC15]'
                      : 'border border-transparent text-white/50 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            }
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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

          <div className="aether-card rounded-2xl p-4 space-y-3 border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-[#0f1623]/90 to-cyan-500/[0.05]">
            <div className="flex items-center justify-between text-[11px] gap-2">
              <span className="font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-1.5">
                {isCloudflareConfigured ? (
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                {isCloudflareConfigured ? 'Cloudflare Flux (2×2)' : 'Flux.1 AI Horde (2×2)'}
              </span>
              <span className="font-mono text-[10px] text-white/55">1344×768 → 4K UHD</span>
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
                      disabled={isolatedEditing} onChange={e => setCfAccountId(e.target.value)}
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
                      disabled={isolatedEditing} onChange={e => setCfApiToken(e.target.value)}
                      placeholder="Bearer API Token"
                      className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono text-[#f8fafc] outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10px] text-white/55 leading-tight font-mono">
                      sessionStorage • токен стирается при закрытии вкладки
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

          <div className="aether-card rounded-2xl p-4 space-y-4 border border-white/[0.08] bg-[#0b0f19]/90 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Type className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#f8fafc] block truncate">
                    Documentary Impact
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
                title="Разделить текущее название проекта на Строку 1 и Строку 2"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Из проекта</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-white/60">
                  Свой фон для Варианта {activeSlot}:
                </label>
                {(isolatedEditing || activeSlot !== 'A') && slotImages[activeSlot] && (
                  <button
                    type="button"
                    disabled={isolatedEditing&&!onProjectImageRemove}
                    aria-label={isolatedEditing?'Remove native thumbnail '+activeSlot:undefined}
                    onClick={() => {
                      if(isolatedEditing){onProjectImageRemove?.(activeSlot);return;}
                      setSlotImages(prev => ({ ...prev, [activeSlot]: null }));
                      onNotify(
                        `Фон Варианта ${activeSlot} сброшен на общий фон Слота A.`,
                        'info'
                      );
                    }}
                    className="text-[10px] text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                  >
                    {isolatedEditing&&activeSlot==='A'?'Удалить фон A':'Использовать фон A'}
                  </button>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                aria-label="Native thumbnail background" onChange={e => handleLoadImageForSlot(e, activeSlot)}
                className="w-full text-xs text-white/60 file:mr-3 file:min-h-[36px] file:py-1.5 file:px-3 file:rounded-xl file:border file:border-white/[0.1] file:text-xs file:font-bold file:bg-[#111827] file:text-amber-300 hover:file:bg-white/[0.1] cursor-pointer"
              />
            </div>

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
                          updateSlotConfig(activeSlot, prev => ({ ...prev, topColor: swatch.id }))
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
                      updateSlotConfig(activeSlot, prev => ({ ...prev, topColor: e.target.value }))
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
                  ]
                    .filter(Boolean)
                    .map(swatch => {
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

            <div className="rounded-xl p-3.5 space-y-3 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Композиция и позиция заголовка</span>
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
                            hookLayout: { ...prev.hookLayout, xPct: corner.x, yPct: corner.y }
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
            </div>

            <div className="rounded-xl p-3.5 space-y-3 bg-[#111827]/80 border border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f8fafc] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Верхние капсулы-бейджи ({activeSlot})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-mono font-bold text-[#FACC15] bg-[#090D16] border border-amber-400/35 px-2 py-0.5 rounded-md tabular-nums">
                    Включено: {enabledPresetsCount} / 20
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
              </div>

              {activeConfig.badgesEnabled && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={badgeFilterQuery}
                      onChange={e => setBadgeFilterQuery(e.target.value)}
                      placeholder="Фильтр бейджей…"
                      className="flex-1 min-h-[34px] bg-[#0b0f19] border border-white/[0.1] focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs text-[#f8fafc] placeholder:text-white/40 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSlotConfig(activeSlot, prev => {
                          const cleared: Record<string, BadgeItemState> = {};
                          for (const p of BADGE_PRESETS_CONFIG) {
                            const oldItem = prev.presetBadges?.[p.id];
                            cleared[p.id] = {
                              enabled: false,
                              position: oldItem?.position === 'right' ? 'right' : 'left'
                            };
                          }
                          return {
                            ...prev,
                            presetBadges: cleared,
                            customBadgeEnabled: false
                          };
                        })
                      }
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0b0f19] hover:bg-rose-950/35 border border-white/[0.1] hover:border-rose-500/45 text-[10.5px] font-bold text-white/75 hover:text-rose-200 shrink-0 cursor-pointer transition"
                    >
                      Выключить все
                    </button>
                  </div>

                  {baseGroupPresets.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                        База
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {baseGroupPresets.map(renderPresetCard)}
                      </div>
                    </div>
                  )}

                  {ambienceGroupPresets.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
                        Ambience · 3 часа
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ambienceGroupPresets.map(renderPresetCard)}
                      </div>
                    </div>
                  )}

                  {baseGroupPresets.length === 0 && ambienceGroupPresets.length === 0 && (
                    <div className="text-center py-3 text-[11px] text-white/45 bg-[#090D16] rounded-xl border border-white/[0.06]">
                      Нет бейджей, подходящих под «{badgeFilterQuery}»
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                        Свой кастомный бейдж
                      </span>
                      <button
                        type="button"
                        aria-pressed={activeConfig.customBadgeEnabled}
                        onClick={() =>
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            customBadgeEnabled: !prev.customBadgeEnabled
                          }))
                        }
                        className={`min-h-[24px] px-2 py-0.5 rounded-md border text-[9.5px] font-bold cursor-pointer transition ${
                          activeConfig.customBadgeEnabled
                            ? 'bg-amber-400/20 border-amber-400/70 text-[#FACC15]'
                            : 'bg-[#0b0f19] border-white/[0.1] text-white/50 hover:text-white'
                        }`}
                      >
                        {activeConfig.customBadgeEnabled ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={activeConfig.customBadgeText}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          updateSlotConfig(activeSlot, prev => ({
                            ...prev,
                            customBadgeText: val,
                            customBadgeEnabled:
                              val.trim().length > 0 ? true : prev.customBadgeEnabled
                          }));
                        }}
                        placeholder="СВОЙ ТЕКСТ КАПСУЛЫ..."
                        className="flex-1 min-h-[34px] bg-[#090D16] border border-[#F59E0B]/45 focus:border-[#F59E0B] rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold tracking-wider uppercase text-[#FACC15] outline-none"
                      />
                      <div
                        role="group"
                        aria-label="Позиция кастомного бейджа"
                        className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#090D16] border border-white/[0.08] shrink-0 sm:w-36"
                      >
                        {(
                          [
                            { value: 'left', label: 'Слева' },
                            { value: 'right', label: 'Справа' }
                          ] as const
                        ).map(opt => {
                          const isSelected = activeConfig.customBadgePosition === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() =>
                                updateSlotConfig(activeSlot, prev => ({
                                  ...prev,
                                  customBadgePosition: opt.value
                                }))
                              }
                              className={`min-h-[26px] px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition ${
                                isSelected
                                  ? 'bg-amber-400/20 border border-amber-400/60 text-[#FACC15]'
                                  : 'border border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                    <span className="tabular-nums">
                      {res.w}×{res.h}
                    </span>
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

            <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#f8fafc] flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>☀️ Контраст и яркость кадра</span>
                </span>
                <span className="text-[10px] font-mono text-amber-300/90">Слот {activeSlot}</span>
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
                  onClick={() =>
                    updateSlotConfig(activeSlot, prev => ({
                      ...prev,
                      bgAdjust: { ...DEFAULT_BG_ADJUST }
                    }))
                  }
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
                    <span className="text-white/80 font-semibold">Яркость и подсветка бликов</span>
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
                    <span className="text-white/80 font-semibold">Мягкая сочность (Vibrance)</span>
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
                  Применяется 100% локально на Canvas только к фону слота {activeSlot} — заголовки и
                  бейджи сохраняют исходную чёткость.
                </p>
              </div>
            </div>
          </div>

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
                  {lastExportReport[activeSlot]?.formatLabel}:{' '}
                  {lastExportReport[activeSlot]?.sizeText}
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
                      title="End Screen рассчитывается от реальной длительности проекта (последние 5–20 с)"
                    >
                      End Screen: {effectiveEndScreenSafeZone} {showEndScreenSafeZone ? 'ON' : 'OFF'}
                    </button>
                    <span className="text-[11px] font-mono text-white/55 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full">
                      3840×2160 • 16:9
                    </span>
                  </div>
                </div>

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
                    {showEndScreenSafeZone && (
                      <div className="pointer-events-none absolute inset-0 z-10">
                        <div className="absolute inset-[5%] border border-dashed border-emerald-400/35 rounded-lg" />
                        <div className="absolute right-[6%] bottom-[16%] w-[30%] h-[30%] rounded-lg border border-dashed border-cyan-300/65 bg-cyan-500/10 flex flex-col items-center justify-center text-center p-1">
                          <span className="text-[9px] font-mono font-bold text-cyan-200 uppercase">
                            End Screen Card
                          </span>
                          <span className="text-[8px] font-mono text-cyan-300/80">
                            {effectiveEndScreenSafeZone}
                          </span>
                        </div>
                        <div className="absolute left-[6%] bottom-[16%] w-[30%] h-[30%] rounded-lg border border-dashed border-cyan-300/45 bg-cyan-500/5 flex flex-col items-center justify-center text-center p-1">
                          <span className="text-[9px] font-mono font-bold text-cyan-200/85 uppercase">
                            Next Video Slot
                          </span>
                        </div>
                        <div className="absolute top-2.5 left-2.5 bg-[#0b0f19]/85 backdrop-blur-md border border-emerald-400/40 text-emerald-300 font-mono text-[9.5px] px-2 py-0.5 rounded-md">
                          Safe-Zone • End Screen {effectiveEndScreenSafeZone}
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
                          {youtubeDurationBadge}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {activeHookBox && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/55 px-1">
                    <span className="flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Перетащите заголовок Варианта {activeSlot} мышью или пальцем по кадру
                      </span>
                    </span>
                    <span className="font-mono text-amber-300/90 tabular-nums">
                      X:{Math.round(activeConfig.hookLayout.xPct)}% • Y:
                      {Math.round(activeConfig.hookLayout.yPct)}% • S1:
                      {activeConfig.hookLayout.topScalePct}% / S2:
                      {activeConfig.hookLayout.bottomScalePct}%
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
                        <span className="text-[10px] bg-white/10 text-white/80 px-1.5 rounded-full">
                          ✓
                        </span>
                        <span className="font-mono text-[11px]">
                          • 428K views • 2h ago • Слот {activeSlot}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
                            isCurrent ? item.borderActive : 'border-white/[0.08] hover:border-white/25'
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
                              {youtubeDurationBadge}
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
                            {youtubeDurationBadge}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <span className="text-[10.5px] font-mono font-bold text-amber-300 block">
                            {item.tag} •{' '}
                            {slotConfigs[item.slot].badgesEnabled
                              ? BADGE_PRESETS_CONFIG.filter(
                                  p => slotConfigs[item.slot].presetBadges?.[p.id]?.enabled
                                ).length +
                                (slotConfigs[item.slot].customBadgeEnabled &&
                                slotConfigs[item.slot].customBadgeText.trim()
                                  ? 1
                                  : 0)
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
                  {youtubeDurationBadge}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#f8fafc] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Мобильный масштаб • Слот {activeSlot} (160×90 px)</span>
                </span>
                <p className="text-xs text-white/55 max-w-md leading-relaxed">
                  Контроль читаемости заголовка, верхнего ряда бейджей и таймкода{' '}
                  <code className="font-mono text-amber-300">{youtubeDurationBadge}</code> в ленте
                  смартфона.
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

      <div className="aether-surface rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <Grid className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-[#f8fafc] uppercase tracking-wider">
                Галерея сцен и обложек 2×2 (Flux.1 • 16:9)
              </h3>
              <p className="text-xs text-white/55">
                Выберите любую карточку для установки в мастер-слот (window.selectedMasterThumbnail)
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
          <div
            id="flux-thumbnails-grid-container"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full my-4"
          >
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
                  <div className="p-3 bg-[#0f1623]/90 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs min-w-0">
                      <span className="font-mono font-bold text-[#f8fafc] shrink-0">
                        #{index + 1}
                      </span>
                      <span
                        className="text-[11px] text-white/55 truncate max-w-[180px]"
                        title={sceneLabel}
                      >
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
                        <span>{isAttached ? '✓ В релизе' : 'В релиз'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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
              <span className="text-[11px] font-mono text-amber-300/85">3840×2160</span>
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
                      onLoadedMetadata={e => setVideoDuration(e.currentTarget.duration || 10)}
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
              <span className="text-[11px] font-mono text-emerald-300/85">PROMPT LAB</span>
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
