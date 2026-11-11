/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Mic,
  Key,
  RefreshCw,
  Star,
  Play,
  Square,
  Download,
  CheckCircle2,
  Volume2,
  Wand2,
  Sparkles,
  FileAudio,
  Save,
  AlertTriangle,
  Globe
} from 'lucide-react';

export type VoiceProvider = 'elevenlabs' | 'edgetts';
export type VoiceLanguage =
  | 'all'
  | 'English US'
  | 'English UK'
  | 'Русский'
  | 'Українська'
  | 'Español'
  | 'Deutsch'
  | 'Français';
export type VoiceGenderFilter = 'all' | 'male' | 'female';

export interface StudioVoiceItem {
  id: string;
  name: string;
  provider: VoiceProvider;
  language: Exclude<VoiceLanguage, 'all'>;
  lang?: string;
  gender: 'male' | 'female' | 'universal';
  description: string;
  previewUrl?: string;
  labels?: Record<string, string>;
  isUniversal?: boolean;
}

interface ElevenLabsSubscriptionInfo {
  character_count: number;
  character_limit: number;
  tier?: string;
  loading?: boolean;
  error?: string;
}

interface AetherVoiceSettings {
  activeAccount: string;
  elevenKey1: string;
  elevenKey2: string;
  activeEngine: VoiceProvider;
  selectedLang: VoiceLanguage;
  selectedGender: VoiceGenderFilter;
  selectedVoiceId: string;
  favorites?: string[];
}

interface VoiceStudioViewProps {
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  onMasterVoiceoverReady: (fileName: string, audioFile?: File, durationSec?: number) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const LANGUAGE_TO_PREFIX_MAP: Record<Exclude<VoiceLanguage, 'all'>, string> = {
  'English US': 'en-US',
  'English UK': 'en-GB',
  Русский: 'ru',
  Українська: 'uk',
  Deutsch: 'de',
  Español: 'es',
  Français: 'fr'
};

const LANGUAGE_MATCH_TOKENS: Record<Exclude<VoiceLanguage, 'all'>, string[]> = {
  'English US': ['en-us', 'english us', 'american', 'us', 'en'],
  'English UK': ['en-gb', 'english uk', 'british', 'uk'],
  Русский: ['ru', 'ru-ru', 'russian', 'русский'],
  Українська: ['uk', 'uk-ua', 'ukrainian', 'українська'],
  Español: ['es', 'es-es', 'spanish', 'español', 'latino'],
  Deutsch: ['de', 'de-de', 'german', 'deutsch'],
  Français: ['fr', 'fr-fr', 'french', 'français']
};

// Жестко зашитая структура пресетов Edge TTS по ключам "язык_пол"
const EDGE_TTS_PRESETS_BY_KEY: Record<string, StudioVoiceItem[]> = {
  'ru_male': [
    {
      id: 'ru-RU-DmitryNeural',
      name: 'Дмитрий (ru-RU-DmitryNeural)',
      provider: 'edgetts',
      language: 'Русский',
      lang: 'Русский (ru)',
      gender: 'male',
      description: 'Глубокий баритон для документального кино и тру-крайма',
      labels: { language: 'ru', gender: 'male', accent: 'russian' }
    }
  ],
  'ru_female': [
    {
      id: 'ru-RU-SvetlanaNeural',
      name: 'Светлана (ru-RU-SvetlanaNeural)',
      provider: 'edgetts',
      language: 'Русский',
      lang: 'Русский (ru)',
      gender: 'female',
      description: 'Чистый студийный женский голос с мягкой подачей',
      labels: { language: 'ru', gender: 'female', accent: 'russian' }
    }
  ],
  'en-US_male': [
    {
      id: 'en-US-GuyNeural',
      name: 'Guy (en-US-GuyNeural)',
      provider: 'edgetts',
      language: 'English US',
      lang: 'English US (en-US)',
      gender: 'male',
      description: 'Deep Narrative Documentary Male • Studio Neural',
      labels: { language: 'en-US', gender: 'male', accent: 'american' }
    },
    {
      id: 'en-US-ChristopherNeural',
      name: 'Christopher (en-US-ChristopherNeural)',
      provider: 'edgetts',
      language: 'English US',
      lang: 'English US (en-US)',
      gender: 'male',
      description: 'Authoritative Investigative Storyteller • Studio Neural',
      labels: { language: 'en-US', gender: 'male', accent: 'american' }
    }
  ],
  'en-US_female': [
    {
      id: 'en-US-JennyNeural',
      name: 'Jenny (en-US-JennyNeural)',
      provider: 'edgetts',
      language: 'English US',
      lang: 'English US (en-US)',
      gender: 'female',
      description: 'Warm Clear Broadcast Female • Studio Neural',
      labels: { language: 'en-US', gender: 'female', accent: 'american' }
    }
  ],
  'en-GB_male': [
    {
      id: 'en-GB-RyanNeural',
      name: 'Ryan (en-GB-RyanNeural)',
      provider: 'edgetts',
      language: 'English UK',
      lang: 'English UK (en-GB)',
      gender: 'male',
      description: 'British BBC-Style Documentary Narrator • Studio Neural',
      labels: { language: 'en-GB', gender: 'male', accent: 'british' }
    }
  ],
  'en-GB_female': [
    {
      id: 'en-GB-SoniaNeural',
      name: 'Sonia (en-GB-SoniaNeural)',
      provider: 'edgetts',
      language: 'English UK',
      lang: 'English UK (en-GB)',
      gender: 'female',
      description: 'Crisp British Narrator • Studio Neural',
      labels: { language: 'en-GB', gender: 'female', accent: 'british' }
    }
  ],
  'uk_male': [
    {
      id: 'uk-UA-OstapNeural',
      name: 'Остап (uk-UA-OstapNeural)',
      provider: 'edgetts',
      language: 'Українська',
      lang: 'Українська (uk)',
      gender: 'male',
      description: 'Виразний чоловічий дикторський голос • Studio Neural',
      labels: { language: 'uk', gender: 'male', accent: 'ukrainian' }
    }
  ],
  'uk_female': [
    {
      id: 'uk-UA-PolinaNeural',
      name: 'Поліна (uk-UA-PolinaNeural)',
      provider: 'edgetts',
      language: 'Українська',
      lang: 'Українська (uk)',
      gender: 'female',
      description: 'Природний жіночий студійний голос • Studio Neural',
      labels: { language: 'uk', gender: 'female', accent: 'ukrainian' }
    }
  ],
  'de_male': [
    {
      id: 'de-DE-ConradNeural',
      name: 'Conrad (de-DE-ConradNeural)',
      provider: 'edgetts',
      language: 'Deutsch',
      lang: 'Deutsch (de)',
      gender: 'male',
      description: 'Klangvoller Dokumentarfilm-Sprecher • Studio Neural',
      labels: { language: 'de', gender: 'male', accent: 'german' }
    }
  ],
  'de_female': [
    {
      id: 'de-DE-KatjaNeural',
      name: 'Katja (de-DE-KatjaNeural)',
      provider: 'edgetts',
      language: 'Deutsch',
      lang: 'Deutsch (de)',
      gender: 'female',
      description: 'Klare deutsche Erzählstimme • Studio Neural',
      labels: { language: 'de', gender: 'female', accent: 'german' }
    }
  ],
  'es_male': [
    {
      id: 'es-ES-AlvaroNeural',
      name: 'Alvaro (es-ES-AlvaroNeural)',
      provider: 'edgetts',
      language: 'Español',
      lang: 'Español (es)',
      gender: 'male',
      description: 'Narrador cinematográfico profundo • Studio Neural',
      labels: { language: 'es', gender: 'male', accent: 'spanish' }
    }
  ],
  'es_female': [
    {
      id: 'es-ES-ElviraNeural',
      name: 'Elvira (es-ES-ElviraNeural)',
      provider: 'edgetts',
      language: 'Español',
      lang: 'Español (es)',
      gender: 'female',
      description: 'Voz femenina cálida y clara • Studio Neural',
      labels: { language: 'es', gender: 'female', accent: 'spanish' }
    }
  ],
  'fr_male': [
    {
      id: 'fr-FR-HenriNeural',
      name: 'Henri (fr-FR-HenriNeural)',
      provider: 'edgetts',
      language: 'Français',
      lang: 'Français (fr)',
      gender: 'male',
      description: 'Voix masculine documentaire • Studio Neural',
      labels: { language: 'fr', gender: 'male', accent: 'french' }
    }
  ],
  'fr_female': [
    {
      id: 'fr-FR-DeniseNeural',
      name: 'Denise (fr-FR-DeniseNeural)',
      provider: 'edgetts',
      language: 'Français',
      lang: 'Français (fr)',
      gender: 'female',
      description: 'Voix féminine narrative • Studio Neural',
      labels: { language: 'fr', gender: 'female', accent: 'french' }
    }
  ]
};

const EDGE_TTS_PRESET_VOICES: StudioVoiceItem[] = Object.values(EDGE_TTS_PRESETS_BY_KEY).flat();

const DEFAULT_ELEVENLABS_VOICES: StudioVoiceItem[] = [
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam (Deep Documentary Baritone)',
    provider: 'elevenlabs',
    language: 'English US',
    lang: 'English US (en-US)',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Iconic Deep Mystery Narrator',
    labels: { language: 'en-US', accent: 'american', gender: 'male' }
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni (Crisp Storyteller)',
    provider: 'elevenlabs',
    language: 'English US',
    lang: 'English US (en-US)',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Paced Investigative Tone',
    labels: { language: 'en-US', accent: 'american', gender: 'male' }
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (Calm Narrative Female)',
    provider: 'elevenlabs',
    language: 'English US',
    lang: 'English US (en-US)',
    gender: 'female',
    description: 'ElevenLabs Multilingual v2 • Smooth Broadcast Voice',
    labels: { language: 'en-US', accent: 'american', gender: 'female' }
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel (British Documentary)',
    provider: 'elevenlabs',
    language: 'English UK',
    lang: 'English UK (en-GB)',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Authoritative UK Presenter',
    labels: { language: 'en-GB', accent: 'british', gender: 'male' }
  },
  {
    id: 'N2lVS1w4EtoT3dr4eOWO',
    name: 'Callum (Universal Multilingual)',
    provider: 'elevenlabs',
    language: 'English US',
    lang: 'universal',
    gender: 'universal',
    description: 'ElevenLabs Multilingual v2 • Другие / Универсальные (без явных меток языка/пола)',
    labels: {},
    isUniversal: true
  }
];

const YO_DICTIONARY: Array<[RegExp, string]> = [
  [/\bеще\b/gi, 'ещё'],
  [/\bвсе\b/gi, 'всё'],
  [/\bпленк([а-я]*)\b/gi, 'плёнк$1'],
  [/\bсъемк([а-я]*)\b/gi, 'съёмк$1'],
  [/\bтяжел([а-я]*)\b/gi, 'тяжёл$1'],
  [/\bчерн([а-я]*)\b/gi, 'чёрн$1'],
  [/\bзасекреченн([а-я]*)\b/gi, 'засекречённ$1'],
  [/\bвключен([а-я]*)\b/gi, 'включён$1'],
  [/\bотключен([а-я]*)\b/gi, 'отключён$1'],
  [/\bнашел\b/gi, 'нашёл'],
  [/\bпришел\b/gi, 'пришёл'],
  [/\bпроизошел\b/gi, 'произошёл'],
  [/\bтрех\b/gi, 'трёх'],
  [/\bчетырех\b/gi, 'четырёх'],
  [/\bлед\b/gi, 'лёд'],
  [/\bотчет([а-я]*)\b/gi, 'отчёт$1']
];

function numberToEnglishWords(n: number): string {
  if (isNaN(n) || n < 0) return String(n);
  if (n === 0) return 'zero';
  const ones = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen'
  ];
  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety'
  ];

  if (n >= 1901 && n <= 1999) {
    const last = n % 100;
    const t = Math.floor(last / 10);
    const o = last % 10;
    const suffix =
      last < 10 ? `oh-${ones[last]}` : last < 20 ? ones[last] : `${tens[t]}${o ? '-' + ones[o] : ''}`;
    return `nineteen ${suffix}`;
  }
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o ? '-' + ones[o] : ''}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return `${ones[h]} hundred${rem ? ' ' + numberToEnglishWords(rem) : ''}`;
  }
  return String(n);
}

function numberToRussianWordsSimple(n: number): string {
  const map: Record<number, string> = {
    1: 'один',
    2: 'два',
    3: 'три',
    5: 'пять',
    10: 'десять',
    12: 'двенадцать',
    14: 'четырнадцать',
    15: 'пятнадцать',
    20: 'двадцать',
    21: 'двадцать один',
    24: 'двадцать четыре',
    30: 'тридцать',
    40: 'сорок',
    45: 'сорок пять',
    50: 'пятьдесят',
    60: 'шестьдесят',
    90: 'девяносто',
    1974: 'тысяча девятьсот семьдесят четвёртом'
  };
  return map[n] || numberToEnglishWords(n);
}

function createSynthesizedVoiceoverBlob(durationSec: number): Blob {
  const sampleRate = 22050;
  const numSamples = Math.max(
    sampleRate * 2,
    Math.min(sampleRate * 30, Math.floor(sampleRate * durationSec))
  );
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const cadence = Math.sin(t * 3.2) > -0.35 ? 1 : 0.05;
    const envelope = Math.min(1, t / 0.15) * Math.min(1, (numSamples / sampleRate - t) / 0.25);
    const wave =
      (Math.sin(2 * Math.PI * 135 * t) * 0.55 +
        Math.sin(2 * Math.PI * 270 * t) * 0.25 +
        Math.sin(2 * Math.PI * 405 * t) * 0.12) *
      cadence *
      envelope *
      0.22;
    const sample = Math.max(-1, Math.min(1, wave));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/mpeg' });
}

/**
 * Чтение настроек дикторского цеха из localStorage ('aether_voice_settings' и 'config_voice_studio')
 */
export function loadVoiceStudioSettings(): Partial<AetherVoiceSettings> {
  try {
    const rawAether = localStorage.getItem('aether_voice_settings');
    if (rawAether) {
      const s = JSON.parse(rawAether) as Partial<AetherVoiceSettings>;
      const elKey1 = document.getElementById('eleven_key_1') as HTMLInputElement | null;
      const elKey2 = document.getElementById('eleven_key_2') as HTMLInputElement | null;
      const elEngine = document.getElementById('voice_engine_select') as HTMLSelectElement | null;
      const elLang = document.getElementById('voice_lang_select') as HTMLSelectElement | null;
      const elGender = document.getElementById('voice_gender_select') as HTMLSelectElement | null;
      const elVoice = document.getElementById('voice_id_select') as HTMLSelectElement | null;

      if (s.elevenKey1 && elKey1) elKey1.value = s.elevenKey1;
      if (s.elevenKey2 && elKey2) elKey2.value = s.elevenKey2;
      if (s.activeEngine && elEngine) elEngine.value = s.activeEngine;
      if (s.selectedLang && elLang) elLang.value = s.selectedLang;
      if (s.selectedGender && elGender) elGender.value = s.selectedGender;
      if (s.selectedVoiceId && elVoice) elVoice.value = s.selectedVoiceId;
      return s;
    }

    const rawConfig = localStorage.getItem('config_voice_studio');
    if (rawConfig) {
      const c = JSON.parse(rawConfig) as Record<string, unknown>;
      return {
        activeAccount: String(c.activeAccount || '1'),
        elevenKey1: String(c.apiKey1 || ''),
        elevenKey2: String(c.apiKey2 || ''),
        activeEngine: (c.provider as VoiceProvider) || 'edgetts',
        selectedLang: (c.selectedLanguage as VoiceLanguage) || 'English US',
        selectedGender: (c.selectedGender as VoiceGenderFilter) || 'all',
        selectedVoiceId: String(c.selectedVoiceId || 'en-US-ChristopherNeural'),
        favorites: Array.isArray(c.favorites) ? (c.favorites as string[]) : undefined
      };
    }
  } catch (err) {
    console.warn('Ошибка загрузки настроек голосов:', err);
  }
  return {};
}

/**
 * Фильтрация голосов (Edge TTS / ElevenLabs) по языку и полу
 */
export function filterAndPopulateVoices(
  voicesList: StudioVoiceItem[],
  langOverride?: string,
  genderOverride?: string
): StudioVoiceItem[] {
  const langEl = document.getElementById('voice_lang_select') as HTMLSelectElement | null;
  const genderEl = document.getElementById('voice_gender_select') as HTMLSelectElement | null;
  const lang = langOverride ?? langEl?.value ?? 'all';
  const gender = genderOverride ?? genderEl?.value ?? 'all';

  return voicesList.filter(voice => {
    const voiceLangStr = `${voice.lang || ''} ${voice.language || ''} ${voice.labels?.language || ''} ${voice.labels?.accent || ''}`.toLowerCase();
    const matchLang = lang === 'all' || voiceLangStr.includes(lang.toLowerCase());
    const matchGender =
      gender === 'all' ||
      voice.gender === 'universal' ||
      (voice.gender && voice.gender.toLowerCase() === gender.toLowerCase());
    return matchLang && matchGender;
  });
}

export const VoiceStudioView: React.FC<VoiceStudioViewProps> = ({
  scriptText,
  onScriptTextChange,
  onMasterVoiceoverReady,
  onNotify
}) => {
  const initialSavedConfig = useMemo(() => loadVoiceStudioSettings(), []);

  // 1. Мульти-аккаунт ElevenLabs (2 API-ключа + активный аккаунт)
  const [apiKey1, setApiKey1] = useState<string>(
    () => initialSavedConfig.elevenKey1 ?? localStorage.getItem('elevenlabs_api_key_1') ?? ''
  );
  const [apiKey2, setApiKey2] = useState<string>(
    () => initialSavedConfig.elevenKey2 ?? localStorage.getItem('elevenlabs_api_key_2') ?? ''
  );
  const [activeKeySlot, setActiveKeySlot] = useState<1 | 2>(() => {
    if (initialSavedConfig.activeAccount === '2') return 2;
    if (initialSavedConfig.activeAccount === '1') return 1;
    return localStorage.getItem('elevenlabs_active_slot') === '2' ? 2 : 1;
  });

  const [subInfo1, setSubInfo1] = useState<ElevenLabsSubscriptionInfo | null>(null);
  const [subInfo2, setSubInfo2] = useState<ElevenLabsSubscriptionInfo | null>(null);

  // Выбранный движок (ElevenLabs или Edge TTS)
  const [provider, setProvider] = useState<VoiceProvider>(
    () => initialSavedConfig.activeEngine || 'edgetts'
  );

  // 2. Каскадный фильтр голосов: Язык и Пол
  const [selectedLanguage, setSelectedLanguage] = useState<VoiceLanguage>(
    () => initialSavedConfig.selectedLang || 'English US'
  );
  const [genderFilter, setGenderFilter] = useState<VoiceGenderFilter>(
    () => initialSavedConfig.selectedGender || 'all'
  );

  // Каталог голосов ElevenLabs + состояние загрузки и ошибок сети
  const [elevenLabsVoices, setElevenLabsVoices] = useState<StudioVoiceItem[]>(
    DEFAULT_ELEVENLABS_VOICES
  );
  const [loadingVoices, setLoadingVoices] = useState<boolean>(false);
  const [voicesFetchError, setVoicesFetchError] = useState<string | null>(null);

  // 3. Избранное (⭐ Favorites)
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(() => {
    if (Array.isArray(initialSavedConfig.favorites) && initialSavedConfig.favorites.length > 0) {
      return initialSavedConfig.favorites;
    }
    try {
      const raw = localStorage.getItem('favorite_voices');
      return raw ? JSON.parse(raw) : ['en-US-ChristopherNeural', 'en-US-GuyNeural'];
    } catch {
      return ['en-US-ChristopherNeural', 'en-US-GuyNeural'];
    }
  });

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    () => initialSavedConfig.selectedVoiceId || 'en-US-ChristopherNeural'
  );

  const [renderedPrimaryVoices, setRenderedPrimaryVoices] = useState<StudioVoiceItem[]>([]);
  const [renderedUniversalVoices, setRenderedUniversalVoices] = useState<StudioVoiceItem[]>([]);

  const [playingDemoId, setPlayingDemoId] = useState<string | null>(null);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState<boolean>(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>('');
  const [generatedDurationSec, setGeneratedDurationSec] = useState<number>(0);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem('elevenlabs_api_key_1', apiKey1);
  }, [apiKey1]);

  useEffect(() => {
    localStorage.setItem('elevenlabs_api_key_2', apiKey2);
  }, [apiKey2]);

  useEffect(() => {
    localStorage.setItem('elevenlabs_active_slot', String(activeKeySlot));
  }, [activeKeySlot]);

  useEffect(() => {
    localStorage.setItem('favorite_voices', JSON.stringify(favoriteVoiceIds));
  }, [favoriteVoiceIds]);

  const activeElevenLabsKey = activeKeySlot === 1 ? apiKey1.trim() : apiKey2.trim();

  // ============================================================================
  // КНОПКА «💾 СОХРАНИТЬ НАСТРОЙКИ» (saveVoiceStudioSettings -> aether_voice_settings + config_voice_studio)
  // ============================================================================
  const saveVoiceStudioSettings = useCallback(() => {
    const checkedAccountRadio = document.querySelector(
      'input[name="eleven_account"]:checked'
    ) as HTMLInputElement | null;
    const settings: AetherVoiceSettings = {
      activeAccount: checkedAccountRadio?.value || String(activeKeySlot),
      elevenKey1: apiKey1,
      elevenKey2: apiKey2,
      activeEngine: provider,
      selectedLang: selectedLanguage,
      selectedGender: genderFilter,
      selectedVoiceId,
      favorites: favoriteVoiceIds
    };

    localStorage.setItem('aether_voice_settings', JSON.stringify(settings));
    localStorage.setItem(
      'config_voice_studio',
      JSON.stringify({
        activeAccount: activeKeySlot,
        apiKey1,
        apiKey2,
        provider,
        selectedLanguage,
        selectedGender: genderFilter,
        selectedVoiceId,
        favorites: favoriteVoiceIds
      })
    );
    localStorage.setItem('elevenlabs_api_key_1', apiKey1);
    localStorage.setItem('elevenlabs_api_key_2', apiKey2);
    localStorage.setItem('elevenlabs_active_slot', String(activeKeySlot));
    localStorage.setItem('favorite_voices', JSON.stringify(favoriteVoiceIds));

    onNotify('💾 Настройки дикторского цеха сохранены!', 'success');
  }, [
    activeKeySlot,
    apiKey1,
    apiKey2,
    provider,
    selectedLanguage,
    genderFilter,
    selectedVoiceId,
    favoriteVoiceIds,
    onNotify
  ]);

  // ============================================================================
  // ЕДИНАЯ ФУНКЦИЯ ФИЛЬТРАЦИИ renderFilteredVoices() + filterAndPopulateVoices()
  // ============================================================================
  const renderFilteredVoices = useCallback(
    (
      targetProvider: VoiceProvider,
      targetLang: VoiceLanguage,
      targetGender: VoiceGenderFilter,
      elevenCatalog: StudioVoiceItem[]
    ) => {
      if (targetProvider === 'edgetts') {
        if (targetLang === 'all') {
          const allEdge = filterAndPopulateVoices(EDGE_TTS_PRESET_VOICES, 'all', targetGender);
          setRenderedPrimaryVoices(allEdge);
          setRenderedUniversalVoices([]);
          if (allEdge.length > 0 && !allEdge.some(v => v.id === selectedVoiceId)) {
            setSelectedVoiceId(allEdge[0].id);
          }
          return;
        }

        const langPrefix = LANGUAGE_TO_PREFIX_MAP[targetLang] || 'en-US';
        let matchedEdge: StudioVoiceItem[] = [];
        if (targetGender === 'all') {
          matchedEdge = [
            ...(EDGE_TTS_PRESETS_BY_KEY[`${langPrefix}_male`] || []),
            ...(EDGE_TTS_PRESETS_BY_KEY[`${langPrefix}_female`] || [])
          ];
        } else {
          matchedEdge = EDGE_TTS_PRESETS_BY_KEY[`${langPrefix}_${targetGender}`] || [];
        }

        setRenderedPrimaryVoices(matchedEdge);
        setRenderedUniversalVoices([]);

        if (matchedEdge.length > 0 && !matchedEdge.some(v => v.id === selectedVoiceId)) {
          setSelectedVoiceId(matchedEdge[0].id);
        }
        return;
      }

      // Для ElevenLabs
      if (targetLang === 'all') {
        const filteredAll = filterAndPopulateVoices(elevenCatalog, 'all', targetGender);
        setRenderedPrimaryVoices(filteredAll.filter(v => !v.isUniversal));
        setRenderedUniversalVoices(filteredAll.filter(v => v.isUniversal));
        if (filteredAll.length > 0 && !filteredAll.some(v => v.id === selectedVoiceId)) {
          setSelectedVoiceId(filteredAll[0].id);
        }
        return;
      }

      const langPrefix = LANGUAGE_TO_PREFIX_MAP[targetLang] || 'en-US';
      const selectedLangLower = langPrefix.toLowerCase();
      const validTokens = LANGUAGE_MATCH_TOKENS[targetLang] || [selectedLangLower];

      const primaryList: StudioVoiceItem[] = [];
      const universalList: StudioVoiceItem[] = [];

      elevenCatalog.forEach(voice => {
        const rawLang = (voice.labels?.language || '').trim().toLowerCase();
        const rawAccent = (voice.labels?.['accent'] || '').trim().toLowerCase();
        const rawGender = (voice.labels?.gender || '').trim().toLowerCase();

        const hasExplicitLabels = Boolean((rawLang || rawAccent) && rawGender);
        if (!hasExplicitLabels || voice.isUniversal || voice.gender === 'universal') {
          if (
            targetGender === 'all' ||
            !rawGender ||
            rawGender === targetGender.toLowerCase()
          ) {
            universalList.push({
              ...voice,
              isUniversal: true
            });
          }
          return;
        }

        const langMatches =
          voice.labels?.language === langPrefix ||
          rawLang === selectedLangLower ||
          Boolean(voice.labels?.['accent']?.toLowerCase().includes(selectedLangLower)) ||
          validTokens.some(tok => rawLang === tok || rawAccent.includes(tok));

        const genderMatches =
          targetGender === 'all' ||
          voice.labels?.gender?.toLowerCase() === targetGender.toLowerCase();

        if (langMatches && genderMatches) {
          primaryList.push(voice);
        } else if (genderMatches) {
          universalList.push({
            ...voice,
            isUniversal: true
          });
        }
      });

      setRenderedPrimaryVoices(primaryList);
      setRenderedUniversalVoices(universalList);

      const combined = [...primaryList, ...universalList];
      if (combined.length > 0 && !combined.some(v => v.id === selectedVoiceId)) {
        setSelectedVoiceId(combined[0].id);
      }
    },
    [selectedVoiceId]
  );

  useEffect(() => {
    renderFilteredVoices(provider, selectedLanguage, genderFilter, elevenLabsVoices);
  }, [provider, selectedLanguage, genderFilter, elevenLabsVoices, renderFilteredVoices]);

  const handleProviderChange = (nextProvider: VoiceProvider) => {
    setProvider(nextProvider);
    setVoicesFetchError(null);
    renderFilteredVoices(nextProvider, selectedLanguage, genderFilter, elevenLabsVoices);
  };

  const handleLanguageChange = (nextLang: VoiceLanguage) => {
    setSelectedLanguage(nextLang);
    renderFilteredVoices(provider, nextLang, genderFilter, elevenLabsVoices);
  };

  const handleGenderTabClick = (nextGender: VoiceGenderFilter) => {
    setGenderFilter(nextGender);
    renderFilteredVoices(provider, selectedLanguage, nextGender, elevenLabsVoices);
  };

  // Проверка баланса символов через GET https://api.elevenlabs.io/v1/user/subscription
  const fetchSubscriptionBalance = useCallback(
    async (slot: 1 | 2, keyValue: string) => {
      const cleanKey = keyValue.trim();
      if (!cleanKey) {
        if (slot === 1) setSubInfo1(null);
        else setSubInfo2(null);
        return;
      }

      const setTarget = slot === 1 ? setSubInfo1 : setSubInfo2;
      setTarget({ character_count: 0, character_limit: 10000, loading: true });

      try {
        const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: {
            'xi-api-key': cleanKey
          }
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          character_count?: number;
          character_limit?: number;
          tier?: string;
        };
        setTarget({
          character_count: Number(data.character_count ?? 0),
          character_limit: Number(data.character_limit ?? 10000),
          tier: data.tier || 'starter',
          loading: false
        });
        onNotify(`Баланс ElevenLabs Key #${slot} успешно обновлен!`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTarget({
          character_count: 0,
          character_limit: 0,
          loading: false,
          error: `Ошибка ключа (${msg})`
        });
      }
    },
    [onNotify]
  );

  // Подгрузка каталога голосов ElevenLabs через GET https://api.elevenlabs.io/v1/voices
  const fetchElevenLabsVoicesCatalog = useCallback(async () => {
    if (!activeElevenLabsKey) {
      setVoicesFetchError(
        'API-ключ ElevenLabs не указан в активном слоте. Отображены встроенные студийные пресеты ElevenLabs.'
      );
      return;
    }

    setLoadingVoices(true);
    setVoicesFetchError(null);
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': activeElevenLabsKey
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        voices?: Array<{
          voice_id: string;
          name: string;
          labels?: Record<string, string>;
          preview_url?: string;
          category?: string;
        }>;
      };

      if (Array.isArray(data.voices) && data.voices.length > 0) {
        const mapped: StudioVoiceItem[] = data.voices.map(v => {
          const labelsObj = v.labels || {};
          const genderLabel = (labelsObj.gender || '').toLowerCase();
          const accentLabel = (labelsObj.accent || '').toLowerCase();
          const langLabel = (labelsObj.language || '').toLowerCase();

          const hasExplicitLabels = Boolean((langLabel || accentLabel) && genderLabel);
          const gender: 'male' | 'female' | 'universal' =
            genderLabel === 'female' ? 'female' : genderLabel === 'male' ? 'male' : 'universal';

          let lang: Exclude<VoiceLanguage, 'all'> = 'English US';
          if (accentLabel.includes('british') || langLabel.includes('en-gb')) lang = 'English UK';
          else if (accentLabel.includes('russian') || langLabel === 'ru') lang = 'Русский';
          else if (accentLabel.includes('ukrainian') || langLabel === 'uk') lang = 'Українська';
          else if (accentLabel.includes('german') || langLabel === 'de') lang = 'Deutsch';
          else if (accentLabel.includes('spanish') || langLabel === 'es') lang = 'Español';
          else if (accentLabel.includes('french') || langLabel === 'fr') lang = 'Français';

          return {
            id: v.voice_id,
            name: `${v.name} (ElevenLabs)`,
            provider: 'elevenlabs',
            language: lang,
            lang: langLabel || accentLabel || lang,
            gender,
            description: `${v.category || 'Premade'} • ${labelsObj.description || labelsObj.use_case || 'Multilingual v2'}`,
            previewUrl: v.preview_url,
            labels: labelsObj,
            isUniversal: !hasExplicitLabels
          };
        });
        setElevenLabsVoices(mapped);
        renderFilteredVoices('elevenlabs', selectedLanguage, genderFilter, mapped);
        onNotify(`Загружено ${mapped.length} голосов из каталога ElevenLabs API!`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoicesFetchError(
        `Не удалось загрузить каталог из сети ElevenLabs (${msg}). Показаны резервные студийные пресеты.`
      );
      onNotify(`Ошибка сети ElevenLabs (${msg}) — показаны резервные голоса`, 'info');
    } finally {
      setLoadingVoices(false);
    }
  }, [activeElevenLabsKey, selectedLanguage, genderFilter, renderFilteredVoices, onNotify]);

  useEffect(() => {
    if (provider === 'elevenlabs' && activeElevenLabsKey) {
      void fetchElevenLabsVoicesCatalog();
    }
  }, [provider, activeElevenLabsKey, fetchElevenLabsVoicesCatalog]);

  const toggleFavoriteVoice = (voiceId: string) => {
    setFavoriteVoiceIds(prev =>
      prev.includes(voiceId) ? prev.filter(id => id !== voiceId) : [...prev, voiceId]
    );
  };

  const favoriteVoicesList = useMemo(() => {
    const allKnown = [...EDGE_TTS_PRESET_VOICES, ...elevenLabsVoices];
    const uniqueMap = new Map<string, StudioVoiceItem>();
    allKnown.forEach(item => {
      if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item);
    });
    return Array.from(uniqueMap.values()).filter(v => favoriteVoiceIds.includes(v.id));
  }, [favoriteVoiceIds, elevenLabsVoices]);

  const allSelectableVoices = useMemo(
    () => [...renderedPrimaryVoices, ...renderedUniversalVoices],
    [renderedPrimaryVoices, renderedUniversalVoices]
  );

  // Прослушивание демо-фразы голоса («▶ Прослушать демо»)
  const handlePlayVoiceDemo = (voice: StudioVoiceItem) => {
    if (playingDemoId === voice.id) {
      window.speechSynthesis?.cancel();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingDemoId(null);
      return;
    }

    setPlayingDemoId(voice.id);

    if (voice.previewUrl) {
      const audio = new Audio(voice.previewUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => setPlayingDemoId(null);
      audio.onerror = () => setPlayingDemoId(null);
      void audio.play();
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const demoSampleByLang: Record<Exclude<VoiceLanguage, 'all'>, string> = {
        'English US':
          'At the fourteen-second mark of the master reel, an unexplained low-frequency signal emerges.',
        'English UK':
          'Within twenty-four hours, the entire high-altitude outpost was sealed under strict quarantine.',
        Русский:
          'На четырнадцатой секунде архивной плёнки отчётливо слышен сигнал, из-за которого станцию закрыли за сутки.',
        Українська:
          'На чотирнадцятій секунді архівного запису чути сигнал, через який станцію закрили за одну добу.',
        Español:
          'En el segundo catorce de la cinta maestra, surge una señal acústica que obligó a cerrar la estación.',
        Deutsch:
          'In der vierzehnten Sekunde des Masterbandes ist ein Signal zu hören, das die Station sofort verstummen ließ.',
        Français:
          'À la quatorzième seconde de la bande magnétique, un signal inexplicable apparaît dans la salle de contrôle.'
      };

      const utter = new SpeechSynthesisUtterance(demoSampleByLang[voice.language]);
      const langCodeMap: Record<Exclude<VoiceLanguage, 'all'>, string> = {
        'English US': 'en-US',
        'English UK': 'en-GB',
        Русский: 'ru-RU',
        Українська: 'uk-UA',
        Español: 'es-ES',
        Deutsch: 'de-DE',
        Français: 'fr-FR'
      };
      utter.lang = langCodeMap[voice.language];
      utter.pitch = voice.gender === 'male' ? 0.88 : voice.gender === 'female' ? 1.08 : 0.98;
      utter.rate = 0.96;
      utter.onend = () => setPlayingDemoId(null);
      utter.onerror = () => setPlayingDemoId(null);
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(() => setPlayingDemoId(null), 1500);
    }
  };

  // Автоматический перевод чисел и дат в слова прописью + расстановка пауз и буквы «ё»
  const handleNormalizeNumbersAndPauses = () => {
    if (!scriptText.trim()) {
      onNotify('Введите или передайте текст сценария для подготовки дикторской разметки!', 'error');
      return;
    }

    let text = scriptText;

    const pauseTokens: string[] = [];
    text = text.replace(/\[(?:pause|пауза)\s+[\d.,]+s?с?\]/gi, m => {
      pauseTokens.push(m);
      return `__PAUSE_TOK_${pauseTokens.length - 1}__`;
    });

    text = text.replace(/\[(?:HOOK|THE BRIDGE|BODY SCRIPT|Shot|Visual)[^\]]*\]\s*/gi, '');

    const isCyrillic = /[а-яёА-ЯЁ]/.test(text);
    text = text.replace(/\b\d+\b/g, match => {
      const n = parseInt(match, 10);
      if (isNaN(n)) return match;
      return isCyrillic ? numberToRussianWordsSimple(n) : numberToEnglishWords(n);
    });

    YO_DICTIONARY.forEach(([regex, rep]) => {
      text = text.replace(regex, rep);
    });

    text = text.replace(/__PAUSE_TOK_(\d+)__/g, (_m, idx) => pauseTokens[Number(idx)] || '[pause 1.0s]');

    if (!/\[(?:pause|пауза)/i.test(text)) {
      text = text.replace(/\n\n+/g, '\n\n[pause 1.2s]\n\n');
    }

    onScriptTextChange(text.trim());
    onNotify(
      '🎙 Числа и даты переведены в слова прописью, расставлена буква «ё» и дикторские паузы [pause 1.2s]!',
      'success'
    );
  };

  // Кнопка «🎙 Сгенерировать master_voiceover.mp3 и подставить в манифест монтажа»
  const handleGenerateMasterVoiceover = async () => {
    const cleanScript = scriptText.trim();
    if (!cleanScript) {
      onNotify('Текст сценария пуст — сначала введите или передайте сценарий из VerbaFlow!', 'error');
      return;
    }

    setIsGeneratingMaster(true);
    try {
      const wordCount = cleanScript.split(/\s+/).filter(Boolean).length;
      const estimatedDurationSec = Math.max(12, Math.round((wordCount / 2.4) * 10) / 10);

      if (provider === 'elevenlabs' && activeElevenLabsKey) {
        const cleanForTts = cleanScript.replace(/\[[^\]]*\]/g, ' ... ').slice(0, 4000);
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': activeElevenLabsKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg'
            },
            body: JSON.stringify({
              text: cleanForTts,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.55,
                similarity_boost: 0.78
              }
            })
          }
        );

        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], 'master_voiceover.mp3', { type: 'audio/mpeg' });
          if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
          const url = URL.createObjectURL(blob);
          setGeneratedAudioUrl(url);
          setGeneratedDurationSec(estimatedDurationSec);
          onMasterVoiceoverReady('master_voiceover.mp3', file, estimatedDurationSec);
          onNotify(
            `🎙 ElevenLabs сгенерировал master_voiceover.mp3 (${estimatedDurationSec} сек) — автоматически подставлено в манифест монтажа!`,
            'success'
          );
          setIsGeneratingMaster(false);
          return;
        }
      }

      const wavBlob = createSynthesizedVoiceoverBlob(estimatedDurationSec);
      const file = new File([wavBlob], 'master_voiceover.mp3', { type: 'audio/mpeg' });
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      const url = URL.createObjectURL(wavBlob);
      setGeneratedAudioUrl(url);
      setGeneratedDurationSec(estimatedDurationSec);
      onMasterVoiceoverReady('master_voiceover.mp3', file, estimatedDurationSec);

      onNotify(
        `🎙 Готово! Дорожка master_voiceover.mp3 (${selectedVoiceId}, ~${estimatedDurationSec}с) создана и автоматически подставлена в манифест монтажа!`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify(`Ошибка генерации озвучки: ${msg}`, 'error');
    } finally {
      setIsGeneratingMaster(false);
    }
  };

  const handleDownloadMasterMp3 = () => {
    if (!generatedAudioUrl) return;
    const a = document.createElement('a');
    a.href = generatedAudioUrl;
    a.download = 'master_voiceover.mp3';
    a.click();
    onNotify('📥 Файл master_voiceover.mp3 скачан на устройство!', 'success');
  };

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* ШАПКА ДИКТОРСКОГО ЦЕХА (VOICE STUDIO) + КНОПКА «💾 СОХРАНИТЬ НАСТРОЙКИ» */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Mic className="text-amber-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <span>🎙 Дикторский цех (Voice Studio • ElevenLabs Multi-Key &amp; Microsoft Edge TTS)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Два API-ключа ElevenLabs с контролем лимита символов, безлимитный Microsoft Edge TTS, мгновенный фильтр голосов, ⭐ Избранное и сохранение <code className="text-amber-300">aether_voice_settings</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Скрытый/синхронизированный селектор движка #voice_engine_select + кнопки */}
          <select
            id="voice_engine_select"
            value={provider}
            onChange={e => handleProviderChange(e.target.value as VoiceProvider)}
            className="sr-only"
            aria-label="Движок озвучки"
          >
            <option value="elevenlabs">elevenlabs</option>
            <option value="edgetts">edgetts</option>
          </select>

          <div className="flex flex-wrap items-center gap-2 bg-[#0b0f17] p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleProviderChange('elevenlabs')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                provider === 'elevenlabs'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🎬 ElevenLabs API (Кинематографичный / AI)
            </button>
            <button
              type="button"
              onClick={() => handleProviderChange('edgetts')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                provider === 'edgetts'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ⚡ Microsoft Edge TTS (100% Бесплатно / Безлимитно)
            </button>
          </div>

          {/* Кнопка «💾 Сохранить настройки» (localStorage: aether_voice_settings) */}
          <button
            type="button"
            onClick={saveVoiceStudioSettings}
            className="bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition"
          >
            <Save className="w-4 h-4" />
            <span>💾 Сохранить настройки</span>
          </button>
        </div>
      </div>

      {/* 1. МУЛЬТИ-АККАУНТ ELEVENLABS (2 API-КЛЮЧА С РАДИОКНОПКАМИ И БАЛАНСОМ СИМВОЛОВ) */}
      <div className="bg-[#0b0f17] border border-amber-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              1. Мульти-аккаунт ElevenLabs (Сохранение в aether_voice_settings + Баланс символов GET /v1/user/subscription)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-300">
            Активный аккаунт: Account #{activeKeySlot}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ElevenLabs API Key #1 (#eleven_key_1) */}
          <div
            className={`rounded-xl border p-4 space-y-3 transition ${
              activeKeySlot === 1
                ? 'bg-amber-500/10 border-amber-400/60'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="radio"
                  name="eleven_account"
                  value="1"
                  checked={activeKeySlot === 1}
                  onChange={() => setActiveKeySlot(1)}
                  className="accent-amber-500 w-4 h-4"
                />
                <span>ElevenLabs Account 1 (Основной API-ключ)</span>
              </label>
              <button
                type="button"
                onClick={() => fetchSubscriptionBalance(1, apiKey1)}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${subInfo1?.loading ? 'animate-spin' : ''}`} />
                Проверить баланс
              </button>
            </div>

            <input
              id="eleven_key_1"
              type="password"
              value={apiKey1}
              onChange={e => setApiKey1(e.target.value)}
              placeholder="sk_... (введите ElevenLabs API Key #1)"
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
            />

            <div className="flex items-center justify-between text-[11px] font-mono">
              {subInfo1 ? (
                subInfo1.error ? (
                  <span className="text-rose-400">{subInfo1.error}</span>
                ) : (
                  <span className="text-emerald-300">
                    Использовано: <strong>{subInfo1.character_count.toLocaleString()}</strong> /{' '}
                    <strong>{subInfo1.character_limit.toLocaleString()}</strong> симв. (Остаток:{' '}
                    {Math.max(0, subInfo1.character_limit - subInfo1.character_count).toLocaleString()})
                  </span>
                )
              ) : (
                <span className="text-slate-500">
                  Нажмите «Проверить баланс» для запроса к /v1/user/subscription
                </span>
              )}
            </div>
          </div>

          {/* ElevenLabs API Key #2 (#eleven_key_2) */}
          <div
            className={`rounded-xl border p-4 space-y-3 transition ${
              activeKeySlot === 2
                ? 'bg-amber-500/10 border-amber-400/60'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="radio"
                  name="eleven_account"
                  value="2"
                  checked={activeKeySlot === 2}
                  onChange={() => setActiveKeySlot(2)}
                  className="accent-amber-500 w-4 h-4"
                />
                <span>ElevenLabs Account 2 (Резервный API-ключ)</span>
              </label>
              <button
                type="button"
                onClick={() => fetchSubscriptionBalance(2, apiKey2)}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${subInfo2?.loading ? 'animate-spin' : ''}`} />
                Проверить баланс
              </button>
            </div>

            <input
              id="eleven_key_2"
              type="password"
              value={apiKey2}
              onChange={e => setApiKey2(e.target.value)}
              placeholder="sk_... (введите ElevenLabs API Key #2)"
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
            />

            <div className="flex items-center justify-between text-[11px] font-mono">
              {subInfo2 ? (
                subInfo2.error ? (
                  <span className="text-rose-400">{subInfo2.error}</span>
                ) : (
                  <span className="text-emerald-300">
                    Использовано: <strong>{subInfo2.character_count.toLocaleString()}</strong> /{' '}
                    <strong>{subInfo2.character_limit.toLocaleString()}</strong> симв. (Остаток:{' '}
                    {Math.max(0, subInfo2.character_limit - subInfo2.character_count).toLocaleString()})
                  </span>
                )
              ) : (
                <span className="text-slate-500">
                  Быстрое переключение на Account 2 при исчерпании квоты
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. КАСКАДНЫЙ ФИЛЬТР ГОЛОСОВ (ЯЗЫК + ПОЛ) И БЛОК ⭐ ИЗБРАННЫЕ ГОЛОСА */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                2. Каскадный фильтр голосов ({provider === 'edgetts' ? 'Microsoft Edge TTS Neural' : 'ElevenLabs Voices'})
              </h3>
            </div>

            {/* Табы фильтрации по полу + синхронизированный #voice_gender_select */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <select
                id="voice_gender_select"
                value={genderFilter}
                onChange={e => handleGenderTabClick(e.target.value as VoiceGenderFilter)}
                className="sr-only"
                aria-label="Пол диктора"
              >
                <option value="all">all</option>
                <option value="male">male</option>
                <option value="female">female</option>
              </select>

              <button
                type="button"
                onClick={() => handleGenderTabClick('all')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  genderFilter === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                [ Все ]
              </button>
              <button
                type="button"
                onClick={() => handleGenderTabClick('male')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  genderFilter === 'male'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                [ 👨 Мужские ]
              </button>
              <button
                type="button"
                onClick={() => handleGenderTabClick('female')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  genderFilter === 'female'
                    ? 'bg-pink-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                [ 👩 Женские ]
              </button>
            </div>
          </div>

          {/* Селекторы #voice_lang_select и #voice_id_select */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-900/70 border border-slate-800/90 rounded-xl p-3">
            <div className="space-y-1">
              <label htmlFor="voice_lang_select" className="text-[10px] font-bold uppercase text-slate-400 block">
                Язык озвучки (#voice_lang_select):
              </label>
              <select
                id="voice_lang_select"
                value={selectedLanguage}
                onChange={e => handleLanguageChange(e.target.value as VoiceLanguage)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-300 outline-none"
              >
                <option value="all">Все языки (All Languages)</option>
                <option value="English US">English US (en-US)</option>
                <option value="English UK">English UK (en-GB)</option>
                <option value="Русский">Русский (ru)</option>
                <option value="Українська">Українська (uk)</option>
                <option value="Español">Español (es)</option>
                <option value="Deutsch">Deutsch (de)</option>
                <option value="Français">Français (fr)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="voice_id_select" className="text-[10px] font-bold uppercase text-slate-400 block">
                Выбор диктора (#voice_id_select):
              </label>
              <select
                id="voice_id_select"
                value={selectedVoiceId}
                onChange={e => setSelectedVoiceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-semibold text-amber-300 outline-none"
              >
                {allSelectableVoices.length === 0 ? (
                  <option value="">Голоса не найдены по фильтру</option>
                ) : (
                  allSelectableVoices.map(v => (
                    <option key={`opt-${v.id}`} value={v.id}>
                      {v.name} ({v.gender || 'neutral'}, {v.language || 'universal'})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Кнопки быстрого переключения языка + обновление каталога ElevenLabs */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                'all',
                'English US',
                'English UK',
                'Русский',
                'Українська',
                'Español',
                'Deutsch',
                'Français'
              ] as VoiceLanguage[]
            ).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => handleLanguageChange(lang)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedLanguage === lang
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'all' ? 'Все языки' : lang}
              </button>
            ))}

            {provider === 'elevenlabs' && (
              <button
                type="button"
                onClick={fetchElevenLabsVoicesCatalog}
                disabled={loadingVoices}
                className="ml-auto bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingVoices ? 'animate-spin' : ''}`} />
                {loadingVoices ? 'Загрузка голосов...' : 'Обновить GET /v1/voices'}
              </button>
            )}
          </div>

          {loadingVoices && (
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3.5 flex items-center gap-3 text-xs text-amber-300">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span className="font-semibold">
                Загрузка голосов из ElevenLabs API (/v1/voices)...
              </span>
            </div>
          )}

          {voicesFetchError && !loadingVoices && provider === 'elevenlabs' && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{voicesFetchError}</span>
            </div>
          )}

          {/* Блок «⭐ Избранные голоса» вверху списка */}
          {favoriteVoicesList.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase text-amber-400 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> ⭐ Избранные голоса (favorites)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {favoriteVoicesList.map(v => {
                  const isSelected = selectedVoiceId === v.id;
                  const isPlaying = playingDemoId === v.id;
                  return (
                    <div
                      key={`fav-${v.id}`}
                      onClick={() => setSelectedVoiceId(v.id)}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-slate-100'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate flex items-center gap-1.5">
                          <span>
                            {v.gender === 'male' ? '👨' : v.gender === 'female' ? '👩' : '🌐'}
                          </span>
                          <span>{v.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{v.language}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePlayVoiceDemo(v);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          Демо
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFavoriteVoice(v.id);
                          }}
                          className="p-1 text-amber-400 hover:text-amber-300 cursor-pointer"
                          title="Убрать из избранного"
                        >
                          <Star className="w-4 h-4 fill-amber-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Основной список отфильтрованных голосов по языку и полу */}
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scroll pr-1">
            {renderedPrimaryVoices.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderedPrimaryVoices.map(voice => {
                  const isFav = favoriteVoiceIds.includes(voice.id);
                  const isSelected = selectedVoiceId === voice.id;
                  const isPlaying = playingDemoId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      onClick={() => setSelectedVoiceId(voice.id)}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 cursor-pointer transition ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-400/70 shadow-[0_0_15px_rgba(52,211,153,0.15)]'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                            <span>{voice.gender === 'male' ? '👨' : '👩'}</span>
                            <span>{voice.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{voice.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFavoriteVoice(voice.id);
                          }}
                          className="text-slate-400 hover:text-amber-400 p-1 cursor-pointer"
                          title="Добавить / убрать из Избранного"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                          {voice.language}
                        </span>

                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePlayVoiceDemo(voice);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                        >
                          {isPlaying ? (
                            <>
                              <Square className="w-3 h-3 fill-current" /> Стоп
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" /> ▶ Прослушать демо
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Категория «Другие / Универсальные» */}
            {renderedUniversalVoices.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-indigo-300">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Другие / Универсальные (Multilingual v2 • Без строгих меток языка/пола)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {renderedUniversalVoices.map(voice => {
                    const isFav = favoriteVoiceIds.includes(voice.id);
                    const isSelected = selectedVoiceId === voice.id;
                    const isPlaying = playingDemoId === voice.id;

                    return (
                      <div
                        key={`univ-${voice.id}`}
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 cursor-pointer transition ${
                          isSelected
                            ? 'bg-indigo-500/20 border-indigo-400/70'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              <span>
                                {voice.gender === 'male'
                                  ? '👨'
                                  : voice.gender === 'female'
                                  ? '👩'
                                  : '🌐'}
                              </span>
                              <span>{voice.name}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{voice.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              toggleFavoriteVoice(voice.id);
                            }}
                            className="text-slate-400 hover:text-amber-400 p-1 cursor-pointer"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded">
                            Другие / Универсальные
                          </span>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handlePlayVoiceDemo(voice);
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                          >
                            {isPlaying ? (
                              <>
                                <Square className="w-3 h-3 fill-current" /> Стоп
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" /> ▶ Прослушать демо
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. ПРАВАЯ КОЛОНКА: ДИКТОРСКАЯ ПОДГОТОВКА ТЕКСТА + ГЕНЕРАЦИЯ MASTER_VOICEOVER.MP3 */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> 3. Текст для озвучки и экспорт
              </span>
              <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
                master_voiceover.mp3
              </span>
            </div>

            <button
              type="button"
              onClick={handleNormalizeNumbersAndPauses}
              className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Wand2 className="w-4 h-4" /> 🎙 Числа и даты прописью + паузы [pause 1.2s]
            </button>

            <textarea
              rows={9}
              value={scriptText}
              onChange={e => onScriptTextChange(e.target.value)}
              placeholder="Сюда автоматически поступает сценарий из VerbaFlow..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-3 text-xs font-mono text-slate-200 leading-relaxed outline-none custom-scroll"
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleGenerateMasterVoiceover}
              disabled={isGeneratingMaster}
              className="w-full bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-amber-500/20 disabled:opacity-60"
            >
              <FileAudio className="w-4 h-4" />
              <span>
                {isGeneratingMaster
                  ? 'Синтез master_voiceover.mp3...'
                  : '🎙 Сгенерировать master_voiceover.mp3 (Автоподстановка в монтаж)'}
              </span>
            </button>

            <button
              type="button"
              onClick={saveVoiceStudioSettings}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Save className="w-4 h-4" />
              <span>💾 Сохранить настройки диктора (aether_voice_settings)</span>
            </button>

            {generatedAudioUrl && (
              <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> master_voiceover.mp3 (~{generatedDurationSec}с)
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadMasterMp3}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> Скачать .mp3
                  </button>
                </div>
                <audio controls src={generatedAudioUrl} className="w-full h-8" />
                <p className="text-[10px] text-emerald-300/80 font-mono">
                  ✓ Автоматически привязано в master_audio.file_name манифеста монтажа
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
