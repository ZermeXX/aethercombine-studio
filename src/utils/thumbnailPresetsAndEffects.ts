/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TopLineGradientId =
  | 'auto'
  | 'gold'
  | 'silver'
  | 'stone'
  | 'white'
  | 'ice'
  | 'amber'
  | 'fire'
  | 'emerald'
  | 'cyan';

export type BottomPlaqueStyleId =
  | 'none'
  | 'royal_navy_gold'
  | 'crimson_brush'
  | 'highlight_tape'
  | 'ambient_glass'
  | 'classified_stamp';

export interface BottomPlaquePaletteOverride {
  bgStart: string;
  bgEnd: string;
  border: string;
  text: string;
}

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

export type PresetCategoryId = 'all' | 'history' | 'mystery' | 'science' | 'ambient';

export interface YoutubeThumbnailPreset {
  id: string;
  index: number;
  category: Exclude<PresetCategoryId, 'all'>;
  topLine: string;
  bottomLine: string;
  topGradient: TopLineGradientId;
  bottomBadgeStyle: BottomPlaqueStyleId;
  bottomPlaqueOverride?: BottomPlaquePaletteOverride;
  topFontId: string;
  bottomFontId: string;
  styleTag: string;
  swatchTop: string;
  swatchBottomBg: string;
  swatchBottomText: string;
}

export const PRESET_CATEGORIES: Array<{ id: PresetCategoryId; label: string }> = [
  { id: 'all', label: 'Все (20)' },
  { id: 'history', label: 'История и Масштаб' },
  { id: 'mystery', label: 'Тайны и Расследования' },
  { id: 'science', label: 'Наука и Факты' },
  { id: 'ambient', label: 'Эмбиент 3 часа' }
];

export const TOP_LINE_GRADIENT_OPTIONS: Array<{
  id: TopLineGradientId;
  label: string;
  swatch: string;
  isPrimary?: boolean;
}> = [
  { id: 'auto', label: 'Авто', swatch: 'linear-gradient(135deg, #f8fafc, #94a3b8)', isPrimary: true },
  { id: 'gold', label: 'Золото', swatch: 'linear-gradient(180deg, #FFF7CC, #F5A623, #B86B00)', isPrimary: true },
  { id: 'silver', label: 'Серебро', swatch: 'linear-gradient(180deg, #FFFFFF, #CBD5E1, #64748B)', isPrimary: true },
  { id: 'stone', label: 'Камень', swatch: 'linear-gradient(180deg, #FAF7F0, #C7BCA6, #786D58)', isPrimary: true },
  { id: 'white', label: 'Чистый белый', swatch: 'linear-gradient(180deg, #FFFFFF, #E2E8F0)', isPrimary: true },
  { id: 'ice', label: 'Лёд', swatch: 'linear-gradient(180deg, #FFFFFF, #7DD3FC, #0284C7)' },
  { id: 'amber', label: 'Янтарь', swatch: 'linear-gradient(180deg, #FEF3C7, #FBBF24, #D97706)' },
  { id: 'fire', label: 'Огонь', swatch: 'linear-gradient(180deg, #FEF08A, #F97316, #DC2626)' },
  { id: 'emerald', label: 'Изумруд', swatch: 'linear-gradient(180deg, #ECFDF5, #34D399, #059669)' },
  { id: 'cyan', label: 'Циан', swatch: 'linear-gradient(180deg, #ECFEFF, #22D3EE, #0891B2)' }
];

export const BOTTOM_PLAQUE_STYLE_OPTIONS: Array<{
  id: BottomPlaqueStyleId;
  label: string;
  shortDesc: string;
  previewBg: string;
  previewBorder: string;
  previewText: string;
}> = [
  {
    id: 'none',
    label: 'Нет (только текст)',
    shortDesc: 'Чистая 2-я строка с обводкой',
    previewBg: 'rgba(15, 23, 42, 0.5)',
    previewBorder: 'rgba(255, 255, 255, 0.2)',
    previewText: '#F8FAFC'
  },
  {
    id: 'royal_navy_gold',
    label: 'Синяя рамка с золотой каймой',
    shortDesc: 'Royal Navy & Gold',
    previewBg: 'linear-gradient(180deg, #0D254D, #061124)',
    previewBorder: '#F6D365',
    previewText: '#FEF3C7'
  },
  {
    id: 'crimson_brush',
    label: 'Алый мазок кисти',
    shortDesc: 'Distressed Crimson Brush',
    previewBg: 'linear-gradient(135deg, #B91C1C, #7F1D1D)',
    previewBorder: '#EF4444',
    previewText: '#FFFFFF'
  },
  {
    id: 'highlight_tape',
    label: 'Жёлтый маркер / скотч',
    shortDesc: 'Highlight Tape',
    previewBg: 'linear-gradient(180deg, #FDE047, #EAB308)',
    previewBorder: '#FEF08A',
    previewText: '#090D16'
  },
  {
    id: 'ambient_glass',
    label: 'Тёмное матовое стекло',
    shortDesc: 'Ambient Glass',
    previewBg: 'rgba(11, 15, 25, 0.85)',
    previewBorder: 'rgba(255, 255, 255, 0.28)',
    previewText: '#F8FAFC'
  },
  {
    id: 'classified_stamp',
    label: 'Красный архивный штамп',
    shortDesc: 'Classified Stamp',
    previewBg: 'rgba(24, 6, 8, 0.82)',
    previewBorder: '#EF4444',
    previewText: '#FCA5A5'
  }
];

export const YOUTUBE_THUMBNAIL_PRESETS: YoutubeThumbnailPreset[] = [
  {
    id: 'yt_01_bigger_london',
    index: 1,
    category: 'history',
    topLine: 'BIGGER THAN',
    bottomLine: 'LONDON',
    topGradient: 'gold',
    bottomBadgeStyle: 'royal_navy_gold',
    topFontId: 'gg_cinzel',
    bottomFontId: 'gg_cinzel',
    styleTag: 'Синяя рамка + золото · Античный сериф',
    swatchTop: '#FFE58F',
    swatchBottomBg: '#0B2145',
    swatchBottomText: '#FEF3C7'
  },
  {
    id: 'yt_02_40000_vanished',
    index: 2,
    category: 'mystery',
    topLine: '40,000',
    bottomLine: 'VANISHED',
    topGradient: 'stone',
    bottomBadgeStyle: 'crimson_brush',
    topFontId: 'gg_cinzel',
    bottomFontId: 'gg_montserrat',
    styleTag: 'Алый мазок кисти · Каменное золото',
    swatchTop: '#E5DEC9',
    swatchBottomBg: '#B91C1C',
    swatchBottomText: '#FFFFFF'
  },
  {
    id: 'yt_03_why_nobody',
    index: 3,
    category: 'mystery',
    topLine: 'WHY NOBODY',
    bottomLine: 'ENTERS HERE',
    topGradient: 'white',
    bottomBadgeStyle: 'highlight_tape',
    topFontId: 'gg_montserrat',
    bottomFontId: 'gg_bebas_neue',
    styleTag: 'Жёлтый маркер · Мощный гротеск',
    swatchTop: '#FFFFFF',
    swatchBottomBg: '#FACC15',
    swatchBottomText: '#090D16'
  },
  {
    id: 'yt_04_dark_truth',
    index: 4,
    category: 'mystery',
    topLine: 'THE DARK',
    bottomLine: 'TRUTH',
    topGradient: 'silver',
    bottomBadgeStyle: 'crimson_brush',
    bottomPlaqueOverride: {
      bgStart: '#0B0B10',
      bgEnd: '#3B080E',
      border: '#EF4444',
      text: '#F8FAFC'
    },
    topFontId: 'gg_montserrat',
    bottomFontId: 'gg_oswald',
    styleTag: 'Чёрно-красная плашка · Серебристый металл',
    swatchTop: '#CBD5E1',
    swatchBottomBg: '#27070C',
    swatchBottomText: '#F8FAFC'
  },
  {
    id: 'yt_05_in_4_minutes',
    index: 5,
    category: 'science',
    topLine: 'IT HAPPENED',
    bottomLine: 'IN 4 MINUTES',
    topGradient: 'white',
    bottomBadgeStyle: 'crimson_brush',
    bottomPlaqueOverride: {
      bgStart: '#E11D48',
      bgEnd: '#9F1239',
      border: '#FB7185',
      text: '#FFFFFF'
    },
    topFontId: 'gg_rubik',
    bottomFontId: 'gg_montserrat',
    styleTag: 'Неоново-алый акцент · Чистый гротеск',
    swatchTop: '#FFFFFF',
    swatchBottomBg: '#E11D48',
    swatchBottomText: '#FFFFFF'
  },
  {
    id: 'yt_06_build_this',
    index: 6,
    category: 'history',
    topLine: 'HOW DID THEY',
    bottomLine: 'BUILD THIS?',
    topGradient: 'cyan',
    bottomBadgeStyle: 'highlight_tape',
    topFontId: 'gg_russo_one',
    bottomFontId: 'gg_bebas_neue',
    styleTag: 'Жёлтый индустриальный блок · Циан',
    swatchTop: '#67E8F9',
    swatchBottomBg: '#FACC15',
    swatchBottomText: '#090D16'
  },
  {
    id: 'yt_07_empire_gold',
    index: 7,
    category: 'history',
    topLine: 'EMPIRE OF',
    bottomLine: 'PURE GOLD',
    topGradient: 'gold',
    bottomBadgeStyle: 'royal_navy_gold',
    bottomPlaqueOverride: {
      bgStart: '#24093D',
      bgEnd: '#3D1063',
      border: '#F6D365',
      text: '#FEF08A'
    },
    topFontId: 'gg_cinzel_decorative',
    bottomFontId: 'gg_cinzel',
    styleTag: 'Пурпурно-золотая рамка · Античный сериф',
    swatchTop: '#FFE58F',
    swatchBottomBg: '#310D52',
    swatchBottomText: '#FEF08A'
  },
  {
    id: 'yt_08_destroyed_overnight',
    index: 8,
    category: 'mystery',
    topLine: 'DESTROYED',
    bottomLine: 'OVERNIGHT',
    topGradient: 'fire',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(18, 9, 6, 0.92)',
      bgEnd: 'rgba(38, 12, 6, 0.95)',
      border: '#EA580C',
      text: '#FFEDD5'
    },
    topFontId: 'gg_oswald',
    bottomFontId: 'gg_russo_one',
    styleTag: 'Тёмная обугленная плашка · Огненный градиент',
    swatchTop: '#FB923C',
    swatchBottomBg: '#1C0B06',
    swatchBottomText: '#FFEDD5'
  },
  {
    id: 'yt_09_classified',
    index: 9,
    category: 'mystery',
    topLine: 'CLASSIFIED',
    bottomLine: 'FILE #09',
    topGradient: 'white',
    bottomBadgeStyle: 'classified_stamp',
    topFontId: 'gg_jetbrains_mono',
    bottomFontId: 'gg_special_elite',
    styleTag: 'Красный архивный штамп · Моноширинный',
    swatchTop: '#F8FAFC',
    swatchBottomBg: '#2A0709',
    swatchBottomText: '#FCA5A5'
  },
  {
    id: 'yt_10_below_zero',
    index: 10,
    category: 'science',
    topLine: '72 HOURS',
    bottomLine: 'BELOW ZERO',
    topGradient: 'ice',
    bottomBadgeStyle: 'royal_navy_gold',
    bottomPlaqueOverride: {
      bgStart: '#061A38',
      bgEnd: '#0C2D5E',
      border: '#38BDF8',
      text: '#E0F2FE'
    },
    topFontId: 'gg_montserrat',
    bottomFontId: 'gg_exo_2',
    styleTag: 'Тёмно-синий блок · Ледяной голубой',
    swatchTop: '#BAE6FD',
    swatchBottomBg: '#09234A',
    swatchBottomText: '#E0F2FE'
  },
  {
    id: 'yt_11_1000_years',
    index: 11,
    category: 'history',
    topLine: '1,000 YEARS',
    bottomLine: 'LATER...',
    topGradient: 'amber',
    bottomBadgeStyle: 'royal_navy_gold',
    bottomPlaqueOverride: {
      bgStart: '#171547',
      bgEnd: '#2B2673',
      border: '#F59E0B',
      text: '#FEF3C7'
    },
    topFontId: 'gg_cormorant',
    bottomFontId: 'gg_cinzel',
    styleTag: 'Глубокий индиго · Янтарный градиент',
    swatchTop: '#FCD34D',
    swatchBottomBg: '#1F1C5C',
    swatchBottomText: '#FEF3C7'
  },
  {
    id: 'yt_12_100_billion',
    index: 12,
    category: 'science',
    topLine: '$100 BILLION',
    bottomLine: 'MISTAKE',
    topGradient: 'emerald',
    bottomBadgeStyle: 'crimson_brush',
    bottomPlaqueOverride: {
      bgStart: '#DC2626',
      bgEnd: '#991B1B',
      border: '#F87171',
      text: '#FFFFFF'
    },
    topFontId: 'gg_montserrat',
    bottomFontId: 'gg_bebas_neue',
    styleTag: 'Тревожный красный баннер · Изумрудный верх',
    swatchTop: '#6EE7B7',
    swatchBottomBg: '#B91C1C',
    swatchBottomText: '#FFFFFF'
  },
  {
    id: 'yt_13_forbidden_city',
    index: 13,
    category: 'history',
    topLine: 'INSIDE THE',
    bottomLine: 'FORBIDDEN CITY',
    topGradient: 'white',
    bottomBadgeStyle: 'royal_navy_gold',
    bottomPlaqueOverride: {
      bgStart: '#090D16',
      bgEnd: '#111827',
      border: '#EAB308',
      text: '#FEF08A'
    },
    topFontId: 'gg_cinzel',
    bottomFontId: 'gg_playfair',
    styleTag: 'Тонкая золотая рамка · Строгий белый',
    swatchTop: '#FFFFFF',
    swatchBottomBg: '#0D121F',
    swatchBottomText: '#FEF08A'
  },
  {
    id: 'yt_14_lied_to',
    index: 14,
    category: 'mystery',
    topLine: 'YOU WERE',
    bottomLine: 'LIED TO',
    topGradient: 'white',
    bottomBadgeStyle: 'highlight_tape',
    topFontId: 'gg_montserrat',
    bottomFontId: 'gg_bebas_neue',
    styleTag: 'Жёлтая лента · Контрастный белый',
    swatchTop: '#FFFFFF',
    swatchBottomBg: '#FDE047',
    swatchBottomText: '#090D16'
  },
  {
    id: 'yt_15_last_survivor',
    index: 15,
    category: 'mystery',
    topLine: 'THE LAST',
    bottomLine: 'SURVIVOR',
    topGradient: 'stone',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(28, 20, 12, 0.90)',
      bgEnd: 'rgba(15, 10, 6, 0.94)',
      border: '#D6B885',
      text: '#FEF3C7'
    },
    topFontId: 'gg_playfair',
    bottomFontId: 'gg_cormorant',
    styleTag: 'Тёмная сепия · Кремовый кино-сериф',
    swatchTop: '#F5EFE0',
    swatchBottomBg: '#1C140C',
    swatchBottomText: '#FEF3C7'
  },
  {
    id: 'yt_16_one_mistake',
    index: 16,
    category: 'science',
    topLine: 'ONE MISTAKE',
    bottomLine: 'CHANGED ALL',
    topGradient: 'amber',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(24, 14, 6, 0.90)',
      bgEnd: 'rgba(12, 8, 5, 0.94)',
      border: '#F59E0B',
      text: '#FDE68A'
    },
    topFontId: 'gg_russo_one',
    bottomFontId: 'gg_oswald',
    styleTag: 'Закатное золото · Крупный рубленый шрифт',
    swatchTop: '#FBBF24',
    swatchBottomBg: '#180E06',
    swatchBottomText: '#FDE68A'
  },
  {
    id: 'yt_17_down_there',
    index: 17,
    category: 'mystery',
    topLine: 'SOMETHING',
    bottomLine: 'IS DOWN THERE',
    topGradient: 'cyan',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(3, 5, 9, 0.94)',
      bgEnd: 'rgba(7, 13, 22, 0.96)',
      border: '#22D3EE',
      text: '#CFFAFE'
    },
    topFontId: 'gg_oswald',
    bottomFontId: 'gg_exo_2',
    styleTag: 'Глубокий чёрный блок · Холодная бирюза',
    swatchTop: '#67E8F9',
    swatchBottomBg: '#05080F',
    swatchBottomText: '#CFFAFE'
  },
  {
    id: 'yt_18_lost_4000',
    index: 18,
    category: 'history',
    topLine: 'LOST FOR',
    bottomLine: '4,000 YEARS',
    topGradient: 'stone',
    bottomBadgeStyle: 'royal_navy_gold',
    bottomPlaqueOverride: {
      bgStart: '#0D4F54',
      bgEnd: '#0F766E',
      border: '#5EEAD4',
      text: '#F0FDFA'
    },
    topFontId: 'gg_cinzel',
    bottomFontId: 'gg_montserrat',
    styleTag: 'Бирюзовая плашка · Текстура песчаника',
    swatchTop: '#E5DEC9',
    swatchBottomBg: '#0F6664',
    swatchBottomText: '#F0FDFA'
  },
  {
    id: 'yt_19_deep_sleep',
    index: 19,
    category: 'ambient',
    topLine: '3 HOURS',
    bottomLine: 'DEEP SLEEP',
    topGradient: 'amber',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(11, 15, 25, 0.80)',
      bgEnd: 'rgba(17, 24, 39, 0.88)',
      border: 'rgba(251, 191, 36, 0.45)',
      text: '#FEF3C7'
    },
    topFontId: 'gg_cormorant',
    bottomFontId: 'gg_inter',
    styleTag: 'Тёмное матовое стекло · Мягкий янтарь',
    swatchTop: '#FDE68A',
    swatchBottomBg: '#0F172A',
    swatchBottomText: '#FEF3C7'
  },
  {
    id: 'yt_20_rain_fire',
    index: 20,
    category: 'ambient',
    topLine: 'RAIN & FIRE',
    bottomLine: 'NO ADS',
    topGradient: 'silver',
    bottomBadgeStyle: 'ambient_glass',
    bottomPlaqueOverride: {
      bgStart: 'rgba(42, 16, 8, 0.88)',
      bgEnd: 'rgba(20, 8, 4, 0.92)',
      border: '#FB923C',
      text: '#FFEDD5'
    },
    topFontId: 'gg_cormorant',
    bottomFontId: 'gg_montserrat',
    styleTag: 'Тёплая каминная плашка · Лунное серебро',
    swatchTop: '#E2E8F0',
    swatchBottomBg: '#2A1008',
    swatchBottomText: '#FFEDD5'
  }
];

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

        // Глубина теней и света (Contrast centered at 128)
        if (contrast !== 1) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }

        // Деликатная сочность (Vibrance): усиливает менее насыщенные тона и тёплые золотые блики без кислотности
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

export function buildTopLine3DGradient(
  ctx: CanvasRenderingContext2D,
  gradientId: Exclude<TopLineGradientId, 'auto'>,
  topY: number,
  bottomY: number
): CanvasGradient {
  const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
  switch (gradientId) {
    case 'gold':
      grad.addColorStop(0.0, '#FFF8D6');
      grad.addColorStop(0.24, '#FFE58F');
      grad.addColorStop(0.58, '#F5A623');
      grad.addColorStop(0.92, '#B86B00');
      grad.addColorStop(1.0, '#8A4800');
      break;
    case 'silver':
      grad.addColorStop(0.0, '#FFFFFF');
      grad.addColorStop(0.32, '#E2E8F0');
      grad.addColorStop(0.54, '#94A3B8');
      grad.addColorStop(0.76, '#CBD5E1');
      grad.addColorStop(1.0, '#475569');
      break;
    case 'stone':
      grad.addColorStop(0.0, '#FAF7F0');
      grad.addColorStop(0.35, '#DFD7C5');
      grad.addColorStop(0.72, '#A89B82');
      grad.addColorStop(1.0, '#6E624D');
      break;
    case 'ice':
      grad.addColorStop(0.0, '#FFFFFF');
      grad.addColorStop(0.38, '#BAE6FD');
      grad.addColorStop(0.78, '#38BDF8');
      grad.addColorStop(1.0, '#0369A1');
      break;
    case 'amber':
      grad.addColorStop(0.0, '#FFFBEB');
      grad.addColorStop(0.35, '#FDE68A');
      grad.addColorStop(0.72, '#F59E0B');
      grad.addColorStop(1.0, '#B45309');
      break;
    case 'fire':
      grad.addColorStop(0.0, '#FEF9C3');
      grad.addColorStop(0.32, '#FDBA74');
      grad.addColorStop(0.68, '#F97316');
      grad.addColorStop(1.0, '#B91C1C');
      break;
    case 'emerald':
      grad.addColorStop(0.0, '#ECFDF5');
      grad.addColorStop(0.35, '#6EE7B7');
      grad.addColorStop(0.75, '#10B981');
      grad.addColorStop(1.0, '#047857');
      break;
    case 'cyan':
      grad.addColorStop(0.0, '#ECFEFF');
      grad.addColorStop(0.36, '#A5F3FC');
      grad.addColorStop(0.74, '#06B6D4');
      grad.addColorStop(1.0, '#0E7490');
      break;
    case 'white':
    default:
      grad.addColorStop(0.0, '#FFFFFF');
      grad.addColorStop(0.55, '#F8FAFC');
      grad.addColorStop(1.0, '#CBD5E1');
      break;
  }
  return grad;
}

function deterministicHash(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Отрисовка нижней акцентной плашки под строкой текста (6 стилей + цветовые пресеты)
 */
export function drawBottomAccentPlaque(
  ctx: CanvasRenderingContext2D,
  style: BottomPlaqueStyleId,
  cx: number,
  cy: number,
  textW: number,
  fontSize: number,
  effScale: number,
  text: string,
  fontStr: string,
  override?: BottomPlaquePaletteOverride | null,
  customStrokeColor: string = '#000000',
  strokeMult: number = 1,
  customShadowColor: string = '#000000',
  shadowMult: number = 1
): { width: number; height: number } {
  const padX = Math.max(22 * effScale, fontSize * 0.42);
  const padY = Math.max(10 * effScale, fontSize * 0.18);
  const plaqueW = textW + padX * 2;
  const plaqueH = fontSize * 1.06 + padY * 2;
  const halfW = plaqueW / 2;
  const halfH = plaqueH / 2;
  const hasCustomStroke = customStrokeColor.toLowerCase() !== '#000000';
  const hasCustomShadow = customShadowColor.toLowerCase() !== '#000000';
  const seedBase = Array.from(text).reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 3), 19);

  if (style === 'none') {
    ctx.save();
    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 18 * effScale * shadowMult;
      ctx.shadowOffsetY = 4 * effScale;
    }
    if (strokeMult > 0) {
      ctx.strokeStyle = hasCustomStroke ? customStrokeColor : '#090D16';
      ctx.lineWidth = Math.max(1, 8 * effScale * strokeMult);
      ctx.strokeText(text, cx, cy);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = override?.text || '#FDE047';
    ctx.fillText(text, cx, cy);
    ctx.restore();
    return { width: textW, height: fontSize * 1.06 };
  }

  ctx.save();
  ctx.translate(cx, cy);

  if (style === 'royal_navy_gold') {
    const r = 8 * effScale;
    const bgGrad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    bgGrad.addColorStop(0, override?.bgStart || '#0D254D');
    bgGrad.addColorStop(0.55, override?.bgEnd || '#07142B');
    bgGrad.addColorStop(1, override?.bgStart || '#0A1C3D');

    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 22 * effScale * shadowMult;
      ctx.shadowOffsetY = 6 * effScale;
    }

    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, plaqueW, plaqueH, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 3D золотая или акцентная кайма
    const borderGrad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    if (override?.border) {
      borderGrad.addColorStop(0, '#FFFFFF');
      borderGrad.addColorStop(0.28, override.border);
      borderGrad.addColorStop(0.72, override.border);
      borderGrad.addColorStop(1, '#FFF8D6');
    } else {
      borderGrad.addColorStop(0, '#FFF3B0');
      borderGrad.addColorStop(0.35, '#F6D365');
      borderGrad.addColorStop(0.7, '#C59B27');
      borderGrad.addColorStop(1, '#FFE58F');
    }
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = Math.max(2, 3.2 * effScale);
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, plaqueW, plaqueH, r);
    ctx.stroke();

    // Тонкая внутренняя световая кайма
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = Math.max(1, 1.1 * effScale);
    ctx.beginPath();
    ctx.roundRect(
      -halfW + 4.5 * effScale,
      -halfH + 4.5 * effScale,
      plaqueW - 9 * effScale,
      plaqueH - 9 * effScale,
      Math.max(2, r - 3 * effScale)
    );
    ctx.stroke();

    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 8 * effScale;
    ctx.shadowOffsetY = 2 * effScale;
    ctx.fillStyle = override?.text || '#FFFDF5';
    ctx.fillText(text, 0, 1.5 * effScale);
  } else if (style === 'crimson_brush') {
    ctx.rotate(-0.024);
    const extW = plaqueW + 28 * effScale;
    const hw = extW / 2;
    const hh = halfH * 1.08;

    const brushGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    brushGrad.addColorStop(0, override?.bgStart || '#B91C1C');
    brushGrad.addColorStop(0.5, override?.bgEnd || '#991B1B');
    brushGrad.addColorStop(1, override?.bgStart || '#DC2626');

    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0, 0, 0, 0.88)';
      ctx.shadowBlur = 20 * effScale * shadowMult;
      ctx.shadowOffsetY = 6 * effScale;
    }

    // Органичный мазок кисти с рваными краями щетины
    ctx.fillStyle = brushGrad;
    ctx.beginPath();
    const topSteps = 14;
    for (let i = 0; i <= topSteps; i++) {
      const t = i / topSteps;
      const x = -hw + t * extW;
      const jitter = (deterministicHash(seedBase + i * 7) - 0.5) * 6 * effScale;
      const edgeTaper = i === 0 || i === topSteps ? 5 * effScale : 0;
      const y = -hh + jitter + edgeTaper;
      if (i === 0) ctx.moveTo(x - 8 * effScale, y + 6 * effScale);
      else ctx.lineTo(x, y);
    }
    // Правые рваные щетинки
    for (let b = 0; b < 5; b++) {
      const bt = b / 4;
      const by = -hh * 0.75 + bt * hh * 1.5;
      const tipX = hw + (6 + deterministicHash(seedBase + b * 19) * 16) * effScale;
      ctx.lineTo(tipX, by);
      ctx.lineTo(hw - 4 * effScale, by + hh * 0.16);
    }
    for (let i = topSteps; i >= 0; i--) {
      const t = i / topSteps;
      const x = -hw + t * extW;
      const jitter = (deterministicHash(seedBase + i * 13 + 31) - 0.5) * 6 * effScale;
      const edgeTaper = i === 0 || i === topSteps ? -5 * effScale : 0;
      ctx.lineTo(x, hh + jitter + edgeTaper);
    }
    // Левые рваные щетинки
    for (let b = 4; b >= 0; b--) {
      const bt = b / 4;
      const by = -hh * 0.75 + bt * hh * 1.5;
      const tipX = -hw - (6 + deterministicHash(seedBase + b * 23 + 9) * 16) * effScale;
      ctx.lineTo(tipX, by);
      ctx.lineTo(-hw + 4 * effScale, by - hh * 0.14);
    }
    ctx.closePath();
    ctx.fill();

    // Сухой акцентный мазок поверх края
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = override?.border || 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = Math.max(1.2, 2.2 * effScale);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.88, -hh * 0.88);
    ctx.lineTo(hw * 0.9, -hh * 0.84);
    ctx.stroke();

    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (strokeMult > 0) {
      ctx.strokeStyle = hasCustomStroke ? customStrokeColor : 'rgba(10, 4, 4, 0.85)';
      ctx.lineWidth = Math.max(1, 5 * effScale * strokeMult);
      ctx.strokeText(text, 0, 1.5 * effScale);
    }
    ctx.fillStyle = override?.text || '#FFFFFF';
    ctx.fillText(text, 0, 1.5 * effScale);
  } else if (style === 'highlight_tape') {
    ctx.rotate(-0.022);
    const tapeW = plaqueW + 16 * effScale;
    const hw = tapeW / 2;
    const hh = halfH * 0.96;

    const tapeGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    tapeGrad.addColorStop(0, override?.bgStart || '#FEF08A');
    tapeGrad.addColorStop(0.35, override?.bgEnd || '#FACC15');
    tapeGrad.addColorStop(1, '#EAB308');

    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0, 0, 0, 0.82)';
      ctx.shadowBlur = 18 * effScale * shadowMult;
      ctx.shadowOffsetY = 5 * effScale;
    }

    // Рваные зубчатые края скотча/маркера слева и справа
    ctx.fillStyle = tapeGrad;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh);
    ctx.lineTo(hw, -hh);
    const teeth = 7;
    for (let i = 1; i <= teeth; i++) {
      const ty = -hh + (i / teeth) * hh * 2;
      const tx = hw + (i % 2 === 1 ? 5 : -3) * effScale;
      ctx.lineTo(tx, ty);
    }
    ctx.lineTo(-hw, hh);
    for (let i = teeth - 1; i >= 0; i--) {
      const ty = -hh + (i / teeth) * hh * 2;
      const tx = -hw + (i % 2 === 1 ? -5 : 3) * effScale;
      ctx.lineTo(tx, ty);
    }
    ctx.closePath();
    ctx.fill();

    // Тонкий глянцевый блик ленты сверху
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(-hw + 4 * effScale, -hh + 2 * effScale, tapeW - 8 * effScale, 3.5 * effScale);

    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = override?.text || '#090D16';
    ctx.fillText(text, 0, 1.5 * effScale);
  } else if (style === 'ambient_glass') {
    const r = 12 * effScale;
    const glassGrad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    glassGrad.addColorStop(0, override?.bgStart || 'rgba(17, 24, 39, 0.84)');
    glassGrad.addColorStop(1, override?.bgEnd || 'rgba(8, 12, 20, 0.90)');

    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 24 * effScale * shadowMult;
      ctx.shadowOffsetY = 6 * effScale;
    }

    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, plaqueW, plaqueH, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Верхний стеклянный блик
    const sheen = ctx.createLinearGradient(0, -halfH, 0, 0);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.roundRect(-halfW + 1, -halfH + 1, plaqueW - 2, halfH, [r, r, 0, 0]);
    ctx.fill();

    ctx.strokeStyle = override?.border || 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = Math.max(1.2, 1.8 * effScale);
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, plaqueW, plaqueH, r);
    ctx.stroke();

    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 8 * effScale;
    ctx.fillStyle = override?.text || '#F8FAFC';
    ctx.fillText(text, 0, 1.5 * effScale);
  } else if (style === 'classified_stamp') {
    ctx.rotate(-0.038);
    const hw = halfW + 6 * effScale;
    const hh = halfH * 0.98;
    const r = 4 * effScale;

    if (shadowMult > 0) {
      ctx.shadowColor = hasCustomShadow ? customShadowColor : 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 18 * effScale * shadowMult;
      ctx.shadowOffsetY = 4 * effScale;
    }

    ctx.fillStyle = override?.bgStart || 'rgba(20, 5, 7, 0.82)';
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Внешняя и внутренняя рамка архивного штампа
    const stampRed = override?.border || '#EF4444';
    ctx.strokeStyle = stampRed;
    ctx.lineWidth = Math.max(2, 3.6 * effScale);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, 1.3 * effScale);
    ctx.beginPath();
    ctx.roundRect(
      -hw + 5.5 * effScale,
      -hh + 5.5 * effScale,
      hw * 2 - 11 * effScale,
      hh * 2 - 11 * effScale,
      Math.max(1, r - 2 * effScale)
    );
    ctx.stroke();

    // Потёртости чернил архивного штампа
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let s = 0; s < 16; s++) {
      const sx = -hw + deterministicHash(seedBase + s * 11) * hw * 2;
      const sy = -hh + deterministicHash(seedBase + s * 17) * hh * 2;
      const sr = (1 + deterministicHash(seedBase + s * 29) * 2.2) * effScale;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = override?.text || '#FCA5A5';
    ctx.fillText(text, 0, 1.5 * effScale);
  }

  ctx.restore();
  return { width: plaqueW + 24 * effScale, height: plaqueH + 8 * effScale };
}
