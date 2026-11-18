/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SlotBgAdjustConfig {
  contrastPct: number;
  brightnessPct: number;
  vibrancePct: number;
}

export const DEFAULT_BG_ADJUST: SlotBgAdjustConfig = {
  contrastPct: 100,
  brightnessPct: 100,
  vibrancePct: 100
};

export const YOUTUBE_CINEMA_BG_ADJUST: SlotBgAdjustConfig = {
  contrastPct: 128,
  brightnessPct: 106,
  vibrancePct: 110
};

export type SplashShapeId =
  | 'monolith_bristle'
  | 'jagged_splash'
  | 'bottom_slash'
  | 'double_strokes'
  | 'distressed_grunge'
  | 'tapered_speed'
  | 'none';

export type SplashColorPresetId = 'red' | 'charcoal' | 'gold' | 'custom' | 'none';

export type CornerPositionPresetId = 'top_left' | 'bottom_right' | 'bottom_left';

export interface LineColorSwatch {
  id: string;
  label: string;
}

export const LINE_COLOR_SWATCHES: LineColorSwatch[] = [
  { id: '#FFFFFF', label: 'Белый' },
  { id: '#FFD600', label: 'Жёлтый' },
  { id: '#EF4444', label: 'Алый' },
  { id: '#38BDF8', label: 'Голубой' },
  { id: '#F97316', label: 'Оранжевый' }
];

export interface SplashShapeOption {
  id: SplashShapeId;
  label: string;
  subtitle: string;
}

export const SPLASH_SHAPE_OPTIONS: SplashShapeOption[] = [
  {
    id: 'monolith_bristle',
    label: 'Широкая сухая кисть',
    subtitle: 'Monolith Bristle'
  },
  {
    id: 'jagged_splash',
    label: 'Рваный агрессивный мазок',
    subtitle: 'Jagged Splash'
  },
  {
    id: 'bottom_slash',
    label: 'Нижний акцентный росчерк',
    subtitle: 'Bottom Slash'
  },
  {
    id: 'double_strokes',
    label: 'Двойной раздельный мазок',
    subtitle: 'Double Strokes'
  },
  {
    id: 'distressed_grunge',
    label: 'Фактурная потёртая кисть',
    subtitle: 'Distressed Grunge'
  },
  {
    id: 'tapered_speed',
    label: 'Клиновидный росчерк',
    subtitle: 'Tapered Speed Brush'
  },
  {
    id: 'none',
    label: 'Без подложки',
    subtitle: 'None'
  }
];

export interface SplashColorSwatch {
  id: string;
  label: string;
  mainColor: string;
  edgeColor: string;
}

export const SPLASH_COLOR_SWATCHES: SplashColorSwatch[] = [
  {
    id: 'crimson_brand',
    label: 'Фирменный алый',
    mainColor: '#E10613',
    edgeColor: '#8A0009'
  },
  {
    id: 'dark_carmine',
    label: 'Тёмный кармин',
    mainColor: '#B91C1C',
    edgeColor: '#580606'
  },
  {
    id: 'coal_black',
    label: 'Угольно-чёрный',
    mainColor: '#18181B',
    edgeColor: '#09090B'
  },
  {
    id: 'amber_gold',
    label: 'Янтарно-золотой',
    mainColor: '#D97706',
    edgeColor: '#78350F'
  },
  {
    id: 'cobalt_blue',
    label: 'Кобальтово-синий',
    mainColor: '#1D4ED8',
    edgeColor: '#1E3A8A'
  }
];

export const DEFAULT_BADGE_CAPSULES: [string, string, string] = [
  '4K ULTRA HD',
  'DOCUMENTARY',
  'TRUE STORY'
];

/**
 * Динамически разделяет заголовок текущего проекта из состояния студии на две ударные строки
 * (без хардкода конкретных названий видеороликов).
 */
export function splitProjectTitleIntoTwoLines(rawTitle: string): {
  line1: string;
  line2: string;
} {
  const cleaned = (rawTitle || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return { line1: '', line2: '' };
  }

  // Если есть явный разделитель двоеточие / тире / слэш — берём первую часть для чистого хука
  const colonSplit = cleaned.split(/\s*[:|—]\s*/).filter(Boolean);
  const candidate =
    colonSplit.length > 1 && colonSplit[0].split(/\s+/).length >= 2
      ? colonSplit[0].trim()
      : cleaned;

  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return { line1: '', line2: '' };
  if (words.length === 1) return { line1: words[0].toUpperCase(), line2: '' };
  if (words.length === 2) {
    return {
      line1: words[0].toUpperCase(),
      line2: words[1].toUpperCase()
    };
  }

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

  return {
    line1: words.slice(0, bestSplit).join(' ').toUpperCase(),
    line2: words.slice(bestSplit).join(' ').toUpperCase()
  };
}

/**
 * Локальная обработка фонового изображения (Контраст, Яркость, Мягкая сочность/Vibrance, Резкость 3x3)
 * строго на HTML5 Canvas без воздействия на заголовки и верхние бейджи.
 */
export function renderAdjustedBackgroundToCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  bgAdjust: SlotBgAdjustConfig,
  baseSharpenPercent: number,
  drawCoverImageFn: (
    targetCtx: CanvasRenderingContext2D,
    source: HTMLImageElement | HTMLVideoElement,
    srcW: number,
    srcH: number,
    destW: number,
    destH: number,
    zoom?: number
  ) => void
): void {
  const contrastPct = bgAdjust?.contrastPct ?? 100;
  const brightnessPct = bgAdjust?.brightnessPct ?? 100;
  const vibrancePct = bgAdjust?.vibrancePct ?? 100;

  const hasColorAdjust =
    Math.abs(contrastPct - 100) > 0.1 ||
    Math.abs(brightnessPct - 100) > 0.1 ||
    Math.abs(vibrancePct - 100) > 0.1;

  if (!hasColorAdjust && baseSharpenPercent <= 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCoverImageFn(
      ctx,
      image,
      image.naturalWidth || w,
      image.naturalHeight || h,
      w,
      h,
      1
    );
    return;
  }

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = w;
  bgCanvas.height = h;
  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
  if (!bgCtx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCoverImageFn(
      ctx,
      image,
      image.naturalWidth || w,
      image.naturalHeight || h,
      w,
      h,
      1
    );
    return;
  }

  bgCtx.imageSmoothingEnabled = true;
  bgCtx.imageSmoothingQuality = 'high';
  drawCoverImageFn(
    bgCtx,
    image,
    image.naturalWidth || w,
    image.naturalHeight || h,
    w,
    h,
    1
  );

  if (w > 2 && h > 2) {
    const imgData = bgCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    if (hasColorAdjust) {
      const contrast = contrastPct / 100;
      const brightness = brightnessPct / 100;
      const vibrance = (vibrancePct - 100) / 100;
      const len = data.length;

      for (let i = 0; i < len; i += 4) {
        let r = data[i] * brightness;
        let g = data[i + 1] * brightness;
        let b = data[i + 2] * brightness;

        if (contrast !== 1) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }

        if (vibrance !== 0) {
          const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
          const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
          const sat = Math.min(1, Math.max(0, (maxC - minC) / 255));
          const avg = (r + g + b) * 0.333333;
          const warmBias = r > b && vibrance > 0 ? 1.12 : 1.0;
          const amt =
            vibrance >= 0
              ? vibrance * (1 - sat) * 1.45 * warmBias
              : vibrance;
          r = r + (r - avg) * amt;
          g = g + (g - avg) * amt;
          b = b + (b - avg) * amt;
        }

        data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }

    if (baseSharpenPercent > 0) {
      const copy = new Uint8ClampedArray(data);
      const amount = (baseSharpenPercent / 100) * 1.35;
      const stride = w * 4;
      for (let y = 1; y < h - 1; y++) {
        const rowOff = y * stride;
        for (let x = 1; x < w - 1; x++) {
          const idx = rowOff + x * 4;
          for (let ch = 0; ch < 3; ch++) {
            const center = copy[idx + ch];
            const avgNeighbors =
              (copy[idx - 4 + ch] +
                copy[idx + 4 + ch] +
                copy[idx - stride + ch] +
                copy[idx + stride + ch]) *
              0.25;
            const sharpened = center + (center - avgNeighbors) * amount;
            data[idx + ch] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : sharpened;
          }
        }
      }
    }

    bgCtx.putImageData(imgData, 0, 0);
  }

  ctx.drawImage(bgCanvas, 0, 0);
}

function deterministicHash(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function adjustHexBrightness(hex: string, factor: number, addBias: number = 0): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const r = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(0, 2), 16) * factor + addBias))
  );
  const g = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(2, 4), 16) * factor + addBias))
  );
  const b = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(4, 6), 16) * factor + addBias))
  );
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function buildVertical3DFill(
  ctx: CanvasRenderingContext2D,
  hexColor: string,
  topY: number,
  bottomY: number,
  useSubtle3DGradient: boolean
): string | CanvasGradient {
  const normalized = (hexColor || '#FFFFFF').trim().toUpperCase();
  if (!useSubtle3DGradient) return normalized;

  const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
  if (normalized === '#FFD600') {
    grad.addColorStop(0.0, '#FFF176');
    grad.addColorStop(0.45, '#FFD600');
    grad.addColorStop(1.0, '#E09600');
  } else {
    grad.addColorStop(0.0, adjustHexBrightness(normalized, 1.18));
    grad.addColorStop(0.48, normalized);
    grad.addColorStop(1.0, adjustHexBrightness(normalized, 0.78));
  }
  return grad;
}

export interface ResolvedSplashColorPalette {
  coreColor: string;
  mainColor: string;
  edgeColor: string;
  deepColor: string;
}

/**
 * Автоматически рассчитывает объёмный градиент и внутреннюю глубину
 * от любого выбранного пользователем цвета (основной тон в центре + глубокий оттенок по краям).
 */
export function resolveSplashColorPalette(hexColor: string): ResolvedSplashColorPalette {
  const normalized = /^#[0-9a-fA-F]{6}$/.test((hexColor || '').trim())
    ? hexColor.trim().toUpperCase()
    : '#E10613';

  const preset = SPLASH_COLOR_SWATCHES.find(s => s.mainColor.toUpperCase() === normalized);
  if (preset) {
    return {
      coreColor:
        normalized === '#18181B'
          ? '#27272A'
          : adjustHexBrightness(preset.mainColor, 1.08, 6),
      mainColor: preset.mainColor,
      edgeColor: preset.edgeColor,
      deepColor:
        normalized === '#18181B'
          ? '#030305'
          : adjustHexBrightness(preset.edgeColor, 0.65)
    };
  }

  return {
    coreColor: adjustHexBrightness(normalized, 1.12, 10),
    mainColor: normalized,
    edgeColor: adjustHexBrightness(normalized, 0.56),
    deepColor: adjustHexBrightness(normalized, 0.34)
  };
}

export function legacyPresetToSplashColor(
  preset?: SplashColorPresetId,
  customColor?: string
): string {
  if (preset === 'charcoal') return '#18181B';
  if (preset === 'gold') return '#D97706';
  if (preset === 'custom' && customColor && /^#[0-9a-fA-F]{6}$/.test(customColor)) {
    return customColor.toUpperCase();
  }
  return '#E10613';
}

export interface UnifiedSplashDrawParams {
  shape: SplashShapeId;
  colorHex: string;
  paddingPct: number;
  shadowPct: number;
  contentW: number;
  totalTextH: number;
  hasTop: boolean;
  topYCenter: number;
  topW: number;
  topH: number;
  hasBottom: boolean;
  bottomYCenter: number;
  bottomW: number;
  bottomH: number;
  scale: number;
  seedText: string;
}

function createVolumetricBrushFill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  palette: ResolvedSplashColorPalette
): CanvasGradient {
  const rad = Math.max(halfW * 1.12, halfH * 1.4, 16);
  const grad = ctx.createRadialGradient(
    cx,
    cy - halfH * 0.14,
    rad * 0.08,
    cx,
    cy + halfH * 0.18,
    rad
  );
  grad.addColorStop(0.0, palette.coreColor);
  grad.addColorStop(0.45, palette.mainColor);
  grad.addColorStop(0.84, palette.edgeColor);
  grad.addColorStop(1.0, palette.deepColor);
  return grad;
}

function applyBrushShadow(
  ctx: CanvasRenderingContext2D,
  scale: number,
  shadowMult: number
): void {
  if (shadowMult <= 0.01) {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  const alpha = Math.min(0.98, 0.52 + 0.42 * shadowMult);
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha.toFixed(2)})`;
  ctx.shadowBlur = (26 * shadowMult + 6) * scale;
  ctx.shadowOffsetX = 4 * scale * Math.min(1.4, shadowMult);
  ctx.shadowOffsetY = (9 * shadowMult + 2) * scale;
}

function clearBrushShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Рисует органичный векторный путь мазка через кривые Безье и щетину по торцам.
 */
function traceSmoothBristleRectPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  scale: number,
  seed: number,
  opts: {
    bristleReach: number;
    edgeRoughness: number;
    bristleCount: number;
    skewRightY?: number;
  }
): void {
  const segs = 12;
  const skewY = opts.skewRightY ?? 0;

  const topPts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = cx - hw + t * hw * 2;
    const slopeOffset = (t - 0.5) * skewY;
    const wave =
      Math.sin(t * Math.PI * 3.4 + seed * 0.27) * (2.6 * scale) +
      (deterministicHash(seed + i * 17) - 0.5) * opts.edgeRoughness * scale;
    topPts.push({ x, y: cy - hh + wave + slopeOffset });
  }

  const botPts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = cx - hw + t * hw * 2;
    const slopeOffset = (t - 0.5) * skewY;
    const wave =
      Math.cos(t * Math.PI * 2.9 + seed * 0.41) * (2.8 * scale) +
      (deterministicHash(seed + i * 23 + 91) - 0.5) * opts.edgeRoughness * scale;
    botPts.push({ x, y: cy + hh + wave + slopeOffset });
  }

  ctx.beginPath();
  ctx.moveTo(topPts[0].x, topPts[0].y);
  for (let i = 1; i < topPts.length; i++) {
    const prev = topPts[i - 1];
    const curr = topPts[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.lineTo(topPts[topPts.length - 1].x, topPts[topPts.length - 1].y);

  // Правая сторона с щетинистыми зубцами
  const rTopY = topPts[topPts.length - 1].y;
  const rBotY = botPts[botPts.length - 1].y;
  for (let b = 0; b < opts.bristleCount; b++) {
    const t0 = b / opts.bristleCount;
    const t1 = (b + 0.52) / opts.bristleCount;
    const by0 = rTopY + t0 * (rBotY - rTopY);
    const by1 = rTopY + t1 * (rBotY - rTopY);
    const outX =
      cx + hw + (0.28 + deterministicHash(seed + b * 19 + 5) * 0.72) * opts.bristleReach;
    const inX = cx + hw - (2 + deterministicHash(seed + b * 31 + 11) * 9) * scale;
    ctx.lineTo(outX, by0 + (by1 - by0) * 0.25);
    ctx.quadraticCurveTo(outX * 0.2 + inX * 0.8, by1, inX, by1);
  }
  ctx.lineTo(botPts[botPts.length - 1].x, botPts[botPts.length - 1].y);

  // Нижняя кромка справа налево через Bezier
  for (let i = botPts.length - 2; i >= 0; i--) {
    const prev = botPts[i + 1];
    const curr = botPts[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.lineTo(botPts[0].x, botPts[0].y);

  // Левая сторона с щетинистыми зубцами
  const lTopY = topPts[0].y;
  const lBotY = botPts[0].y;
  for (let b = opts.bristleCount - 1; b >= 0; b--) {
    const t0 = (b + 0.5) / opts.bristleCount;
    const t1 = b / opts.bristleCount;
    const by0 = lTopY + t0 * (lBotY - lTopY);
    const by1 = lTopY + t1 * (lBotY - lTopY);
    const outX =
      cx - hw - (0.28 + deterministicHash(seed + b * 29 + 13) * 0.72) * opts.bristleReach;
    const inX = cx - hw + (2 + deterministicHash(seed + b * 37 + 19) * 9) * scale;
    ctx.lineTo(outX, by0 - (by0 - by1) * 0.25);
    ctx.quadraticCurveTo(outX * 0.2 + inX * 0.8, by1, inX, by1);
  }
  ctx.closePath();
}

function drawHorizontalBristleFibers(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  scale: number,
  seed: number,
  palette: ResolvedSplashColorPalette,
  countPerSide: number,
  maxReach: number
): void {
  ctx.save();
  for (let i = 0; i < countPerSide; i++) {
    const normY = (i + 0.5) / countPerSide - 0.5;
    const fy = cy + normY * hh * 1.65;
    const side = i % 2 === 0 ? 1 : -1;

    // Тёмные и светлые волокна щетины с правого и левого краёв
    for (const dir of [1, -1]) {
      const reach = (0.35 + deterministicHash(seed + i * 41 + dir * 7) * 0.65) * maxReach;
      const startX = cx + dir * (hw - 12 * scale);
      const tipX = cx + dir * (hw + reach);
      const thick = (1.6 + deterministicHash(seed + i * 53 + dir * 3) * 3.8) * scale;
      const curveY = fy + side * (2 + deterministicHash(seed + i * 17) * 4) * scale;

      ctx.fillStyle = i % 3 === 0 ? palette.edgeColor : palette.mainColor;
      ctx.globalAlpha = 0.65 + deterministicHash(seed + i * 29) * 0.3;
      ctx.beginPath();
      ctx.moveTo(startX, fy - thick * 0.6);
      ctx.quadraticCurveTo((startX + tipX) * 0.55, curveY - thick * 0.25, tipX, curveY);
      ctx.quadraticCurveTo((startX + tipX) * 0.55, curveY + thick * 0.35, startX, fy + thick * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Процедурный векторный рендер 6 форм гранж-подложки (или 'none')
 * с детерминированным зерном (нулевое мерцание в 720p и 4K).
 */
export function drawUnifiedGrungeSplash(
  ctx: CanvasRenderingContext2D,
  params: UnifiedSplashDrawParams
): { splashW: number; splashH: number } {
  if (params.shape === 'none') {
    return {
      splashW: params.contentW + 24 * params.scale,
      splashH: params.totalTextH + 20 * params.scale
    };
  }

  const { scale } = params;
  const padMult = Math.max(0.5, Math.min(1.6, params.paddingPct / 100));
  const shadowMult = Math.max(0, Math.min(1.6, params.shadowPct / 100));
  const palette = resolveSplashColorPalette(params.colorHex);
  const seedBase =
    Array.from(`${params.shape}_${params.seedText || 'AETHER'}`).reduce(
      (acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 7),
      43
    ) || 101;

  const padX = Math.max(36 * scale, params.contentW * 0.11) * padMult;
  const padY = Math.max(18 * scale, params.totalTextH * 0.14) * padMult;
  const hw = params.contentW * 0.5 + padX;
  const hh = params.totalTextH * 0.5 + padY;

  ctx.save();

  // 1) «Широкая сухая кисть (Monolith Bristle)»
  if (params.shape === 'monolith_bristle') {
    const reach = 34 * scale * padMult;
    applyBrushShadow(ctx, scale, shadowMult);
    ctx.fillStyle = createVolumetricBrushFill(ctx, 0, 0, hw, hh, palette);
    traceSmoothBristleRectPath(ctx, 0, 0, hw, hh, scale, seedBase, {
      bristleReach: reach,
      edgeRoughness: 5.5,
      bristleCount: 10
    });
    ctx.fill();
    clearBrushShadow(ctx);

    // Внутренний слой плотной краски + выступающие горизонтальные волокна щетины
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = palette.edgeColor;
    traceSmoothBristleRectPath(ctx, 0, 2 * scale, hw - 10 * scale, hh - 7 * scale, scale, seedBase + 71, {
      bristleReach: reach * 0.72,
      edgeRoughness: 4.5,
      bristleCount: 9
    });
    ctx.fill();
    ctx.restore();

    drawHorizontalBristleFibers(ctx, 0, 0, hw, hh, scale, seedBase + 13, palette, 12, reach * 1.25);

    // Сухие продольные волокна светлого/глубокого тона внутри мазка
    ctx.save();
    ctx.lineCap = 'round';
    for (let s = 0; s < 6; s++) {
      const sy = -hh * 0.72 + s * (hh * 0.28) + (deterministicHash(seedBase + s * 11) - 0.5) * 5 * scale;
      ctx.strokeStyle = s % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.22)';
      ctx.lineWidth = (1.4 + deterministicHash(seedBase + s * 19) * 2.4) * scale;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.85, sy);
      ctx.quadraticCurveTo(0, sy + (deterministicHash(seedBase + s * 23) - 0.5) * 8 * scale, hw * 0.85, sy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
    return { splashW: (hw + reach) * 2 + 16 * scale, splashH: hh * 2 + 24 * scale };
  }

  // 2) «Рваный агрессивный мазок (Jagged Splash)»
  if (params.shape === 'jagged_splash') {
    const spikeReach = 44 * scale * padMult;
    const spikeCountTop = 14;
    applyBrushShadow(ctx, scale, shadowMult);
    ctx.fillStyle = createVolumetricBrushFill(ctx, 0, 0, hw, hh, palette);

    ctx.beginPath();
    for (let i = 0; i <= spikeCountTop; i++) {
      const t = i / spikeCountTop;
      const x = -hw + t * hw * 2;
      const spike =
        i % 2 === 0
          ? -deterministicHash(seedBase + i * 19) * 14 * scale
          : deterministicHash(seedBase + i * 29) * 9 * scale;
      const diagPull = (t - 0.5) * -8 * scale;
      const y = -hh + spike + diagPull;
      if (i === 0) ctx.moveTo(x - 16 * scale, y + 4 * scale);
      else ctx.lineTo(x, y);
    }

    // Острые диагональные выпады справа
    for (let b = 0; b < 9; b++) {
      const bt = b / 8;
      const by = -hh * 0.92 + bt * hh * 1.84;
      const outX = hw + (10 + deterministicHash(seedBase + b * 31 + 7) * spikeReach);
      const tipY = by - (6 + deterministicHash(seedBase + b * 17) * 12) * scale;
      const inX = hw - (4 + deterministicHash(seedBase + b * 43) * 18) * scale;
      ctx.lineTo(outX, tipY);
      ctx.lineTo(inX, by + hh * 0.14);
    }

    for (let i = spikeCountTop; i >= 0; i--) {
      const t = i / spikeCountTop;
      const x = -hw + t * hw * 2;
      const spike =
        i % 2 === 1
          ? deterministicHash(seedBase + i * 37 + 3) * 15 * scale
          : -deterministicHash(seedBase + i * 41 + 9) * 8 * scale;
      const diagPull = (t - 0.5) * -8 * scale;
      ctx.lineTo(x, hh + spike + diagPull);
    }

    // Острые диагональные выпады слева
    for (let b = 8; b >= 0; b--) {
      const bt = b / 8;
      const by = -hh * 0.92 + bt * hh * 1.84;
      const outX = -hw - (10 + deterministicHash(seedBase + b * 47 + 13) * spikeReach);
      const tipY = by + (6 + deterministicHash(seedBase + b * 23) * 12) * scale;
      const inX = -hw + (4 + deterministicHash(seedBase + b * 53) * 18) * scale;
      ctx.lineTo(outX, tipY);
      ctx.lineTo(inX, by - hh * 0.14);
    }
    ctx.closePath();
    ctx.fill();
    clearBrushShadow(ctx);

    // Агрессивные диагональные брызги и капли по краям
    ctx.save();
    for (let f = 0; f < 18; f++) {
      const side = f % 2 === 0 ? 1 : -1;
      const fx = side * (hw + (10 + deterministicHash(seedBase + f * 59) * (spikeReach + 16 * scale)));
      const fy = (deterministicHash(seedBase + f * 67) - 0.5) * hh * 2.05;
      const len = (8 + deterministicHash(seedBase + f * 71) * 22) * scale;
      const rad = (1.6 + deterministicHash(seedBase + f * 73) * 3.8) * scale;
      ctx.fillStyle = f % 3 === 0 ? palette.edgeColor : palette.mainColor;
      ctx.globalAlpha = 0.72 + deterministicHash(seedBase + f * 79) * 0.25;
      ctx.beginPath();
      ctx.ellipse(fx, fy, len, rad, -0.18 + (deterministicHash(seedBase + f * 13) - 0.5) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
    return { splashW: (hw + spikeReach + 16 * scale) * 2, splashH: (hh + 18 * scale) * 2 };
  }

  // 3) «Нижний акцентный росчерк (Bottom Slash)»
  if (params.shape === 'bottom_slash') {
    const activeW = params.hasBottom ? params.bottomW : params.topW;
    const activeH = params.hasBottom ? params.bottomH : params.topH;
    const activeCy = params.hasBottom ? params.bottomYCenter : params.topYCenter;

    // Мягкое тёмное свечение под верхней строкой (если она есть)
    if (params.hasTop && params.hasBottom) {
      const glowW = Math.max(120 * scale, params.topW * 0.68 + 60 * scale);
      const glowH = Math.max(48 * scale, params.topH * 1.15);
      const glowAlpha = Math.min(0.85, 0.36 + 0.34 * shadowMult);
      ctx.save();
      ctx.translate(0, params.topYCenter);
      ctx.scale(1, glowH / Math.max(1, glowW));
      const darkSpot = ctx.createRadialGradient(0, 0, glowW * 0.12, 0, 0, glowW);
      darkSpot.addColorStop(0, `rgba(0, 0, 0, ${glowAlpha.toFixed(2)})`);
      darkSpot.addColorStop(0.65, `rgba(0, 0, 0, ${(glowAlpha * 0.45).toFixed(2)})`);
      darkSpot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = darkSpot;
      ctx.beginPath();
      ctx.arc(0, 0, glowW, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Скошенный мазок с заострёнными рваными концами строго под нижней строкой
    const slashHalfW = activeW * 0.5 + Math.max(42 * scale, activeW * 0.12) * padMult;
    const slashHalfH = activeH * 0.5 + Math.max(15 * scale, activeH * 0.22) * padMult;
    const slashTip = 46 * scale * padMult;
    const slantShift = -8 * scale;

    applyBrushShadow(ctx, scale, shadowMult);
    ctx.fillStyle = createVolumetricBrushFill(ctx, 0, activeCy, slashHalfW, slashHalfH, palette);
    ctx.beginPath();
    ctx.moveTo(-slashHalfW - slashTip, activeCy + slantShift * 0.4 + 4 * scale);
    ctx.quadraticCurveTo(
      -slashHalfW * 0.45,
      activeCy - slashHalfH * 1.08 + slantShift * 0.5,
      0,
      activeCy - slashHalfH * 0.96
    );
    ctx.quadraticCurveTo(
      slashHalfW * 0.55,
      activeCy - slashHalfH * 0.92 - slantShift * 0.5,
      slashHalfW + slashTip * 1.05,
      activeCy - slantShift * 0.8 - 2 * scale
    );
    // Правые рваные заострённые концы
    ctx.lineTo(slashHalfW + slashTip * 0.35, activeCy + slashHalfH * 0.28);
    ctx.lineTo(slashHalfW + slashTip * 0.85, activeCy + slashHalfH * 0.62);
    ctx.quadraticCurveTo(
      slashHalfW * 0.35,
      activeCy + slashHalfH * 1.12,
      -slashHalfW * 0.2,
      activeCy + slashHalfH * 0.98
    );
    ctx.quadraticCurveTo(
      -slashHalfW * 0.72,
      activeCy + slashHalfH * 0.95,
      -slashHalfW - slashTip * 0.55,
      activeCy + slashHalfH * 0.42
    );
    ctx.lineTo(-slashHalfW - slashTip * 0.15, activeCy + 2 * scale);
    ctx.closePath();
    ctx.fill();
    clearBrushShadow(ctx);

    drawHorizontalBristleFibers(
      ctx,
      0,
      activeCy,
      slashHalfW * 0.95,
      slashHalfH * 0.8,
      scale,
      seedBase + 55,
      palette,
      7,
      slashTip * 0.95
    );

    ctx.restore();
    return {
      splashW: Math.max(params.contentW, (slashHalfW + slashTip) * 2) + 20 * scale,
      splashH: params.totalTextH + padY * 2 + 20 * scale
    };
  }

  // 4) «Двойной раздельный мазок (Double Strokes)»
  if (params.shape === 'double_strokes') {
    const reach = 28 * scale * padMult;
    const strokePadX = Math.max(30 * scale, params.contentW * 0.085) * padMult;
    const strokePadY = Math.max(12 * scale, params.totalTextH * 0.09) * padMult;

    let maxSpanW = params.contentW + 30 * scale;

    if (params.hasTop) {
      const hw1 = params.topW * 0.5 + strokePadX;
      const hh1 = params.topH * 0.5 + strokePadY;
      const offX1 = params.hasBottom ? -12 * scale * padMult : 0;
      maxSpanW = Math.max(maxSpanW, (hw1 + reach + Math.abs(offX1)) * 2);

      applyBrushShadow(ctx, scale, shadowMult);
      ctx.fillStyle = createVolumetricBrushFill(ctx, offX1, params.topYCenter, hw1, hh1, palette);
      traceSmoothBristleRectPath(ctx, offX1, params.topYCenter, hw1, hh1, scale, seedBase + 17, {
        bristleReach: reach,
        edgeRoughness: 4.5,
        bristleCount: 7,
        skewRightY: -3 * scale
      });
      ctx.fill();
      clearBrushShadow(ctx);
      drawHorizontalBristleFibers(
        ctx,
        offX1,
        params.topYCenter,
        hw1,
        hh1,
        scale,
        seedBase + 29,
        palette,
        6,
        reach
      );
    }

    if (params.hasBottom) {
      const hw2 = params.bottomW * 0.5 + strokePadX * 1.08;
      const hh2 = params.bottomH * 0.5 + strokePadY * 1.08;
      const offX2 = params.hasTop ? 14 * scale * padMult : 0;
      maxSpanW = Math.max(maxSpanW, (hw2 + reach + Math.abs(offX2)) * 2);

      applyBrushShadow(ctx, scale, shadowMult);
      ctx.fillStyle = createVolumetricBrushFill(
        ctx,
        offX2,
        params.bottomYCenter,
        hw2,
        hh2,
        palette
      );
      traceSmoothBristleRectPath(ctx, offX2, params.bottomYCenter, hw2, hh2, scale, seedBase + 83, {
        bristleReach: reach * 1.05,
        edgeRoughness: 5,
        bristleCount: 7,
        skewRightY: -3 * scale
      });
      ctx.fill();
      clearBrushShadow(ctx);
      drawHorizontalBristleFibers(
        ctx,
        offX2,
        params.bottomYCenter,
        hw2,
        hh2,
        scale,
        seedBase + 97,
        palette,
        6,
        reach * 1.05
      );
    }

    ctx.restore();
    return {
      splashW: maxSpanW + 16 * scale,
      splashH: params.totalTextH + strokePadY * 2.8 + 16 * scale
    };
  }

  // 5) «Фактурная потёртая кисть (Distressed Grunge)»
  if (params.shape === 'distressed_grunge') {
    const reach = 34 * scale * padMult;
    const offHalfW = Math.ceil(hw + reach + 24 * scale);
    const offHalfH = Math.ceil(hh + 26 * scale);
    const offW = Math.max(8, offHalfW * 2);
    const offH = Math.max(8, offHalfH * 2);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = offW;
    offCanvas.height = offH;
    const octx = offCanvas.getContext('2d');

    if (octx) {
      octx.translate(offHalfW, offHalfH);
      octx.fillStyle = createVolumetricBrushFill(octx, 0, 0, hw, hh, palette);
      traceSmoothBristleRectPath(octx, 0, 0, hw, hh, scale, seedBase + 3, {
        bristleReach: reach,
        edgeRoughness: 8.5,
        bristleCount: 11
      });
      octx.fill();

      drawHorizontalBristleFibers(
        octx,
        0,
        0,
        hw,
        hh,
        scale,
        seedBase + 43,
        palette,
        10,
        reach * 1.1
      );

      // Прорезаем сухие просветы/царапины щетины только внутри краски (не затрагивая фото фона!)
      octx.globalCompositeOperation = 'destination-out';
      for (let g = 0; g < 15; g++) {
        const edgeSide = g < 8 ? -1 : 1;
        const gy =
          edgeSide * (hh * (0.42 + deterministicHash(seedBase + g * 19) * 0.56));
        const gx1 = (deterministicHash(seedBase + g * 23) - 0.5) * hw * 1.65;
        const gapLen = (48 + deterministicHash(seedBase + g * 31) * 145) * scale;
        const gapThick = (1.6 + deterministicHash(seedBase + g * 37) * 4.4) * scale;
        octx.fillStyle = `rgba(0, 0, 0, ${(0.55 + deterministicHash(seedBase + g * 41) * 0.4).toFixed(2)})`;
        octx.beginPath();
        octx.moveTo(gx1 - gapLen * 0.5, gy);
        octx.quadraticCurveTo(gx1, gy - gapThick, gx1 + gapLen * 0.5, gy + 1.5 * scale);
        octx.quadraticCurveTo(gx1, gy + gapThick, gx1 - gapLen * 0.5, gy);
        octx.closePath();
        octx.fill();
      }

      // Мелкие потёртые сколы у кромки
      for (let c = 0; c < 18; c++) {
        const cx = (deterministicHash(seedBase + c * 59) - 0.5) * hw * 1.9;
        const cy =
          (c % 2 === 0 ? -1 : 1) * (hh * (0.68 + deterministicHash(seedBase + c * 61) * 0.34));
        const rx = (5 + deterministicHash(seedBase + c * 67) * 14) * scale;
        const ry = (1.8 + deterministicHash(seedBase + c * 71) * 3.8) * scale;
        octx.beginPath();
        octx.ellipse(cx, cy, rx, ry, (deterministicHash(seedBase + c * 17) - 0.5) * 0.3, 0, Math.PI * 2);
        octx.fill();
      }

      applyBrushShadow(ctx, scale, shadowMult);
      ctx.drawImage(offCanvas, -offHalfW, -offHalfH);
      clearBrushShadow(ctx);
    } else {
      applyBrushShadow(ctx, scale, shadowMult);
      ctx.fillStyle = createVolumetricBrushFill(ctx, 0, 0, hw, hh, palette);
      traceSmoothBristleRectPath(ctx, 0, 0, hw, hh, scale, seedBase + 3, {
        bristleReach: reach,
        edgeRoughness: 8.5,
        bristleCount: 11
      });
      ctx.fill();
      clearBrushShadow(ctx);
    }

    ctx.restore();
    return { splashW: offW, splashH: offH };
  }

  // 6) «Клиновидный росчерк (Tapered Speed Brush)»
  const leftReach = 24 * scale * padMult;
  const rightTailReach = 74 * scale * padMult;
  const leftHH = hh * 1.14;
  const rightHH = Math.max(hh * 0.42, 16 * scale);

  applyBrushShadow(ctx, scale, shadowMult);
  ctx.fillStyle = createVolumetricBrushFill(ctx, 0, 0, hw, hh, palette);
  ctx.beginPath();
  ctx.moveTo(-hw - leftReach * 0.65, -leftHH * 0.86);
  ctx.quadraticCurveTo(
    -hw * 0.15,
    -leftHH * 0.94,
    hw + rightTailReach * 0.72,
    -rightHH * 0.78
  );
  // Длинные острые волокна клиновидного хвоста справа
  for (let b = 0; b < 7; b++) {
    const bt = b / 6;
    const by = -rightHH * 0.72 + bt * (rightHH * 1.44);
    const outX =
      hw +
      rightTailReach *
        (0.45 + (1 - Math.abs(bt - 0.5) * 1.3) * 0.58 + deterministicHash(seedBase + b * 23) * 0.32);
    const inX = hw + rightTailReach * (0.08 + deterministicHash(seedBase + b * 31) * 0.18);
    ctx.lineTo(outX, by);
    ctx.lineTo(inX, by + (rightHH * 1.44) / 10);
  }
  ctx.quadraticCurveTo(
    -hw * 0.15,
    leftHH * 1.02,
    -hw - leftReach * 0.5,
    leftHH * 0.88
  );
  // Грубые рваные зубцы у широкого левого основания
  for (let b = 6; b >= 0; b--) {
    const bt = b / 6;
    const by = -leftHH * 0.8 + bt * (leftHH * 1.6);
    const outX = -hw - leftReach * (0.35 + deterministicHash(seedBase + b * 43) * 0.65);
    const inX = -hw + (3 + deterministicHash(seedBase + b * 47) * 9) * scale;
    ctx.lineTo(outX, by);
    ctx.lineTo(inX, by - (leftHH * 1.6) / 11);
  }
  ctx.closePath();
  ctx.fill();
  clearBrushShadow(ctx);

  // Тонкие скоростные волокна клина справа
  ctx.save();
  ctx.fillStyle = palette.mainColor;
  for (let s = 0; s < 7; s++) {
    const sy = ((s / 6) - 0.5) * rightHH * 1.75;
    const sx = hw + rightTailReach * 0.2;
    const tx = hw + rightTailReach * (0.85 + deterministicHash(seedBase + s * 59) * 0.65);
    const th = (1.5 + deterministicHash(seedBase + s * 61) * 3) * scale;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(sx, sy - th * 0.5);
    ctx.lineTo(tx, sy);
    ctx.lineTo(sx, sy + th * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
  return {
    splashW: hw * 2 + leftReach + rightTailReach * 1.25,
    splashH: leftHH * 2 + 20 * scale
  };
}

