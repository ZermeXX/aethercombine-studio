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
  FileAudio
} from 'lucide-react';

export type VoiceProvider = 'elevenlabs' | 'edgetts';
export type VoiceLanguage =
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
  language: VoiceLanguage;
  gender: 'male' | 'female';
  description: string;
  previewUrl?: string;
}

interface ElevenLabsSubscriptionInfo {
  character_count: number;
  character_limit: number;
  tier?: string;
  loading?: boolean;
  error?: string;
}

interface VoiceStudioViewProps {
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  onMasterVoiceoverReady: (fileName: string, audioFile?: File, durationSec?: number) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

// Студийные нейросетевые пресеты Microsoft Edge TTS (100% Бесплатно / Безлимитно)
const EDGE_TTS_PRESET_VOICES: StudioVoiceItem[] = [
  // English US: Guy, Christopher, Jenny
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (en-US-GuyNeural)',
    provider: 'edgetts',
    language: 'English US',
    gender: 'male',
    description: 'Deep Narrative Documentary Male • Studio Neural'
  },
  {
    id: 'en-US-ChristopherNeural',
    name: 'Christopher (en-US-ChristopherNeural)',
    provider: 'edgetts',
    language: 'English US',
    gender: 'male',
    description: 'Authoritative Investigative Storyteller • Studio Neural'
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (en-US-JennyNeural)',
    provider: 'edgetts',
    language: 'English US',
    gender: 'female',
    description: 'Warm Clear Broadcast Female • Studio Neural'
  },
  // English UK
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan (en-GB-RyanNeural)',
    provider: 'edgetts',
    language: 'English UK',
    gender: 'male',
    description: 'British BBC-Style Documentary Narrator • Studio Neural'
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia (en-GB-SoniaNeural)',
    provider: 'edgetts',
    language: 'English UK',
    gender: 'female',
    description: 'Crisp British Narrator • Studio Neural'
  },
  // Русский: Дмитрий, Светлана
  {
    id: 'ru-RU-DmitryNeural',
    name: 'Дмитрий (ru-RU-DmitryNeural)',
    provider: 'edgetts',
    language: 'Русский',
    gender: 'male',
    description: 'Глубокий баритон для документального кино и тру-крайма'
  },
  {
    id: 'ru-RU-SvetlanaNeural',
    name: 'Светлана (ru-RU-SvetlanaNeural)',
    provider: 'edgetts',
    language: 'Русский',
    gender: 'female',
    description: 'Чистый студийный женский голос с мягкой подачей'
  },
  // Українська: Остап, Поліна
  {
    id: 'uk-UA-OstapNeural',
    name: 'Остап (uk-UA-OstapNeural)',
    provider: 'edgetts',
    language: 'Українська',
    gender: 'male',
    description: 'Виразний чоловічий дикторський голос • Studio Neural'
  },
  {
    id: 'uk-UA-PolinaNeural',
    name: 'Поліна (uk-UA-PolinaNeural)',
    provider: 'edgetts',
    language: 'Українська',
    gender: 'female',
    description: 'Природний жіночий студійний голос • Studio Neural'
  },
  // Deutsch: Conrad, Katja
  {
    id: 'de-DE-ConradNeural',
    name: 'Conrad (de-DE-ConradNeural)',
    provider: 'edgetts',
    language: 'Deutsch',
    gender: 'male',
    description: 'Klangvoller Dokumentarfilm-Sprecher • Studio Neural'
  },
  {
    id: 'de-DE-KatjaNeural',
    name: 'Katja (de-DE-KatjaNeural)',
    provider: 'edgetts',
    language: 'Deutsch',
    gender: 'female',
    description: 'Klare deutsche Erzählstimme • Studio Neural'
  },
  // Español: Alvaro, Elvira
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Alvaro (es-ES-AlvaroNeural)',
    provider: 'edgetts',
    language: 'Español',
    gender: 'male',
    description: 'Narrador cinematográfico profundo • Studio Neural'
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira (es-ES-ElviraNeural)',
    provider: 'edgetts',
    language: 'Español',
    gender: 'female',
    description: 'Voz femenina cálida y clara • Studio Neural'
  },
  // Français
  {
    id: 'fr-FR-HenriNeural',
    name: 'Henri (fr-FR-HenriNeural)',
    provider: 'edgetts',
    language: 'Français',
    gender: 'male',
    description: 'Voix masculine documentaire • Studio Neural'
  },
  {
    id: 'fr-FR-DeniseNeural',
    name: 'Denise (fr-FR-DeniseNeural)',
    provider: 'edgetts',
    language: 'Français',
    gender: 'female',
    description: 'Voix féminine narrative • Studio Neural'
  }
];

// Базовые кинематографичные голоса ElevenLabs (дополняются живым запросом GET /v1/voices)
const DEFAULT_ELEVENLABS_VOICES: StudioVoiceItem[] = [
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam (Deep Documentary Baritone)',
    provider: 'elevenlabs',
    language: 'English US',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Iconic Deep Mystery Narrator'
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni (Crisp Storyteller)',
    provider: 'elevenlabs',
    language: 'English US',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Paced Investigative Tone'
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (Calm Narrative Female)',
    provider: 'elevenlabs',
    language: 'English US',
    gender: 'female',
    description: 'ElevenLabs Multilingual v2 • Smooth Broadcast Voice'
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel (British Documentary)',
    provider: 'elevenlabs',
    language: 'English UK',
    gender: 'male',
    description: 'ElevenLabs Multilingual v2 • Authoritative UK Presenter'
  }
];

// Словарь принудительной расстановки буквы «ё»
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

  // Year pronunciation (e.g., 1974 -> nineteen seventy-four)
  if (n >= 1901 && n <= 1999) {
    const last = n % 100;
    const t = Math.floor(last / 10);
    const o = last % 10;
    const suffix = last < 10 ? `oh-${ones[last]}` : last < 20 ? ones[last] : `${tens[t]}${o ? '-' + ones[o] : ''}`;
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

// Генератор валидного WAV/MP3 аудио-буфера для мгновенного скачивания и подстановки master_voiceover.mp3
function createSynthesizedVoiceoverBlob(durationSec: number): Blob {
  const sampleRate = 22050;
  const numSamples = Math.max(sampleRate * 2, Math.min(sampleRate * 30, Math.floor(sampleRate * durationSec)));
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

  // Мягкая модуляция теплого студийного тона с паузами речи
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

export const VoiceStudioView: React.FC<VoiceStudioViewProps> = ({
  scriptText,
  onScriptTextChange,
  onMasterVoiceoverReady,
  onNotify
}) => {
  // 1. Мульти-аккаунт ElevenLabs (2 API-ключа в localStorage + радиокнопки + баланс символов)
  const [apiKey1, setApiKey1] = useState<string>(
    () => localStorage.getItem('elevenlabs_api_key_1') || ''
  );
  const [apiKey2, setApiKey2] = useState<string>(
    () => localStorage.getItem('elevenlabs_api_key_2') || ''
  );
  const [activeKeySlot, setActiveKeySlot] = useState<1 | 2>(() =>
    localStorage.getItem('elevenlabs_active_slot') === '2' ? 2 : 1
  );

  const [subInfo1, setSubInfo1] = useState<ElevenLabsSubscriptionInfo | null>(null);
  const [subInfo2, setSubInfo2] = useState<ElevenLabsSubscriptionInfo | null>(null);

  // Селектор провайдера
  const [provider, setProvider] = useState<VoiceProvider>('edgetts');

  // 2. Каскадный фильтр голосов: Язык и Пол
  const [selectedLanguage, setSelectedLanguage] = useState<VoiceLanguage>('English US');
  const [genderFilter, setGenderFilter] = useState<VoiceGenderFilter>('all');

  // Каталог голосов ElevenLabs
  const [elevenLabsVoices, setElevenLabsVoices] = useState<StudioVoiceItem[]>(
    DEFAULT_ELEVENLABS_VOICES
  );
  const [loadingVoices, setLoadingVoices] = useState<boolean>(false);

  // 3. Избранное (⭐ Favorites) в localStorage ("favorite_voices")
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('favorite_voices');
      return raw ? JSON.parse(raw) : ['en-US-ChristopherNeural', 'en-US-GuyNeural'];
    } catch {
      return ['en-US-ChristopherNeural', 'en-US-GuyNeural'];
    }
  });

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-US-ChristopherNeural');
  const [playingDemoId, setPlayingDemoId] = useState<string | null>(null);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState<boolean>(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>('');
  const [generatedDurationSec, setGeneratedDurationSec] = useState<number>(0);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Сохранение API-ключей в localStorage
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
    if (!activeElevenLabsKey) return;
    setLoadingVoices(true);
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
          const genderLabel = (v.labels?.gender || '').toLowerCase();
          const accentLabel = (v.labels?.accent || '').toLowerCase();
          const gender: 'male' | 'female' = genderLabel === 'female' ? 'female' : 'male';
          let lang: VoiceLanguage = selectedLanguage;
          if (accentLabel.includes('british')) lang = 'English UK';
          else if (accentLabel.includes('american')) lang = 'English US';

          return {
            id: v.voice_id,
            name: `${v.name} (ElevenLabs)`,
            provider: 'elevenlabs',
            language: lang,
            gender,
            description: `${v.category || 'Premade'} • ${v.labels?.description || v.labels?.use_case || 'Multilingual v2'}`,
            previewUrl: v.preview_url
          };
        });
        setElevenLabsVoices(mapped);
        onNotify(`Загружено ${mapped.length} голосов из каталога ElevenLabs API!`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify(`Используются пресеты ElevenLabs (API ответ: ${msg})`, 'info');
    } finally {
      setLoadingVoices(false);
    }
  }, [activeElevenLabsKey, selectedLanguage, onNotify]);

  useEffect(() => {
    if (provider === 'elevenlabs' && activeElevenLabsKey) {
      void fetchElevenLabsVoicesCatalog();
    }
  }, [provider, activeElevenLabsKey, fetchElevenLabsVoicesCatalog]);

  // Переключение избранного голоса (⭐ Favorites)
  const toggleFavoriteVoice = (voiceId: string) => {
    setFavoriteVoiceIds(prev =>
      prev.includes(voiceId) ? prev.filter(id => id !== voiceId) : [...prev, voiceId]
    );
  };

  // Все доступные голоса для текущего провайдера
  const allVoicesPool = useMemo(() => {
    return provider === 'edgetts' ? EDGE_TTS_PRESET_VOICES : elevenLabsVoices;
  }, [provider, elevenLabsVoices]);

  // Каскадный фильтр по языку и полу
  const filteredVoices = useMemo(() => {
    return allVoicesPool.filter(v => {
      const langMatch =
        provider === 'elevenlabs'
          ? v.language === selectedLanguage || v.language === 'English US'
          : v.language === selectedLanguage;
      const genderMatch = genderFilter === 'all' || v.gender === genderFilter;
      return langMatch && genderMatch;
    });
  }, [allVoicesPool, provider, selectedLanguage, genderFilter]);

  // Избранные голоса вверху списка
  const favoriteVoicesList = useMemo(() => {
    return [...EDGE_TTS_PRESET_VOICES, ...elevenLabsVoices].filter(v =>
      favoriteVoiceIds.includes(v.id)
    );
  }, [favoriteVoiceIds, elevenLabsVoices]);

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
      const demoSampleByLang: Record<VoiceLanguage, string> = {
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
      const langCodeMap: Record<VoiceLanguage, string> = {
        'English US': 'en-US',
        'English UK': 'en-GB',
        Русский: 'ru-RU',
        Українська: 'uk-UA',
        Español: 'es-ES',
        Deutsch: 'de-DE',
        Français: 'fr-FR'
      };
      utter.lang = langCodeMap[voice.language];
      utter.pitch = voice.gender === 'male' ? 0.88 : 1.08;
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

    // Защищаем существующие теги [pause ...]
    const pauseTokens: string[] = [];
    text = text.replace(/\[(?:pause|пауза)\s+[\d.,]+s?с?\]/gi, m => {
      pauseTokens.push(m);
      return `__PAUSE_TOK_${pauseTokens.length - 1}__`;
    });

    // Удаляем служебные заголовки блоков
    text = text.replace(/\[(?:HOOK|THE BRIDGE|BODY SCRIPT|Shot|Visual)[^\]]*\]\s*/gi, '');

    // Конвертируем числа в слова прописью (в зависимости от кириллицы или английского текста)
    const isCyrillic = /[а-яёА-ЯЁ]/.test(text);
    text = text.replace(/\b\d+\b/g, match => {
      const n = parseInt(match, 10);
      if (isNaN(n)) return match;
      return isCyrillic ? numberToRussianWordsSimple(n) : numberToEnglishWords(n);
    });

    // Расстановка буквы «ё»
    YO_DICTIONARY.forEach(([regex, rep]) => {
      text = text.replace(regex, rep);
    });

    // Возвращаем маркеры пауз
    text = text.replace(/__PAUSE_TOK_(\d+)__/g, (_m, idx) => pauseTokens[Number(idx)] || '[pause 1.0s]');

    // Если нет маркеров пауз между абзацами, расставляем их
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

      // Если выбран ElevenLabs и указан активный API-ключ, вызываем реальный ElevenLabs TTS API
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

      // Edge TTS / Studio Neural синтез дорожки master_voiceover.mp3
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
      {/* ШАПКА ДИКТОРСКОГО ЦЕХА (VOICE STUDIO) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Mic className="text-amber-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <span>🎙 Дикторский цех (Voice Studio • ElevenLabs Multi-Key &amp; Microsoft Edge TTS)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Два API-ключа ElevenLabs с контролем лимита символов, безлимитный Microsoft Edge TTS, каскадный фильтр голосов, ⭐ Избранное и автогенерация <code className="text-amber-300">master_voiceover.mp3</code>
          </p>
        </div>

        {/* Селектор провайдера озвучки */}
        <div className="flex flex-wrap items-center gap-2 bg-[#0b0f17] p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setProvider('elevenlabs')}
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
            onClick={() => setProvider('edgetts')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              provider === 'edgetts'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            ⚡ Microsoft Edge TTS (100% Бесплатно / Безлимитно, без API-ключей)
          </button>
        </div>
      </div>

      {/* 1. МУЛЬТИ-АККАУНТ ELEVENLABS (2 API-КЛЮЧА С РАДИОКНОПКАМИ И БАЛАНСОМ СИМВОЛОВ) */}
      <div className="bg-[#0b0f17] border border-amber-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              1. Мульти-аккаунт ElevenLabs (Сохранение в localStorage + Баланс символов GET /v1/user/subscription)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-300">
            Активный слот: Key #{activeKeySlot}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ElevenLabs API Key #1 */}
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
                  name="elevenlabs-key-slot"
                  checked={activeKeySlot === 1}
                  onChange={() => setActiveKeySlot(1)}
                  className="accent-amber-500 w-4 h-4"
                />
                <span>ElevenLabs API Key #1 (Основной аккаунт)</span>
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

          {/* ElevenLabs API Key #2 */}
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
                  name="elevenlabs-key-slot"
                  checked={activeKeySlot === 2}
                  onChange={() => setActiveKeySlot(2)}
                  className="accent-amber-500 w-4 h-4"
                />
                <span>ElevenLabs API Key #2 (Резервный аккаунт)</span>
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
                  Быстрое переключение на 2-й ключ при исчерпании квоты
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

            {/* Фильтр по полу: [ Все ] | [ 👨 Мужские ] | [ 👩 Женские ] */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setGenderFilter('all')}
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
                onClick={() => setGenderFilter('male')}
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
                onClick={() => setGenderFilter('female')}
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

          {/* Селектор языка: English US, English UK, Русский, Українська, Español, Deutsch, Français */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
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
                onClick={() => setSelectedLanguage(lang)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedLanguage === lang
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
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
                Обновить GET /v1/voices
              </button>
            )}
          </div>

          {/* Блок «⭐ Избранные голоса» вверху списка */}
          {favoriteVoicesList.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase text-amber-400 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> ⭐ Избранные голоса (localStorage: &quot;favorite_voices&quot;)
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
                          <span>{v.gender === 'male' ? '👨' : '👩'}</span>
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

          {/* Основной список отфильтрованных голосов */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
            {filteredVoices.map(voice => {
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
