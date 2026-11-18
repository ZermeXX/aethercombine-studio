/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SeoToneStyle =
  | 'Dark Mystery'
  | 'Cozy Ambient'
  | 'Historical Doc'
  | 'Cinematic Drama';

export interface SeoTitleVariant {
  id: 'A' | 'B' | 'C';
  category: 'Intrigue' | 'Contradiction' | 'Drama';
  categoryRu: string;
  title: string;
}

export interface YoutubeSeoState {
  tone: SeoToneStyle;
  selectedTitleId: 'A' | 'B' | 'C';
  titles: SeoTitleVariant[];
  description: string;
  tagsString: string;
}

export interface YoutubeSeoManifestBlock {
  title: string;
  description: string;
  tags: string[];
}

export const YOUTUBE_SEO_STORAGE_KEY = 'ac_youtube_seo_state_v1';

const CYRILLIC_RE = /[а-яёА-ЯЁ]/;

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh',
  З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O',
  П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts',
  Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya'
};

const RU_TO_EN_PHRASES: Array<[RegExp, string]> = [
  [/\bвведение\b/gi, 'Intro'],
  [/\bпролог\b/gi, 'Prologue'],
  [/\bфинал\b/gi, 'Finale'],
  [/\bэпилог\b/gi, 'Epilogue'],
  [/\bкульминация\b/gi, 'Climax'],
  [/\bразвязка\b/gi, 'Resolution'],
  [/\bакт\b/gi, 'Act'],
  [/\bглава\b/gi, 'Chapter'],
  [/\bслот\b/gi, 'Chapter'],
  [/\bсцена\b/gi, 'Scene'],
  [/\bметель\b/gi, 'Blizzard'],
  [/\bбуря\b/gi, 'Storm'],
  [/\bснег\b/gi, 'Snowfall'],
  [/\bдождь\b/gi, 'Rainfall'],
  [/\bветер\b/gi, 'Arctic Wind'],
  [/\bкамин\b/gi, 'Fireplace'],
  [/\bочаг\b/gi, 'Warm Hearth'],
  [/\bхижина\b/gi, 'Mountain Cabin'],
  [/\bлес\b/gi, 'Forest'],
  [/\bгоры\b/gi, 'Alpine Ridge'],
  [/\bночь\b/gi, 'Midnight'],
  [/\bрассвет\b/gi, 'Pre-Dawn'],
  [/\bтуман\b/gi, 'Fog'],
  [/\bтишина\b/gi, 'Stillness'],
  [/\bбункер\b/gi, 'Sealed Bunker'],
  [/\bстанция\b/gi, 'Weather Station'],
  [/\bсигнал\b/gi, 'Anomalous Signal'],
  [/\bархив\b/gi, 'Classified Archive'],
  [/\bтайна\b/gi, 'Deep Mystery'],
  [/\bзапись\b/gi, 'Tape Recording'],
  [/\bкосмос\b/gi, 'Deep Space'],
  [/\bокеан\b/gi, 'Deep Ocean']
];

const DEFAULT_ENGLISH_ACT_THEMES = [
  'Opening Atmosphere',
  'Deepening Midnight Mood',
  'Sub-Zero Wind & Immersion',
  'Rising Atmospheric Tension',
  'Distant Horizon Resonance',
  'Pre-Dawn Stillness & Outro'
];

const DEFAULT_ENGLISH_SCENE_THEMES = [
  'The Initial Discovery',
  'Entering the Perimeter',
  'First Anomalous Signal',
  'Inside the Sealed Room',
  'Analyzing the Tape Logs',
  'The Missing Telemetry Window',
  'Midnight Static & Clues',
  'Unanswered Questions',
  'Approaching the Truth',
  'The Final Transmission'
];

export function transliterateToEnglishAscii(input: string): string {
  let out = input;
  for (const [pattern, replacement] of RU_TO_EN_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/[а-яёА-ЯЁ]/g, ch => TRANSLIT_MAP[ch] ?? '');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Гарантирует чистое английское название главы для timeline_slots в manifest_payload,
 * оставляя русский UI нетронутым.
 */
export function toEnglishChapterTitle(
  rawTitle: string | undefined,
  slotIndexZeroBased: number,
  actTimecode?: string
): string {
  const num = slotIndexZeroBased + 1;
  const theme = DEFAULT_ENGLISH_ACT_THEMES[slotIndexZeroBased % DEFAULT_ENGLISH_ACT_THEMES.length];
  const cleaned = (rawTitle || '').trim();

  if (!cleaned) {
    return actTimecode ? `Act ${num}: ${theme} (${actTimecode})` : `Act ${num}: ${theme}`;
  }

  if (!CYRILLIC_RE.test(cleaned)) {
    return cleaned;
  }

  // Если название вида "Акт 1 (0:00–0:30)" или "Слот 2" без пользовательского текста
  const genericActMatch = cleaned.match(/^(?:акт|слот|глава)\s*№?\s*(\d+)\s*(?:\(([^)]+)\))?$/i);
  if (genericActMatch) {
    const actNum = genericActMatch[1];
    const tc = genericActMatch[2]?.trim();
    return tc ? `Act ${actNum}: ${theme} (${tc})` : `Act ${actNum}: ${theme}`;
  }

  const converted = transliterateToEnglishAscii(cleaned);
  return converted || `Act ${num}: ${theme}`;
}

/**
 * Гарантирует чистое английское название главы (title) для каждого элемента scenes в manifest_payload.
 */
export function toEnglishSceneTitle(
  scene: {
    title?: string;
    text_overlay?: string;
    scene_id?: string;
  },
  sceneIndexZeroBased: number
): string {
  const num = sceneIndexZeroBased + 1;
  const theme = DEFAULT_ENGLISH_SCENE_THEMES[sceneIndexZeroBased % DEFAULT_ENGLISH_SCENE_THEMES.length];

  const explicitTitle = (scene.title || '').trim();
  if (explicitTitle) {
    if (!CYRILLIC_RE.test(explicitTitle)) {
      return explicitTitle;
    }
    const converted = transliterateToEnglishAscii(explicitTitle);
    if (converted && !/^Scene \d+$/i.test(converted)) {
      return converted;
    }
  }

  const overlay = (scene.text_overlay || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (overlay && !CYRILLIC_RE.test(overlay)) {
    const snippet = overlay.slice(0, 64).trim();
    if (snippet.length >= 4) {
      return `Chapter ${num}: ${snippet}`;
    }
  }

  return `Chapter ${num}: ${theme}`;
}

export const SEO_PRESETS_BY_TONE: Record<
  SeoToneStyle,
  {
    titles: [string, string, string];
    desc: string;
    tags: string;
  }
> = {
  'Dark Mystery': {
    titles: ['', '', ''],
    desc: `In this 4K investigative documentary, we examine the primary source logs, the missing communication window, and the non-disclosure agreements surrounding the event. Using forensic audio analysis and archival blueprints, we trace every verified clue step by step.\n\nWhether you enjoy dark historical mysteries, unexplained anomalies, or deep-dive investigative storytelling, this film reconstructs the timeline in crisp 4K Ultra HD with continuous unbroken narration.`,
    tags: 'dark mystery, documentary 4k, investigative doc, unsolved history, audio anomaly, declassified archive, true mystery story, forensic investigation, cinematic doc, eerie history, unexplained signal, aether studio'
  },
  'Cozy Ambient': {
    titles: ['', '', ''],
    desc: `Immerse yourself in an ultra-detailed 4K atmospheric experience engineered for deep sleep, uninterrupted study sessions, reading, and stress relief.\n\nEvery visual transition flows cleanly in 4K 24fps Ultra HD with normalized broadcast audio and zero sudden volume spikes.`,
    tags: 'cozy ambient 4k, deep sleep ambience, study ambience, atmospheric soundscape, 4k loop, relaxation video, deep focus audio, peaceful winter, sleep aid 4k, ultra hd 4k'
  },
  'Historical Doc': {
    titles: ['', '', ''],
    desc: `Drawing on primary archival records, duty rosters, and historical schematics, this 4K documentary traces the complete chronological timeline from the initial log entry to the final verified transmission.\n\nIdeal for viewers who appreciate rigorous historical documentaries, engineering history, and fact-based investigative journalism in crisp 4K Ultra HD resolution.`,
    tags: 'historical documentary, declassified history, archive, history documentary 4k, engineering mystery, archival footage doc, scientific expedition, documentary film, historical analysis, primary sources, 4k doc'
  },
  'Cinematic Drama': {
    titles: ['', '', ''],
    desc: `Edited with cinematic 4K 24fps pacing, layered sound design, and continuous unbroken voiceover narration, this short film reconstructs the pivotal hours behind the story.\n\nExperience atmospheric visuals and immersive storytelling from the opening frame to the closing end screen.`,
    tags: 'cinematic drama, suspense documentary, thriller storytelling, 4k short film, dramatic true story, atmospheric cinema, gripping documentary, cinematic investigation, voiceover story, 4k film'
  }
};

export function createDefaultYoutubeSeoState(tone: SeoToneStyle = 'Dark Mystery'): YoutubeSeoState {
  const preset = SEO_PRESETS_BY_TONE[tone];
  return {
    tone,
    selectedTitleId: 'A',
    titles: [
      {
        id: 'A',
        category: 'Intrigue',
        categoryRu: 'Интрига (Intrigue)',
        title: preset.titles[0]
      },
      {
        id: 'B',
        category: 'Contradiction',
        categoryRu: 'Противоречие (Contradiction)',
        title: preset.titles[1]
      },
      {
        id: 'C',
        category: 'Drama',
        categoryRu: 'Драма (Cinematic Drama)',
        title: preset.titles[2]
      }
    ],
    description: preset.desc,
    tagsString: preset.tags.slice(0, 495)
  };
}

export function loadStoredYoutubeSeoState(): YoutubeSeoState {
  const fallback = createDefaultYoutubeSeoState('Dark Mystery');
  try {
    const raw = localStorage.getItem(YOUTUBE_SEO_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<YoutubeSeoState>;
    if (
      parsed &&
      Array.isArray(parsed.titles) &&
      parsed.titles.length === 3 &&
      typeof parsed.description === 'string' &&
      typeof parsed.tagsString === 'string'
    ) {
      return {
        tone: parsed.tone || 'Dark Mystery',
        selectedTitleId: parsed.selectedTitleId || 'A',
        titles: parsed.titles,
        description: parsed.description,
        tagsString: parsed.tagsString
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Формирует строгий англоязычный блок youtube_seo ({ title, description, tags })
 * для передачи в manifest_payload в GitHub Actions (без кириллицы).
 */
export function buildEnglishYoutubeSeoBlock(
  seo: YoutubeSeoState,
  fallbackProjectName?: string
): YoutubeSeoManifestBlock {
  const preset = SEO_PRESETS_BY_TONE[seo.tone] || SEO_PRESETS_BY_TONE['Dark Mystery'];
  const selectedVariant =
    seo.titles.find(t => t.id === seo.selectedTitleId) || seo.titles[0];

  const sanitizeEnglish = (text: string, fallbackText: string): string => {
    const trimmed = (text || '').trim();
    if (!trimmed) return fallbackText;
    if (!CYRILLIC_RE.test(trimmed)) return trimmed;
    const stripped = trimmed.replace(/[а-яёА-ЯЁ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped.length >= 6 ? stripped : fallbackText;
  };

  const englishProjectHint =
    fallbackProjectName && !CYRILLIC_RE.test(fallbackProjectName.trim())
      ? fallbackProjectName.trim()
      : 'Aether Documentary 4K';

  const title = sanitizeEnglish(
    selectedVariant?.title || englishProjectHint,
    englishProjectHint
  ).slice(0, 100);

  const description = sanitizeEnglish(seo.description, preset.desc);

  const rawTags = sanitizeEnglish(seo.tagsString, preset.tags);
  const tags: string[] = [];
  let totalChars = 0;
  for (const tag of rawTags.split(',')) {
    const cleanTag = tag.trim();
    if (!cleanTag) continue;
    const nextLen = totalChars + (tags.length > 0 ? 2 : 0) + cleanTag.length;
    if (nextLen > 500) break;
    tags.push(cleanTag);
    totalChars = nextLen;
  }

  return {
    title,
    description,
    tags: tags.length > 0 ? tags : preset.tags.split(',').map(t => t.trim()).filter(Boolean)
  };
}
