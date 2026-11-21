/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/

/**
 Единый источник правды для счётчиков студии.
 Закрывает два дефекта: отрицательное «-179 сцен» и склеенное «Слов: 41130 сл/мин».
 */

export interface SceneLike {
  scene_index?: number;
  duration_sec?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface SlotLike {
  slot_duration_sec?: number;
  duration_sec?: number;
  inserts?: unknown[];
  slot_transition_out?: { type?: string; duration_sec?: number } | null;
  [key: string]: unknown;
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Целое неотрицательное число — единственная допустимая форма счётчика в UI. */
export const safeCount = (value: unknown): number => {
  const n = toFiniteNumber(value, 0);
  return Math.max(0, Math.floor(n));
};

/**
 Количество сцен берётся из фактического массива, а не из разности длин.
 Принимает несколько источников и выбирает первый непустой.
 */
export const countScenes = (
  ...sources: Array<readonly unknown[] | null | undefined>
): number => {
  for (const source of sources) {
    if (Array.isArray(source) && source.length > 0) return safeCount(source.length);
  }
  return 0;
};

/** Русская плюрализация: 1 сцена / 2 сцены / 5 сцен. */
export const pluralRu = (count: number, one: string, few: string, many: string): string => {
  const n = safeCount(count);
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

export const formatSceneCount = (count: number): string => {
  const n = safeCount(count);
  return `${n} ${pluralRu(n, 'сцена', 'сцены', 'сцен')}`;
};

export const formatBadgeCount = (count: number): string => {
  const n = safeCount(count);
  return `${n} ${pluralRu(n, 'бейдж', 'бейджа', 'бейджей')}`;
};

export const formatChapterCount = (count: number): string => {
  const n = safeCount(count);
  return `${n} ${pluralRu(n, 'глава', 'главы', 'глав')}`;
};

/** h:mm:ss, либо m:ss при длительности меньше часа. Никогда не «180:00». */
export const formatDurationClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(toFiniteNumber(totalSeconds, 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/** Всегда HH:MM:SS — для таймкодов глав и SRT-подобных выгрузок. */
export const formatDurationHMS = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(toFiniteNumber(totalSeconds, 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

/** Суммарная длительность сцен с учётом фактических duration. */
export const sumSceneDuration = (scenes: readonly SceneLike[] | null | undefined): number => {
  if (!Array.isArray(scenes)) return 0;
  return scenes.reduce(
    (acc, scene) => acc + Math.max(0, toFiniteNumber(scene?.duration_sec ?? scene?.duration, 0)),
    0
  );
};

/** Длительность лупа: сумма слотов минус перекрытия кроссфейдов между актами. */
export const sumSlotDuration = (slots: readonly SlotLike[] | null | undefined): number => {
  if (!Array.isArray(slots) || slots.length === 0) return 0;
  return slots.reduce((acc, slot, idx) => {
    const dur = Math.max(0, toFiniteNumber(slot?.slot_duration_sec ?? slot?.duration_sec, 0));
    const isLast = idx === slots.length - 1;
    const transition = slot?.slot_transition_out;
    const overlap =
      !isLast && transition && transition.type !== 'none'
        ? Math.max(0, toFiniteNumber(transition.duration_sec, 0))
        : 0;
    return acc + Math.max(0, dur - overlap);
  }, 0);
};

export interface WordStats {
  words: number;
  chars: number;
  sentences: number;
  wordsPerMinute: number;
  speechSeconds: number;
  speechLabel: string;
  /** Готовая строка с явным разделителем: «Слов: 41 · 130 сл/мин». */
  label: string;
}

export const DEFAULT_WORDS_PER_MINUTE = 130;

/** Раздельные счётчики слов и темпа — исключает склейку «41» и «130 сл/мин». */
export const computeWordStats = (
  text: string,
  wordsPerMinute: number = DEFAULT_WORDS_PER_MINUTE
): WordStats => {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const sentences = trimmed ? trimmed.split(/[.!?…]+(?:\s|$)/).filter(s => s.trim()).length : 0;
  const wpm = Math.max(
    40,
    Math.min(320, Math.round(toFiniteNumber(wordsPerMinute, DEFAULT_WORDS_PER_MINUTE)))
  );
  const speechSeconds = wpm > 0 ? (words / wpm) * 60 : 0;

  return {
    words: safeCount(words),
    chars: safeCount(raw.length),
    sentences: safeCount(sentences),
    wordsPerMinute: wpm,
    speechSeconds,
    speechLabel: formatDurationClock(speechSeconds),
    label: `Слов: ${safeCount(words)} · ${wpm} сл/мин`
  };
};

/** Дельта рассинхрона видео и мастер-аудио для drift-guard. */
export interface DriftReport {
  deltaSeconds: number;
  absDeltaSeconds: number;
  withinTolerance: boolean;
  label: string;
}

export const computeDrift = (
  videoSeconds: number,
  audioSeconds: number,
  toleranceSeconds = 2
): DriftReport => {
  const video = Math.max(0, toFiniteNumber(videoSeconds, 0));
  const audio = Math.max(0, toFiniteNumber(audioSeconds, 0));
  const delta = video - audio;
  const abs = Math.abs(delta);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return {
    deltaSeconds: delta,
    absDeltaSeconds: abs,
    withinTolerance: abs <= Math.max(0, toFiniteNumber(toleranceSeconds, 2)),
    label: `${sign}${formatDurationClock(abs)}`
  };
};
