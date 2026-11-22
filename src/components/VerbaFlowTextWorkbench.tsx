/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Sparkles,
  RefreshCw,
  Mic,
  Film,
  ShieldAlert,
  Wand2,
  Copy,
  Check,
  Download,
  ArrowRight,
  Zap,
  Droplets,
  Gem,
  Clock,
  SlidersHorizontal,
  Volume2,
  Trash2,
  FileText,
  Layers,
  TrendingUp,
  Globe,
  Video,
  Upload,
  ListTree
} from 'lucide-react';
import type { NarrativeSceneItem } from './MontageCombineView';
import { AnimatedNumber, AnimatedDurationText } from './MotionMetrics';
import {
  VerbaLanguage,
  VerbaTone,
  VerbaRewriteMode,
  VerbaHookCard,
  VerbaScenePromptCard,
  VoiceoverCleanStats,
  CameraMovementVector,
  TimedDocumentChapter,
  analyzeVerbaTelemetry,
  buildXrayTokens,
  localRewriteScript,
  localGenerateHooks,
  localSliceToScenes,
  prepareVoiceoverScript,
  extractWordTokens,
  calculateSceneDurationFromWords,
  pickAntiRepeatCameraVectors,
  splitTextIntoTimedChapters,
  AI_CLICHE_RULES,
  WATER_BALLAST_RULES
} from '../utils/verbaFlowLinguistics';
import {
  V21_SUBTITLE_LANGUAGES,
  V21_SUBTITLE_LANG_LABELS,
  V21SubtitleLang,
  buildSidecarSrtForLanguage,
  sanitizeSlugForFilename
} from '../utils/manifestV21';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type SubmoduleId = 'rewrite' | 'hooks' | 'voiceprep' | 'scenes' | 'xray';

interface VerbaFlowTextWorkbenchProps {
  sourceText: string;
  onSourceTextChange: (text: string) => void;
  projectName?: string;
  narrativeScenes?: NarrativeSceneItem[];
  onUpdateSceneSubtitle?: (sceneIdx: number, lang: V21SubtitleLang, text: string) => void;
  strictSceneDurationLock?: boolean;
  onStrictSceneDurationLockChange?: (locked: boolean) => void;
  sidecarBurnInVideo?: boolean;
  onSidecarBurnInVideoChange?: (burnIn: boolean) => void;
  exportSeparateSrtFiles?: boolean;
  onExportSeparateSrtFilesChange?: (separate: boolean) => void;
  selectedSubtitleLanguages?: V21SubtitleLang[];
  onSelectedSubtitleLanguagesChange?: (langs: V21SubtitleLang[]) => void;
  onSendToVoiceStudio?: (voiceReadyText: string) => void;
  onSendScenesToTimeline: (scenes: NarrativeSceneItem[], fullScriptText: string) => void;
  onSendToYoutubeSeo: (fullScriptText: string, scenes: NarrativeSceneItem[]) => void;
  onSendChaptersToYoutubeSeo?: (
    chaptersTxt: string,
    chaptersCount: number,
    totalDurationFormatted: string
  ) => void;
  onImportManifestFile?: (file: File) => void;
  onScriptFileLoaded?: (text: string) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const TONE_OPTIONS: Array<{ id: VerbaTone; label: string }> = [
  { id: 'doc', label: '🎬 Документальный жанр' },
  { id: 'storyteller', label: '🎙️ Живой рассказчик' },
  { id: 'truecrime', label: '🕵️ Расследование / Тру-крайм' },
  { id: 'scipop', label: '🧠 Научпоп' },
  { id: 'dynamic', label: '🔥 Динамичный' },
  { id: 'neutral', label: '⚖️ Нейтральный' }
];

const MODE_OPTIONS: Array<{ id: VerbaRewriteMode; label: string; hint: string }> = [
  { id: 'humanize', label: 'Очеловечивание', hint: 'Ритм и живая речь' },
  { id: 'deep_rewrite', label: 'Глубокий рерайт 95%+', hint: 'Перестройка фраз' },
  { id: 'dry_water', label: 'Сушка воды', hint: 'Только факты и суть' },
  { id: 'gentle_edit', label: 'Бережная редактура', hint: 'Чистка клише и ё' }
];

const SUBMODULES: Array<{ id: SubmoduleId; emoji: string; title: string; subtitle: string }> = [
  { id: 'rewrite', emoji: '🔄', title: 'Рерайтинг & Анти-ИИ', subtitle: 'Тональность, ритмика, факты' },
  { id: 'hooks', emoji: '🪝', title: 'YouTube-Хуки & Переделка', subtitle: '15-сек хук и пак из 5' },
  { id: 'voiceprep', emoji: '🎙️', title: 'Дикторский цех', subtitle: 'Числа прописью, «Ё», паузы' },
  { id: 'scenes', emoji: '🎬', title: 'Видео-промты по сценам', subtitle: 'Тайминг (words/2.2), камера, SFX' },
  { id: 'xray', emoji: '🛡️', title: 'Проверка (Цветовой рентген)', subtitle: 'Штампы, вода, повторы' }
];

const DEFAULT_DEMO_SAMPLE_RU =
  'В современном мире не секрет, что история альпийской метеостанции 1978 года играет ключевую роль в архивах. На сегодняшний день, как известно, персонал подписал неразглашение на 50 лет, и станцию закрыли за 24 ч. На самом деле, стоит отметить, что приборы на высоте 3.5 км продолжали передавать сигнал со скоростью 120 м/с ещё три недели. Таким образом, важно понимать, что официальная версия о лавине вызывает вопросы.';

const DEFAULT_DEMO_SAMPLE_EN =
  "In today's world it is no secret that the 1978 Alpine weather station incident plays a crucial role in declassified archives. As is well known, the crew signed a 50-year non-disclosure agreement and evacuated the outpost in 24 hrs. Basically, it is worth noting that instruments at 3.5 km altitude kept transmitting a 120 m/s signal for three full weeks. In conclusion, the official avalanche story leaves major questions.";

/** Целое неотрицательное значение для любого счётчика в UI. */
const safeCount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

export const VerbaFlowTextWorkbench: React.FC<VerbaFlowTextWorkbenchProps> = ({
  sourceText,
  onSourceTextChange,
  projectName = 'Aether_Production',
  narrativeScenes = [],
  onUpdateSceneSubtitle,
  strictSceneDurationLock = true,
  onStrictSceneDurationLockChange,
  sidecarBurnInVideo = false,
  onSidecarBurnInVideoChange,
  exportSeparateSrtFiles = true,
  onExportSeparateSrtFilesChange,
  selectedSubtitleLanguages,
  onSelectedSubtitleLanguagesChange,
  onSendToVoiceStudio,
  onSendScenesToTimeline,
  onSendToYoutubeSeo,
  onSendChaptersToYoutubeSeo,
  onImportManifestFile,
  onScriptFileLoaded,
  onNotify
}) => {
  const [activeSubmodule, setActiveSubmodule] = useState<SubmoduleId>('rewrite');
  const [outputLanguage, setOutputLanguage] = useState<VerbaLanguage>('ru');
  const [localSubtitleLangs, setLocalSubtitleLangs] = useState<V21SubtitleLang[]>(['EN', 'RU']);
  const [previewSrtLang, setPreviewSrtLang] = useState<V21SubtitleLang>('EN');
  const [localStrictLock, setLocalStrictLock] = useState<boolean>(strictSceneDurationLock);
  const [localBurnInVideo, setLocalBurnInVideo] = useState<boolean>(sidecarBurnInVideo);
  const [localExportSeparate, setLocalExportSeparate] = useState<boolean>(exportSeparateSrtFiles);

  const activeSubLangs = selectedSubtitleLanguages ?? localSubtitleLangs;
  const activeStrictLock = onStrictSceneDurationLockChange
    ? strictSceneDurationLock
    : localStrictLock;
  const activeBurnIn = onSidecarBurnInVideoChange ? sidecarBurnInVideo : localBurnInVideo;
  const activeExportSeparate = onExportSeparateSrtFilesChange
    ? exportSeparateSrtFiles
    : localExportSeparate;

  const toggleSubLang = (lang: V21SubtitleLang) => {
    const exists = activeSubLangs.includes(lang);
    const next = exists
      ? activeSubLangs.length > 1
        ? activeSubLangs.filter(l => l !== lang)
        : activeSubLangs
      : [...activeSubLangs, lang];
    if (onSelectedSubtitleLanguagesChange) {
      onSelectedSubtitleLanguagesChange(next);
    } else {
      setLocalSubtitleLangs(next);
    }
    if (!exists) setPreviewSrtLang(lang);
  };

  const handleDownloadSingleSidecarSrt = (lang: V21SubtitleLang) => {
    const slug = sanitizeSlugForFilename(projectName);
    const content = buildSidecarSrtForLanguage(narrativeScenes, lang);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}_${lang}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`📥 Субтитры ${slug}_${lang}.srt скачаны (${narrativeScenes.length} сцен)!`, 'success');
  };

  const handleDownloadAllSidecarSrt = () => {
    const slug = sanitizeSlugForFilename(projectName);
    activeSubLangs.forEach((lang, idx) => {
      window.setTimeout(() => {
        const content = buildSidecarSrtForLanguage(narrativeScenes, lang);
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}_${lang}.srt`;
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 140);
    });
    onNotify(
      `📦 Экспортировано ${activeSubLangs.length} отдельных .SRT файлов (${activeSubLangs.join(', ')})!`,
      'success'
    );
  };

  const [workingText, setWorkingText] = useState<string>(() => sourceText);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastEngineLabel, setLastEngineLabel] = useState<string>('Локальный движок готов');

  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const scriptFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isReadingDocument, setIsReadingDocument] = useState<boolean>(false);
  const [loadedDocumentMeta, setLoadedDocumentMeta] = useState<{
    name: string;
    pages?: number;
  } | null>(null);
  const [documentChapters, setDocumentChapters] = useState<TimedDocumentChapter[]>([]);
  const [chaptersSummary, setChaptersSummary] = useState<{
    totalWords: number;
    totalDurationFormatted: string;
  } | null>(null);

  const [tone, setTone] = useState<VerbaTone>('doc');
  const [rewriteMode, setRewriteMode] = useState<VerbaRewriteMode>('humanize');
  const [preserveFacts, setPreserveFacts] = useState<boolean>(true);
  const [numbersToWords, setNumbersToWords] = useState<boolean>(false);

  const [hookGenerationMode, setHookGenerationMode] = useState<'single15' | 'pack5'>('pack5');
  const [hookCards, setHookCards] = useState<VerbaHookCard[]>(() =>
    localGenerateHooks(sourceText, 'doc', 'ru').hooks
  );
  const [appliedHookId, setAppliedHookId] = useState<string>('');

  const [stripAds, setStripAds] = useState<boolean>(true);
  const [stripTimecodes, setStripTimecodes] = useState<boolean>(true);
  const [stripStageNotes, setStripStageNotes] = useState<boolean>(true);
  const [voiceNumbersToWords, setVoiceNumbersToWords] = useState<boolean>(true);
  const [expandAbbr, setExpandAbbr] = useState<boolean>(true);
  const [restoreYo, setRestoreYo] = useState<boolean>(true);
  const [insertBreathingPauses, setInsertBreathingPauses] = useState<boolean>(true);
  const [voiceReadyText, setVoiceReadyText] = useState<string>('');
  const [voiceStats, setVoiceStats] = useState<VoiceoverCleanStats | null>(null);

  const [sceneCards, setSceneCards] = useState<VerbaScenePromptCard[]>(() =>
    localSliceToScenes(sourceText, 'doc', 'ru')
  );

  const [selectedXrayIndex, setSelectedXrayIndex] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string>('');

  const handleDocumentFileUpload = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
    const isText =
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      file.type.startsWith('text/');
    if (!isPdf && !isText) {
      onNotify('Поддерживаются файлы .pdf, .txt и .md!', 'error');
      return;
    }
    setIsReadingDocument(true);
    try {
      let extracted = '';
      let pagesCount: number | undefined;
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdfDoc = await loadingTask.promise;
        pagesCount = pdfDoc.numPages;
        const pageTexts: string[] = [];
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const linesMap = new Map<number, string[]>();
          for (const item of textContent.items) {
            if (!('str' in item) || !item.str) continue;
            const yCoord = Array.isArray(item.transform)
              ? Math.round(item.transform[5] / 4) * 4
              : 0;
            const bucket = linesMap.get(yCoord) || [];
            bucket.push(item.str);
            linesMap.set(yCoord, bucket);
          }
          const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
          const pageLines = sortedY
            .map(y => (linesMap.get(y) || []).join(' ').replace(/\s{2,}/g, ' ').trim())
            .filter(Boolean);
          if (pageLines.length > 0) pageTexts.push(pageLines.join('\n'));
        }
        extracted = pageTexts.join('\n\n').trim();
      } else {
        extracted = (await file.text()).replace(/\r\n/g, '\n').trim();
      }
      if (!extracted) {
        onNotify(
          isPdf
            ? 'PDF загружен, но текстовый слой пуст (возможно, это скан без OCR).'
            : 'Файл документа пуст!',
          'error'
        );
        return;
      }
      onSourceTextChange(extracted);
      setWorkingText(extracted);
      setSceneCards(localSliceToScenes(extracted, tone, outputLanguage));
      setLoadedDocumentMeta({ name: file.name, pages: pagesCount });
      setDocumentChapters([]);
      setChaptersSummary(null);
      setLastEngineLabel(
        isPdf ? `PDF импортирован (${pagesCount} стр.)` : `Документ импортирован (${file.name})`
      );
      onNotify(
        isPdf
          ? `📄 PDF «${file.name}» (${pagesCount} стр., ${extractWordTokens(extracted).length} слов) загружен! Нажмите «📑 Разбить на главы и таймкоды».`
          : `📄 Файл «${file.name}» (${extractWordTokens(extracted).length} слов) загружен!`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify(`Не удалось прочитать документ «${file.name}»: ${msg}`, 'error');
    } finally {
      setIsReadingDocument(false);
    }
  };

  /** P1: кнопка «Загрузить сценарий»: .json → общий импорт манифеста, .txt/.md → редактор + синхронизация. */
  const handleScriptFileSelected = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.json')) {
      if (onImportManifestFile) {
        onImportManifestFile(file);
        onNotify(`📦 JSON «${file.name}» передан в общий импорт манифеста студии.`, 'info');
      } else {
        onNotify('JSON-манифест можно импортировать кнопкой в цехе «Многочасовой Луп».', 'info');
      }
      return;
    }
    const text = (await file.text()).replace(/\r\n/g, '\n').trim();
    if (!text) {
      onNotify('Файл сценария пуст!', 'error');
      return;
    }
    onSourceTextChange(text);
    setWorkingText(text);
    setSceneCards(localSliceToScenes(text, tone, outputLanguage));
    onScriptFileLoaded?.(text);
  };

  const handleSplitDocumentChapters = () => {
    const targetText = (sourceText || workingText).trim();
    if (!targetText) {
      onNotify('Сначала загрузите документ (.pdf, .txt, .md) или вставьте текст!', 'error');
      return;
    }
    const res = splitTextIntoTimedChapters(targetText, 130);
    if (res.chapters.length === 0) {
      onNotify('Недостаточно текста для выделения логических глав.', 'error');
      return;
    }
    setDocumentChapters(res.chapters);
    setChaptersSummary({
      totalWords: res.totalWords,
      totalDurationFormatted: res.totalDurationFormatted
    });
    onNotify(
      `📑 Разбито на ${res.chapters.length} глав • хронометраж ${res.totalDurationFormatted} (при темпе 130 слов/мин)!`,
      'success'
    );
  };

  const handleUpdateChapterTitle = (idx: number, nextTitle: string) => {
    setDocumentChapters(prev => prev.map((ch, i) => (i === idx ? { ...ch, title: nextTitle } : ch)));
  };

  const chaptersOutputTxt = useMemo(
    () =>
      documentChapters
        .map(ch => `${ch.timecode} ${ch.title.trim() || `Глава ${ch.index}`}`)
        .join('\n'),
    [documentChapters]
  );

  const buildSyncedMontageScenes = (baseScript: string): NarrativeSceneItem[] => {
    const rawScenes =
      sceneCards.length > 0 ? sceneCards : localSliceToScenes(baseScript, tone, outputLanguage);
    const antiRepeatVectors = pickAntiRepeatCameraVectors(rawScenes.length);
    let cursorSec = 0;
    const formatMMSS = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    return rawScenes.map((sc, idx) => {
      const wc = Math.max(1, extractWordTokens(sc.scriptLine).length);
      const syncedDuration = calculateSceneDurationFromWords(wc);
      const startTime = formatMMSS(cursorSec);
      cursorSec += syncedDuration;
      const camMove: CameraMovementVector =
        idx > 0 && sc.cameraMove === antiRepeatVectors[idx - 1]
          ? antiRepeatVectors[idx]
          : sc.cameraMove || antiRepeatVectors[idx];
      const histDate = String(sc.historical_date || '').trim().slice(0, 26);
      const histLoc = String(sc.historical_location || '').trim().slice(0, 36);
      return {
        scene_index: idx + 1,
        scene_id: `SCENE_${String(idx + 1).padStart(3, '0')}`,
        title: sc.promptRu.slice(0, 64),
        file_name: '',
        start_time: startTime,
        duration: syncedDuration,
        camera_movement: camMove,
        visual_style: sc.visualStyle || 'Historical Oil Painting & Chiaroscuro',
        transition: { type: 'crossfade', duration_sec: 0.6 },
        text_overlay: sc.scriptLine,
        ai_video_prompt: sc.promptEn.includes(camMove)
          ? sc.promptEn
          : `${sc.promptEn} [camera: ${camMove}]`,
        prompt_ru: sc.promptRu,
        sfx: sc.sfx,
        ...(histDate ? { historical_date: histDate } : {}),
        ...(histLoc ? { historical_location: histLoc } : {})
      };
    });
  };

  const handleSendDocumentChaptersToSeo = () => {
    if (documentChapters.length === 0) return;
    const totalFmt = chaptersSummary?.totalDurationFormatted || '00:00';
    if (onSendChaptersToYoutubeSeo) {
      onSendChaptersToYoutubeSeo(chaptersOutputTxt, documentChapters.length, totalFmt);
    } else {
      const mapped = buildSyncedMontageScenes(workingText || sourceText);
      onSendToYoutubeSeo(workingText || sourceText, mapped);
    }
  };

  const analyzedText =
    activeSubmodule === 'voiceprep' && voiceReadyText ? voiceReadyText : workingText || sourceText;

  const telemetry = useMemo(
    () => analyzeVerbaTelemetry(analyzedText, sourceText),
    [analyzedText, sourceText]
  );

  const xrayTokens = useMemo(() => buildXrayTokens(workingText || sourceText), [
    workingText,
    sourceText
  ]);

  const copyWithFeedback = (val: string, id: string, message: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    onNotify(message, 'success');
    window.setTimeout(() => setCopiedId(''), 1800);
  };

  const handleSelectLanguage = (lang: VerbaLanguage) => {
    setOutputLanguage(lang);
    const base = (workingText || sourceText).trim();
    if (base) {
      const nextHooks = localGenerateHooks(base, tone, lang);
      setHookCards(nextHooks.hooks);
      setSceneCards(localSliceToScenes(base, tone, lang));
      if (voiceReadyText) {
        const nextVoice = prepareVoiceoverScript(lang === 'en' ? nextHooks.rewrittenBody : base, {
          stripAds,
          stripTimecodes,
          stripStageNotes,
          numbersToWords: voiceNumbersToWords,
          expandAbbr,
          restoreYo: lang === 'ru' && restoreYo,
          insertBreathingPauses,
          language: lang
        });
        setVoiceReadyText(nextVoice.text);
        setVoiceStats(nextVoice.stats);
      }
    }
    onNotify(
      lang === 'en'
        ? '🇺🇸 Выходной язык VerbaFlow: English (US Native) — хуки, рерайт и числа прописью на английском'
        : '🇷🇺 Выходной язык VerbaFlow: Русский — восстановление «Ё», русские числительные и штампы',
      'info'
    );
  };

  const handleRunRewrite = async () => {
    const input = sourceText.trim();
    if (!input) {
      onNotify('Введите исходный текст для переработки!', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const resp = await fetch('/api/gemini/verbaflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rewrite',
          text: input,
          tone,
          mode: rewriteMode,
          preserveFacts,
          numbersToWords,
          language: outputLanguage
        })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && json.data?.rewrittenText) {
          const out = String(json.data.rewrittenText).trim();
          setWorkingText(out);
          setLastEngineLabel(
            outputLanguage === 'en' ? 'Gemini API • US English' : 'Gemini API • RU'
          );
          onNotify(
            outputLanguage === 'en'
              ? 'Script rewritten in natural US English via Gemini API!'
              : 'Текст переработан через Gemini API с анти-ИИ ритмикой!',
            'success'
          );
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      /* локальный fallback */
    }
    const fallbackOut = localRewriteScript(input, {
      tone,
      mode: rewriteMode,
      preserveFacts,
      numbersToWords,
      language: outputLanguage
    });
    setWorkingText(fallbackOut);
    setLastEngineLabel(
      outputLanguage === 'en'
        ? 'Локальный движок • US English'
        : 'Локальный лингвистический обработчик'
    );
    onNotify(
      outputLanguage === 'en'
        ? 'Сценарий переработан на естественном US English!'
        : 'Рерайт выполнен локальным лингвистическим движком VerbaFlow!',
      'success'
    );
    setIsProcessing(false);
  };

  const handleGenerateHooks = async () => {
    const input = (workingText || sourceText).trim();
    if (!input) {
      onNotify('Введите текст для генерации YouTube-хуков!', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const resp = await fetch('/api/gemini/verbaflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hooks',
          text: input,
          tone,
          hookStyle: hookGenerationMode,
          language: outputLanguage
        })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data?.hooks) && json.data.hooks.length > 0) {
          const mapped: VerbaHookCard[] = json.data.hooks.map(
            (h: Omit<VerbaHookCard, 'id'>, idx: number) => ({
              id: `gemini-hook-${idx}`,
              archetype: h.archetype || 'paradox',
              archetypeLabel: h.archetypeLabel || 'Hook',
              durationSec: Number(h.durationSec) || 14,
              visualCue: h.visualCue || '',
              hookText: h.hookText || ''
            })
          );
          setHookCards(mapped);
          if (json.data.rewrittenBody && hookGenerationMode === 'single15') {
            setWorkingText(String(json.data.rewrittenBody).trim());
          }
          setLastEngineLabel(
            outputLanguage === 'en' ? 'Gemini API • US English' : 'Gemini API • RU'
          );
          onNotify(
            outputLanguage === 'en'
              ? '5 US English YouTube hooks generated via Gemini!'
              : 'Пак YouTube-хуков сгенерирован через Gemini!',
            'success'
          );
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      /* локальный fallback */
    }
    const local = localGenerateHooks(input, tone, outputLanguage);
    setHookCards(local.hooks);
    if (hookGenerationMode === 'single15') {
      setWorkingText(`${local.hooks[0].hookText}\n\n${local.rewrittenBody}`);
    }
    setLastEngineLabel(
      outputLanguage === 'en'
        ? 'Локальный движок • US English'
        : 'Локальный лингвистический обработчик'
    );
    onNotify(
      outputLanguage === 'en'
        ? 'Сгенерированы 5 хуков на естественном US English!'
        : 'Хуки и структура удержания собраны локальным движком VerbaFlow!',
      'success'
    );
    setIsProcessing(false);
  };

  const handleApplyHookToText = (card: VerbaHookCard) => {
    const baseBody = (workingText || sourceText).trim();
    const cleanedBody = baseBody.replace(/^\[HOOK[^\]]*\]\s*\n+/i, '').trim();
    const nextCombined = `${card.hookText}\n\n${cleanedBody}`;
    setWorkingText(nextCombined);
    setAppliedHookId(card.id);
    onNotify(`Хук «${card.archetypeLabel}» применён к началу сценария!`, 'success');
  };

  const handleRunVoicePrep = () => {
    const rawBase = (workingText || sourceText).trim();
    if (!rawBase) {
      onNotify('Нет текста для подготовки к озвучке!', 'error');
      return;
    }
    const baseForLang =
      outputLanguage === 'en'
        ? localRewriteScript(rawBase, {
            tone,
            mode: 'humanize',
            preserveFacts: true,
            numbersToWords: false,
            language: 'en'
          })
        : rawBase;
    const { text, stats } = prepareVoiceoverScript(baseForLang, {
      stripAds,
      stripTimecodes,
      stripStageNotes,
      numbersToWords: voiceNumbersToWords,
      expandAbbr,
      restoreYo: outputLanguage === 'ru' && restoreYo,
      insertBreathingPauses,
      language: outputLanguage
    });
    setVoiceReadyText(text);
    setVoiceStats(stats);
    onNotify(
      outputLanguage === 'en'
        ? `US English Voiceover Script ready: ${stats.convertedNumbers} numbers spelled out (1978 → nineteen seventy-eight), ${stats.insertedBreathingPauses} breathing pauses!`
        : `Дикторский текст готов: чисел прописью ${stats.convertedNumbers}, букв «Ё» ${stats.restoredYo}, пауз дыхания ${stats.insertedBreathingPauses}!`,
      'success'
    );
  };

  const handleSliceScenes = async () => {
    const base = (workingText || sourceText).trim();
    if (!base) {
      onNotify('Введите сценарий для покадровой разбивки!', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const resp = await fetch('/api/gemini/verbaflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scenes', text: base, tone, language: outputLanguage })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data?.scenes) && json.data.scenes.length > 0) {
          const rawScenes = json.data.scenes as Array<Partial<VerbaScenePromptCard>>;
          const camVectors = pickAntiRepeatCameraVectors(rawScenes.length);
          let cursor = 0;
          const formatMMSS = (sec: number) => {
            const m = Math.floor(sec / 60);
            const s = Math.round(sec % 60);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          };
          let prevHistDate = '';
          let prevHistLoc = '';
          const normalized: VerbaScenePromptCard[] = rawScenes.map((sc, idx) => {
            const line = String(sc.scriptLine || '').trim();
            const wc = Math.max(1, extractWordTokens(line).length);
            const dur = calculateSceneDurationFromWords(wc);
            const startStr = formatMMSS(cursor);
            const endStr = formatMMSS(cursor + dur);
            cursor += dur;
            const cam = camVectors[idx];
            const rawDate = String(sc.historical_date || '').trim().slice(0, 26);
            const rawLoc = String(sc.historical_location || '').trim().slice(0, 36);
            const isRepeat =
              idx > 0 &&
              rawDate.toLowerCase() === prevHistDate.toLowerCase() &&
              rawLoc.toLowerCase() === prevHistLoc.toLowerCase();
            const finalDate = isRepeat ? '' : rawDate;
            const finalLoc = isRepeat ? '' : rawLoc;
            if (rawDate || rawLoc) {
              prevHistDate = rawDate;
              prevHistLoc = rawLoc;
            }
            return {
              sceneIndex: idx + 1,
              startTime: startStr,
              timecodeRange: `${startStr}–${endStr}`,
              durationSec: dur,
              wordCount: wc,
              cameraMove: cam,
              visualStyle: sc.visualStyle || 'Historical Oil Painting & Chiaroscuro',
              scriptLine: line,
              promptEn: String(sc.promptEn || ''),
              promptRu: String(sc.promptRu || ''),
              sfx: String(sc.sfx || ''),
              historical_date: finalDate,
              historical_location: finalLoc
            };
          });
          setSceneCards(normalized);
          setLastEngineLabel('Gemini API • Synced Timing');
          onNotify(
            `Сценарий разбит на ${normalized.length} сцен (тайминг words/2.2 сек + анти-повтор векторов камеры)!`,
            'success'
          );
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      /* локальный fallback */
    }
    const localScenes = localSliceToScenes(base, tone, outputLanguage);
    setSceneCards(localScenes);
    setLastEngineLabel('Локальный лингвистический обработчик');
    onNotify(
      `Сформировано ${localScenes.length} сцен (длительность пропорциональна числу слов: words / 2.2 сек, анти-повтор камеры)!`,
      'success'
    );
    setIsProcessing(false);
  };

  const handleReplaceXrayToken = (tokenIndex: number, replacement: string) => {
    const updatedTokens = xrayTokens.map((tok, idx) => {
      if (idx !== tokenIndex) return tok.text;
      if (!replacement) return '';
      const first = tok.text[0];
      if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
    const nextText = updatedTokens
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .replace(/^[,.\s]+/, '')
      .trim();
    setWorkingText(nextText);
    setSelectedXrayIndex(null);
    onNotify(replacement ? `Заменено на «${replacement}»` : 'Штамп удалён из текста', 'success');
  };

  const handleCleanAllXrayIssues = () => {
    let next = (workingText || sourceText).trim();
    for (const rule of AI_CLICHE_RULES) {
      const rep = rule.replacements.find(r => r !== '') || '';
      next = next.replace(rule.pattern, rep);
    }
    for (const rule of WATER_BALLAST_RULES) {
      next = next.replace(rule.pattern, '');
    }
    next = next.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
    setWorkingText(next);
    setSelectedXrayIndex(null);
    onNotify('Все обнаруженные ИИ-штампы и словесная вода очищены!', 'success');
  };

  const handleOpenInternalVoicePrep = () => {
    const base = (workingText || sourceText).trim();
    if (!base) {
      onNotify('Текст пуст — введите сценарий для подготовки к озвучке!', 'error');
      return;
    }
    const baseForLang =
      outputLanguage === 'en'
        ? localRewriteScript(base, {
            tone,
            mode: 'humanize',
            preserveFacts: true,
            numbersToWords: false,
            language: 'en'
          })
        : base;
    const prepared = prepareVoiceoverScript(baseForLang, {
      stripAds: true,
      stripTimecodes: true,
      stripStageNotes: true,
      numbersToWords: true,
      expandAbbr: true,
      restoreYo: outputLanguage === 'ru',
      insertBreathingPauses: true,
      language: outputLanguage
    });
    setVoiceReadyText(prepared.text);
    setVoiceStats(prepared.stats);
    setActiveSubmodule('voiceprep');
    onSendToVoiceStudio?.(prepared.text);
    onNotify(
      outputLanguage === 'en'
        ? '🎙️ Открыт подмодуль «Дикторский цех» (US English: числа и даты переведены в слова прописью + паузы дыхания)!'
        : '🎙️ Открыт подмодуль «Дикторский цех» (Числа прописью, «Ё» и паузы дыхания готовы)!',
      'success'
    );
  };

  const handleTransferScenesToRenderTimeline = () => {
    const base = (workingText || sourceText).trim();
    if (!base) {
      onNotify('Сначала введите или сформируйте сценарий для разбивки на сцены!', 'error');
      return;
    }
    const mappedForMontage = buildSyncedMontageScenes(base);
    if (mappedForMontage.length === 0) {
      onNotify('Не удалось выделить сцены из текста!', 'error');
      return;
    }
    onSendScenesToTimeline(mappedForMontage, base);
  };

  const handleTransferToYoutubeSeo = () => {
    const base = (workingText || sourceText).trim();
    if (!base) {
      onNotify('Текст пуст — нечего передавать в YouTube SEO!', 'error');
      return;
    }
    const mappedForSeo = buildSyncedMontageScenes(base);
    onSendToYoutubeSeo(base, mappedForSeo);
  };

  const updateSceneCard = (idx: number, patch: Partial<VerbaScenePromptCard>) => {
    setSceneCards(prev => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleDownloadVoiceTxt = () => {
    const content =
      voiceReadyText ||
      prepareVoiceoverScript(workingText || sourceText, { language: outputLanguage }).text;
    if (!content.trim()) return;
    const fileName =
      outputLanguage === 'en' ? 'verbaflow_voiceover_us_en.txt' : 'verbaflow_voiceover_ru.txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Файл ${fileName} скачан!`, 'success');
  };

  const wordCountSafe = safeCount(telemetry.wordCount);
  const digitsSafe = safeCount(telemetry.remainingDigitsCount);
  const yoSafe = safeCount(telemetry.yoCount);
  const repeatSafe = safeCount(telemetry.repeatWordsCount);

  return (
    <div className="rounded-2xl bg-[#090D16]/90 backdrop-blur-xl border border-white/[0.08] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] p-3.5 sm:p-6 space-y-5 sm:space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-50 [text-wrap:balance]">
              📝 VerbaFlow • Сценарии &amp; Текст
            </h2>
            <div
              role="group"
              aria-label="Выходной язык генерации VerbaFlow"
              className="inline-flex items-center rounded-xl bg-[#131B2E] p-1 border border-white/[0.08]"
            >
              <button
                type="button"
                onClick={() => handleSelectLanguage('ru')}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 ${
                  outputLanguage === 'ru'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/45 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🇷🇺 Русский</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectLanguage('en')}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 ${
                  outputLanguage === 'en'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/45 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-sky-300" />
                <span>🇺🇸 English (US Native)</span>
              </button>
            </div>
            <input
              ref={scriptFileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleScriptFileSelected(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => scriptFileInputRef.current?.click()}
              title="Загрузить сценарий с диска: .txt/.md — сразу в редактор, .json — в общий импорт манифеста"
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#131B2E] hover:bg-[#19233b] border border-amber-400/35 text-amber-300 text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Загрузить сценарий (.txt / .md / .json)</span>
            </button>
            <span className="text-xs text-slate-400 font-medium">{lastEngineLabel}</span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">
            {outputLanguage === 'en'
              ? 'Режим 🇺🇸 English (US Native): все хуки, рерайт сценария и Дикторский цех (1978 → nineteen seventy-eight) генерируют чистый английский текст под американскую озвучку'
              : 'Сквозная текстовая лаборатория: анти-ИИ ритмика, YouTube-хуки, дикторская нормализация, покадровые видео-промты (words / 2.2 сек) и цветовой рентген'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleOpenInternalVoicePrep}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131B2E] hover:bg-[#19233b] border border-emerald-400/35 text-emerald-300 text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>🎙️ Результат → в Дикторский цех</span>
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleTransferToYoutubeSeo}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131B2E] hover:bg-[#19233b] border border-sky-400/35 text-sky-300 text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>📈 Сценарий → в YouTube SEO</span>
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleTransferScenesToRenderTimeline}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)]"
          >
            <Film className="w-4 h-4 shrink-0" />
            <span>🎬 Сцены → в Повествовательный монтаж</span>
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">🧬 Человечность</span>
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums whitespace-nowrap shrink-0 ${
                telemetry.humanityScore >= 75
                  ? 'text-emerald-400'
                  : telemetry.humanityScore >= 50
                    ? 'text-amber-300'
                    : 'text-rose-400'
              }`}
            >
              <AnimatedNumber value={telemetry.humanityScore} suffix="%" />
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090D16] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                telemetry.humanityScore >= 75
                  ? 'bg-emerald-400'
                  : telemetry.humanityScore >= 50
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, telemetry.humanityScore))}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 font-mono tabular-nums">
            <span className="whitespace-nowrap">
              Burstiness: <AnimatedNumber value={telemetry.burstinessPercent} suffix="%" />
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span
              className={`whitespace-nowrap ${
                telemetry.totalClichesCount > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              ИИ-штампов: {safeCount(telemetry.totalClichesCount)}
            </span>
          </div>
        </motion.div>

        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">💧 Без воды</span>
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums whitespace-nowrap shrink-0 ${
                telemetry.densityPercent >= 72
                  ? 'text-sky-300'
                  : telemetry.densityPercent >= 50
                    ? 'text-amber-300'
                    : 'text-rose-400'
              }`}
            >
              <AnimatedNumber value={telemetry.densityPercent} suffix="%" />
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090D16] overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.densityPercent))}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 font-mono tabular-nums">
            <span className="whitespace-nowrap">
              Предложений: {safeCount(telemetry.sentenceCount)}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span
              className={`whitespace-nowrap ${
                telemetry.totalWaterCount > 0 ? 'text-sky-300' : 'text-emerald-300'
              }`}
            >
              Балласт: {safeCount(telemetry.totalWaterCount)}
            </span>
          </div>
        </motion.div>

        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <Gem className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">💎 Уникальность</span>
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums whitespace-nowrap shrink-0 ${
                telemetry.uniquenessPercent >= 75
                  ? 'text-indigo-300'
                  : telemetry.uniquenessPercent >= 40
                    ? 'text-amber-300'
                    : 'text-slate-300'
              }`}
            >
              <AnimatedNumber value={telemetry.uniquenessPercent} suffix="%" />
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090D16] overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.uniquenessPercent))}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 font-mono tabular-nums">
            <span className="whitespace-nowrap">
              3-граммы: {safeCount(100 - telemetry.shingleOverlapPercent)}% нов.
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="whitespace-nowrap">
              Лексика: {safeCount(telemetry.lexicalDiversityPercent)}%
            </span>
          </div>
        </motion.div>

        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">⏱️ Объём и тайминг</span>
            </span>
            <span className="text-lg font-mono font-extrabold text-amber-300 tabular-nums whitespace-nowrap shrink-0">
              <AnimatedDurationText totalSeconds={telemetry.narrationSeconds} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-300 font-mono tabular-nums">
            <span className="whitespace-nowrap">
              Слов: <strong className="text-slate-100">{wordCountSafe}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400 whitespace-nowrap">130 сл/мин (~2.2 сл/с)</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 font-mono tabular-nums">
            <span
              className={`whitespace-nowrap ${digitsSafe > 0 ? 'text-amber-300' : 'text-emerald-300'}`}
            >
              Цифр: {digitsSafe}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="whitespace-nowrap">Букв «Ё»: {yoSafe}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="whitespace-nowrap">Повт.: {repeatSafe}</span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <aside className="lg:col-span-3 space-y-2.5 min-w-0">
          <div className="rounded-xl bg-[#131B2E]/75 border border-white/[0.08] p-2 flex lg:flex-col overflow-x-auto lg:overflow-visible no-scrollbar gap-1.5 lg:gap-0 lg:space-y-1">
            {SUBMODULES.map(mod => {
              const isActive = activeSubmodule === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveSubmodule(mod.id)}
                  className={`relative shrink-0 lg:shrink lg:w-full min-h-[44px] text-left rounded-lg px-3 py-2.5 flex items-center lg:items-start gap-2.5 cursor-pointer transition-colors overflow-hidden ${
                    isActive
                      ? 'text-slate-50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="verbaFlowActiveSubmodule"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-transparent border border-amber-400/40"
                    />
                  )}
                  <span className="relative z-10 text-base leading-none lg:mt-0.5 select-none">
                    {mod.emoji}
                  </span>
                  <div className="relative z-10 min-w-0">
                    <div className="text-xs font-bold leading-snug whitespace-nowrap lg:whitespace-normal">
                      {mod.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate hidden lg:block">
                      {mod.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl bg-[#131B2E]/60 border border-white/[0.08] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Быстрый тест текста</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {safeCount(telemetry.charCount)} симв.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const sample =
                    outputLanguage === 'en' ? DEFAULT_DEMO_SAMPLE_EN : DEFAULT_DEMO_SAMPLE_RU;
                  onSourceTextChange(sample);
                  setWorkingText(sample);
                  onNotify(
                    outputLanguage === 'en'
                      ? 'Loaded English sample with AI clichés, numbers (1978, 50, 24), and units!'
                      : 'Загружен текст со штампами, водой, цифрами и без «Ё» для проверки!',
                    'info'
                  );
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-white/[0.08] text-xs text-amber-300 font-semibold text-left cursor-pointer transition"
              >
                {outputLanguage === 'en'
                  ? 'Load US English test draft'
                  : 'Загрузить текст с ИИ-штампами'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkingText(sourceText);
                  onNotify('Рабочий текст сброшен к исходнику', 'info');
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-white/[0.08] text-xs text-slate-300 font-medium text-left cursor-pointer transition"
              >
                Синхронизировать с исходником
              </button>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-9 space-y-5">
          <AnimatePresence mode="wait">
            {activeSubmodule === 'rewrite' && (
              <motion.div
                key="rewrite"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-xl bg-[#131B2E]/80 border border-white/[0.08] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-slate-100">
                        Параметры рерайтинга &amp; Анти-ИИ (
                        {outputLanguage === 'en' ? '🇺🇸 US English Output' : '🇷🇺 Русский'})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunRewrite}
                      disabled={isProcessing}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      <span>
                        {outputLanguage === 'en'
                          ? 'Переработать на US English'
                          : 'Переработать сценарий'}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300 block">
                      Тональность повествования:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {TONE_OPTIONS.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTone(t.id)}
                          className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition ${
                            tone === t.id
                              ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                              : 'bg-[#090D16] border-white/[0.08] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MODE_OPTIONS.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRewriteMode(m.id)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                          rewriteMode === m.id
                            ? 'bg-indigo-500/15 border-indigo-400/50 text-slate-100'
                            : 'bg-[#090D16] border-white/[0.08] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-bold">{m.label}</div>
                        <div className="text-[11px] text-slate-400">{m.hint}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={preserveFacts}
                        onChange={e => setPreserveFacts(e.target.checked)}
                        className="accent-emerald-400 w-4 h-4"
                      />
                      <span>Сохранять 100% фактов (имена, даты, цифры контекста)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={numbersToWords}
                        onChange={e => setNumbersToWords(e.target.checked)}
                        className="accent-amber-400 w-4 h-4"
                      />
                      <span>
                        {outputLanguage === 'en'
                          ? 'Переводить цифры в английские слова (1978 → nineteen seventy-eight)'
                          : 'Переводить цифры в слова прописью'}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0b0f19]/90 border border-cyan-500/25 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) void handleDocumentFileUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => docFileInputRef.current?.click()}
                        disabled={isReadingDocument}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/45 text-cyan-200 text-xs font-bold flex items-center gap-2 cursor-pointer transition disabled:opacity-60"
                      >
                        {isReadingDocument ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                        ) : (
                          <Upload className="w-4 h-4 text-cyan-300" />
                        )}
                        <span>
                          {isReadingDocument
                            ? 'Чтение документа...'
                            : '📄 Загрузить документ (.pdf, .txt, .md)'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSplitDocumentChapters}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-amber-200 text-xs font-bold flex items-center gap-2 cursor-pointer transition"
                      >
                        <ListTree className="w-4 h-4 text-amber-300" />
                        <span>📑 Разбить на главы и таймкоды</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                      {loadedDocumentMeta && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
                          {loadedDocumentMeta.name}
                          {loadedDocumentMeta.pages ? ` (${loadedDocumentMeta.pages} стр.)` : ''}
                        </span>
                      )}
                      <span className="text-slate-400">
                        Темп: <strong className="text-amber-300">130 слов/мин</strong>
                      </span>
                    </div>
                  </div>

                  {documentChapters.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                      className="rounded-xl bg-[#111827]/90 border border-amber-400/30 p-3.5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-bold text-amber-300">
                            📑 Главы сценария ({documentChapters.length})
                          </span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                            {safeCount(chaptersSummary?.totalWords)} слов
                          </span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <strong className="text-emerald-300 font-mono tabular-nums whitespace-nowrap">
                            {chaptersSummary?.totalDurationFormatted || '00:00'}
                          </strong>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              copyWithFeedback(
                                chaptersOutputTxt,
                                'copy-chapters',
                                'Список глав с таймкодами скопирован!'
                              )
                            }
                            className="min-h-[40px] sm:min-h-[34px] px-2.5 py-1 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-white/[0.1] text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === 'copy-chapters' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-amber-300" />
                            )}
                            <span>Копировать</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleSendDocumentChaptersToSeo}
                            className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>В output_chapters.txt (YouTube SEO) →</span>
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scroll pr-1">
                        {documentChapters.map((ch, idx) => (
                          <div
                            key={`doc-ch-${ch.index}`}
                            className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-[#090D16]/90 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded tabular-nums shrink-0">
                              {ch.timecode}
                            </span>
                            <input
                              type="text"
                              value={ch.title}
                              onChange={e => handleUpdateChapterTitle(idx, e.target.value)}
                              className="flex-1 min-w-[120px] bg-transparent border border-transparent focus:border-cyan-400/50 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-100 outline-none"
                            />
                            <span className="text-[10px] font-mono text-slate-400 tabular-nums shrink-0">
                              {safeCount(ch.wordCount)} сл. • ~{safeCount(ch.durationSec)}с
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#131B2E]/70 border border-white/[0.08] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        Исходный текст / Черновик (RU или EN)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          onSourceTextChange('');
                          setLoadedDocumentMeta(null);
                          setDocumentChapters([]);
                          setChaptersSummary(null);
                        }}
                        className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        Очистить
                      </button>
                    </div>
                    <textarea
                      rows={13}
                      value={sourceText}
                      onChange={e => onSourceTextChange(e.target.value)}
                      placeholder="Загрузите документ (.pdf, .txt, .md) кнопкой выше или вставьте длинный текст сценария..."
                      className="w-full bg-[#090D16] border border-white/[0.08] focus:border-amber-400/60 rounded-xl p-3.5 text-sm text-slate-100 leading-relaxed outline-none custom-scroll"
                    />
                  </div>
                  <div className="rounded-xl bg-[#131B2E]/70 border border-emerald-400/25 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-emerald-300">
                        Готовый результат ({outputLanguage === 'en' ? '🇺🇸 US English' : '🇷🇺 Русский'})
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          copyWithFeedback(workingText, 'copy-res', 'Результат скопирован!')
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedId === 'copy-res' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>Копировать</span>
                      </button>
                    </div>
                    <textarea
                      rows={13}
                      value={workingText}
                      onChange={e => setWorkingText(e.target.value)}
                      placeholder="Здесь появится переработанный сценарий..."
                      className="w-full bg-[#090D16] border border-white/[0.08] focus:border-emerald-400/60 rounded-xl p-3.5 text-sm text-slate-100 leading-relaxed outline-none custom-scroll"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeSubmodule === 'hooks' && (
              <motion.div
                key="hooks"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-xl bg-[#131B2E]/80 border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 bg-[#090D16] p-1 rounded-xl border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setHookGenerationMode('single15')}
                      className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                        hookGenerationMode === 'single15'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      15-сек хук-загадка + переделка
                    </button>
                    <button
                      type="button"
                      onClick={() => setHookGenerationMode('pack5')}
                      className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                        hookGenerationMode === 'pack5'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Пак из 5 вариантов хука ({outputLanguage === 'en' ? 'US EN' : 'RU'})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateHooks}
                    disabled={isProcessing}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>
                      {outputLanguage === 'en'
                        ? 'Generate 5 Hooks (US English)'
                        : 'Сгенерировать хуки'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {hookCards.map(card => {
                    const isApplied = appliedHookId === card.id;
                    return (
                      <div
                        key={card.id}
                        className={`rounded-xl bg-[#131B2E]/85 border p-4 flex flex-col justify-between gap-3 transition ${
                          isApplied
                            ? 'border-emerald-400/50 bg-emerald-950/15'
                            : 'border-white/[0.08]'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-amber-300">{card.archetypeLabel}</span>
                            <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap">
                              ~{safeCount(card.durationSec)} сек
                            </span>
                          </div>
                          <p className="text-sm text-slate-100 leading-relaxed">{card.hookText}</p>
                          {card.visualCue && (
                            <p className="text-xs text-slate-400">Кадр: {card.visualCue}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() =>
                              copyWithFeedback(card.hookText, card.id, 'Хук скопирован!')
                            }
                            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === card.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Копировать</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyHookToText(card)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                              isApplied
                                ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                                : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200'
                            }`}
                          >
                            {isApplied ? 'Применён к тексту ✓' : 'Применить этот хук к тексту'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl bg-[#131B2E]/70 border border-white/[0.08] p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-xs font-bold text-slate-200">
                      Итоговый сценарий с активным хуком
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {wordCountSafe} слов
                      <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
                      {telemetry.narrationFormatted}
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={workingText}
                    onChange={e => setWorkingText(e.target.value)}
                    className="w-full bg-[#090D16] border border-white/[0.08] rounded-xl p-3 text-sm text-slate-100 leading-relaxed outline-none custom-scroll"
                  />
                </div>
              </motion.div>
            )}

            {activeSubmodule === 'voiceprep' && (
              <motion.div
                key="voiceprep"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-xl bg-[#131B2E]/80 border border-white/[0.08] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">
                        Очистка и нормализация под озвучку (
                        {outputLanguage === 'en' ? '🇺🇸 English US Voiceover' : '🇷🇺 Русский диктор'})
                      </h3>
                      <p className="text-xs text-slate-400">
                        {outputLanguage === 'en'
                          ? 'Удаление рекламы и таймкодов, 1978 → nineteen seventy-eight, разворот km/m/s и расстановка дыхательных пауз [pause 1.2s]'
                          : 'Удаление рекламы и таймкодов, 1978 → тысяча девятьсот семьдесят восьмого, разворот сокращений, «Ё» и паузы дыхания'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunVoicePrep}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      <span>
                        {outputLanguage === 'en'
                          ? 'Prepare US English Voiceover'
                          : 'Подготовить текст для диктора'}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {[
                      { label: 'Удалить рекламу и спонсоров', checked: stripAds, set: setStripAds },
                      {
                        label: 'Удалить таймкоды [00:15]',
                        checked: stripTimecodes,
                        set: setStripTimecodes
                      },
                      {
                        label: 'Удалить ремарки [Кадр: ...]',
                        checked: stripStageNotes,
                        set: setStripStageNotes
                      },
                      {
                        label:
                          outputLanguage === 'en'
                            ? 'Числа и годы в слова (1978 → nineteen seventy-eight)'
                            : 'Числа, даты и % прописью',
                        checked: voiceNumbersToWords,
                        set: setVoiceNumbersToWords
                      },
                      {
                        label:
                          outputLanguage === 'en'
                            ? 'Развернуть km, m/s, hrs, e.g.'
                            : 'Развернуть км, г., м/с, тыс.',
                        checked: expandAbbr,
                        set: setExpandAbbr
                      },
                      outputLanguage === 'en'
                        ? {
                            label: 'Расставить паузы дыхания [pause 1.2s]',
                            checked: insertBreathingPauses,
                            set: setInsertBreathingPauses
                          }
                        : {
                            label: 'Восстановить букву «Ё»',
                            checked: restoreYo,
                            set: setRestoreYo
                          }
                    ].map(opt => (
                      <label
                        key={opt.label}
                        className="flex items-center gap-2 rounded-lg bg-[#090D16] border border-white/[0.08] px-3 py-2 text-slate-200 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={e => opt.set(e.target.checked)}
                          className="accent-emerald-400 w-4 h-4 shrink-0"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  {voiceStats && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 rounded-lg px-3.5 py-2">
                      <span className="whitespace-nowrap">
                        Чисел прописью: {safeCount(voiceStats.convertedNumbers)}
                      </span>
                      <span aria-hidden="true" className="text-emerald-700">·</span>
                      <span className="whitespace-nowrap">
                        Сокращений: {safeCount(voiceStats.expandedAbbreviations)}
                      </span>
                      <span aria-hidden="true" className="text-emerald-700">·</span>
                      <span className="whitespace-nowrap">
                        Пауз дыхания: {safeCount(voiceStats.insertedBreathingPauses)}
                      </span>
                      {outputLanguage === 'ru' && (
                        <>
                          <span aria-hidden="true" className="text-emerald-700">·</span>
                          <span className="whitespace-nowrap">
                            Букв «Ё»: {safeCount(voiceStats.restoredYo)}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="text-emerald-700">·</span>
                      <span className="whitespace-nowrap">
                        Удалено мусора:{' '}
                        {safeCount(
                          voiceStats.removedAds +
                            voiceStats.removedTimecodes +
                            voiceStats.removedStageNotes
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-[#131B2E]/70 border border-emerald-400/25 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      Готовый дикторский сценарий (
                      {outputLanguage === 'en' ? 'US English Native' : 'Русский'})
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          copyWithFeedback(
                            voiceReadyText || workingText,
                            'voice-copy',
                            'Дикторский текст скопирован!'
                          )
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#090D16] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedId === 'voice-copy' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>Копировать</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadVoiceTxt}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#090D16] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Скачать .txt</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTransferScenesToRenderTimeline}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Синхронизировать с Монтажом</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={voiceReadyText || workingText}
                    onChange={e => setVoiceReadyText(e.target.value)}
                    placeholder="Нажмите «Подготовить текст для диктора», чтобы развернуть все цифры и даты в слова прописью..."
                    className="w-full bg-[#090D16] border border-white/[0.08] rounded-xl p-3.5 text-sm font-mono text-emerald-100 leading-relaxed outline-none custom-scroll"
                  />
                </div>
              </motion.div>
            )}

            {activeSubmodule === 'scenes' && (
              <motion.div
                key="scenes"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-xl bg-[#131B2E]/80 border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      Покадровая разбивка на сцены и видео-промты ({sceneCards.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Авто-расчёт{' '}
                      <code className="text-emerald-300 font-mono">duration = words / 2.2 сек</code>{' '}
                      под темп диктора и чередование векторов камеры (
                      <code className="text-amber-300 font-mono">
                        zoom_in / zoom_out / pan_left / pan_right
                      </code>{' '}
                      без повторов)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSliceScenes}
                      disabled={isProcessing}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#090D16] hover:bg-slate-900 border border-indigo-400/40 text-indigo-200 text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Layers className="w-4 h-4" />
                      )}
                      <span>Разбить текст на сцены</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTransferScenesToRenderTimeline}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                      <Film className="w-4 h-4" />
                      <span>Отправить в Повествовательный монтаж</span>
                    </button>
                  </div>
                </div>

                {sceneCards.length === 0 ? (
                  <div className="rounded-xl bg-[#131B2E]/60 border border-white/[0.08] p-8 text-center space-y-3">
                    <p className="text-sm text-slate-300">
                      Сцены ещё не сформированы. Нажмите «Разбить текст на сцены».
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scroll pr-1">
                    {sceneCards.map((sc, idx) => (
                      <div
                        key={`scene-card-${sc.sceneIndex}`}
                        className="rounded-xl bg-[#131B2E]/85 border border-white/[0.08] p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums">
                            <span className="font-bold text-amber-300 whitespace-nowrap">
                              Сцена #{sc.sceneIndex}
                            </span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="text-sky-300 whitespace-nowrap">{sc.timecodeRange}</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="text-slate-400 whitespace-nowrap">
                              {safeCount(sc.wordCount || extractWordTokens(sc.scriptLine).length)} сл.
                            </span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <label className="flex items-center gap-1 text-slate-300 whitespace-nowrap">
                              <span>Длит.:</span>
                              <input
                                type="number"
                                min={2}
                                max={30}
                                step={0.5}
                                value={sc.durationSec}
                                onChange={e =>
                                  updateSceneCard(idx, {
                                    durationSec: Math.max(2, Number(e.target.value) || 5)
                                  })
                                }
                                className="w-14 bg-[#090D16] border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-emerald-300 font-bold outline-none"
                              />
                              <span>с</span>
                            </label>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="inline-flex items-center gap-1 text-indigo-300 bg-indigo-500/15 border border-indigo-400/30 px-2 py-0.5 rounded whitespace-nowrap">
                              <Video className="w-3 h-3" />
                              {sc.cameraMove || 'zoom_in'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyWithFeedback(
                                sc.promptEn,
                                `sc-${sc.sceneIndex}`,
                                `promptEn сцены #${sc.sceneIndex} скопирован!`
                              )
                            }
                            className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === `sc-${sc.sceneIndex}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Копировать promptEn</span>
                          </button>
                        </div>

                        <p className="text-sm text-slate-100 font-medium leading-relaxed">
                          «{sc.scriptLine}»
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-emerald-300 block">
                              promptEn (Kling / Veo / Sora)
                            </span>
                            <textarea
                              rows={3}
                              value={sc.promptEn}
                              onChange={e => updateSceneCard(idx, { promptEn: e.target.value })}
                              className="w-full bg-[#090D16] border border-white/[0.08] rounded-lg p-2.5 font-mono text-xs text-emerald-200 outline-none focus:border-emerald-400/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <div>
                              <span className="text-[11px] font-semibold text-sky-300 block mb-1">
                                promptRu (Визуальное описание)
                              </span>
                              <input
                                type="text"
                                value={sc.promptRu}
                                onChange={e => updateSceneCard(idx, { promptRu: e.target.value })}
                                className="w-full bg-[#090D16] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/50"
                              />
                            </div>
                            <div>
                              <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 mb-1">
                                <Volume2 className="w-3 h-3" /> Рекомендация по звуку (SFX)
                              </span>
                              <input
                                type="text"
                                value={sc.sfx}
                                onChange={e => updateSceneCard(idx, { sfx: e.target.value })}
                                className="w-full bg-[#090D16] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-amber-100 outline-none focus:border-amber-400/50"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                          <div>
                            <span className="text-[10px] font-semibold text-amber-300/90 block mb-1">
                              Дата / Эпоха (historical_date)
                            </span>
                            <input
                              type="text"
                              value={sc.historical_date || ''}
                              placeholder="Напр.: 575 г. до н. э. или XI век н. э."
                              onChange={e =>
                                updateSceneCard(idx, { historical_date: e.target.value })
                              }
                              className="w-full bg-[#090D16] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-amber-200 placeholder:text-slate-600 outline-none focus:border-amber-400/50"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-cyan-300/90 block mb-1">
                              Локация / Место (historical_location)
                            </span>
                            <input
                              type="text"
                              value={sc.historical_location || ''}
                              placeholder="Напр.: Вавилон, Месопотамия"
                              onChange={e =>
                                updateSceneCard(idx, { historical_location: e.target.value })
                              }
                              className="w-full bg-[#090D16] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-cyan-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeSubmodule === 'xray' && (
              <motion.div
                key="xray"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="rounded-xl bg-[#131B2E]/80 border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      Цветовой рентген текста
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80 inline-block" />
                        Красный — ИИ-штампы ({safeCount(telemetry.totalClichesCount)})
                      </span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/80 inline-block" />
                        Голубой — вода ({safeCount(telemetry.totalWaterCount)})
                      </span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/80 inline-block" />
                        Янтарный — повторы ({repeatSafe})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCleanAllXrayIssues}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Удалить все штампы и воду в 1 клик</span>
                  </button>
                </div>

                <div className="rounded-xl bg-[#090D16] border border-white/[0.08] p-5 leading-loose text-sm text-slate-100 min-h-[200px]">
                  {xrayTokens.length === 0 ? (
                    <span className="text-slate-500">Введите текст для рентген-анализа...</span>
                  ) : (
                    xrayTokens.map((tok, idx) => {
                      if (tok.kind === 'normal') return <span key={idx}>{tok.text}</span>;
                      const isSelected = selectedXrayIndex === idx;
                      const styleMap: Record<'cliche' | 'water' | 'repeat', string> = {
                        cliche:
                          'bg-rose-500/25 text-rose-100 border-b-2 border-rose-400 hover:bg-rose-500/40',
                        water:
                          'bg-sky-500/25 text-sky-100 border-b-2 border-sky-400 hover:bg-sky-500/40',
                        repeat:
                          'bg-amber-500/25 text-amber-100 border-b-2 border-amber-400 hover:bg-amber-500/40'
                      };
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedXrayIndex(isSelected ? null : idx)}
                          title={`${tok.reason} — нажмите для замены`}
                          className={`inline px-1 py-0.5 rounded mx-0.5 cursor-pointer transition ${
                            styleMap[tok.kind as 'cliche' | 'water' | 'repeat']
                          } ${isSelected ? 'ring-2 ring-white/70' : ''}`}
                        >
                          {tok.text}
                        </button>
                      );
                    })
                  )}
                </div>

                {selectedXrayIndex !== null &&
                  xrayTokens[selectedXrayIndex] &&
                  xrayTokens[selectedXrayIndex].kind !== 'normal' && (
                    <div className="rounded-xl bg-[#131B2E] border border-amber-400/40 p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-bold text-slate-100">
                            «{xrayTokens[selectedXrayIndex].text}»
                          </span>
                          <span className="text-slate-400 ml-2">
                            — {xrayTokens[selectedXrayIndex].reason}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedXrayIndex(null)}
                          className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          Закрыть
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(xrayTokens[selectedXrayIndex].replacements || [])
                          .filter(Boolean)
                          .map((rep, rIdx) => (
                            <button
                              key={rIdx}
                              type="button"
                              onClick={() => handleReplaceXrayToken(selectedXrayIndex, rep)}
                              className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-xs font-semibold text-emerald-200 cursor-pointer"
                            >
                              Заменить на «{rep}»
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => handleReplaceXrayToken(selectedXrayIndex, '')}
                          className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-
