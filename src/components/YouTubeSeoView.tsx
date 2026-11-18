/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Package,
  Sparkles,
  Copy,
  Check,
  Download,
  RefreshCw,
  Clock,
  Tag,
  FileText,
  Sliders
} from 'lucide-react';
import type {
  NarrativeSceneItem,
  ShortsExportManifestBlock,
  ShortsExportSegment
} from './MontageCombineView';
import type { TimelineSlot } from '../App';
import {
  AnimatedNumber,
  AnimatedDurationText,
  MetadataReadinessRing
} from './MotionMetrics';

import {
  SeoToneStyle,
  SeoTitleVariant,
  YoutubeSeoState,
  SEO_PRESETS_BY_TONE,
  createDefaultYoutubeSeoState,
  toEnglishChapterTitle,
  toEnglishSceneTitle
} from '../utils/englishExport';
import {
  V21SubtitleLang,
  buildEnglishReleaseCardMarkdown,
  computeContinuousSceneTimings
} from '../utils/manifestV21';

export type { SeoToneStyle, SeoTitleVariant };

interface YouTubeSeoViewProps {
  scriptContext: string;
  narrativeScenes: NarrativeSceneItem[];
  loopSlots: TimelineSlot[];
  projectName: string;
  externalChaptersTxt?: string;
  onClearExternalChapters?: () => void;
  seoState?: YoutubeSeoState;
  onSeoStateChange?: React.Dispatch<React.SetStateAction<YoutubeSeoState>>;
  shortsExportConfig?: ShortsExportManifestBlock;
  onShortsExportChange?: (cfg: ShortsExportManifestBlock) => void;
  renderSpecsSummary?: string;
  activeSubtitleLanguages?: V21SubtitleLang[];
  endScreenSafeZone?: string;
  exportOutputChaptersEnabled?: boolean;
  onExportOutputChaptersEnabledChange?: (val: boolean) => void;
  exportReleaseCardMdEnabled?: boolean;
  onExportReleaseCardMdEnabledChange?: (val: boolean) => void;
  onApplyTitleToThumbnail?: (title: string) => void;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const formatSecToTimestamp = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(safe % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const formatSecToShortChapter = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const YouTubeSeoView: React.FC<YouTubeSeoViewProps> = ({
  scriptContext,
  narrativeScenes,
  loopSlots,
  projectName,
  externalChaptersTxt,
  onClearExternalChapters,
  seoState,
  onSeoStateChange,
  shortsExportConfig,
  onShortsExportChange,
  renderSpecsSummary = 'libx264 / High / CRF 18 / yuv420p / 3840x2160 / 24fps CFR / -14.0 LUFS / -1.0 dBTP',
  activeSubtitleLanguages = ['EN', 'RU'],
  endScreenSafeZone = '05:14-05:24',
  exportOutputChaptersEnabled = true,
  onExportOutputChaptersEnabledChange,
  exportReleaseCardMdEnabled = true,
  onExportReleaseCardMdEnabledChange,
  onApplyTitleToThumbnail,
  onNotify
}) => {
  const [internalSeoState, setInternalSeoState] = useState<YoutubeSeoState>(() =>
    createDefaultYoutubeSeoState('Dark Mystery')
  );
  const [localExportChapters, setLocalExportChapters] = useState<boolean>(exportOutputChaptersEnabled);
  const [localExportReleaseMd, setLocalExportReleaseMd] = useState<boolean>(exportReleaseCardMdEnabled);
  const isChaptersExportChecked = onExportOutputChaptersEnabledChange
    ? exportOutputChaptersEnabled
    : localExportChapters;
  const isReleaseCardMdChecked = onExportReleaseCardMdEnabledChange
    ? exportReleaseCardMdEnabled
    : localExportReleaseMd;

  const activeSeoState = seoState ?? internalSeoState;
  const updateSeoState: React.Dispatch<React.SetStateAction<YoutubeSeoState>> =
    onSeoStateChange ?? setInternalSeoState;

  const { tone, selectedTitleId, titles, description, tagsString } = activeSeoState;

  const setTone = useCallback(
    (nextTone: SeoToneStyle) => {
      updateSeoState(prev => ({ ...prev, tone: nextTone }));
    },
    [updateSeoState]
  );

  const setSelectedTitleId = useCallback(
    (nextId: 'A' | 'B' | 'C') => {
      updateSeoState(prev => ({ ...prev, selectedTitleId: nextId }));
    },
    [updateSeoState]
  );

  const setTitles = useCallback(
    (
      updater:
        | SeoTitleVariant[]
        | ((prev: SeoTitleVariant[]) => SeoTitleVariant[])
    ) => {
      updateSeoState(prev => ({
        ...prev,
        titles: typeof updater === 'function' ? updater(prev.titles) : updater
      }));
    },
    [updateSeoState]
  );

  const setDescription = useCallback(
    (nextDesc: string) => {
      updateSeoState(prev => ({ ...prev, description: nextDesc }));
    },
    [updateSeoState]
  );

  const setTagsString = useCallback(
    (nextTags: string) => {
      updateSeoState(prev => ({ ...prev, tagsString: nextTags }));
    },
    [updateSeoState]
  );

  const [chapterSourceMode, setChapterSourceMode] = useState<'scenes' | 'loop'>(
    loopSlots.length > 0 && narrativeScenes.length === 0 ? 'loop' : 'scenes'
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>('');

  // в) Кликабельные главы (Timestamps / Chapters) из сцен манифеста (00:00:00 - Intro...)
  const computedChaptersFromManifest = useMemo(() => {
    const defaultEnglishChapterTitles: Record<SeoToneStyle, string[]> = {
      'Dark Mystery': [
        'Intro: The 14-Second Master Reel Anomaly',
        'Act I: The Sealed High-Altitude Outpost',
        'Act II: The Missing 40-Minute Telemetry Window',
        'Act III: 21 Days of Ghost Broadcasts',
        'Act IV: Inside the Classified Duty Logs',
        'Final Verdict: What Was Recorded on Tape'
      ],
      'Cozy Ambient': [
        'Intro: First Snowfall Over the Mountain Ridge',
        'Act I: Warm Cabin Embers & Distant Arctic Wind',
        'Act II: Deepening Midnight Blizzard (4K Ambience)',
        'Act III: Sub-Zero Resonance & Crackling Hearth',
        'Act IV: Whiteout Horizon & Deep Sleep Frequencies',
        'Act V: Pre-Dawn Stillness & Glacial Echoes'
      ],
      'Historical Doc': [
        'Intro: Archival Discovery & Historical Context',
        'Chapter I: Construction of the High-Altitude Station',
        'Chapter II: The 24-Hour Emergency Evacuation Protocol',
        'Chapter III: Declassified Telemetry & Witness Reports',
        'Chapter IV: Scientific Analysis of the Acoustic Pulse',
        'Conclusion: Legacy of the 50-Year Archive'
      ],
      'Cinematic Drama': [
        'Prologue: 03:17 AM at the Communications Console',
        'Act I: The Warning Signal Nobody Believed',
        'Act II: Twelve Minutes Before Complete Blackout',
        'Act III: The 50-Year Non-Disclosure Oath',
        'Act IV: Return to the Frozen Perimeter',
        'Epilogue: The Unbroken Transmission'
      ]
    };

    const presetNames = defaultEnglishChapterTitles[tone];

    if (chapterSourceMode === 'loop' && loopSlots.length > 0) {
      let cursorSec = 0;
      return loopSlots
        .map((slot, idx) => {
          const ts = formatSecToTimestamp(cursorSec);
          const isLast = idx === loopSlots.length - 1;
          const overlap =
            !isLast && slot.slot_transition_out.type !== 'none'
              ? slot.slot_transition_out.duration_sec
              : 0;
          cursorSec += Math.max(1, slot.slot_duration_sec - overlap);

          const rawTitle = (slot.act_title || slot.title || '').trim();
          const englishLabel =
            !rawTitle || /[а-яёА-ЯЁ]/.test(rawTitle)
              ? presetNames[idx % presetNames.length]
              : rawTitle;
          return `${ts} - ${englishLabel}`;
        })
        .join('\n');
    }

    // По сценам повествовательного манифеста (непрерывная голосовая шкала, без Speech Overlap)
    if (narrativeScenes.length > 0) {
      const timings = computeContinuousSceneTimings(narrativeScenes);
      const step = Math.max(1, Math.floor(narrativeScenes.length / 6));
      const lines: string[] = [];

      narrativeScenes.forEach((sc, idx) => {
        if (idx === 0 || idx % step === 0) {
          const chapterIdx = lines.length;
          if (chapterIdx < 8) {
            const ts = formatSecToTimestamp(idx === 0 ? 0 : timings[idx]?.segStart ?? 0);
            const label = toEnglishSceneTitle(sc, chapterIdx);
            lines.push(`${ts} - ${label}`);
          }
        }
      });

      if (lines.length > 0) {
        return lines.join('\n');
      }
    }

    return presetNames
      .map((name, i) => `${formatSecToTimestamp(i * 180)} - ${name}`)
      .join('\n');
  }, [tone, chapterSourceMode, narrativeScenes, loopSlots]);

  const liveLoopTimestampsText = useMemo(() => {
    if (loopSlots.length === 0) return '';
    let cursorSec = 0;
    return loopSlots
      .map((slot, idx) => {
        const ts = formatSecToTimestamp(cursorSec);
        const isLast = idx === loopSlots.length - 1;
        const overlap =
          !isLast && slot.slot_transition_out.type !== 'none'
            ? slot.slot_transition_out.duration_sec
            : 0;
        cursorSec += Math.max(1, slot.slot_duration_sec - overlap);

        const englishLabel = toEnglishChapterTitle(
          slot.act_title || slot.title,
          idx,
          slot.act_timecode
        );
        return `${ts} - ${englishLabel}`;
      })
      .join('\n');
  }, [loopSlots]);

  const [chaptersText, setChaptersText] = useState<string>(
    externalChaptersTxt?.trim() || computedChaptersFromManifest
  );

  useEffect(() => {
    if (externalChaptersTxt && externalChaptersTxt.trim()) {
      setChaptersText(externalChaptersTxt.trim());
    } else {
      setChaptersText(computedChaptersFromManifest);
    }
  }, [computedChaptersFromManifest, externalChaptersTxt]);

  const copyWithToast = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onNotify(`${label} скопировано в буфер обмена!`, 'success');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Генерация по тональности (сохраняем загруженный video_title из манифеста, никогда не перезаписываем захардкоженными заголовками)
  const applyTonePresetsLocally = useCallback(
    (selectedTone: SeoToneStyle) => {
      const selected = SEO_PRESETS_BY_TONE[selectedTone];
      updateSeoState(prev => {
        const cleanProj = (projectName || '').trim();
        const fallbackBase =
          cleanProj && !/[а-яёА-ЯЁ]/.test(cleanProj) ? cleanProj : 'Documentary Film (4K)';
        return {
          ...prev,
          tone: selectedTone,
          titles: [
            {
              id: 'A',
              category: 'Intrigue',
              categoryRu: 'Интрига (Intrigue)',
              title: prev.titles[0]?.title?.trim() || fallbackBase.slice(0, 100)
            },
            {
              id: 'B',
              category: 'Contradiction',
              categoryRu: 'Противоречие (Contradiction)',
              title:
                prev.titles[1]?.title?.trim() ||
                `${fallbackBase}: What Really Happened`.slice(0, 100)
            },
            {
              id: 'C',
              category: 'Drama',
              categoryRu: 'Драма (Cinematic Drama)',
              title:
                prev.titles[2]?.title?.trim() ||
                `Inside ${fallbackBase} (${selectedTone})`.slice(0, 100)
            }
          ],
          description: selected.desc,
          tagsString: selected.tags.slice(0, 495)
        };
      });
    },
    [updateSeoState, projectName]
  );

  // Генерация через Gemini API (с гарантированным мгновенным результатом)
  const handleGenerateWithGemini = async () => {
    setIsGenerating(true);
    try {
      const chaptersList = computedChaptersFromManifest.split('\n').map(line => {
        const [tc, ...rest] = line.split(' - ');
        return { timecode: tc || '00:00:00', label: rest.join(' - ') || 'Scene' };
      });

      const res = await fetch('/api/gemini/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText: scriptContext || projectName,
          tone,
          chaptersInput: chaptersList
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          const d = json.data;
          if (Array.isArray(d.titles) && d.titles.length >= 3) {
            setTitles([
              {
                id: 'A',
                category: 'Intrigue',
                categoryRu: 'Интрига (Intrigue)',
                title: String(d.titles[0]?.title || '').slice(0, 60)
              },
              {
                id: 'B',
                category: 'Contradiction',
                categoryRu: 'Противоречие (Contradiction)',
                title: String(d.titles[1]?.title || '').slice(0, 60)
              },
              {
                id: 'C',
                category: 'Drama',
                categoryRu: 'Драма (Cinematic Drama)',
                title: String(d.titles[2]?.title || '').slice(0, 60)
              }
            ]);
          }
          if (typeof d.description === 'string' && d.description.trim()) {
            setDescription(d.description.trim());
          }
          if (Array.isArray(d.chapters) && d.chapters.length > 0) {
            setChaptersText(d.chapters.join('\n'));
          }
          if (typeof d.tags === 'string' && d.tags.trim()) {
            setTagsString(d.tags.trim().slice(0, 498));
          }
          onNotify(
            `✨ Gemini сформировал англоязычный SEO-пакет в стиле «${tone}»!`,
            'success'
          );
          setIsGenerating(false);
          return;
        }
      }
      // Fallback to local tone generator if server route unavailable (e.g. static preview)
      applyTonePresetsLocally(tone);
      onNotify(`✨ SEO-пакет сформирован в стиле «${tone}» (US English)!`, 'success');
    } catch {
      applyTonePresetsLocally(tone);
      onNotify(`✨ SEO-пакет сформирован в стиле «${tone}» (US English)!`, 'success');
    } finally {
      setIsGenerating(false);
    }
  };

  // Счетчики слов и символов
  const descriptionWordCount = useMemo(() => {
    const words = description.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }, [description]);

  const tagsListCount = useMemo(() => {
    return tagsString
      .split(',')
      .map(t => t.trim())
      .filter(Boolean).length;
  }, [tagsString]);

  const tagsCharCount = tagsString.length;

  // д) Кнопка «📥 Скачать metadata.txt»: сохранение заголовка, описания, глав и тегов в один файл
  const handleDownloadMetadataTxt = () => {
    const content = [
      `====================================================================`,
      `YOUTUBE SEO & METADATA PACKAGE (${tone.toUpperCase()} • US ENGLISH)`,
      `PROJECT: ${projectName || 'AetherCombine 4K Production'}`,
      `====================================================================`,
      ``,
      `--- 1. CLICKABLE A/B TITLES (MAX 60 CHARS) ---`,
      ...titles.map(
        t => `[Variant ${t.id} • ${t.category}] (${t.title.length}/60 chars):\n${t.title}`
      ),
      ``,
      `--- 2. SEO DESCRIPTION (${descriptionWordCount} WORDS) ---`,
      description.trim(),
      ``,
      `--- 3. CLICKABLE YOUTUBE CHAPTERS (TIMESTAMPS) ---`,
      chaptersText.trim(),
      ``,
      `--- 4. YOUTUBE TAGS (${tagsListCount} TAGS • ${tagsCharCount}/500 CHARS) ---`,
      tagsString.trim(),
      ``
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metadata.txt';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('📥 Файл metadata.txt (Titles + Description + Chapters + 30 Tags) скачан!', 'success');
  };

  const activeReleaseTitle = useMemo(() => {
    return (titles.find(t => t.id === selectedTitleId) || titles[0])?.title || '';
  }, [titles, selectedTitleId]);

  const releaseCardTimestamps = useMemo(() => {
    if (chapterSourceMode === 'loop' && chaptersText.trim()) {
      return chaptersText.trim();
    }
    return liveLoopTimestampsText || chaptersText.trim();
  }, [chapterSourceMode, chaptersText, liveLoopTimestampsText]);

  // 3. НАСТРОЙКИ АВТО-SHORTS (9:16 + Динамические субтитры)
  const [shortsEnabled, setShortsEnabled] = useState<boolean>(
    shortsExportConfig?.enabled ?? true
  );
  const [shortsSubtitleColor, setShortsSubtitleColor] = useState<string>(
    shortsExportConfig?.subtitle_style?.highlight_color ?? '#FBBF24'
  );
  const [shortsFontSize, setShortsFontSize] = useState<number>(
    shortsExportConfig?.subtitle_style?.font_size_px ?? 68
  );

  // Автоматическое выделение 2–3 самых цепляющих абзацев из текста VerbaFlow (начиная с хука)
  const extractedShortsSegments = useMemo<ShortsExportSegment[]>(() => {
    const rawParagraphs = (scriptContext || '')
      .split(/\n{2,}|\r?\n/)
      .map(p => p.replace(/\[[^\]]*\]/g, '').trim())
      .filter(p => p.length > 25);

    const defaultHooks = [
      'Everything you were told about this classified mountain outpost is missing one crucial detail recorded at the fourteenth second of the tape.',
      'When the inspection team unlocked the subterranean vault twenty-four hours later, every transmitter was still broadcasting at full power.',
      'Nobody had clearance to enter the command room, yet the signal returned at the exact same minute every single night.'
    ];

    const candidates = rawParagraphs.length >= 2 ? rawParagraphs : defaultHooks;
    // Первый абзац — всегда стартовый хук, затем ещё 1–2 наиболее плотных/интригующих абзаца
    const picked: string[] = [candidates[0]];
    const rest = candidates.slice(1).sort((a, b) => {
      const scoreA = (/[?!—]/.test(a) ? 30 : 0) + Math.min(a.length, 220) * 0.2;
      const scoreB = (/[?!—]/.test(b) ? 30 : 0) + Math.min(b.length, 220) * 0.2;
      return scoreB - scoreA;
    });
    picked.push(...rest.slice(0, 2));

    let cursorSec = 0;
    return picked.slice(0, 3).map((text, idx) => {
      const words = text.split(/\s+/).filter(Boolean).length;
      const estDur = Math.max(12, Math.min(28, Math.round((words / 2.2) * 10) / 10));
      const seg: ShortsExportSegment = {
        segment_index: idx + 1,
        hook_type:
          idx === 0
            ? 'Hook & Opening Paradox'
            : idx === 1
            ? 'Core Twist & Evidence'
            : 'Cliffhanger Finale',
        start_sec: cursorSec,
        duration_sec: estDur,
        script_excerpt: text
      };
      cursorSec += estDur;
      return seg;
    });
  }, [scriptContext]);

  const computedShortsManifestBlock = useMemo<ShortsExportManifestBlock>(
    () => ({
      enabled: shortsEnabled,
      aspect_ratio: '9:16',
      resolution: '1080x1920',
      crop_mode: 'center',
      ffmpeg_crop_filter: 'crop=ih*9/16:ih,scale=1080:1920,setsar=1',
      subtitle_style: {
        font_family: 'Montserrat ExtraBold',
        font_size_px: shortsFontSize,
        text_color: '#FFFFFF',
        highlight_color: shortsSubtitleColor,
        stroke_color: '#000000',
        stroke_width_px: 4,
        background_box: 'rgba(9,13,22,0.78)',
        position: 'center_lower_third',
        uppercase: true
      },
      segments: extractedShortsSegments
    }),
    [shortsEnabled, shortsFontSize, shortsSubtitleColor, extractedShortsSegments]
  );

  useEffect(() => {
    onShortsExportChange?.(computedShortsManifestBlock);
  }, [computedShortsManifestBlock, onShortsExportChange]);

  const hasVerbaFlowChapters = Boolean(externalChaptersTxt && externalChaptersTxt.trim());

  // 4. Точный расчёт глав output_chapters.txt по непрерывной голосовой шкале (zero speech overlap)
  const exactRhythmMapChaptersTxt = useMemo(() => {
    if (externalChaptersTxt && externalChaptersTxt.trim()) {
      return externalChaptersTxt.trim();
    }

    if (narrativeScenes.length > 0) {
      const timings = computeContinuousSceneTimings(narrativeScenes);
      const totalScenes = narrativeScenes.length;
      const chapterCount = Math.min(8, Math.max(3, Math.ceil(totalScenes / 3)));
      const step = Math.max(1, Math.floor(totalScenes / chapterCount));
      const lines: string[] = [];

      narrativeScenes.forEach((sc, idx) => {
        if (idx === 0 || idx % step === 0) {
          const ts = formatSecToShortChapter(idx === 0 ? 0 : timings[idx]?.segStart ?? 0);
          const chapterTitle = toEnglishSceneTitle(sc, lines.length);
          lines.push(`${ts} ${chapterTitle}`);
        }
      });

      return lines.join('\n');
    }

    return computedChaptersFromManifest
      .split('\n')
      .map(line => line.replace(/^00:/, '').replace(' - ', ' '))
      .join('\n');
  }, [externalChaptersTxt, narrativeScenes, computedChaptersFromManifest]);

  const totalRhythmMapDurationSec = useMemo(() => {
    if (narrativeScenes.length === 0) return 0;
    const timings = computeContinuousSceneTimings(narrativeScenes);
    return timings.length > 0 ? timings[timings.length - 1].segEnd : 0;
  }, [narrativeScenes]);

  // 4. Генерация и скачивание RELEASE_CARD.md (Strictly English-only Release Package)
  const handleDownloadReleaseCardMd = () => {
    const dominantCameraVectors = Array.from(
      new Set(narrativeScenes.map(s => s.camera_movement || 'zoom_in'))
    ).join(', ');
    const dominantStyle =
      narrativeScenes[0]?.visual_style ||
      (tone === 'Cozy Ambient'
        ? 'Ambient Sanctuary (4K Atmospheric Matte)'
        : 'Historical Storytelling (Oil Painting / Graphic Novel)');

    const mdContent = buildEnglishReleaseCardMarkdown({
      projectName: projectName || 'AETHER COMBINE 4K RELEASE',
      releaseTitle: activeReleaseTitle.trim(),
      tone,
      abTitles: titles.map(t => ({ id: t.id, category: t.category, title: t.title })),
      description,
      chaptersText: exactRhythmMapChaptersTxt,
      tagsString,
      tagsListCount,
      tagsCharCount,
      scenesCount: narrativeScenes.length,
      durationFormatted: formatSecToShortChapter(totalRhythmMapDurationSec),
      averageSceneSec:
        narrativeScenes.length > 0
          ? (totalRhythmMapDurationSec / narrativeScenes.length).toFixed(1)
          : '5.0',
      dominantStyle,
      cameraVectors: dominantCameraVectors,
      shortsEnabled,
      shortsSegmentsCount: extractedShortsSegments.length,
      renderSpecsSummary,
      activeSubtitleLanguages,
      endScreenSafeZone
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'RELEASE_CARD.md';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('📦 Файл RELEASE_CARD.md (English Release Package) успешно скачан!', 'success');
  };

  // Скачивание output_chapters.txt с точным суммированием реальных duration сцен или глав VerbaFlow
  const handleDownloadOutputChaptersTxt = () => {
    const blob = new Blob([exactRhythmMapChaptersTxt + '\n'], {
      type: 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output_chapters.txt';
    a.click();
    URL.revokeObjectURL(url);
    onNotify(
      hasVerbaFlowChapters
        ? '⏱️ Файл output_chapters.txt скачан (главы из VerbaFlow • темп 130 слов/мин)!'
        : `⏱️ Файл output_chapters.txt скачан (точный расчёт по ${narrativeScenes.length} сценам Ритм-карты)!`,
      'success'
    );
  };

  const releaseCardText = useMemo(() => {
    return [
      `TITLE:`,
      activeReleaseTitle.trim(),
      ``,
      `DESCRIPTION:`,
      description.trim(),
      ``,
      `TIMESTAMPS (CHAPTERS):`,
      releaseCardTimestamps,
      ``,
      `TAGS:`,
      tagsString.trim()
    ].join('\n');
  }, [activeReleaseTitle, description, releaseCardTimestamps, tagsString]);

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-3.5 sm:p-6 space-y-5 sm:space-y-6">
      {/* ШАПКА ВКЛАДКИ «📦 YOUTUBE SEO & УПАКОВКА» */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Package className="text-emerald-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>📦 YouTube SEO &amp; Упаковка (SEO Hub • Strictly Natural US English)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Автоматическая генерация на базе Gemini: 3 A/B заголовка (до 60 симв.), продающее SEO-описание (150–200 слов), кликабельные главы по манифесту и 30 тегов (до 500 симв.)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateWithGemini}
            disabled={isGenerating}
            className="min-h-[42px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {isGenerating ? 'Генерация Gemini (EN)...' : '✨ Сгенерировать SEO через Gemini (EN)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              copyWithToast(releaseCardText, 'release-card', 'Карточка релиза (Title + Description + Timestamps + Tags)')
            }
            className="min-h-[42px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-sky-500/20"
          >
            {copiedKey === 'release-card' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>
              {copiedKey === 'release-card' ? 'Карточка скопирована!' : 'Скопировать карточку релиза'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMetadataTxt}
            className="min-h-[42px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/20"
          >
            <Download className="w-4 h-4" /> 📥 Скачать metadata.txt
          </button>
        </div>
      </div>

      {/* е) СЕЛЕКТОР СТИЛЯ ГЕНЕРАЦИИ (TONE): Dark Mystery, Cozy Ambient, Historical Doc, Cinematic Drama */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Стиль и тональность генерации (Tone Selector):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'Dark Mystery', label: '🕵️ Dark Mystery' },
              { id: 'Cozy Ambient', label: '❄️ Cozy Ambient' },
              { id: 'Historical Doc', label: '📜 Documentary / Historical Doc' },
              { id: 'Cinematic Drama', label: '🎬 Cinematic Drama' }
            ] as { id: SeoToneStyle; label: string }[]
          ).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTone(item.id);
                applyTonePresetsLocally(item.id);
                onNotify(`Тональность SEO переключена на «${item.id}» (US English)`, 'info');
              }}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                tone === item.id
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* а) ОСНОВНОЙ ЗАГОЛОВОК ВИДЕО (video_title ИЗ МАНИФЕСТА) + A/B ВАРИАНТЫ */}
      <div className="bg-[#0b0f17] border border-amber-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              а) Основной Video Title (<code className="text-amber-300">video_title</code>) &amp; A/B Заголовки
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-300">
            Populated dynamically from manifest video_title • Natural US English
          </span>
        </div>

        {/* Прямое редактируемое поле Video Title (связано с выбранным вариантом релиза) */}
        <div className="bg-[#111622] border border-white/[0.08] rounded-xl p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-emerald-300">
              Primary Video Title (<code className="text-amber-300">video_title</code> • Variant {selectedTitleId})
            </label>
            <span className="text-[10.5px] font-mono text-slate-400 tabular-nums">
              {activeReleaseTitle.length}/100 chars
            </span>
          </div>
          <input
            type="text"
            maxLength={100}
            value={activeReleaseTitle}
            placeholder="Loaded dynamically from manifest video_title (or enter custom release title)..."
            onChange={e => {
              const val = e.target.value.slice(0, 100);
              setTitles(prev =>
                prev.map(t => (t.id === selectedTitleId ? { ...t, title: val } : t))
              );
            }}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-lg px-3.5 py-2.5 text-sm font-bold text-slate-100 outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {titles.map((item, idx) => {
            const len = item.title.length;
            const isValidLen = len <= 60;
            return (
              <div
                key={item.id}
                className="bg-[#111622] border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 flex flex-col justify-between space-y-3 transition"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">
                      Вариант {item.id}: {item.categoryRu}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        isValidLen
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {len}/100 симв. {len > 60 ? '(CTR >60)' : ''}
                    </span>
                  </div>

                  <input
                    type="text"
                    maxLength={100}
                    value={item.title}
                    onChange={e => {
                      const val = e.target.value.slice(0, 100);
                      setTitles(prev =>
                        prev.map((t, i) => (i === idx ? { ...t, title: val } : t))
                      );
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-bold text-slate-100 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      copyWithToast(item.title, `title-${item.id}`, `Заголовок ${item.id}`)
                    }
                    className="min-h-[40px] flex-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    {copiedKey === `title-${item.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Копировать</span>
                  </button>

                  {onApplyTitleToThumbnail && (
                    <button
                      type="button"
                      onClick={() => onApplyTitleToThumbnail(item.title)}
                      className="min-h-[40px] bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg text-[11px] cursor-pointer transition"
                      title="Передать этот YouTube-заголовок в мокап 4K Превью"
                    >
                      В Превью →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* б) SEO-ОПИСАНИЕ (150-200 СЛОВ) И в) КЛИКАБЕЛЬНЫЕ ГЛАВЫ (TIMESTAMPS / CHAPTERS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* б) SEO-описание (Description) */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  б) SEO-описание (Description • 150–200 слов с ключевыми словами)
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  descriptionWordCount >= 140 && descriptionWordCount <= 220
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {descriptionWordCount} слов (цель: 150–200)
              </span>
            </div>

            <textarea
              rows={9}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed outline-none custom-scroll"
            />
          </div>

          <button
            type="button"
            onClick={() => copyWithToast(description, 'seo-desc', 'SEO-описание (EN)')}
            className="min-h-[42px] w-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {copiedKey === 'seo-desc' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>Копировать SEO-описание (US English)</span>
          </button>
        </div>

        {/* в) Кликабельные главы (Timestamps / Chapters) */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  в) Кликабельные главы (Timestamps / Chapters по манифесту)
                </h3>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setChapterSourceMode('scenes')}
                  className={`min-h-[36px] sm:min-h-[28px] px-2.5 py-1 rounded font-semibold cursor-pointer ${
                    chapterSourceMode === 'scenes'
                      ? 'bg-indigo-500/30 text-indigo-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Из сцен ({narrativeScenes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChapterSourceMode('loop')}
                  className={`min-h-[36px] sm:min-h-[28px] px-2.5 py-1 rounded font-semibold cursor-pointer ${
                    chapterSourceMode === 'loop'
                      ? 'bg-amber-500/30 text-amber-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Из актов лупа ({loopSlots.length})
                </button>
              </div>
            </div>

            <textarea
              rows={9}
              value={chaptersText}
              onChange={e => setChaptersText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-400 rounded-xl p-3.5 text-xs font-mono text-indigo-200 leading-relaxed outline-none custom-scroll"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              copyWithToast(chaptersText, 'seo-chapters', 'Кликабельные главы (Timestamps)')
            }
            className="min-h-[42px] w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {copiedKey === 'seo-chapters' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>Копировать таймкоды (Chapters)</span>
          </button>
        </div>
      </div>

      {/* г) ТЕГИ YOUTUBE (30 РЕЛЕВАНТНЫХ ТЕГОВ ЕДИНОЙ СТРОКОЙ ЧЕРЕЗ ЗАПЯТУЮ ДО 500 СИМВОЛОВ) */}
      <div className="bg-[#0b0f17] border border-emerald-500/30 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              г) Теги YouTube (Tags • 30 релевантных тегов через запятую со счетчиком до 500 символов)
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-300 tabular-nums">
              Тегов: <strong className="text-slate-100">{tagsListCount}</strong>
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border tabular-nums ${
                tagsCharCount <= 500
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              }`}
            >
              {tagsCharCount}/500 символов
            </span>
          </div>
        </div>

        <textarea
          rows={3}
          maxLength={500}
          value={tagsString}
          onChange={e => setTagsString(e.target.value.slice(0, 500))}
          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => copyWithToast(tagsString, 'seo-tags', 'Все 30 тегов YouTube')}
            className="min-h-[42px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition"
          >
            {copiedKey === 'seo-tags' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>Копировать все теги ({tagsCharCount}/500 симв.)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMetadataTxt}
            className="min-h-[42px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-md shadow-amber-500/15"
          >
            <Download className="w-4 h-4" /> 📥 Скачать metadata.txt (Полный пакет)
          </button>
        </div>
      </div>

      {/* д) ЕДИНАЯ КАРТОЧКА РЕЛИЗА (ЗАГОЛОВОК + ОПИСАНИЕ + АКТУАЛЬНЫЕ ТАЙМКОДЫ СЛОТОВ + ТЕГИ) */}
      <div className="bg-[#0b0f17] border border-sky-500/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-400" />
              д) Единая карточка релиза YouTube (Title + Description + Timestamps слотов + Tags)
            </h3>
            <p className="text-[11px] text-slate-400">
              Объединяет выбранный заголовок, SEO-описание, теги и актуальные YouTube-таймкоды из текущих слотов таймлайна ({loopSlots.length} сл.)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
              {(['A', 'B', 'C'] as const).map(tid => (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setSelectedTitleId(tid)}
                  className={`min-h-[36px] sm:min-h-[30px] px-2.5 py-1 rounded font-bold cursor-pointer transition ${
                    selectedTitleId === tid
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Заголовок {tid}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                copyWithToast(
                  releaseCardText,
                  'release-card',
                  'Карточка релиза (Title + Description + Timestamps + Tags)'
                )
              }
              className="min-h-[42px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-lg shadow-sky-500/20"
            >
              {copiedKey === 'release-card' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>
                {copiedKey === 'release-card' ? 'Скопировано!' : 'Скопировать карточку релиза'}
              </span>
            </button>
          </div>
        </div>

        <pre className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto custom-scroll">
          {releaseCardText}
        </pre>
      </div>

      {/* е) БЛОК «📦 ЭКСПОРТ ПАКЕТА РЕЛИЗА (ENGLISH)» (RELEASE_CARD.md + output_chapters.txt) И АВТО-SHORTS (9:16) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Левая карточка (6 cols): 📦 Экспорт пакета релиза (English) */}
        <div className="lg:col-span-6 bg-[#0b0f19] border border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                📦 Экспорт пакета релиза (English)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Структурированный Markdown-манифест релиза и точные таймкоды глав по реальным <code className="text-emerald-300">duration</code> сцен Ритм-карты
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-300 tabular-nums shrink-0">
              <AnimatedNumber value={narrativeScenes.length} /> сцен •{' '}
              <AnimatedDurationText totalSeconds={totalRhythmMapDurationSec} />
            </span>
          </div>

          <MetadataReadinessRing
            titleValid={activeReleaseTitle.trim().length > 0 && activeReleaseTitle.trim().length <= 60}
            descriptionValid={descriptionWordCount >= 40}
            chaptersValid={exactRhythmMapChaptersTxt.trim().split(/\r?\n/).filter(Boolean).length >= 2}
            tagsValid={tagsListCount >= 5 && tagsCharCount > 0 && tagsCharCount <= 500}
            chaptersCount={exactRhythmMapChaptersTxt.trim().split(/\r?\n/).filter(Boolean).length}
            tagsCount={tagsListCount}
          />

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
              <span>Предпросмотр точных глав (output_chapters.txt):</span>
              <div className="flex items-center gap-2">
                {hasVerbaFlowChapters ? (
                  <>
                    <span className="text-cyan-300 bg-cyan-500/15 border border-cyan-400/35 px-2 py-0.5 rounded">
                      Из VerbaFlow (130 слов/мин)
                    </span>
                    {onClearExternalChapters && (
                      <button
                        type="button"
                        onClick={onClearExternalChapters}
                        className="text-[10px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                      >
                        Вернуть Ритм-карту
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-emerald-400">Секунда в секунду с монтажом</span>
                )}
              </div>
            </div>
            <pre className="text-xs font-mono text-indigo-200 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scroll leading-relaxed tabular-nums">
              {exactRhythmMapChaptersTxt}
            </pre>
          </div>

          {/* v2.1 Чекбоксы экспорта пакета релиза (output_chapters.txt + English-only RELEASE_CARD.md) */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-2 bg-[#111827] border border-white/[0.08] rounded-xl px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChaptersExportChecked}
                  onChange={e => {
                    if (onExportOutputChaptersEnabledChange) {
                      onExportOutputChaptersEnabledChange(e.target.checked);
                    } else {
                      setLocalExportChapters(e.target.checked);
                    }
                  }}
                  className="accent-indigo-400 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-indigo-200 font-semibold">
                  Export <code className="text-amber-300">output_chapters.txt</code> from <code className="text-indigo-300">chapters_youtube</code>
                </span>
              </label>

              <label className="flex items-center gap-2 bg-[#111827] border border-white/[0.08] rounded-xl px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isReleaseCardMdChecked}
                  onChange={e => {
                    if (onExportReleaseCardMdEnabledChange) {
                      onExportReleaseCardMdEnabledChange(e.target.checked);
                    } else {
                      setLocalExportReleaseMd(e.target.checked);
                    }
                  }}
                  className="accent-emerald-400 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-emerald-200 font-semibold">
                  Export English-only <code className="text-emerald-300">RELEASE_CARD.md</code> (specs + SRT + chapters)
                </span>
              </label>
            </div>

            <div className="bg-[#111827]/70 border border-white/[0.06] rounded-lg px-3 py-1.5 text-[10.5px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate">Specs: <strong className="text-slate-200">{renderSpecsSummary}</strong></span>
              <span>SRT: <strong className="text-cyan-300">{activeSubtitleLanguages.join(', ')}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleDownloadReleaseCardMd}
              className="min-h-[42px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              <span>Скачать RELEASE_CARD.md</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadOutputChaptersTxt}
              className="min-h-[42px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Clock className="w-4 h-4 text-indigo-300" />
              <span>Скачать output_chapters.txt</span>
            </button>
          </div>
        </div>

        {/* Правая карточка (6 cols): 3. НАСТРОЙКИ АВТО-SHORTS (9:16 + Динамические субтитры) */}
        <div className="lg:col-span-6 bg-[#0b0f19] border border-amber-500/40 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                📱 Настройки Авто-Shorts (9:16 + Динамические субтитры)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Выделяет 2–3 самых цепляющих абзаца из VerbaFlow (начиная с хука) и записывает <code className="text-amber-300">shorts_export</code> в <code className="text-amber-300">manifest.json</code>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !shortsEnabled;
                setShortsEnabled(next);
                onNotify(
                  next
                    ? '📱 Конфиг для Shorts (9:16) активирован и добавлен в manifest.json!'
                    : 'Конфиг Shorts (9:16) отключён',
                  'info'
                );
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                shortsEnabled
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <span>📱 Сформировать конфиг для Shorts (9:16): {shortsEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
              <span className="text-slate-400 block text-[10px]">Вертикальный кроп</span>
              <strong className="text-slate-100 font-mono">9:16 • 1080x1920</strong>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
              <span className="text-slate-400 block text-[10px]">Размер титров (px)</span>
              <input
                type="number"
                min={42}
                max={96}
                value={shortsFontSize}
                onChange={e => setShortsFontSize(Math.max(42, Number(e.target.value) || 68))}
                className="w-full bg-transparent font-mono font-bold text-amber-300 outline-none tabular-nums"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
              <span className="text-slate-400 block text-[10px]">Акцент субтитров</span>
              <select
                value={shortsSubtitleColor}
                onChange={e => setShortsSubtitleColor(e.target.value)}
                className="w-full bg-transparent font-mono font-bold text-amber-300 outline-none"
              >
                <option value="#FBBF24" className="bg-slate-900">Gold #FBBF24</option>
                <option value="#34D399" className="bg-slate-900">Emerald #34D399</option>
                <option value="#38BDF8" className="bg-slate-900">Cyan #38BDF8</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
            {extractedShortsSegments.map((seg, idx) => (
              <div
                key={`short-seg-${seg.segment_index}`}
                className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-amber-300 font-bold">
                    #{idx + 1} • SHORT_9x16_0{seg.segment_index} — {seg.hook_type}
                  </span>
                  <span className="text-emerald-400 tabular-nums">
                    ~{seg.duration_sec} сек
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2">{seg.script_excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
