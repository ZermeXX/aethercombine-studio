/**
 @license
 SPDX-License-Identifier: Apache-2.0
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
import { AnimatedDurationText, MetadataReadinessRing } from './MotionMetrics';
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

/* ---------- счётчики: только целые неотрицательные, без анимационного undershoot ---------- */
const safeCount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const pluralRu = (count: number, one: string, few: string, many: string): string => {
  const n = safeCount(count);
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const formatSecToTimestamp = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const formatSecToShortChapter = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const computeLoopDurationSec = (slots: TimelineSlot[]): number => {
  if (!Array.isArray(slots) || slots.length === 0) return 0;
  return slots.reduce((acc, slot, idx) => {
    const dur = Math.max(0, Number(slot?.slot_duration_sec) || 0);
    const isLast = idx === slots.length - 1;
    const transition = slot?.slot_transition_out;
    const overlap =
      !isLast && transition && transition.type !== 'none'
        ? Math.max(0, Number(transition.duration_sec) || 0)
        : 0;
    return acc + Math.max(0, dur - overlap);
  }, 0);
};

/** YouTube разрешает End Screen только в последние 5–20 секунд ролика. */
const computeEndScreenWindow = (durationSec: number): string => {
  if (!Number.isFinite(durationSec) || durationSec < 25) return '—';
  const start = Math.max(0, durationSec - 20);
  const end = Math.max(start + 5, durationSec - 5);
  return `${formatSecToShortChapter(start)}-${formatSecToShortChapter(end)}`;
};

const countWords = (text: string): number =>
  String(text || '').trim().split(/\s+/).filter(Boolean).length;

const clampTitle = (raw: string, max = 60): string => {
  const value = String(raw || '').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
};

const TITLE_TARGET = 60;
const DESC_MIN = 150;
const DESC_MAX = 200;
const TAGS_TARGET = 30;
const TAGS_MAX_CHARS = 500;

const TONE_SUBJECT_FALLBACK: Record<SeoToneStyle, string> = {
  'Dark Mystery': 'the sealed alpine outpost file',
  'Cozy Ambient': 'this three-hour winter sanctuary',
  'Historical Doc': 'the declassified station archive',
  'Cinematic Drama': 'the night the signal returned'
};

const TONE_DESCRIPTION_SENTENCES: Record<SeoToneStyle, string[]> = {
  'Dark Mystery': [
    'In this 4K investigative documentary we reopen {subject} and read the file the way the inspectors did.',
    'Working from primary source logs, declassified correspondence and the original telemetry reels, we reconstruct the sequence hour by hour.',
    'That includes the fourteen-second anomaly every official summary quietly leaves out.',
    'You will see the archived blueprints, hear the restored audio and follow the paper trail to a room nobody had clearance to enter.',
    'Every claim is anchored to a document, and where the record runs out we say so plainly instead of filling the gap with speculation.',
    'The film is mastered in crisp 4K Ultra HD with continuous, unbroken narration, so the timeline never jumps ahead of the evidence.',
    'This is a slow, deliberate reconstruction rather than a highlight reel.',
    'If you enjoy dark historical mysteries, unexplained signals and forensic deep dives, stay through the final verdict.',
    'The last document changes the meaning of everything that came before it.',
    'Sources, chapter markers and a full transcript are linked below.'
  ],
  'Cozy Ambient': [
    'Settle into {subject}, a continuous three-hour ambience piece recorded and mastered in native 4K Ultra HD.',
    'Snow drifts past the window while the hearth keeps a low, steady crackle underneath the room tone.',
    'There are no cuts, no jump scares and no mid-roll interruptions, so the atmosphere stays unbroken for the full runtime.',
    'The loop seams are crossfaded frame by frame, which means you will not hear the moment the scene starts over.',
    'Audio is normalised to a gentle broadcast target with true-peak headroom, so it sits comfortably behind sleep, study or deep work.',
    'Use the chapter markers to jump between acts, or simply let the whole piece run while you read.',
    'Many viewers keep this open on a second monitor as a calm, warm anchor during long sessions.',
    'Headphones reveal the distant wind layer, but the mix is deliberately soft on speakers as well.',
    'Dim the screen, lower the volume a little and let the room settle.',
    'New ambience films are published regularly, so subscribe if this one helps you focus.'
  ],
  'Historical Doc': [
    'This 4K historical documentary reconstructs {subject} from the archive outward.',
    'We begin with construction records and staffing rosters, then move through the emergency protocol that emptied the site in a single day.',
    'Declassified telemetry, witness statements and internal correspondence are read on screen so you can weigh them yourself.',
    'Each act is anchored to a dated document, and the chapter list below maps directly onto those sources.',
    'Where accounts disagree we present both readings rather than choosing the more dramatic one.',
    'The visual language is oil-painting and graphic-novel reconstruction, clearly labelled as such, never passed off as archival footage.',
    'Narration runs continuously at a measured pace, mastered in 4K Ultra HD with broadcast loudness and clean dialogue.',
    'A full source list, transcript and timeline are provided so the film can be checked line by line.',
    'If you care about history that shows its working, this reconstruction is built for you.',
    'Corrections and additional documents are welcome in the comments and will be pinned.'
  ],
  'Cinematic Drama': [
    '{subject} begins at 03:17, when a warning signal reached a console nobody was watching.',
    'This 4K cinematic reconstruction follows the twelve minutes before the blackout and the fifty-year oath that came after.',
    'We stage the events from sworn statements and duty logs, with every dramatised sequence marked as reconstruction.',
    'The sound design carries the low carrier hum that appears on every surviving reel.',
    'Colour grading, lens choice and camera movement follow the emotional pressure of the scene rather than spectacle.',
    'Narration is continuous and unbroken, mastered in 4K Ultra HD with cinema loudness and controlled true peaks.',
    'Act markers below let you return to the exact moment each decision was made.',
    'The final act returns to the frozen perimeter and asks the only question the file cannot answer.',
    'Watch to the epilogue, because the transmission never actually stopped.',
    'Sources, transcript and reconstruction notes are linked in the description.'
  ]
};

const TONE_TAG_POOL: Record<SeoToneStyle, string[]> = {
  'Dark Mystery': [
    'dark mystery', 'documentary 4k', 'investigative doc', 'unsolved history', 'audio anomaly',
    'declassified archive', 'true mystery story', 'forensic investigation', 'cinematic doc',
    'eerie history', 'unexplained signal', 'cold case files', 'sealed archive', 'night shift log',
    'telemetry anomaly'
  ],
  'Cozy Ambient': [
    'cozy ambience', '3 hours ambience', '4k ambient loop', 'fireplace sounds', 'snowstorm window',
    'sleep sounds', 'study ambience', 'deep focus', 'no ads ambience', 'winter cabin',
    'crackling fire', 'white noise sleep', 'relaxing ambience', 'seamless loop', 'calm room tone'
  ],
  'Historical Doc': [
    'historical documentary', 'history 4k', 'archive footage', 'declassified history',
    'documentary film', 'primary sources', 'cold war history', 'historical reconstruction',
    'oral history', 'timeline documentary', 'research documentary', 'history deep dive',
    'archival records', 'educational documentary', 'narrated history'
  ],
  'Cinematic Drama': [
    'cinematic documentary', 'dramatic reconstruction', '4k film', 'cinema grade',
    'true story drama', 'narrated film', 'atmospheric film', 'storytelling documentary',
    'period reconstruction', 'sound design', 'anamorphic look', 'slow cinema',
    'character study', 'archive drama', 'epilogue'
  ]
};

const GENERIC_TAG_POOL = [
  'aether studio', 'histoviva', '4k ultra hd', 'full documentary', 'long form',
  'no commentary cuts', 'continuous narration', 'chapter markers', 'transcript included',
  'source list', 'deep dive', 'unedited timeline', 'broadcast loudness', 'english narration',
  'documentary 2026'
];

const buildToneDescription = (
  tone: SeoToneStyle,
  projectName: string,
  scriptContext: string,
  chapterLabels: string[]
): string => {
  const cleanProject = String(projectName || '').replace(/[а-яёА-ЯЁ]+/g, '').trim();
  const subject =
    cleanProject && cleanProject.length > 6
      ? cleanProject.toLowerCase()
      : TONE_SUBJECT_FALLBACK[tone];

  const sentences = TONE_DESCRIPTION_SENTENCES[tone].map(s => s.replace('{subject}', subject));

  const firstChapter = chapterLabels.find(Boolean);
  if (firstChapter) {
    sentences.splice(2, 0, `The opening act, "${firstChapter}", sets the reference point for everything that follows.`);
  }

  const contextWords = String(scriptContext || '')
    .replace(/[а-яёА-ЯЁ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 5)
    .slice(0, 6)
    .join(', ');
  if (contextWords) {
    sentences.push(`Recurring threads in this film include ${contextWords.toLowerCase()}.`);
  }

  const filler = [
    'Chapter markers, a plain-text transcript and the full source list are attached below the player.',
    'The runtime is uninterrupted, so the piece can be watched in one sitting or resumed from any act.',
    'If a detail here contradicts a source you hold, post it and the correction will be pinned.'
  ];

  let out = sentences.join(' ');
  let fillerIdx = 0;
  while (countWords(out) < DESC_MIN && fillerIdx < filler.length) {
    out += ' ' + filler[fillerIdx];
    fillerIdx += 1;
  }

  if (countWords(out) > DESC_MAX) {
    const parts = out.split(/(?<=\.)\s+/);
    while (parts.length > 3 && countWords(parts.join(' ')) > DESC_MAX) parts.pop();
    out = parts.join(' ');
  }

  return out.trim();
};

const buildToneTags = (tone: SeoToneStyle, baseTags: string, projectName: string): string => {
  const fromBase = String(baseTags || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  const projectTag = String(projectName || '')
    .replace(/[а-яёА-ЯЁ]+/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .toLowerCase();

  const ordered = [...fromBase, ...TONE_TAG_POOL[tone], ...GENERIC_TAG_POOL];
  if (projectTag.length > 3) ordered.push(projectTag.slice(0, 28));

  const seen = new Set<string>();
  const picked: string[] = [];
  for (const tag of ordered) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const next = [...picked, tag].join(', ');
    if (next.length > TAGS_MAX_CHARS) continue;
    picked.push(tag);
    if (picked.length >= TAGS_TARGET) break;
  }
  return picked.join(', ').slice(0, TAGS_MAX_CHARS);
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
  endScreenSafeZone,
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
    (nextTone: SeoToneStyle) => updateSeoState(prev => ({ ...prev, tone: nextTone })),
    [updateSeoState]
  );
  const setSelectedTitleId = useCallback(
    (nextId: 'A' | 'B' | 'C') => updateSeoState(prev => ({ ...prev, selectedTitleId: nextId })),
    [updateSeoState]
  );
  const setTitles = useCallback(
    (updater: SeoTitleVariant[] | ((prev: SeoTitleVariant[]) => SeoTitleVariant[])) =>
      updateSeoState(prev => ({
        ...prev,
        titles: typeof updater === 'function' ? updater(prev.titles) : updater
      })),
    [updateSeoState]
  );
  const setDescription = useCallback(
    (nextDesc: string) => updateSeoState(prev => ({ ...prev, description: nextDesc })),
    [updateSeoState]
  );
  const setTagsString = useCallback(
    (nextTags: string) => updateSeoState(prev => ({ ...prev, tagsString: nextTags })),
    [updateSeoState]
  );

  const scenesCount = safeCount(narrativeScenes?.length);
  const slotsCount = safeCount(loopSlots?.length);

  const [chapterSourceMode, setChapterSourceMode] = useState<'scenes' | 'loop'>(
    slotsCount > 0 && scenesCount === 0 ? 'loop' : 'scenes'
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>('');

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

    if (chapterSourceMode === 'loop' && slotsCount > 0) {
      let cursorSec = 0;
      return loopSlots
        .map((slot, idx) => {
          const ts = formatSecToTimestamp(cursorSec);
          const isLast = idx === loopSlots.length - 1;
          const overlap =
            !isLast && slot.slot_transition_out?.type !== 'none'
              ? Math.max(0, Number(slot.slot_transition_out?.duration_sec) || 0)
              : 0;
          cursorSec += Math.max(1, (Number(slot.slot_duration_sec) || 0) - overlap);
          const rawTitle = (slot.act_title || slot.title || '').trim();
          const englishLabel =
            !rawTitle || /[а-яёА-ЯЁ]/.test(rawTitle)
              ? presetNames[idx % presetNames.length]
              : rawTitle;
          return `${ts} - ${englishLabel}`;
        })
        .join('\n');
    }

    if (scenesCount > 0) {
      const timings = computeContinuousSceneTimings(narrativeScenes);
      const step = Math.max(1, Math.floor(narrativeScenes.length / 6));
      const lines: string[] = [];
      narrativeScenes.forEach((sc, idx) => {
        if (idx === 0 || idx % step === 0) {
          const chapterIdx = lines.length;
          if (chapterIdx < 8) {
            const ts = formatSecToTimestamp(idx === 0 ? 0 : timings[idx]?.segStart ?? 0);
            lines.push(`${ts} - ${toEnglishSceneTitle(sc, chapterIdx)}`);
          }
        }
      });
      if (lines.length > 0) return lines.join('\n');
    }

    return presetNames.map((name, i) => `${formatSecToTimestamp(i * 180)} - ${name}`).join('\n');
  }, [tone, chapterSourceMode, narrativeScenes, loopSlots, scenesCount, slotsCount]);

  const liveLoopTimestampsText = useMemo(() => {
    if (slotsCount === 0) return '';
    let cursorSec = 0;
    return loopSlots
      .map((slot, idx) => {
        const ts = formatSecToTimestamp(cursorSec);
        const isLast = idx === loopSlots.length - 1;
        const overlap =
          !isLast && slot.slot_transition_out?.type !== 'none'
            ? Math.max(0, Number(slot.slot_transition_out?.duration_sec) || 0)
            : 0;
        cursorSec += Math.max(1, (Number(slot.slot_duration_sec) || 0) - overlap);
        return `${ts} - ${toEnglishChapterTitle(slot.act_title || slot.title, idx, slot.act_timecode)}`;
      })
      .join('\n');
  }, [loopSlots, slotsCount]);

  const [chaptersText, setChaptersText] = useState<string>(
    externalChaptersTxt?.trim() || computedChaptersFromManifest
  );

  useEffect(() => {
    setChaptersText(
      externalChaptersTxt && externalChaptersTxt.trim()
        ? externalChaptersTxt.trim()
        : computedChaptersFromManifest
    );
  }, [computedChaptersFromManifest, externalChaptersTxt]);

  const copyWithToast = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onNotify(`${label} скопировано в буфер обмена!`, 'success');
    window.setTimeout(() => setCopiedKey(''), 2000);
  };

  const chapterLabels = useMemo(
    () =>
      chaptersText
        .split('\n')
        .map(line => line.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–]?\s*/, '').trim())
        .filter(Boolean),
    [chaptersText]
  );

  const applyTonePresetsLocally = useCallback(
    (selectedTone: SeoToneStyle) => {
      const selected = SEO_PRESETS_BY_TONE[selectedTone];
      const cleanProj = String(projectName || '').replace(/[а-яёА-ЯЁ]+/g, '').trim();
      const fallbackBase = cleanProj.length > 4 ? cleanProj : 'Documentary Film (4K)';

      const nextDescription = buildToneDescription(
        selectedTone,
        projectName,
        scriptContext,
        chapterLabels
      );
      const nextTags = buildToneTags(selectedTone, selected?.tags || '', projectName);

      updateSeoState(prev => ({
        ...prev,
        tone: selectedTone,
        titles: [
          {
            id: 'A',
            category: 'Intrigue',
            categoryRu: 'Интрига (Intrigue)',
            title: clampTitle(prev.titles[0]?.title || `${fallbackBase}: The Sealed File`)
          },
          {
            id: 'B',
            category: 'Contradiction',
            categoryRu: 'Противоречие (Contradiction)',
            title: clampTitle(prev.titles[1]?.title || `${fallbackBase}: What Really Happened`)
          },
          {
            id: 'C',
            category: 'Drama',
            categoryRu: 'Драма (Cinematic Drama)',
            title: clampTitle(prev.titles[2]?.title || `Inside ${fallbackBase}`)
          }
        ],
        description: nextDescription,
        tagsString: nextTags
      }));
    },
    [updateSeoState, projectName, scriptContext, chapterLabels]
  );

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
                title: clampTitle(String(d.titles[0]?.title || ''))
              },
              {
                id: 'B',
                category: 'Contradiction',
                categoryRu: 'Противоречие (Contradiction)',
                title: clampTitle(String(d.titles[1]?.title || ''))
              },
              {
                id: 'C',
                category: 'Drama',
                categoryRu: 'Драма (Cinematic Drama)',
                title: clampTitle(String(d.titles[2]?.title || ''))
              }
            ]);
          }

          const remoteDesc = typeof d.description === 'string' ? d.description.trim() : '';
          setDescription(
            countWords(remoteDesc) >= DESC_MIN
              ? remoteDesc
              : buildToneDescription(tone, projectName, scriptContext, chapterLabels)
          );

          if (Array.isArray(d.chapters) && d.chapters.length > 0) {
            setChaptersText(d.chapters.join('\n'));
          }

          const remoteTags = typeof d.tags === 'string' ? d.tags.trim() : '';
          setTagsString(buildToneTags(tone, remoteTags, projectName));

          onNotify(`✨ Gemini сформировал англоязычный SEO-пакет в стиле «${tone}»!`, 'success');
          setIsGenerating(false);
          return;
        }
      }

      applyTonePresetsLocally(tone);
      onNotify(`✨ SEO-пакет сформирован в стиле «${tone}» (US English)!`, 'success');
    } catch {
      applyTonePresetsLocally(tone);
      onNotify(`✨ SEO-пакет сформирован в стиле «${tone}» (US English)!`, 'success');
    } finally {
      setIsGenerating(false);
    }
  };

  const descriptionWordCount = useMemo(() => countWords(description), [description]);

  const tagsListCount = useMemo(
    () => safeCount(tagsString.split(',').map(t => t.trim()).filter(Boolean).length),
    [tagsString]
  );
  const tagsCharCount = safeCount(tagsString.length);

  const activeReleaseTitle = useMemo(
    () => (titles.find(t => t.id === selectedTitleId) || titles[0])?.title || '',
    [titles, selectedTitleId]
  );

  const releaseCardTimestamps = useMemo(() => {
    if (chapterSourceMode === 'loop' && chaptersText.trim()) return chaptersText.trim();
    return liveLoopTimestampsText || chaptersText.trim();
  }, [chapterSourceMode, chaptersText, liveLoopTimestampsText]);

  const [shortsEnabled, setShortsEnabled] = useState<boolean>(shortsExportConfig?.enabled ?? true);
  const [shortsSubtitleColor, setShortsSubtitleColor] = useState<string>(
    shortsExportConfig?.subtitle_style?.highlight_color ?? '#FBBF24'
  );
  const [shortsFontSize, setShortsFontSize] = useState<number>(
    shortsExportConfig?.subtitle_style?.font_size_px ?? 68
  );

  const extractedShortsSegments = useMemo<ShortsExportSegment[]>(() => {
    const rawParagraphs = String(scriptContext || '')
      .split(/\n{2,}|\r?\n/)
      .map(p => p.replace(/\[[^\]]*\]/g, '').trim())
      .filter(p => p.length > 25);

    const defaultHooks = [
      'Everything you were told about this classified mountain outpost is missing one crucial detail recorded at the fourteenth second of the tape.',
      'When the inspection team unlocked the subterranean vault twenty-four hours later, every transmitter was still broadcasting at full power.',
      'Nobody had clearance to enter the command room, yet the signal returned at the exact same minute every single night.'
    ];

    const candidates = rawParagraphs.length >= 2 ? rawParagraphs : defaultHooks;
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
      ffmpeg_crop_filter: 'crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920,setsar=1',
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

  const exactRhythmMapChaptersTxt = useMemo(() => {
    if (hasVerbaFlowChapters) return String(externalChaptersTxt).trim();

    if (scenesCount > 0) {
      const timings = computeContinuousSceneTimings(narrativeScenes);
      const chapterCount = Math.min(8, Math.max(3, Math.ceil(narrativeScenes.length / 3)));
      const step = Math.max(1, Math.floor(narrativeScenes.length / chapterCount));
      const lines: string[] = [];
      narrativeScenes.forEach((sc, idx) => {
        if (idx === 0 || idx % step === 0) {
          const ts = formatSecToShortChapter(idx === 0 ? 0 : timings[idx]?.segStart ?? 0);
          lines.push(`${ts} ${toEnglishSceneTitle(sc, lines.length)}`);
        }
      });
      return lines.join('\n');
    }

    return computedChaptersFromManifest
      .split('\n')
      .map(line => line.replace(/^00:/, '').replace(' - ', ' '))
      .join('\n');
  }, [hasVerbaFlowChapters, externalChaptersTxt, narrativeScenes, scenesCount, computedChaptersFromManifest]);

  const chaptersLineCount = safeCount(
    exactRhythmMapChaptersTxt.split(/\r?\n/).filter(Boolean).length
  );

  const totalRhythmMapDurationSec = useMemo(() => {
    if (scenesCount > 0) {
      const timings = computeContinuousSceneTimings(narrativeScenes);
      return timings.length > 0 ? Math.max(0, timings[timings.length - 1].segEnd) : 0;
    }
    return computeLoopDurationSec(loopSlots);
  }, [narrativeScenes, scenesCount, loopSlots]);

  const effectiveEndScreen =
    (endScreenSafeZone || '').trim() || computeEndScreenWindow(totalRhythmMapDurationSec);

  const releaseItemCount = scenesCount > 0 ? scenesCount : slotsCount;
  const releaseItemLabel =
    scenesCount > 0
      ? pluralRu(releaseItemCount, 'сцена', 'сцены', 'сцен')
      : pluralRu(releaseItemCount, 'акт', 'акта', 'актов');

  const handleDownloadMetadataTxt = () => {
    const content = [
      '====================================================================',
      `YOUTUBE SEO & METADATA PACKAGE (${tone.toUpperCase()} • US ENGLISH)`,
      `PROJECT: ${projectName || 'AetherCombine 4K Production'}`,
      '====================================================================',
      '',
      `--- 1. CLICKABLE A/B TITLES (TARGET ${TITLE_TARGET} CHARS) ---`,
      ...titles.map(
        t => `[Variant ${t.id} • ${t.category}] (${t.title.length}/${TITLE_TARGET} chars):\n${t.title}`
      ),
      '',
      `--- 2. SEO DESCRIPTION (${descriptionWordCount} WORDS) ---`,
      description.trim(),
      '',
      '--- 3. CLICKABLE YOUTUBE CHAPTERS (TIMESTAMPS) ---',
      chaptersText.trim(),
      '',
      `--- 4. YOUTUBE TAGS (${tagsListCount} TAGS • ${tagsCharCount}/${TAGS_MAX_CHARS} CHARS) ---`,
      tagsString.trim(),
      ''
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metadata.txt';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('📥 Файл metadata.txt (Titles + Description + Chapters + Tags) скачан!', 'success');
  };

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
      scenesCount: releaseItemCount,
      durationFormatted: formatSecToShortChapter(totalRhythmMapDurationSec),
      averageSceneSec:
        scenesCount > 0 ? (totalRhythmMapDurationSec / scenesCount).toFixed(1) : '5.0',
      dominantStyle,
      cameraVectors: dominantCameraVectors,
      shortsEnabled,
      shortsSegmentsCount: safeCount(extractedShortsSegments.length),
      renderSpecsSummary,
      activeSubtitleLanguages,
      endScreenSafeZone: effectiveEndScreen
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
        : `⏱️ Файл output_chapters.txt скачан (точный расчёт по ${releaseItemCount} ${releaseItemLabel})!`,
      'success'
    );
  };

  const releaseCardText = useMemo(
    () =>
      [
        'TITLE:',
        activeReleaseTitle.trim(),
        '',
        'DESCRIPTION:',
        description.trim(),
        '',
        'TIMESTAMPS (CHAPTERS):',
        releaseCardTimestamps,
        '',
        'TAGS:',
        tagsString.trim()
      ].join('\n'),
    [activeReleaseTitle, description, releaseCardTimestamps, tagsString]
  );

  const descInRange = descriptionWordCount >= DESC_MIN && descriptionWordCount <= DESC_MAX;

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-3.5 sm:p-6 space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Package className="text-emerald-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>📦 YouTube SEO &amp; Упаковка (SEO Hub • Strictly Natural US English)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Автоматическая генерация: 3 A/B заголовка (до {TITLE_TARGET} симв.), SEO-описание
            ({DESC_MIN}–{DESC_MAX} слов), кликабельные главы по манифесту и до {TAGS_TARGET} тегов
            (до {TAGS_MAX_CHARS} симв.)
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
            <span>{isGenerating ? 'Генерация Gemini (EN)...' : '✨ Сгенерировать SEO через Gemini (EN)'}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              copyWithToast(
                releaseCardText,
                'release-card',
                'Карточка релиза (Title + Description + Timestamps + Tags)'
              )
            }
            className="min-h-[42px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-sky-500/20"
          >
            {copiedKey === 'release-card' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey === 'release-card' ? 'Карточка скопирована!' : 'Скопировать карточку релиза'}</span>
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

        <div className="bg-[#111622] border border-white/[0.08] rounded-xl p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-emerald-300">
              Primary Video Title (<code className="text-amber-300">video_title</code> • Variant {selectedTitleId})
            </label>
            <span
              className={`text-[10.5px] font-mono tabular-nums ${
                activeReleaseTitle.length > TITLE_TARGET ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {safeCount(activeReleaseTitle.length)}/{TITLE_TARGET} chars
              {activeReleaseTitle.length > TITLE_TARGET ? ' · обрезается в ленте' : ''}
            </span>
          </div>
          <input
            type="text"
            maxLength={100}
            value={activeReleaseTitle}
            placeholder="Loaded dynamically from manifest video_title (or enter custom release title)..."
            onChange={e => {
              const val = e.target.value.slice(0, 100);
              setTitles(prev => prev.map(t => (t.id === selectedTitleId ? { ...t, title: val } : t)));
            }}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-lg px-3.5 py-2.5 text-sm font-bold text-slate-100 outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {titles.map((item, idx) => {
            const len = safeCount(item.title.length);
            const isValidLen = len <= TITLE_TARGET;
            return (
              <div
                key={item.id}
                className="bg-[#111622] border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 flex flex-col justify-between space-y-3 transition"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-400">
                      Вариант {item.id}: {item.categoryRu}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border tabular-nums whitespace-nowrap ${
                        isValidLen
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {len}/{TITLE_TARGET}
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={100}
                    value={item.title}
                    onChange={e => {
                      const val = e.target.value.slice(0, 100);
                      setTitles(prev => prev.map((t, i) => (i === idx ? { ...t, title: val } : t)));
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-bold text-slate-100 outline-none"
                  />
                  {!isValidLen && (
                    <button
                      type="button"
                      onClick={() =>
                        setTitles(prev =>
                          prev.map((t, i) => (i === idx ? { ...t, title: clampTitle(t.title) } : t))
                        )
                      }
                      className="text-[10.5px] text-amber-300 hover:text-amber-200 underline cursor-pointer"
                    >
                      Обрезать до {TITLE_TARGET} символов по слову
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => copyWithToast(item.title, `title-${item.id}`, `Заголовок ${item.id}`)}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  б) SEO-описание (Description • {DESC_MIN}–{DESC_MAX} слов)
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border tabular-nums whitespace-nowrap ${
                  descInRange
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {descriptionWordCount} слов (цель: {DESC_MIN}–{DESC_MAX})
              </span>
            </div>
            <textarea
              rows={9}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed outline-none custom-scroll"
            />
            {!descInRange && (
              <button
                type="button"
                onClick={() =>
                  setDescription(buildToneDescription(tone, projectName, scriptContext, chapterLabels))
                }
                className="min-h-[36px] w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 rounded-lg text-[11px] font-semibold cursor-pointer transition"
              >
                Довести описание до {DESC_MIN}–{DESC_MAX} слов по текущей тональности
              </button>
            )}
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

        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  в) Кликабельные главы (Timestamps / Chapters)
                </h3>
              </div>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setChapterSourceMode('scenes')}
                  className={`min-h-[36px] sm:min-h-[28px] px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                    chapterSourceMode === 'scenes'
                      ? 'bg-indigo-500/30 text-indigo-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Из сцен ({scenesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChapterSourceMode('loop')}
                  className={`min-h-[36px] sm:min-h-[28px] px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                    chapterSourceMode === 'loop'
                      ? 'bg-amber-500/30 text-amber-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Из актов лупа ({slotsCount})
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
            onClick={() => copyWithToast(chaptersText, 'seo-chapters', 'Кликабельные главы (Timestamps)')}
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

      <div className="bg-[#0b0f17] border border-emerald-500/30 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              г) Теги YouTube (до {TAGS_TARGET} тегов через запятую, лимит {TAGS_MAX_CHARS} символов)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-mono text-slate-300 tabular-nums whitespace-nowrap">
              Тегов: <strong className="text-slate-100">{tagsListCount}</strong> / {TAGS_TARGET}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border tabular-nums whitespace-nowrap ${
                tagsCharCount <= TAGS_MAX_CHARS
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              }`}
            >
              {tagsCharCount}/{TAGS_MAX_CHARS} символов
            </span>
          </div>
        </div>
        <textarea
          rows={3}
          maxLength={TAGS_MAX_CHARS}
          value={tagsString}
          onChange={e => setTagsString(e.target.value.slice(0, TAGS_MAX_CHARS))}
          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyWithToast(tagsString, 'seo-tags', `Теги YouTube (${tagsListCount})`)}
              className="min-h-[42px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition"
            >
              {copiedKey === 'seo-tags' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>Копировать теги ({tagsCharCount}/{TAGS_MAX_CHARS})</span>
            </button>
            {tagsListCount < TAGS_TARGET && (
              <button
                type="button"
                onClick={() => setTagsString(buildToneTags(tone, tagsString, projectName))}
                className="min-h-[42px] bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Добрать до {TAGS_TARGET} релевантных тегов
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownloadMetadataTxt}
            className="min-h-[42px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-md shadow-amber-500/15"
          >
            <Download className="w-4 h-4" /> 📥 Скачать metadata.txt (Полный пакет)
          </button>
        </div>
      </div>

      <div className="bg-[#0b0f17] border border-sky-500/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-400" />
              д) Единая карточка релиза YouTube
            </h3>
            <p className="text-[11px] text-slate-400">
              Объединяет выбранный заголовок, SEO-описание, теги и актуальные таймкоды из{' '}
              {releaseItemCount} {releaseItemLabel}
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
              {copiedKey === 'release-card' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedKey === 'release-card' ? 'Скопировано!' : 'Скопировать карточку релиза'}</span>
            </button>
          </div>
        </div>
        <pre className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto custom-scroll">
          {releaseCardText}
        </pre>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-[#0b0f19] border border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                📦 Экспорт пакета релиза (English)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Markdown-манифест релиза и точные таймкоды глав по реальным{' '}
                <code className="text-emerald-300">duration</code>
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-300 tabular-nums shrink-0 whitespace-nowrap">
              {releaseItemCount} {releaseItemLabel}
              <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
              <AnimatedDurationText totalSeconds={totalRhythmMapDurationSec} />
            </span>
          </div>

          <MetadataReadinessRing
            titleValid={activeReleaseTitle.trim().length > 0 && activeReleaseTitle.trim().length <= TITLE_TARGET}
            descriptionValid={descInRange}
            chaptersValid={chaptersLineCount >= 2}
            tagsValid={tagsListCount >= 5 && tagsCharCount > 0 && tagsCharCount <= TAGS_MAX_CHARS}
            chaptersCount={chaptersLineCount}
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
                  Export <code className="text-amber-300">output_chapters.txt</code>
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
                  Export <code className="text-emerald-300">RELEASE_CARD.md</code>
                </span>
              </label>
            </div>
            <div className="bg-[#111827]/70 border border-white/[0.06] rounded-lg px-3 py-1.5 text-[10.5px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate">
                Specs: <strong className="text-slate-200">{renderSpecsSummary}</strong>
              </span>
              <span className="whitespace-nowrap">
                SRT: <strong className="text-cyan-300">{activeSubtitleLanguages.join(', ')}</strong>
              </span>
              <span className="whitespace-nowrap">
                End Screen: <strong className="text-emerald-300">{effectiveEndScreen}</strong>
              </span>
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
              className="min-h-[42px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 text-indigo-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Clock className="w-4 h-4 text-indigo-300" />
              <span>Скачать output_chapters.txt</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 bg-[#0b0f19] border border-amber-500/40 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                📱 Настройки Авто-Shorts (9:16 + Динамические субтитры)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Выделяет 2–3 цепляющих абзаца из VerbaFlow и записывает{' '}
                <code className="text-amber-300">shorts_export</code> в{' '}
                <code className="text-amber-300">manifest.json</code>
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
              <span>📱 Shorts (9:16): {shortsEnabled ? 'ON' : 'OFF'}</span>
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
                onChange={e =>
                  setShortsFontSize(Math.max(42, Math.min(96, Number(e.target.value) || 68)))
                }
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

          <div className="bg-[#111827]/70 border border-white/[0.06] rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-400 break-all">
            crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920,setsar=1 · loudnorm I=-14:TP=-1
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
            {extractedShortsSegments.map((seg, idx) => (
              <div
                key={`short-seg-${seg.segment_index}`}
                className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] font-mono">
                  <span className="text-amber-300 font-bold">
                    #{idx + 1} • SHORT_9x16_0{seg.segment_index} — {seg.hook_type}
                  </span>
                  <span className="text-emerald-400 tabular-nums whitespace-nowrap">
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
