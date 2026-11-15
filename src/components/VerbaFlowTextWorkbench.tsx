/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Layers
} from 'lucide-react';
import type { NarrativeSceneItem } from './MontageCombineView';
import {
  VerbaTone,
  VerbaRewriteMode,
  VerbaHookCard,
  VerbaScenePromptCard,
  VoiceoverCleanStats,
  XrayToken,
  analyzeVerbaTelemetry,
  buildXrayTokens,
  localRewriteScript,
  localGenerateHooks,
  localSliceToScenes,
  prepareVoiceoverScript,
  AI_CLICHE_RULES,
  WATER_BALLAST_RULES
} from '../utils/verbaFlowLinguistics';

type SubmoduleId = 'rewrite' | 'hooks' | 'voiceprep' | 'scenes' | 'xray';

interface VerbaFlowTextWorkbenchProps {
  sourceText: string;
  onSourceTextChange: (text: string) => void;
  onSendToVoiceStudio: (voiceReadyText: string) => void;
  onSendScenesToTimeline: (scenes: NarrativeSceneItem[], fullScriptText: string) => void;
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

const SUBMODULES: Array<{
  id: SubmoduleId;
  emoji: string;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'rewrite',
    emoji: '🔄',
    title: 'Рерайтинг & Анти-ИИ',
    subtitle: 'Тональность, ритмика, факты'
  },
  {
    id: 'hooks',
    emoji: '🪝',
    title: 'YouTube-Хуки & Переделка',
    subtitle: '15-сек хук и пак из 5'
  },
  {
    id: 'voiceprep',
    emoji: '🎙️',
    title: 'Дикторский цех',
    subtitle: 'Числа прописью, «Ё», чистка'
  },
  {
    id: 'scenes',
    emoji: '🎬',
    title: 'Видео-промты по сценам',
    subtitle: 'Таймкоды, promptEn, SFX'
  },
  {
    id: 'xray',
    emoji: '🛡️',
    title: 'Проверка (Цветовой рентген)',
    subtitle: 'Штампы, вода, повторы'
  }
];

const DEFAULT_DEMO_SAMPLE =
  'В современном мире не секрет, что история альпийской метеостанции 1978 года играет ключевую роль в архивах. На сегодняшний день, как известно, персонал подписал неразглашение на 50 лет, и станцию закрыли за 24 ч. На самом деле, стоит отметить, что приборы на высоте 3.5 км продолжали передавать сигнал со скоростью 120 м/с ещё три недели. Таким образом, важно понимать, что официальная версия о лавине вызывает вопросы.';

export const VerbaFlowTextWorkbench: React.FC<VerbaFlowTextWorkbenchProps> = ({
  sourceText,
  onSourceTextChange,
  onSendToVoiceStudio,
  onSendScenesToTimeline,
  onNotify
}) => {
  const [activeSubmodule, setActiveSubmodule] = useState<SubmoduleId>('rewrite');

  // Рабочий результат сценария (редактируется пользователем или обновляется ИИ / fallback)
  const [workingText, setWorkingText] = useState<string>(() => sourceText);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastEngineLabel, setLastEngineLabel] = useState<string>('Локальный движок готов');

  // 1. Настройки Рерайтинг & Анти-ИИ
  const [tone, setTone] = useState<VerbaTone>('doc');
  const [rewriteMode, setRewriteMode] = useState<VerbaRewriteMode>('humanize');
  const [preserveFacts, setPreserveFacts] = useState<boolean>(true);
  const [numbersToWords, setNumbersToWords] = useState<boolean>(false);

  // 2. Настройки Хуков
  const [hookGenerationMode, setHookGenerationMode] = useState<'single15' | 'pack5'>('pack5');
  const [hookCards, setHookCards] = useState<VerbaHookCard[]>(() =>
    localGenerateHooks(sourceText, 'doc').hooks
  );
  const [appliedHookId, setAppliedHookId] = useState<string>('');

  // 3. Настройки Дикторского цеха
  const [stripAds, setStripAds] = useState<boolean>(true);
  const [stripTimecodes, setStripTimecodes] = useState<boolean>(true);
  const [stripStageNotes, setStripStageNotes] = useState<boolean>(true);
  const [voiceNumbersToWords, setVoiceNumbersToWords] = useState<boolean>(true);
  const [expandAbbr, setExpandAbbr] = useState<boolean>(true);
  const [restoreYo, setRestoreYo] = useState<boolean>(true);
  const [voiceReadyText, setVoiceReadyText] = useState<string>('');
  const [voiceStats, setVoiceStats] = useState<VoiceoverCleanStats | null>(null);

  // 4. Видео-промты по сценам
  const [sceneCards, setSceneCards] = useState<VerbaScenePromptCard[]>(() =>
    localSliceToScenes(sourceText, 'doc')
  );

  // 5. Цветовой рентген
  const [selectedXrayIndex, setSelectedXrayIndex] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string>('');

  // Сквозные живые метрики (Telemetry Bar) — пересчет при каждом вводе
  const analyzedText = activeSubmodule === 'voiceprep' && voiceReadyText
    ? voiceReadyText
    : workingText || sourceText;

  const telemetry = useMemo(
    () => analyzeVerbaTelemetry(analyzedText, sourceText),
    [analyzedText, sourceText]
  );

  const xrayTokens = useMemo(
    () => buildXrayTokens(workingText || sourceText),
    [workingText, sourceText]
  );

  const copyWithFeedback = (val: string, id: string, message: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    onNotify(message, 'success');
    setTimeout(() => setCopiedId(''), 1800);
  };

  // ============================================================================
  // ВЫЗОВ GEMINI API (/api/gemini/verbaflow) + МГНОВЕННЫЙ ЛОКАЛЬНЫЙ FALLBACK
  // ============================================================================
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
          numbersToWords
        })
      });

      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && json.data?.rewrittenText) {
          const out = String(json.data.rewrittenText).trim();
          setWorkingText(out);
          setLastEngineLabel('Gemini API');
          onNotify('Текст переработан через Gemini API с анти-ИИ ритмикой!', 'success');
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      // Переходим на локальный лингвистический fallback
    }

    const fallbackOut = localRewriteScript(input, {
      tone,
      mode: rewriteMode,
      preserveFacts,
      numbersToWords
    });
    setWorkingText(fallbackOut);
    setLastEngineLabel('Локальный лингвистический обработчик');
    onNotify('Рерайт выполнен локальным лингвистическим движком VerbaFlow!', 'success');
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
          hookStyle: hookGenerationMode
        })
      });

      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data?.hooks) && json.data.hooks.length > 0) {
          const mapped: VerbaHookCard[] = json.data.hooks.map(
            (h: Omit<VerbaHookCard, 'id'>, idx: number) => ({
              id: `gemini-hook-${idx}`,
              archetype: h.archetype || 'paradox',
              archetypeLabel: h.archetypeLabel || 'Хук',
              durationSec: Number(h.durationSec) || 14,
              visualCue: h.visualCue || '',
              hookText: h.hookText || ''
            })
          );
          setHookCards(mapped);
          if (json.data.rewrittenBody && hookGenerationMode === 'single15') {
            setWorkingText(String(json.data.rewrittenBody).trim());
          }
          setLastEngineLabel('Gemini API');
          onNotify('Пак YouTube-хуков сгенерирован через Gemini!', 'success');
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      // Локальный fallback
    }

    const local = localGenerateHooks(input, tone);
    setHookCards(local.hooks);
    if (hookGenerationMode === 'single15') {
      setWorkingText(`${local.hooks[0].hookText}\n\n${local.rewrittenBody}`);
    }
    setLastEngineLabel('Локальный лингвистический обработчик');
    onNotify('Хуки и структура удержания собраны локальным движком VerbaFlow!', 'success');
    setIsProcessing(false);
  };

  const handleApplyHookToText = (card: VerbaHookCard) => {
    const baseBody = (workingText || sourceText).trim();
    const cleanedBody = baseBody
      .replace(/^\[HOOK[^\]]*\]\n?[\s\S]*?\n\n/i, '')
      .trim();
    const nextCombined = `${card.hookText}\n\n${cleanedBody}`;
    setWorkingText(nextCombined);
    setAppliedHookId(card.id);
    onNotify(`Хук «${card.archetypeLabel}» применён к началу сценария!`, 'success');
  };

  const handleRunVoicePrep = () => {
    const base = (workingText || sourceText).trim();
    if (!base) {
      onNotify('Нет текста для подготовки к озвучке!', 'error');
      return;
    }
    const { text, stats } = prepareVoiceoverScript(base, {
      stripAds,
      stripTimecodes,
      stripStageNotes,
      numbersToWords: voiceNumbersToWords,
      expandAbbr,
      restoreYo
    });
    setVoiceReadyText(text);
    setVoiceStats(stats);
    onNotify(
      `Дикторский текст готов: чисел прописью ${stats.convertedNumbers}, букв «Ё» ${stats.restoredYo}!`,
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
        body: JSON.stringify({
          action: 'scenes',
          text: base,
          tone
        })
      });

      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data?.scenes) && json.data.scenes.length > 0) {
          setSceneCards(json.data.scenes);
          setLastEngineLabel('Gemini API');
          onNotify(`Сценарий разбит на ${json.data.scenes.length} сцен через Gemini!`, 'success');
          setIsProcessing(false);
          return;
        }
      }
    } catch {
      // Локальный fallback
    }

    const localScenes = localSliceToScenes(base, tone);
    setSceneCards(localScenes);
    setLastEngineLabel('Локальный лингвистический обработчик');
    onNotify(`Сформировано ${localScenes.length} сцен с видео-промтами и SFX!`, 'success');
    setIsProcessing(false);
  };

  // Замена или удаление одного выделенного сегмента в X-Ray
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
    onNotify(
      replacement ? `Заменено на «${replacement}»` : 'Штамп удалён из текста',
      'success'
    );
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

  // ============================================================================
  // СКВОЗНОЙ КОНВЕЙЕР В ДРУГИЕ ЦЕХА AETHER COMBINE
  // ============================================================================
  const handleTransferToVoiceStudio = () => {
    const base = (voiceReadyText || workingText || sourceText).trim();
    if (!base) {
      onNotify('Текст пуст — нечего передавать в Дикторский цех!', 'error');
      return;
    }
    const prepared = voiceReadyText
      ? voiceReadyText
      : prepareVoiceoverScript(base, {
          stripAds: true,
          stripTimecodes: true,
          stripStageNotes: true,
          numbersToWords: true,
          expandAbbr: true,
          restoreYo: true
        }).text;
    setVoiceReadyText(prepared);
    onSendToVoiceStudio(prepared);
  };

  const handleTransferScenesToRenderTimeline = () => {
    const base = (workingText || sourceText).trim();
    const activeScenes =
      sceneCards.length > 0 ? sceneCards : localSliceToScenes(base, tone);
    if (activeScenes.length === 0) {
      onNotify('Сначала введите или сформируйте сценарий для разбивки на сцены!', 'error');
      return;
    }
    if (sceneCards.length === 0) {
      setSceneCards(activeScenes);
    }

    const mappedForMontage: NarrativeSceneItem[] = activeScenes.map(sc => ({
      scene_index: sc.sceneIndex,
      scene_id: `SCENE_${String(sc.sceneIndex).padStart(3, '0')}`,
      title: sc.promptRu.slice(0, 64),
      file_name: '',
      start_time: sc.startTime,
      duration: sc.durationSec,
      transition: {
        type: 'crossfade',
        duration_sec: 0.6
      },
      text_overlay: sc.scriptLine,
      ai_video_prompt: sc.promptEn,
      prompt_ru: sc.promptRu,
      sfx: sc.sfx
    }));

    onSendScenesToTimeline(mappedForMontage, base);
  };

  const updateSceneCard = (idx: number, patch: Partial<VerbaScenePromptCard>) => {
    setSceneCards(prev =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    );
  };

  const handleDownloadVoiceTxt = () => {
    const content = voiceReadyText || prepareVoiceoverScript(workingText || sourceText).text;
    if (!content.trim()) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verbaflow_voiceover_ready.txt';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Файл verbaflow_voiceover_ready.txt скачан!', 'success');
  };

  return (
    <div className="rounded-2xl bg-[#090D16]/90 backdrop-blur-xl border border-white/[0.08] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] p-5 sm:p-6 space-y-6">
      {/* ШАПКА ВКЛАДКИ + КНОПКИ СКВОЗНОГО КОНВЕЙЕРА */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-50 [text-wrap:balance]">
              📝 VerbaFlow • Сценарии &amp; Текст
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              {lastEngineLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Сквозная текстовая лаборатория: анти-ИИ ритмика, YouTube-хуки, дикторская нормализация, покадровые видео-промты и цветовой рентген
          </p>
        </div>

        {/* БЫСТРЫЕ КНОПКИ СКВОЗНОГО КОНВЕЙЕРА AETHER COMBINE */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleTransferToVoiceStudio}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131B2E] hover:bg-[#19233b] border border-emerald-400/35 text-emerald-300 text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>🎙️ Результат → в Дикторский цех</span>
          </motion.button>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleTransferScenesToRenderTimeline}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)]"
          >
            <Film className="w-4 h-4 shrink-0" />
            <span>🎬 Сцены → отправить в наш Рендер-таймлайн / Ритм-карту</span>
          </motion.button>
        </div>
      </div>

      {/* СКВОЗНОЙ ЖИВОЙ ДАШБОРД МЕТРИК (TELEMETRY BAR) — 4 КАРТОЧКИ В РЕАЛЬНОМ ВРЕМЕНИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Карточка 1: Человечность (Анти-ИИ) */}
        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              🧬 Человечность (Анти-ИИ)
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums ${
                telemetry.humanityScore >= 75
                  ? 'text-emerald-400'
                  : telemetry.humanityScore >= 50
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              {telemetry.humanityScore}%
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
              style={{ width: `${telemetry.humanityScore}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
            <span>Burstiness: {telemetry.burstinessPercent}%</span>
            <span aria-hidden="true">·</span>
            <span className={telemetry.totalClichesCount > 0 ? 'text-rose-300' : 'text-emerald-300'}>
              ИИ-штампов: {telemetry.totalClichesCount}
            </span>
          </div>
        </motion.div>

        {/* Карточка 2: Без воды (Плотность) */}
        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              💧 Без воды (Плотность)
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums ${
                telemetry.densityPercent >= 72
                  ? 'text-sky-300'
                  : telemetry.densityPercent >= 50
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              {telemetry.densityPercent}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090D16] overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${telemetry.densityPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
            <span>Предложений: {telemetry.sentenceCount}</span>
            <span aria-hidden="true">·</span>
            <span className={telemetry.totalWaterCount > 0 ? 'text-sky-300' : 'text-emerald-300'}>
              Балласт: {telemetry.totalWaterCount}
            </span>
          </div>
        </motion.div>

        {/* Карточка 3: Уникальность */}
        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Gem className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              💎 Уникальность
            </span>
            <span
              className={`text-lg font-mono font-extrabold tabular-nums ${
                telemetry.uniquenessPercent >= 75
                  ? 'text-indigo-300'
                  : telemetry.uniquenessPercent >= 40
                  ? 'text-amber-300'
                  : 'text-slate-300'
              }`}
            >
              {telemetry.uniquenessPercent}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090D16] overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${telemetry.uniquenessPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
            <span>3-граммы: {100 - telemetry.shingleOverlapPercent}% нов.</span>
            <span aria-hidden="true">·</span>
            <span>Лексика: {telemetry.lexicalDiversityPercent}%</span>
          </div>
        </motion.div>

        {/* Карточка 4: Объём и тайминг диктора (130 сл/мин) */}
        <motion.div
          layout
          className="rounded-xl bg-[#131B2E]/90 border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ⏱️ Объём и тайминг
            </span>
            <span className="text-lg font-mono font-extrabold text-amber-300 tabular-nums">
              {telemetry.narrationFormatted}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono tabular-nums">
            <span>Слов: {telemetry.wordCount}</span>
            <span className="text-slate-400">130 сл/мин</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
            <span className={telemetry.remainingDigitsCount > 0 ? 'text-amber-300' : 'text-emerald-300'}>
              Цифр: {telemetry.remainingDigitsCount}
            </span>
            <span aria-hidden="true">·</span>
            <span>Букв «Ё»: {telemetry.yoCount}</span>
            <span aria-hidden="true">·</span>
            <span>Повт.: {telemetry.repeatWordsCount}</span>
          </div>
        </motion.div>
      </div>

      {/* ОСНОВНАЯ РАБОЧАЯ СЕТКА: ПЕРЕКЛЮЧАТЕЛЬ 5 ПОДМОДУЛЕЙ СЛЕВА + СЦЕНА МОДУЛЯ СПРАВА */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ЛЕВЫЙ ПЕРЕКЛЮЧАТЕЛЬ ПОДМОДУЛЕЙ (260–280px эквивалент: 3 колонки на lg) */}
        <aside className="lg:col-span-3 space-y-2.5">
          <div className="rounded-xl bg-[#131B2E]/75 border border-white/[0.08] p-2 space-y-1">
            {SUBMODULES.map(mod => {
              const isActive = activeSubmodule === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveSubmodule(mod.id)}
                  className={`relative w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-2.5 cursor-pointer transition-colors overflow-hidden ${
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
                  <span className="relative z-10 text-base leading-none mt-0.5 select-none">
                    {mod.emoji}
                  </span>
                  <div className="relative z-10 min-w-0">
                    <div className="text-xs font-bold leading-snug">{mod.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{mod.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* БЫСТРЫЙ ПРЕСЕТ / ОЧИСТКА ИСХОДНИКА */}
          <div className="rounded-xl bg-[#131B2E]/60 border border-white/[0.08] p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Быстрый тест текста</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {telemetry.charCount} симв.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSourceTextChange(DEFAULT_DEMO_SAMPLE);
                  setWorkingText(DEFAULT_DEMO_SAMPLE);
                  onNotify('Загружен текст со штампами, водой, цифрами и без «Ё» для проверки!', 'info');
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-white/[0.08] text-xs text-amber-300 font-semibold text-left cursor-pointer transition"
              >
                Загрузить текст с ИИ-штампами
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

        {/* ПРАВАЯ РАБОЧАЯ ЗОНА АКТИВНОГО ПОДМОДУЛЯ */}
        <div className="lg:col-span-9 space-y-5">
          <AnimatePresence mode="wait">
            {/* =================================================================
                ПОДМОДУЛЬ 1: 🔄 РЕРАЙТИНГ & АНТИ-ИИ
               ================================================================= */}
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
                        Параметры рерайтинга &amp; Анти-ИИ
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
                      <span>Переработать сценарий</span>
                    </button>
                  </div>

                  {/* Тональность */}
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition ${
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

                  {/* Режим */}
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

                  {/* Тумблеры */}
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
                      <span>Переводить цифры в слова прописью</span>
                    </label>
                  </div>
                </div>

                {/* ДВУХКОЛОНОЧНЫЙ РЕДАКТОР: ИСХОДНИК / РЕЗУЛЬТАТ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#131B2E]/70 border border-white/[0.08] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        Исходный текст / Черновик
                      </label>
                      <button
                        type="button"
                        onClick={() => onSourceTextChange('')}
                        className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        Очистить
                      </button>
                    </div>
                    <textarea
                      rows={13}
                      value={sourceText}
                      onChange={e => onSourceTextChange(e.target.value)}
                      placeholder="Вставьте исходный текст или черновик сценария..."
                      className="w-full bg-[#090D16] border border-white/[0.08] focus:border-amber-400/60 rounded-xl p-3.5 text-sm text-slate-100 leading-relaxed outline-none custom-scrollbar"
                    />
                  </div>

                  <div className="rounded-xl bg-[#131B2E]/70 border border-emerald-400/25 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-emerald-300">
                        Готовый результат (Редактируемый)
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
                      className="w-full bg-[#090D16] border border-white/[0.08] focus:border-emerald-400/60 rounded-xl p-3.5 text-sm text-slate-100 leading-relaxed outline-none custom-scrollbar"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* =================================================================
                ПОДМОДУЛЬ 2: 🪝 YOUTUBE-ХУКИ & ПЕРЕДЕЛКА
               ================================================================= */}
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
                  <div className="flex items-center gap-2 bg-[#090D16] p-1 rounded-xl border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setHookGenerationMode('single15')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition ${
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                        hookGenerationMode === 'pack5'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Пак из 5 вариантов хука
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
                    <span>Сгенерировать хуки</span>
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
                            <span className="font-bold text-amber-300">
                              {card.archetypeLabel}
                            </span>
                            <span className="font-mono tabular-nums text-slate-400">
                              ~{card.durationSec} сек
                            </span>
                          </div>
                          <p className="text-sm text-slate-100 leading-relaxed">
                            {card.hookText}
                          </p>
                          {card.visualCue && (
                            <p className="text-xs text-slate-400">
                              Кадр: {card.visualCue}
                            </p>
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

                {/* Текущий сценарий с применённым хуком */}
                <div className="rounded-xl bg-[#131B2E]/70 border border-white/[0.08] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      Итоговый сценарий с активным хуком
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {telemetry.wordCount} слов · {telemetry.narrationFormatted}
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={workingText}
                    onChange={e => setWorkingText(e.target.value)}
                    className="w-full bg-[#090D16] border border-white/[0.08] rounded-xl p-3 text-sm text-slate-100 leading-relaxed outline-none custom-scrollbar"
                  />
                </div>
              </motion.div>
            )}

            {/* =================================================================
                ПОДМОДУЛЬ 3: 🎙️ ДИКТОРСКИЙ ЦЕХ
               ================================================================= */}
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
                        Очистка и нормализация под озвучку
                      </h3>
                      <p className="text-xs text-slate-400">
                        Удаление рекламы и таймкодов, 1978 → тысяча девятьсот семьдесят восьмого, разворот сокращений и «Ё»
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunVoicePrep}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Подготовить текст для диктора</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {[
                      { label: 'Удалить рекламу и спонсоров', checked: stripAds, set: setStripAds },
                      { label: 'Удалить таймкоды [00:15]', checked: stripTimecodes, set: setStripTimecodes },
                      { label: 'Удалить ремарки [Кадр: ...]', checked: stripStageNotes, set: setStripStageNotes },
                      { label: 'Числа, даты и % прописью', checked: voiceNumbersToWords, set: setVoiceNumbersToWords },
                      { label: 'Развернуть км, г., м/с, тыс.', checked: expandAbbr, set: setExpandAbbr },
                      { label: 'Восстановить букву «Ё»', checked: restoreYo, set: setRestoreYo }
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
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 rounded-lg px-3.5 py-2">
                      <span>Чисел прописью: {voiceStats.convertedNumbers}</span>
                      <span aria-hidden="true">·</span>
                      <span>Сокращений: {voiceStats.expandedAbbreviations}</span>
                      <span aria-hidden="true">·</span>
                      <span>Букв «Ё»: {voiceStats.restoredYo}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Удалено мусора: {voiceStats.removedAds + voiceStats.removedTimecodes + voiceStats.removedStageNotes}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-[#131B2E]/70 border border-emerald-400/25 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      Готовый дикторский сценарий (Без цифр и сокращений)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          copyWithFeedback(
                            voiceReadyText || workingText,
                            'voice-copy',
                            'Дикторский текст скопирован!'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#090D16] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
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
                        className="px-3 py-1.5 rounded-lg bg-[#090D16] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Скачать .txt</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTransferToVoiceStudio}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>В Дикторский цех</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={voiceReadyText || workingText}
                    onChange={e => setVoiceReadyText(e.target.value)}
                    placeholder="Нажмите «Подготовить текст для диктора», чтобы развернуть все цифры, даты и восстановить «Ё»..."
                    className="w-full bg-[#090D16] border border-white/[0.08] rounded-xl p-3.5 text-sm font-mono text-emerald-100 leading-relaxed outline-none custom-scrollbar"
                  />
                </div>
              </motion.div>
            )}

            {/* =================================================================
                ПОДМОДУЛЬ 4: 🎬 ВИДЕО-ПРОМТЫ ПО СЦЕНАМ
               ================================================================= */}
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
                      Готово к отправке в Рендер-таймлайн / Ритм-карту и сборку manifest.json для GitHub Actions
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
                      <span>Отправить в Рендер-таймлайн</span>
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
                  <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                    {sceneCards.map((sc, idx) => (
                      <div
                        key={`scene-card-${sc.sceneIndex}`}
                        className="rounded-xl bg-[#131B2E]/85 border border-white/[0.08] p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                            <span className="font-bold text-amber-300">
                              Сцена #{sc.sceneIndex}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-sky-300">{sc.timecodeRange}</span>
                            <span className="text-slate-400">·</span>
                            <label className="flex items-center gap-1 text-slate-300">
                              <span>Длит.:</span>
                              <input
                                type="number"
                                min={2}
                                max={30}
                                value={sc.durationSec}
                                onChange={e =>
                                  updateSceneCard(idx, {
                                    durationSec: Math.max(2, Number(e.target.value) || 5)
                                  })
                                }
                                className="w-12 bg-[#090D16] border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-emerald-300 font-bold outline-none"
                              />
                              <span>с</span>
                            </label>
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
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* =================================================================
                ПОДМОДУЛЬ 5: 🛡️ ПРОВЕРКА (ЦВЕТОВОЙ РЕНТГЕН ТЕКСТА)
               ================================================================= */}
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
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80 inline-block" />
                        Красный — ИИ-штампы ({telemetry.totalClichesCount})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/80 inline-block" />
                        Голубой — вода ({telemetry.totalWaterCount})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/80 inline-block" />
                        Янтарный — повторы ({telemetry.repeatWordsCount})
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

                {/* ИНТЕРАКТИВНЫЙ РЕНТГЕН-ПРОСМОТР С КЛИКАБЕЛЬНЫМИ ТОКЕНАМИ */}
                <div className="rounded-xl bg-[#090D16] border border-white/[0.08] p-5 leading-loose text-sm text-slate-100 min-h-[200px]">
                  {xrayTokens.length === 0 ? (
                    <span className="text-slate-500">Введите текст для рентген-анализа...</span>
                  ) : (
                    xrayTokens.map((tok, idx) => {
                      if (tok.kind === 'normal') {
                        return <span key={idx}>{tok.text}</span>;
                      }
                      const isSelected = selectedXrayIndex === idx;
                      const styleMap = {
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
                            styleMap[tok.kind]
                          } ${isSelected ? 'ring-2 ring-white/70' : ''}`}
                        >
                          {tok.text}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* ПАНЕЛЬ МГНОВЕННОЙ ЗАМЕНЫ В 1 КЛИК ДЛЯ ВЫБРАННОГО ФРАГМЕНТА */}
                {selectedXrayIndex !== null && xrayTokens[selectedXrayIndex] && xrayTokens[selectedXrayIndex].kind !== 'normal' && (
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
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-xs font-semibold text-emerald-200 cursor-pointer"
                          >
                            Заменить на «{rep}»
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => handleReplaceXrayToken(selectedXrayIndex, '')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-xs font-semibold text-rose-200 cursor-pointer"
                      >
                        Удалить фрагмент
                      </button>
                    </div>
                  </div>
                )}

                {/* СВОДКА НАЙДЕННЫХ ШТАМПОВ И ВОДЫ С КНОПКАМИ БЫСТРОГО ИСПРАВЛЕНИЯ */}
                {(telemetry.clichesFound.length > 0 || telemetry.waterFound.length > 0) && (
                  <div className="rounded-xl bg-[#131B2E]/70 border border-white/[0.08] p-4 space-y-2.5">
                    <div className="text-xs font-bold text-slate-200">
                      Быстрые правки (клик по фразе в тексте выше или здесь):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {telemetry.clichesFound.map((c, idx) => (
                        <button
                          key={`cliche-btn-${idx}`}
                          type="button"
                          onClick={() => {
                            const rep = c.replacements[0] || '';
                            const escaped = c.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const next = workingText
                              .replace(new RegExp(escaped, 'gi'), rep)
                              .replace(/[ \t]{2,}/g, ' ')
                              .trim();
                            setWorkingText(next);
                            onNotify(
                              rep ? `Штамп «${c.phrase}» заменён на «${rep}»` : `Штамп «${c.phrase}» удалён`,
                              'success'
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs text-rose-200 cursor-pointer"
                        >
                          Убрать «{c.phrase}» ({c.count}×)
                        </button>
                      ))}
                      {telemetry.waterFound.map((w, idx) => (
                        <button
                          key={`water-btn-${idx}`}
                          type="button"
                          onClick={() => {
                            const escaped = w.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const next = workingText
                              .replace(new RegExp(`${escaped},?\\s*`, 'gi'), '')
                              .replace(/[ \t]{2,}/g, ' ')
                              .trim();
                            setWorkingText(next);
                            onNotify(`Удалена вода «${w.phrase}»`, 'success');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-xs text-sky-200 cursor-pointer"
                        >
                          Высушить «{w.phrase}» ({w.count}×)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
