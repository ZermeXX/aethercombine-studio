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
    titles: [
      'The 1974 Alpine Tape They Hid for 50 Years',
      'Evacuated in 24 Hours, Yet It Broadcast for 21 Days',
      'Why the Night Shift Signed a 50-Year Silence Pact'
    ],
    desc: `In 1974, a remote high-altitude Alpine weather station was abruptly evacuated in under twenty-four hours after recording an unexplained low-frequency acoustic signal. While declassified official reports blamed a sudden mountain avalanche, every telemetry sensor inside the sealed, unpowered bunker continued broadcasting a structured pulse for three straight weeks.\n\nIn this 4K investigative documentary, we examine the original magnetic tape logs, the missing forty-minute communication window, and the fifty-year non-disclosure agreement signed by the surviving night shift engineers. Using forensic audio analysis and archival blueprints, we reconstruct what actually happened behind the welded steel doors of Outpost 7.\n\nWhether you enjoy dark historical mysteries, unsolved Cold War anomalies, or deep-dive investigative storytelling, this documentary uncovers the evidence that authorities tried to erase from history. Watch until the final act to hear the unfiltered fourteen-second recording that started it all.`,
    tags: 'dark mystery, classified files, 1974 alpine tape, unexplained signal, abandoned station, cold war mystery, documentary 4k, investigative doc, unsolved history, audio anomaly, ghost broadcast, secret bunker, reel to reel tape, declassified archive, true mystery story, snowbound outpost, acoustic phenomenon, mystery documentary, deep dive history, lost recording, 50 year nda, vanished crew, forensic investigation, cinematic doc, eerie history, numbers station, arctic anomaly, dark history, mysterious broadcast, aether studio'
  },
  'Cozy Ambient': {
    titles: [
      'Heavy Arctic Blizzard Outside Warm Cabin (4K Loop)',
      'Frozen Storm Outside, Yet 100% Warm Peace Inside',
      '3 Hours of Deep Winter Wind & Crackling Fireplace'
    ],
    desc: `Immerse yourself in an ultra-detailed 4K ambient soundscape where a relentless high-altitude snowstorm meets the warm, comforting glow of a secluded mountain cabin. Mastered at -16 LUFS with seamless 90-second act transitions, this multi-hour audiovisual experience is engineered for deep sleep, uninterrupted study sessions, reading, and stress relief.\n\nEvery visual act blends organic snowfall physics with natural low-frequency wind resonance and soft hearth embers—free from jarring cuts or sudden volume spikes. Put on your headphones, dim the room lights, and let the peaceful contrast between the freezing arctic blizzard outside and the safe shelter inside calm your mind.\n\nSubscribe for weekly 4K Ultra HD ambient loops, dark screen sleep soundscapes, and cinematic atmospheric environments designed to help you focus, relax, and recharge every single night.`,
    tags: 'cozy ambient 4k, snowstorm ambience, winter blizzard sounds, howling wind 4k, deep sleep ambience, study ambience, cozy cabin storm, crackling fireplace, arctic wind soundscape, seamless loop 4k, relaxation video, white noise sleep, atmospheric soundscape, heavy snowstorm, insomnia relief, meditation nature, binaural wind, ultra hd 4k loop, ambient drone, deep focus audio, storm outside window, night blizzard 4k, peaceful winter, sleep aid 4k, ambient study, nature soundscape, cozy rain snow, dark screen sleep, cabin ambience, 4k ambience'
  },
  'Historical Doc': {
    titles: [
      'Inside the Classified 1974 Alpine Station Dossier',
      'Official Logs Said Avalanche, Telemetry Proved Otherwise',
      'The Forgotten Engineers Who Locked Outpost 7 Forever'
    ],
    desc: `Declassified after fifty years, the archival records of the 1974 high-altitude weather station incident reveal one of the most compelling technological mysteries of the twentieth century. Within twenty-four hours of logging a persistent sub-audible frequency, the entire research facility was shuttered and placed under strict military quarantine.\n\nIn this historical documentary, we cross-reference primary source duty rosters, analog oscilloscope transcripts, and geopolitical records to understand why an ordinary meteorological outpost required a half-century secrecy mandate. Step by step, we trace the timeline from the first anomalous signal at 03:17 AM to the final automated transmission twenty-one days later.\n\nIdeal for viewers who appreciate rigorous historical documentaries, archival history, Cold War engineering, and fact-based investigative journalism in crisp 4K Ultra HD resolution.`,
    tags: 'historical documentary, cold war history, declassified history, 1974 archive, history documentary 4k, engineering mystery, archival footage doc, military history, scientific expedition, forgotten history, twentieth century history, investigative history, historical enigma, radar station history, alpine expedition, secret research facility, documentary film, historical analysis, primary sources, cold war bunker, analog telemetry, history channel style, deep history dive, unsolved historical event, meteorological station, classified dossier, history buff, true history, geopolitical history, 4k doc'
  },
  'Cinematic Drama': {
    titles: [
      '14 Seconds on Tape That Changed Everything',
      'The Power Was Cut, But the Microphone Stayed Live',
      'They Had 24 Hours to Vanish & Never Speak Again'
    ],
    desc: `At 03:17 AM, during the worst mountain blizzard of the decade, a single red indicator lamp began blinking inside a locked communications room. What the duty officer recorded on that magnetic reel forced an immediate evacuation at dawn—and bound every witness to fifty years of silence.\n\nShot and edited with cinematic 4K pacing, dramatic sound design, and frame-by-frame tension, this film reconstructs the final hours inside the station before the steel doors were welded shut. Every clue leads closer to the forty-minute gap that investigators were ordered never to mention.\n\nExperience gripping cinematic storytelling, atmospheric visuals, and relentless suspense as we uncover the human drama behind the sealed tape that refused to stay buried.`,
    tags: 'cinematic drama, suspense documentary, thriller storytelling, 4k short film, dramatic true story, mystery thriller, atmospheric cinema, dark storytelling, gripping documentary, untold story, 24 hours to evacuate, classified tape drama, night shift story, bunker mystery, cinematic investigation, high tension doc, true suspense, emotional documentary, film look 4k, dramatic reconstruction, voiceover story, immersive documentary, mystery cinema, cold war drama, survival story, locked room mystery, investigative drama, plot twist doc, deep storytelling, aether cinema'
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
    return stripped.length >= 12 ? stripped : fallbackText;
  };

  const englishProjectHint =
    fallbackProjectName && !CYRILLIC_RE.test(fallbackProjectName.trim())
      ? fallbackProjectName.trim()
      : '';

  const title = sanitizeEnglish(
    selectedVariant?.title || englishProjectHint,
    preset.titles[0]
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
