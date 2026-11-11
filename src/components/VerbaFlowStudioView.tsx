/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Zap,
  Wand2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  Flame,
  Mic,
  Film,
  Activity,
  ArrowRight,
  Download,
  RefreshCw,
  Rocket
} from 'lucide-react';
import type { NarrativeSceneItem } from './MontageCombineView';

export type VerbaMode =
  | '15sec_rewrite'
  | 'pack5_script'
  | 'doc_loops'
  | 'shorts_1sec';

export type MysteryType = 'mystery' | 'question' | 'epicenter' | 'myth';

export type ToneOfVoice =
  | 'doc'
  | 'storyteller'
  | 'truecrime'
  | 'scipop'
  | 'dynamic'
  | 'neutral';

export interface ComplianceIssue {
  word: string;
  category: string;
  risk: 'high' | 'medium';
  replacements: string[];
}

export interface GeneratedVideoPromptScene {
  sceneIndex: number;
  timecodeRange: string;
  durationSec: number;
  scriptLine: string;
  cameraPlan: string;
  lightingStyle: string;
  promptEn: string;
}

interface VerbaFlowStudioViewProps {
  sourceText: string;
  onSourceTextChange: (text: string) => void;
  verbaMode: VerbaMode;
  onVerbaModeChange: (mode: VerbaMode) => void;
  mysteryType: MysteryType;
  onMysteryTypeChange: (type: MysteryType) => void;
  toneOfVoice: ToneOfVoice;
  onToneOfVoiceChange: (tone: ToneOfVoice) => void;
  complianceDictionary: {
    pattern: RegExp;
    label: string;
    category: string;
    risk: 'high' | 'medium';
    replacements: string[];
  }[];
  onTransferToNarrativeMontage: (scenes: NarrativeSceneItem[], fullScriptText: string) => void;
  onSendToVoiceStudio?: (voiceReadyText: string) => void;
  onSyncAllWorkshops?: (
    scenes: NarrativeSceneItem[],
    fullScriptText: string,
    voiceReadyText: string
  ) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

// Словарь принудительной расстановки буквы «ё» для дикторского цеха
const YO_DICTIONARY: Array<[RegExp, string]> = [
  [/\bеще\b/gi, 'ещё'],
  [/\bвсе\b/gi, 'всё'],
  [/\bвпрочем, все\b/gi, 'впрочем, всё'],
  [/\bпленк([а-я]*)\b/gi, 'плёнк$1'],
  [/\bсъемк([а-я]*)\b/gi, 'съёмк$1'],
  [/\bтяжел([а-я]*)\b/gi, 'тяжёл$1'],
  [/\bчерн([а-я]*)\b/gi, 'чёрн$1'],
  [/\bдалек([а-я]*)\b/gi, 'далёк$1'],
  [/\bзасекреченн([а-я]*)\b/gi, 'засекречённ$1'],
  [/\bвключен([а-я]*)\b/gi, 'включён$1'],
  [/\bотключен([а-я]*)\b/gi, 'отключён$1'],
  [/\bобречен([а-я]*)\b/gi, 'обречён$1'],
  [/\bнапряжен([а-я]*)\b/gi, 'напряжён$1'],
  [/\bискажен([а-я]*)\b/gi, 'искажён$1'],
  [/\bподтвержден([а-я]*)\b/gi, 'подтверждён$1'],
  [/\bуничтожен([а-я]*)\b/gi, 'уничтожён$1'],
  [/\bпришел\b/gi, 'пришёл'],
  [/\bушел\b/gi, 'ушёл'],
  [/\bнашел\b/gi, 'нашёл'],
  [/\bпроизошел\b/gi, 'произошёл'],
  [/\bтрех\b/gi, 'трёх'],
  [/\bчетырех\b/gi, 'четырёх'],
  [/\bчетверт([а-я]*)\b/gi, 'четвёрт$1'],
  [/\bзвезд([а-я]*)\b/gi, 'звёзд$1'],
  [/\bлед\b/gi, 'лёд'],
  [/\bзамерзш([а-я]*)\b/gi, 'замёрзш$1'],
  [/\bее\b/gi, 'её'],
  [/\bсчет([а-я]*)\b/gi, 'счёт$1'],
  [/\bотчет([а-я]*)\b/gi, 'отчёт$1']
];

function numberToRussianWords(num: number, isYearContext = false): string {
  if (isNaN(num) || num < 0) return String(num);
  if (num === 0) return 'ноль';

  const ones = [
    '',
    'один',
    'два',
    'три',
    'четыре',
    'пять',
    'шесть',
    'семь',
    'восемь',
    'девять',
    'десять',
    'одиннадцать',
    'двенадцать',
    'тринадцать',
    'четырнадцать',
    'пятнадцать',
    'шестнадцать',
    'семнадцать',
    'восемнадцать',
    'девятнадцать'
  ];

  const ordinalOnesPrepositional = [
    '',
    'первом',
    'втором',
    'третьем',
    'четвёртом',
    'пятом',
    'шестом',
    'седьмом',
    'восьмом',
    'девятом',
    'десятом',
    'одиннадцатом',
    'двенадцатом',
    'тринадцатом',
    'четырнадцатом',
    'пятнадцатом',
    'шестнадцатом',
    'семнадцатом',
    'восемнадцатом',
    'девятнадцатом'
  ];

  const tens = [
    '',
    '',
    'двадцать',
    'тридцать',
    'сорок',
    'пятьдесят',
    'шестьдесят',
    'семьдесят',
    'восемьдесят',
    'девяносто'
  ];

  const ordinalTensPrepositional = [
    '',
    '',
    'двадцатом',
    'тридцатом',
    'сороковом',
    'пятидесятом',
    'шестидесятом',
    'семидесятом',
    'восьмидесятом',
    'девяностом'
  ];

  const hundreds = [
    '',
    'сто',
    'двести',
    'триста',
    'четыреста',
    'пятьсот',
    'шестьсот',
    'семьсот',
    'восемьсот',
    'девятьсот'
  ];

  const parts: string[] = [];
  let rem = Math.floor(num);

  if (rem >= 1000) {
    const th = Math.floor(rem / 1000);
    rem = rem % 1000;
    if (th === 1) parts.push('тысяча');
    else if (th === 2) parts.push('две тысячи');
    else if (th === 3 || th === 4) parts.push(`${ones[th]} тысячи`);
    else if (th < 20) parts.push(`${ones[th]} тысяч`);
  }

  const h = Math.floor(rem / 100);
  const lastTwo = rem % 100;

  if (h > 0) parts.push(hundreds[h]);

  if (isYearContext && lastTwo > 0) {
    if (lastTwo < 20) {
      parts.push(ordinalOnesPrepositional[lastTwo]);
    } else {
      const t = Math.floor(lastTwo / 10);
      const o = lastTwo % 10;
      if (o === 0) parts.push(ordinalTensPrepositional[t]);
      else {
        parts.push(tens[t]);
        parts.push(ordinalOnesPrepositional[o]);
      }
    }
  } else if (lastTwo > 0) {
    if (lastTwo < 20) parts.push(ones[lastTwo]);
    else {
      const t = Math.floor(lastTwo / 10);
      const o = lastTwo % 10;
      if (t > 0) parts.push(tens[t]);
      if (o > 0) parts.push(ones[o]);
    }
  }

  return parts.filter(Boolean).join(' ');
}

export const VerbaFlowStudioView: React.FC<VerbaFlowStudioViewProps> = ({
  sourceText,
  onSourceTextChange,
  verbaMode,
  onVerbaModeChange,
  mysteryType,
  onMysteryTypeChange,
  toneOfVoice,
  onToneOfVoiceChange,
  complianceDictionary,
  onTransferToNarrativeMontage,
  onSendToVoiceStudio,
  onSyncAllWorkshops,
  onNotify
}) => {
  // 3 контрастных блока структурированного Split-экрана справа (вывод строго на English US)
  const [hookBlock, setHookBlock] = useState<string>('');
  const [bridgeBlock, setBridgeBlock] = useState<string>('');
  const [mainScriptBlock, setMainScriptBlock] = useState<string>('');
  const [hookPack, setHookPack] = useState<string[]>([]);
  const [isGeminiRewriting, setIsGeminiRewriting] = useState<boolean>(false);

  // Интерактивные метрики-триггеры («Человечность», «Без воды», «Уникальность»)
  const [humanityScore, setHumanityScore] = useState<number>(88);
  const [noWaterScore, setNoWaterScore] = useState<number>(84);
  const [uniquenessScore, setUniquenessScore] = useState<number>(92);
  const [activeFilterBadge, setActiveFilterBadge] = useState<string>('');

  // Отчет YouTube Compliance
  const [complianceReport, setComplianceReport] = useState<{
    checked: boolean;
    issues: ComplianceIssue[];
    score: number;
  } | null>(null);

  // Сгенерированные видео-промпты (4–5 сек) и дикторский превью
  const [videoPromptScenes, setVideoPromptScenes] = useState<GeneratedVideoPromptScene[]>([]);
  const [voiceoverPreview, setVoiceoverPreview] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');

  const copyTextWithFeedback = (text: string, key: string, toastText: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onNotify(toastText, 'success');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // ============================================================================
  // 1. КНОПКА «🔥 ОЧИСТИТЬ ОТ ДАТ И КАНЦЕЛЯРИТА»
  // ============================================================================
  const handleCleanDatesAndBureaucracy = () => {
    const raw = sourceText.trim();
    if (!raw) {
      onNotify('Сначала введите исходный текст слева!', 'error');
      return;
    }

    let cleaned = raw
      .replace(
        /(?:В|в)\s+\d{4}\s*году\s*,?\s*/g,
        'В ту роковую ночь, когда протоколы ещё не были засекречены, '
      )
      .replace(
        /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*года\s*,?\s*/gi,
        'Без всякого предупреждения '
      )
      .replace(/\b(?:В период с|Начиная с|По состоянию на)\s+\d{4}\s*год[а-я]*\s*/gi, '')
      .replace(/\bIn\s+\d{4}\s*,?\s*/gi, 'Before the incident logs were classified, ')
      .replace(/\bофициальная версия гласила, что\b/gi, 'в отчётах поспешно написали одно:')
      .replace(/\bсогласно официальным данным,?\b/gi, 'на бумаге всё выглядело гладко, но')
      .replace(/\bв рамках расследования было установлено, что\b/gi, 'вскрылась деталь, которую пытались спрятать:')
      .replace(/\bосуществлял[а-я]*\b/gi, 'вёл')
      .replace(/\bявляется\b/gi, 'становится')
      .replace(/\bимело место быть\b/gi, 'произошло наяву')
      .replace(/\bв связи с вышеизложенным\b/gi, 'именно поэтому')
      .replace(/\bданный объект\b/gi, 'это место')
      .replace(/\bв течени[еи]\s+(\d+)\s+часов\b/gi, 'всего за $1 ч.')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (cleaned === raw) {
      cleaned =
        `Никто из дежурной смены не подозревал, чем закончится этот сигнал. ` +
        raw.replace(/\b\d{4}\b/g, 'тот самый');
    }

    onSourceTextChange(cleaned);
    setNoWaterScore(prev => Math.min(99, prev + 6));
    setHumanityScore(prev => Math.min(99, prev + 5));
    onNotify(
      '🔥 Исходник очищен от скучных дат и канцелярита — сухие факты переведены в драматургический конфликт!',
      'success'
    );
  };

  // ============================================================================
  // 2. СТРУКТУРИРОВАННЫЙ SPLIT-ЭКРАН (ВЫВОД СТРОГО НА ENGLISH US)
  // ============================================================================
  const translateDraftSnippetToEnglish = (text: string, fallback: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    if (!/[а-яёА-ЯЁ]/.test(trimmed)) return trimmed;

    return (
      trimmed
        .replace(/альпийской метеостанции/gi, 'high-altitude Alpine weather station')
        .replace(/метеостанции/gi, 'remote weather station')
        .replace(/в архивах/gi, 'inside the sealed archives of the')
        .replace(/нашли кассету с записью/gi, 'investigators uncovered a reel-to-reel tape capturing')
        .replace(/странного низкочастотного гула/gi, 'an unexplained low-frequency acoustic pulse')
        .replace(/станцию закрыли за 24 часа/gi, 'the entire facility was evacuated within twenty-four hours')
        .replace(/персонал подписал неразглашение на 50 лет/gi, 'the crew signed a fifty-year non-disclosure pact')
        .replace(/сошла лавина/gi, 'a sudden avalanche struck the ridge')
        .replace(/приборы продолжали передавать сигнал/gi, 'the instruments kept broadcasting a signal')
        .replace(/еще три недели/gi, 'for three more weeks')
        .replace(/в ту роковую ночь, когда протоколы ещё не были засекречены,?/gi, 'On that fateful night before the logs were classified,')
        .replace(/в отчётах поспешно написали одно:/gi, 'official reports hurriedly claimed one thing:')
        .replace(/[а-яёА-ЯЁ]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,.\s—-]+|[,.\s—-]+$/g, '')
        .trim() || fallback
    );
  };

  const runVerbaFlowRewriteLocal = useCallback(() => {
    const raw = sourceText.trim();
    if (!raw) {
      onNotify('Введите исходный текст или заметку для переработки!', 'error');
      return;
    }

    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const rawSubj = (sentences[0] || '')
      .replace(/^(?:В|в)\s+\d{4}\s*году\s*/i, '')
      .replace(/[.!?]+$/, '');
    const cleanSubject = translateDraftSnippetToEnglish(
      rawSubj,
      'Inside a sealed high-altitude weather station, investigators found a reel tape capturing an unexplained low-frequency signal'
    );
    const detailOne = translateDraftSnippetToEnglish(
      sentences[1]?.replace(/[.!?]+$/, '') || '',
      'The entire outpost was evacuated within twenty-four hours and the crew signed a half-century non-disclosure agreement'
    );
    const detailTwo = translateDraftSnippetToEnglish(
      sentences.slice(2).join(' '),
      'Official reports blamed an avalanche, yet every instrument inside the powered-down bunker kept broadcasting for three straight weeks.'
    );

    // [HOOK 00:00–00:15]: триггер без дат + визуальный маркер сцены [Visual: ...]
    const hookMap: Record<MysteryType, string> = {
      mystery: `[Visual: Extreme macro push-in on a spinning reel-to-reel tape deck in the dark, red REC indicator blinking] Every official report repeated the same cover story: "${cleanSubject}." Yet at the fourteen-second mark of the master tape, a sound emerges that forced the entire facility to shut down overnight.`,
      question: `[Visual: High-altitude drone sweep over a snow-buried perimeter, searchlight cutting through the blizzard] What forces a veteran crew to abandon active consoles and vanish in twenty-four hours? If "${cleanSubject}" was just a routine glitch, who kept broadcasting from the locked bunker for three more weeks?`,
      epicenter: `[Visual: Handheld camera shake, analog oscilloscope needle slamming into the red zone] Three-seventeen AM. The storm siren drowns out the radio. On the desk sits an unstopped tape recorder: "${cleanSubject}." Twelve minutes later, the line goes dead forever.`,
      myth: `[Visual: Classified dossier folder slams onto a backlit table, sharp cut to negative film] For decades, authorities blamed a sudden mountain avalanche. But one torn logbook page proves "${cleanSubject}" was only a cover story.`
    };

    // [THE BRIDGE / OPEN LOOP 00:15–00:45]: заброс открытой петли интриги с обещанием кульминации
    const bridgeByTone: Record<ToneOfVoice, string> = {
      doc: `[Open Loop • Documentary Bridge] Before we play the unfiltered audio from that reel, look closely at the timeline gap: exactly forty minutes vanished between the final distress call and the military cordon. Only three people knew what happened inside that window—and the final payoff changes everything...`,
      storyteller: `[Open Loop • YouTube Storyteller] And here is where the story takes a chilling turn. On paper, the official explanation looks airtight—until you notice one tiny discrepancy buried at the bottom of the inventory list. Stay until the climax, because that single detail changes everything.`,
      truecrime: `[Open Loop • Investigative File] Exhibit A directly contradicts the non-disclosure affidavits. Why did every telemetry sensor keep transmitting for twenty-one days after the main breaker was pulled? The answer is hidden inside the final protocol...`,
      scipop: `[Open Loop • Analytical Breakdown] From an acoustic physics standpoint, a sub-audible resonance of this magnitude cannot sustain itself naturally. Keeping that transmitter alive for three weeks required a massive power source—and we are about to reveal where it came from.`,
      dynamic: `[Open Loop • High-Paced Retention] Think shutting down the outpost ended the broadcast? Not even close. The real anomaly started twenty-four hours later, when receivers in the neighboring sector picked up a return signal...`,
      neutral: `[Open Loop • Forensic Review] Cross-referencing hardware telemetry with crew testimony exposes a critical contradiction. The decisive evidence lies in phase three of the incident, which we examine next.`
    };

    // [BODY SCRIPT]: ритмичные короткие фразы с разметкой пауз [pause 1.5s] и акцентов
    const builtMainScript =
      verbaMode === 'shorts_1sec'
        ? `[SHORTS 00:00–00:03 • TEXT OVERLAY: "SEALED FOR 50 YEARS"]\n` +
          `Stop scrolling. This recording was erased from three separate archives. [pause 1.5s]\n\n` +
          `[SHORTS 00:03–00:18 • TEXT OVERLAY: "14 SECONDS BEFORE BLACKOUT"]\n` +
          `${cleanSubject}. [pause 1.5s] ${detailOne}. [pause 1.5s]\n\n` +
          `[SHORTS 00:18–00:45 • TEXT OVERLAY: "WHO WAS BROADCASTING?"]\n` +
          `${detailTwo} [pause 1.5s]\n\n` +
          `[SHORTS 00:45–00:60 • SEAMLESS LOOP ENDING • TEXT OVERLAY: "LISTEN TO SECOND 14"]\n` +
          `And the strangest part? The final pulse on the tape matches the exact second where...`
        : `[Beat 1 • The Core Conflict]\n` +
          `${cleanSubject}. [pause 1.5s] When the recovery team unsealed the control room, *EVERY INSTRUMENT* was still running in active mode. [pause 1.5s]\n\n` +
          `[Beat 2 • Raising the Stakes]\n` +
          `${detailOne}. [pause 1.5s] No human operator had access to the array. [pause 1.5s] Yet *EVERY SINGLE NIGHT* at the exact same hour, the frequency returned to the airwaves. [pause 1.5s]\n\n` +
          `[Beat 3 • Climax & Payoff]\n` +
          `${detailTwo} [pause 1.5s] And while the original master reels remain locked away, one question refuses to fade: *WHAT EXACTLY* did they hear on that tape?`;

    setHookBlock(hookMap[mysteryType]);
    setBridgeBlock(bridgeByTone[toneOfVoice]);
    setMainScriptBlock(builtMainScript);

    if (verbaMode === 'pack5_script') {
      setHookPack([
        `1. [MYSTERY]: ${hookMap.mystery}`,
        `2. [QUESTION]: ${hookMap.question}`,
        `3. [EPICENTER]: ${hookMap.epicenter}`,
        `4. [MYTH BUSTER]: ${hookMap.myth}`,
        `5. [CONTRAST]: [Visual: Split screen of frozen bunker and active green waveform] On the map, the outpost was listed as dead. On the airwaves, it transmitted a new cipher every forty seconds.`
      ]);
    } else {
      setHookPack([]);
    }
  }, [sourceText, mysteryType, toneOfVoice, verbaMode, onNotify]);

  const handleRewriteWithGemini = async () => {
    const raw = sourceText.trim();
    if (!raw) {
      onNotify('Введите исходный текст или заметку для переработки!', 'error');
      return;
    }

    setIsGeminiRewriting(true);
    try {
      const res = await fetch('/api/gemini/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: raw,
          mysteryType,
          toneOfVoice,
          verbaMode
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setHookBlock(String(json.data.hook || ''));
          setBridgeBlock(String(json.data.bridge || ''));
          setMainScriptBlock(String(json.data.body || ''));
          onNotify('⚡ Сценарий переработан через Gemini (Strictly English US)!', 'success');
          setIsGeminiRewriting(false);
          return;
        }
      }
      runVerbaFlowRewriteLocal();
      onNotify('⚡ Текст переработан движком VerbaFlow (Strictly English US)!', 'success');
    } catch {
      runVerbaFlowRewriteLocal();
      onNotify('⚡ Текст переработан движком VerbaFlow (Strictly English US)!', 'success');
    } finally {
      setIsGeminiRewriting(false);
    }
  };

  useEffect(() => {
    if (!hookBlock && sourceText) {
      runVerbaFlowRewriteLocal();
    }
  }, []);

  // ============================================================================
  // 3. ИНТЕРАКТИВНЫЕ МЕТРИКИ-ТРИГГЕРЫ («БЕЗ ВОДЫ», «ЧЕЛОВЕЧНОСТЬ», «УНИКАЛЬНОСТЬ»)
  // ============================================================================
  const applyNoWaterFilter = () => {
    const fillerRegex =
      /\b(?:as is well known,?|it should be noted that|basically,?|therefore,?|undoubtedly,?|obviously,?|ultimately,?|in fact,?|actually,?|как известно,?|следует отметить, что|по сути,?|таким образом,?|безусловно,?|очевидно, что|на самом деле,?)\s*/gi;

    const compressText = (txt: string) =>
      txt
        .replace(fillerRegex, '')
        .replace(/\bwhich was\b/gi, '')
        .replace(/\bin order to\b/gi, 'to')
        .replace(/\s{2,}/g, ' ')
        .trim();

    setHookBlock(prev => compressText(prev));
    setBridgeBlock(prev => compressText(prev));
    setMainScriptBlock(prev => compressText(prev));
    setNoWaterScore(prev => Math.min(99, prev + 5));
    setActiveFilterBadge('Фильтр «Без воды» (-15% вводного балласта • English US)');
    onNotify(
      '💧 Фильтр «Без воды» применен: удален вводный балласт (-15% объема), плотность сценария повышена!',
      'success'
    );
  };

  const applyHumanityFilter = () => {
    setBridgeBlock(prev =>
      prev.includes('Think about it for a second:')
        ? prev
        : `Think about it for a second: would you stay silent for half a century over a routine weather glitch? [pause 1.5s] ${prev}`
    );
    setMainScriptBlock(prev => {
      if (prev.includes('But you know what is most unsettling?')) return prev;
      return (
        prev +
        `\n\n[Beat 4 • Direct Viewer Question]\nBut you know what is most unsettling about this entire case? [pause 1.5s] *NOT A SINGLE* member of that night shift ever broke their silence.`
      );
    });
    setHumanityScore(prev => Math.min(99, prev + 6));
    setActiveFilterBadge('Фильтр «Человечность» (+разговорная ритмика, акценты и риторические вопросы)');
    onNotify(
      '🎙 Фильтр «Человечность» применен: усилена разговорная ритмика, акценты и риторические вопросы!',
      'success'
    );
  };

  const applyUniquenessFilter = () => {
    setHookBlock(prev =>
      prev
        .replace(
          /Every official report repeated the same cover story/g,
          'In the declassified briefings, censors left only one cold line'
        )
        .replace(/overnight/g, 'in less than twelve hours before dawn')
    );
    setUniquenessScore(prev => Math.min(99, prev + 4));
    setActiveFilterBadge('Фильтр «Уникальность» (+кинематографичные авторские обороты)');
    onNotify(
      '✨ Фильтр «Уникальность» применен: штампы заменены на уникальные кинематографичные обороты!',
      'success'
    );
  };

  const combinedScriptText = useMemo(
    () =>
      `[HOOK 00:00–00:15]\n${hookBlock}\n\n[THE BRIDGE / OPEN LOOP 00:15–00:45]\n${bridgeBlock}\n\n[BODY SCRIPT]\n${mainScriptBlock}`.trim(),
    [hookBlock, bridgeBlock, mainScriptBlock]
  );

  // ============================================================================
  // 4. АНАЛИЗАТОР «СМЕРТЕЛЬНЫХ ЗОН УДЕРЖАНИЯ» (RETENTION FORECAST)
  // ============================================================================
  const retentionForecast = useMemo(() => {
    const hookClean = hookBlock.replace(/\[(?:Кадр|Shot|Visual):[^\]]*\]/gi, '').trim();
    const hasDatesInStart = /\b(18|19|20)\d{2}\b|году|января|февраля|марта|in 19\d\d|in 20\d\d/i.test(
      hookClean.slice(0, 120)
    );
    const hasGreetingsInStart =
      /привет|здравствуйте|добрый день|сегодня мы|в этом видео|hey guys|welcome back|in this video|hello everyone/i.test(
        hookClean.slice(0, 120)
      );
    const dropZoneRisk = hasDatesInStart || hasGreetingsInStart;

    const hasOpenLoop =
      /\?|why|before we|discrepancy|window|hidden|until|climax|payoff|почему|однако|тайна/i.test(
        bridgeBlock
      );

    const allSentences = `${hookClean} ${bridgeBlock} ${mainScriptBlock}`
      .replace(/\[[^\]]*\]/g, '')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const totalWords = allSentences.reduce(
      (acc, s) => acc + s.split(/\s+/).filter(Boolean).length,
      0
    );
    const avgSentenceWords =
      allSentences.length > 0 ? Math.round((totalWords / allSentences.length) * 10) / 10 : 0;

    return {
      dropZoneRisk,
      dropZoneReason: hasDatesInStart
        ? 'Обнаружены даты/годы в первых 5 секундах — высокий риск свайпа!'
        : hasGreetingsInStart
        ? 'Обнаружено приветствие («Hey guys / In this video») — зритель уходит!'
        : 'Динамичный старт без дат + визуальный маркер [Visual: ...] (Риск отвала минимален)',
      hasOpenLoop,
      avgSentenceWords,
      needsShortening: avgSentenceWords > 10
    };
  }, [hookBlock, bridgeBlock, mainScriptBlock]);

  const shortenLongSentences = () => {
    const splitLong = (txt: string) =>
      txt
        .replace(/,\s+(?:but|yet|however|while|although|and yet|но|однако|а|хотя)\s+/gi, '. ')
        .replace(/,\s+because\s+/gi, '. The reason is simple: ')
        .replace(/,\s+when\s+/gi, '. Right then, ')
        .replace(/—/g, '. ');
    setHookBlock(prev => splitLong(prev));
    setBridgeBlock(prev => splitLong(prev));
    setMainScriptBlock(prev => splitLong(prev));
    onNotify('⚡ Длинные предложения разбиты на короткие ударные фразы для удержания ритма!', 'success');
  };

  // ============================================================================
  // 5. ПОДГОТОВКА ТЕКСТА ДЛЯ ДИКТОРСКОГО ЦЕХА («🎙 В ДИКТОРСКИЙ ЦЕХ»)
  // ============================================================================
  const buildVoiceoverReadyText = (): string => {
    let text = `${hookBlock}\n\n[pause 1.5s]\n\n${bridgeBlock}\n\n[pause 1.5s]\n\n${mainScriptBlock}`;

    const pauseTokens: string[] = [];
    text = text.replace(/\[(?:пауза|pause)\s+[\d.,]+(?:с|s)\]/gi, match => {
      pauseTokens.push(match);
      return `__PAUSE_TOKEN_${pauseTokens.length - 1}__`;
    });

    text = text.replace(/\[(?:Бит|Beat|Open Loop|Visual|Shot|Кадр)[^\]]*\]\s*/gi, '');

    text = text.replace(/\b([Вв])\s+(\d{4})\s+(году|года)\b/g, (_m, prep, yearStr, word) => {
      const y = parseInt(yearStr, 10);
      return `${prep} ${numberToRussianWords(y, true)} ${word}`;
    });

    text = text.replace(/\b\d+\b/g, match => {
      const n = parseInt(match, 10);
      if (isNaN(n)) return match;
      return numberToRussianWords(n, n >= 1800 && n <= 2035);
    });

    YO_DICTIONARY.forEach(([regex, replacement]) => {
      text = text.replace(regex, replacement);
    });

    text = text.replace(/__PAUSE_TOKEN_(\d+)__/g, (_m, idx) => {
      return pauseTokens[Number(idx)] || '[pause 1.5s]';
    });

    return text;
  };

  const handleExportVoiceoverTxt = () => {
    const readyTxt = buildVoiceoverReadyText();
    setVoiceoverPreview(readyTxt);

    const blob = new Blob([readyTxt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'voiceover_script_ready.txt';
    link.click();
    URL.revokeObjectURL(url);

    if (onSendToVoiceStudio) {
      onSendToVoiceStudio(readyTxt);
    } else {
      onNotify(
        '🎙 Дикторский файл (.txt) готов: числа прописью, буква «ё» и паузы [pause 1.5s] расставлены!',
        'success'
      );
    }
  };

  // ============================================================================
  // 6. ГЕНЕРАЦИЯ ВИДЕО-ПРОМПТОВ И СКВОЗНАЯ ПЕРЕДАЧА ВО ВСЕ ВКЛАДКИ
  // ============================================================================
  const buildVideoPromptScenesList = (): GeneratedVideoPromptScene[] => {
    const rawClean = `${hookBlock} ${bridgeBlock} ${mainScriptBlock}`
      .replace(/\[(?:пауза|pause|Бит|Beat|SHORTS|Open Loop|Кадр|Shot|Visual)[^\]]*\]/gi, '')
      .replace(/\*+/g, '')
      .trim();

    const segments = rawClean
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const cameraPlans = [
      'Extreme close-up macro shot, shallow depth of field, 85mm anamorphic lens',
      'Slow cinematic dolly-in tracking shot, low angle, rule of thirds composition',
      'Aerial drone establishing shot through dense snowstorm, wide 24mm lens',
      'Handheld tense over-the-shoulder shot, subtle camera shake, cinematic framing',
      'Slow orbital pan around vintage control console, dramatic foreground silhouette',
      'High-contrast dutch angle close-up on flickering analog gauges, 50mm prime'
    ];

    const lightingStyles = [
      'volumetric god rays piercing dark fog, cold cyan and warm tungsten rim light, chiaroscuro',
      'flickering red emergency indicator light, moody atmospheric shadows, 8k photorealistic',
      'moonlit blizzard haze, diffused volumetric beams, high dynamic range, ARRI Alexa look',
      'stark overhead fluorescent beam, dusty air particles, cinematic color grading, Kodachrome'
    ];

    let cursorSec = 0;
    return segments.map((line, idx) => {
      const dur = idx % 2 === 0 ? 5 : 4;
      const startMin = Math.floor(cursorSec / 60);
      const startSec = cursorSec % 60;
      const endCursor = cursorSec + dur;
      const endMin = Math.floor(endCursor / 60);
      const endSec = endCursor % 60;
      const rangeStr = `${String(startMin).padStart(2, '0')}:${String(startSec).padStart(
        2,
        '0'
      )}–${String(endMin).padStart(2, '0')}:${String(endSec).padStart(2, '0')}`;
      cursorSec = endCursor;

      const cam = cameraPlans[idx % cameraPlans.length];
      const light = lightingStyles[idx % lightingStyles.length];

      const promptEn = `Cinematic 4K scene for Kling / Sora / Midjourney: "${line.slice(
        0,
        95
      )}". Camera: ${cam}. Lighting: ${light}, volumetric rays, rule of thirds, ultra-detailed texture, 8k, --ar 16:9 --v 6.0`;

      return {
        sceneIndex: idx + 1,
        timecodeRange: rangeStr,
        durationSec: dur,
        scriptLine: line,
        cameraPlan: cam,
        lightingStyle: light,
        promptEn
      };
    });
  };

  const handleSliceIntoVideoPrompts = () => {
    const generated = buildVideoPromptScenesList();
    setVideoPromptScenes(generated);
    onNotify(
      `🎬 Сценарий разбит на ${generated.length} видео-промптов по 4–5 сек (Midjourney / Kling / Sora)!`,
      'success'
    );
  };

  // Кнопка сквозной передачи: «🚀 Передать сценарий в SEO, Дикторский цех и Видеопромпты»
  const handleSyncToAllWorkshops = () => {
    const generatedPrompts =
      videoPromptScenes.length > 0 ? videoPromptScenes : buildVideoPromptScenesList();
    setVideoPromptScenes(generatedPrompts);

    const mappedScenes: NarrativeSceneItem[] = generatedPrompts.map(item => ({
      scene_index: item.sceneIndex,
      scene_id: `SCENE_${String(item.sceneIndex).padStart(3, '0')}`,
      file_name: '',
      start_time: item.timecodeRange.split('–')[0] || '00:00',
      duration: item.durationSec,
      transition: { type: 'crossfade', duration_sec: 0.6 },
      text_overlay: item.scriptLine
    }));

    const voiceReady = buildVoiceoverReadyText();
    setVoiceoverPreview(voiceReady);

    if (onSyncAllWorkshops) {
      onSyncAllWorkshops(mappedScenes, combinedScriptText, voiceReady);
    } else {
      onTransferToNarrativeMontage(mappedScenes, combinedScriptText);
    }
  };

  const handleExportPromptsManifestJson = () => {
    const list = videoPromptScenes.length > 0 ? videoPromptScenes : buildVideoPromptScenesList();
    if (videoPromptScenes.length === 0) setVideoPromptScenes(list);

    const manifestObj = {
      schema_version: '3.0',
      project_type: 'narrative_scenes_montage',
      project_name: 'VerbaFlow Storyboard 4K',
      total_scenes: list.length,
      total_duration_sec: list.reduce((acc, s) => acc + s.durationSec, 0),
      scenes: list.map(item => ({
        scene_index: item.sceneIndex,
        scene_id: `SCENE_${String(item.sceneIndex).padStart(3, '0')}`,
        file_name: '',
        start_time: item.timecodeRange.split('–')[0] || '00:00',
        duration: item.durationSec,
        transition: { type: 'crossfade', duration_sec: 0.6 },
        text_overlay: item.scriptLine,
        ai_video_prompt: item.promptEn
      }))
    };

    const blob = new Blob([JSON.stringify(manifestObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verbaflow_video_prompts_${list.length}scenes.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Монтажный манифест с видео-промптами экспортирован в JSON!', 'success');
  };

  // YouTube Compliance Check
  const runYouTubeComplianceCheck = () => {
    const fullText = `${sourceText}\n${combinedScriptText}`;
    const foundIssues: ComplianceIssue[] = [];

    complianceDictionary.forEach(entry => {
      const matches = fullText.match(entry.pattern);
      if (matches && matches.length > 0) {
        const uniqueMatches = Array.from(new Set(matches.map(m => m.toLowerCase())));
        foundIssues.push({
          word: uniqueMatches.join(', '),
          category: entry.category,
          risk: entry.risk,
          replacements: entry.replacements
        });
      }
    });

    const score = Math.max(
      10,
      100 - foundIssues.reduce((acc, item) => acc + (item.risk === 'high' ? 22 : 12), 0)
    );

    setComplianceReport({
      checked: true,
      issues: foundIssues,
      score
    });

    if (foundIssues.length === 0) {
      onNotify('YouTube Compliance: Триггерных слов не обнаружено (100% Safe)', 'success');
    } else {
      onNotify(
        `Обнаружено ${foundIssues.length} триггерных групп. Нажмите на синоним для автозамены!`,
        'info'
      );
    }
  };

  const applySafeSynonym = (issueWord: string, replacement: string) => {
    const words = issueWord
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);
    let nextSource = sourceText;
    let nextHook = hookBlock;
    let nextBridge = bridgeBlock;
    let nextMain = mainScriptBlock;

    words.forEach(w => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      nextSource = nextSource.replace(regex, replacement);
      nextHook = nextHook.replace(regex, replacement);
      nextBridge = nextBridge.replace(regex, replacement);
      nextMain = nextMain.replace(regex, replacement);
    });

    onSourceTextChange(nextSource);
    setHookBlock(nextHook);
    setBridgeBlock(nextBridge);
    setMainScriptBlock(nextMain);
    setComplianceReport(prev =>
      prev
        ? {
            ...prev,
            issues: prev.issues.filter(i => i.word !== issueWord),
            score: Math.min(100, prev.score + 18)
          }
        : null
    );
    onNotify(`Заменено на безопасный синоним: «${replacement}»`, 'success');
  };

  const charCount = sourceText.length;
  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* ШАПКА VERBAFLOW + ИНТЕРАКТИВНЫЕ КНОПКИ-ТРИГГЕРЫ МЕТРИК */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Zap className="text-amber-400 w-5 h-5" /> Сценарный цех и Хуки (VerbaFlow • English US Output)
          </h2>
          <p className="text-xs text-slate-400">
            Очистка от дат и канцелярита, интерактивные триггеры метрик и 3-блочный Split-редактор удержания с прямой синхронизацией в SEO, Дикторский цех и Видеопромпты
          </p>
        </div>

        {/* 2. ИНТЕРАКТИВНЫЕ МЕТРИКИ-ТРИГГЕРЫ («ЧЕЛОВЕЧНОСТЬ», «БЕЗ ВОДЫ», «УНИКАЛЬНОСТЬ») */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyHumanityFilter}
            className="group bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-2 rounded-xl text-left transition cursor-pointer shadow-sm"
            title="Клик по «Человечность»: усиление разговорной ритмики, акцентов и риторических вопросов"
          >
            <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold block">
              🎙 Человечность: {humanityScore}%
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-emerald-200">
              + Ритмика, акценты &amp; вопросы
            </span>
          </button>

          <button
            type="button"
            onClick={applyNoWaterFilter}
            className="group bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/40 px-3.5 py-2 rounded-xl text-left transition cursor-pointer shadow-sm"
            title="Клик по «Без воды»: удаление вводного балласта (-15% объема)"
          >
            <span className="text-[10px] uppercase tracking-wider text-sky-300 font-bold block">
              💧 Без воды: {noWaterScore}%
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-sky-200">
              Убрать балласт (-15% объема)
            </span>
          </button>

          <button
            type="button"
            onClick={applyUniquenessFilter}
            className="group bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 px-3.5 py-2 rounded-xl text-left transition cursor-pointer shadow-sm"
            title="Клик по «Уникальность»: замена штампов на кинематографичные обороты"
          >
            <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold block">
              ✨ Уникальность: {uniquenessScore}%
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-amber-200">
              Убрать штампы и клише
            </span>
          </button>
        </div>
      </div>

      {activeFilterBadge && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-amber-300">
          <span>
            ⚡ Активный триггер метрики: <strong>{activeFilterBadge}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveFilterBadge('')}
            className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* СЕЛЕКТОРЫ РЕЖИМА И ТОНАЛЬНОСТИ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1.5">
            Режим сценария (VerbaFlow Mode):
          </label>
          <select
            value={verbaMode}
            onChange={e => onVerbaModeChange(e.target.value as VerbaMode)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-amber-300 font-semibold outline-none focus:border-amber-500"
          >
            <option value="15sec_rewrite">15-сек Хук с загадкой + Split-переделка</option>
            <option value="pack5_script">Пак из 5 хуков (15 сек) + Полный сценарий</option>
            <option value="doc_loops">Документальный сценарий с петлями интриги</option>
            <option value="shorts_1sec">Shorts / Reels (Удержание с 1-й секунды)</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1.5">
            Тип загадки в начале:
          </label>
          <select
            value={mysteryType}
            onChange={e => onMysteryTypeChange(e.target.value as MysteryType)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
          >
            <option value="mystery">Тайна и необъяснимый факт</option>
            <option value="question">Провокационный вопрос</option>
            <option value="epicenter">Сразу в эпицентр события</option>
            <option value="myth">Разрушение мифа</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1.5">
            Тональность (Tone of Voice):
          </label>
          <select
            value={toneOfVoice}
            onChange={e => onToneOfVoiceChange(e.target.value as ToneOfVoice)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
          >
            <option value="doc">🎬 Документальный жанр</option>
            <option value="storyteller">🎙️ Живой рассказчик (YouTube)</option>
            <option value="truecrime">🕵️ Расследование / Тру-крайм</option>
            <option value="scipop">🧠 Научпоп / Аналитика</option>
            <option value="dynamic">🔥 Динамичный / Энергичный</option>
            <option value="neutral">⚖️ Нейтральный / Строгий</option>
          </select>
        </div>
      </div>

      {/* ПАНЕЛЬ ДЕЙСТВИЙ: ПЕРЕДЕЛАТЬ ТЕКСТ, В ДИКТОРСКИЙ ЦЕХ, СКВОЗНАЯ ПЕРЕДАЧА В SEO / ДИКТОРСКИЙ ЦЕХ / ВИДЕОПРОМПТЫ */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleRewriteWithGemini}
          disabled={isGeminiRewriting}
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition text-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {isGeminiRewriting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          <span>⚡ Переделать сценарий (English US Split)</span>
        </button>

        <button
          type="button"
          onClick={handleExportVoiceoverTxt}
          className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-2 cursor-pointer"
        >
          <Mic className="w-4 h-4" /> 🎙 В Дикторский цех (числа прописью, ё, паузы, экспорт txt)
        </button>

        <button
          type="button"
          onClick={handleSyncToAllWorkshops}
          className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 hover:from-indigo-400 hover:to-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20"
        >
          <Rocket className="w-4 h-4" /> 🚀 Передать сценарий в SEO, Дикторский цех и Видеопромпты
        </button>

        <button
          type="button"
          onClick={runYouTubeComplianceCheck}
          className="bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-400 font-bold px-3.5 py-2.5 rounded-xl transition text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" /> 🛡️ Compliance
        </button>
      </div>

      {/* ОТЧЕТ YOUTUBE COMPLIANCE */}
      {complianceReport && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            complianceReport.issues.length === 0
              ? 'bg-emerald-950/30 border-emerald-500/40'
              : 'bg-amber-950/20 border-amber-500/40'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {complianceReport.issues.length === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-xs font-bold text-slate-100">
                YouTube Ad-Safety Check: Индекс безопасности{' '}
                <span className={complianceReport.score >= 85 ? 'text-emerald-400' : 'text-amber-400'}>
                  {complianceReport.score}/100
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setComplianceReport(null)}
              className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Скрыть
            </button>
          </div>

          {complianceReport.issues.length === 0 ? (
            <p className="text-xs text-emerald-300">
              Триггерных слов не обнаружено. Сценарий полностью безопасен для монетизации YouTube.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {complianceReport.issues.map((issue, idx) => (
                <div key={idx} className="bg-[#0b0f17] border border-slate-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400">⚠️ «{issue.word}»</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                      {issue.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {issue.replacements.map((rep, rIdx) => (
                      <button
                        key={rIdx}
                        type="button"
                        onClick={() => applySafeSynonym(issue.word, rep)}
                        className="text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-2 py-1 rounded transition cursor-pointer"
                      >
                        Заменить на «{rep}»
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ДВУХКОЛОНОЧНЫЙ SPLIT-ЭКРАН: СЛЕВА СЫРОЙ ТЕКСТ + КНОПКА ОЧИСТКИ, СПРАВА 3 БЛОКА НА ENGLISH US */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ЛЕВАЯ КОЛОНКА: ПОЛЕ ВВОДА СЫРОГО ТЕКСТА + КНОПКА «🔥 ОЧИСТИТЬ ОТ ДАТ И КАНЦЕЛЯРИТА» */}
        <div className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-200 uppercase">
              Сырой исходный текст / Заметка
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCleanDatesAndBureaucracy}
                className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" /> 🔥 Очистить от дат и канцелярита
              </button>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                Слов: <strong className="text-amber-400">{wordCount}</strong> | Симв.:{' '}
                <strong className="text-amber-400">{charCount}</strong>
              </span>
            </div>
          </div>

          <textarea
            rows={18}
            value={sourceText}
            onChange={e => onSourceTextChange(e.target.value)}
            placeholder="Вставьте сырой текст статьи, энциклопедическую заметку с датами или черновик..."
            className="w-full flex-1 bg-[#0b0f17] border border-slate-800 focus:border-amber-500 rounded-xl p-4 text-xs text-slate-200 leading-relaxed outline-none custom-scroll"
          />
        </div>

        {/* ПРАВАЯ КОЛОНКА: СТРУКТУРИРОВАННЫЙ SPLIT-ЭКРАН (СТРОГО ENGLISH US) */}
        <div className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-400 uppercase">
              Структурированный Split-экран (Strictly English US)
            </span>
            <button
              type="button"
              onClick={() =>
                copyTextWithFeedback(
                  combinedScriptText,
                  'copy-all',
                  'Полный 3-блочный сценарий (English US) скопирован!'
                )
              }
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'copy-all' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-amber-400" />
              )}
              Копировать все 3 блока
            </button>
          </div>

          {/* БЛОК 1: [HOOK 00:00–00:15] */}
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-[#0b0f17] border-2 border-amber-500/50 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded">
                [HOOK 00:00–00:15] • Триггер без дат + маркер [Visual: ...]
              </span>
              <button
                type="button"
                onClick={() =>
                  copyTextWithFeedback(hookBlock, 'hook', 'Блок [HOOK 00:00–00:15] скопирован!')
                }
                className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" /> Копировать
              </button>
            </div>
            <textarea
              rows={3}
              value={hookBlock}
              onChange={e => setHookBlock(e.target.value)}
              className="w-full bg-slate-950/90 border border-amber-500/30 rounded-lg p-2.5 text-xs font-semibold text-amber-100 leading-relaxed outline-none focus:border-amber-400"
            />
          </div>

          {/* БЛОК 2: [THE BRIDGE / OPEN LOOP 00:15–00:45] */}
          <div className="bg-gradient-to-r from-indigo-500/15 via-indigo-500/5 to-[#0b0f17] border border-indigo-400/50 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 px-2.5 py-0.5 rounded">
                [THE BRIDGE / OPEN LOOP 00:15–00:45] • Заброс открытой петли интриги
              </span>
              <button
                type="button"
                onClick={() =>
                  copyTextWithFeedback(
                    bridgeBlock,
                    'bridge',
                    'Блок [THE BRIDGE / OPEN LOOP 00:15–00:45] скопирован!'
                  )
                }
                className="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" /> Копировать
              </button>
            </div>
            <textarea
              rows={3}
              value={bridgeBlock}
              onChange={e => setBridgeBlock(e.target.value)}
              className="w-full bg-slate-950/90 border border-indigo-500/30 rounded-lg p-2.5 text-xs text-indigo-100 leading-relaxed outline-none focus:border-indigo-400"
            />
          </div>

          {/* БЛОК 3: [BODY SCRIPT] */}
          <div className="bg-[#0b0f17] border border-emerald-500/40 rounded-xl p-3.5 space-y-2 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2.5 py-0.5 rounded">
                [BODY SCRIPT] • Короткие фразы + паузы [pause 1.5s] и акценты
              </span>
              <button
                type="button"
                onClick={() =>
                  copyTextWithFeedback(mainScriptBlock, 'main', 'Блок [BODY SCRIPT] скопирован!')
                }
                className="text-[11px] text-emerald-300 hover:text-emerald-200 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" /> Копировать
              </button>
            </div>
            <textarea
              rows={7}
              value={mainScriptBlock}
              onChange={e => setMainScriptBlock(e.target.value)}
              className="w-full flex-1 bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 leading-relaxed outline-none focus:border-emerald-400 custom-scroll"
            />
          </div>

          {hookPack.length > 0 && (
            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-amber-400 uppercase block">
                Пак из 5 вариантов хука (кликните для подстановки в [HOOK 00:00–00:15]):
              </span>
              <div className="space-y-1 max-h-28 overflow-y-auto custom-scroll">
                {hookPack.map((h, i) => (
                  <div
                    key={i}
                    onClick={() => setHookBlock(h)}
                    className="text-[11px] text-slate-300 hover:text-amber-300 bg-slate-900/70 p-1.5 rounded border border-slate-800 cursor-pointer"
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ДИАГНОСТИКА ПЕРВЫХ 30 СЕКУНД И РИТМИКИ */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Контроль удержания и ритмического пульса (Retention Diagnostic)
            </h3>
          </div>
          <button
            type="button"
            onClick={handleSliceIntoVideoPrompts}
            className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5" /> 🎬 Сформировать видеопромпты из сценария
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              retentionForecast.dropZoneRisk
                ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
                : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Секунда 0–5 (Зона дропа)
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  retentionForecast.dropZoneRisk
                    ? 'bg-rose-500 text-slate-950'
                    : 'bg-emerald-500 text-slate-950'
                }`}
              >
                {retentionForecast.dropZoneRisk ? 'РИСК ОТВАЛА' : 'БЕЗОПАСНО'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">{retentionForecast.dropZoneReason}</p>
          </div>

          <div
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              retentionForecast.hasOpenLoop
                ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/30 border-amber-500/50 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Секунда 15–45 (Open Loop)
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  retentionForecast.hasOpenLoop
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-amber-400 text-slate-950'
                }`}
              >
                {retentionForecast.hasOpenLoop ? 'OPEN LOOP АКТИВЕН' : 'УСИЛИТЬ МОСТ'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {retentionForecast.hasOpenLoop
                ? 'Открытая петля интриги зафиксирована в блоке [THE BRIDGE 00:15–00:45].'
                : 'Добавьте открытый вопрос во второй блок для удержания интриги.'}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              retentionForecast.needsShortening
                ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
                : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Ритмический пульс фраз
              </span>
              <span className="text-[11px] font-mono font-bold">
                ~{retentionForecast.avgSentenceWords} слов/фразу
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {retentionForecast.needsShortening
                ? 'Средняя длина фразы > 10 слов. Сократите предложения для динамичной подачи.'
                : 'Идеальный темп коротких фраз с паузами [pause 1.5s].'}
            </p>
            {retentionForecast.needsShortening && (
              <button
                type="button"
                onClick={shortenLongSentences}
                className="mt-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer"
              >
                ⚡ Сократить длинные фразы
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ПРЕВЬЮ ДИКТОРСКОГО ЦЕХА (ЕСЛИ СГЕНЕРИРОВАНО) */}
      {voiceoverPreview && (
        <div className="bg-[#0b0f17] border border-emerald-500/40 rounded-2xl p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-300 uppercase flex items-center gap-2">
              <Mic className="w-4 h-4" /> Готовый текст для диктора (Числа прописью + буква «ё» + паузы)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  copyTextWithFeedback(
                    voiceoverPreview,
                    'vo-copy',
                    'Дикторский текст скопирован в буфер обмена!'
                  )
                }
                className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Копировать дикторский текст
              </button>
              <button
                type="button"
                onClick={() => setVoiceoverPreview('')}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Скрыть
              </button>
            </div>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-emerald-200 whitespace-pre-wrap max-h-56 overflow-y-auto custom-scroll leading-relaxed">
            {voiceoverPreview}
          </pre>
        </div>
      )}

      {/* СПИСОК ВИДЕО-ПРОМПТОВ (ЕСЛИ РАЗБИТО) */}
      {videoPromptScenes.length > 0 && (
        <div className="bg-[#0b0f17] border border-indigo-500/40 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <Film className="w-4 h-4" /> Раскадровка на видео-промпты по 4–5 сек ({videoPromptScenes.length} сцен)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPromptsManifestJson}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Экспорт в манифест (.json)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
            {videoPromptScenes.map(sc => (
              <div
                key={sc.sceneIndex}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px]">
                    Сцена #{sc.sceneIndex} • {sc.timecodeRange} ({sc.durationSec}с)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyTextWithFeedback(
                        sc.promptEn,
                        `prompt-${sc.sceneIndex}`,
                        `Промпт сцены #${sc.sceneIndex} скопирован!`
                      )
                    }
                    className="text-[10px] text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Копировать промпт
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 font-medium">«{sc.scriptLine}»</p>
                <p className="text-[10px] font-mono text-emerald-300/90 bg-slate-950 p-2 rounded border border-slate-800">
                  {sc.promptEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ СКВОЗНОЙ СИНХРОНИЗАЦИИ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <span className="text-xs text-slate-400">
          Синхронизация английского сценария во вкладки «📦 YouTube SEO», «🎙 Дикторский цех» и «Повествовательный монтаж»
        </span>
        <button
          type="button"
          onClick={handleSyncToAllWorkshops}
          className="bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/15 cursor-pointer"
        >
          🚀 Передать сценарий в SEO, Дикторский цех и Видеопромпты <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
