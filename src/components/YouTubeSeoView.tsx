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
import type { NarrativeSceneItem } from './MontageCombineView';
import type { TimelineSlot } from '../App';

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

interface YouTubeSeoViewProps {
  scriptContext: string;
  narrativeScenes: NarrativeSceneItem[];
  loopSlots: TimelineSlot[];
  projectName: string;
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

export const YouTubeSeoView: React.FC<YouTubeSeoViewProps> = ({
  scriptContext,
  narrativeScenes,
  loopSlots,
  projectName,
  onApplyTitleToThumbnail,
  onNotify
}) => {
  const [tone, setTone] = useState<SeoToneStyle>('Dark Mystery');
  const [chapterSourceMode, setChapterSourceMode] = useState<'scenes' | 'loop'>('scenes');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>('');

  // а) Кликабельные заголовки (A/B Titles): 3 контрастных варианта (Интрига, Противоречие, Драма) до 60 символов
  const [titles, setTitles] = useState<SeoTitleVariant[]>([
    {
      id: 'A',
      category: 'Intrigue',
      categoryRu: 'Интрига (Intrigue)',
      title: 'The 1974 Alpine Tape They Hid for 50 Years'
    },
    {
      id: 'B',
      category: 'Contradiction',
      categoryRu: 'Противоречие (Contradiction)',
      title: 'Evacuated in 24 Hours, Yet It Broadcast for 21 Days'
    },
    {
      id: 'C',
      category: 'Drama',
      categoryRu: 'Драма (Cinematic Drama)',
      title: 'Why the Night Shift Signed a 50-Year Silence Pact'
    }
  ]);

  // б) SEO-описание (Description): плотный продающий текст на 150-200 слов с поисковыми ключами (US English)
  const [description, setDescription] = useState<string>(
    `In 1974, a remote high-altitude Alpine weather station was abruptly evacuated in under twenty-four hours after recording an unexplained low-frequency acoustic signal. While declassified official reports blamed a sudden mountain avalanche, every telemetry sensor inside the sealed, unpowered bunker continued broadcasting a structured pulse for three straight weeks.\n\nIn this 4K investigative documentary, we examine the original magnetic tape logs, the missing forty-minute communication window, and the fifty-year non-disclosure agreement signed by the surviving night shift engineers. Using forensic audio analysis and archival blueprints, we reconstruct what actually happened behind the welded steel doors of Outpost 7.\n\nWhether you enjoy dark historical mysteries, unsolved Cold War anomalies, or deep-dive investigative storytelling, this documentary uncovers the evidence that authorities tried to erase from history. Watch until the final act to hear the unfiltered fourteen-second recording that started it all.`
  );

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

    // По сценам повествовательного манифеста
    if (narrativeScenes.length > 0) {
      const step = Math.max(1, Math.floor(narrativeScenes.length / 6));
      const lines: string[] = [];
      let cursorSec = 0;

      narrativeScenes.forEach((sc, idx) => {
        if (idx === 0 || idx % step === 0) {
          const chapterIdx = lines.length;
          if (chapterIdx < 8) {
            const ts = formatSecToTimestamp(cursorSec);
            const rawOverlay = sc.text_overlay
              .replace(/\[[^\]]*\]/g, '')
              .replace(/[а-яёА-ЯЁ]+/g, '')
              .trim();
            const label =
              rawOverlay.length > 6
                ? rawOverlay.slice(0, 52)
                : presetNames[chapterIdx % presetNames.length];
            lines.push(`${ts} - ${label}`);
          }
        }
        cursorSec += Math.max(1, Number(sc.duration) || 6);
      });

      if (lines.length > 0) {
        return lines.join('\n');
      }
    }

    return presetNames
      .map((name, i) => `${formatSecToTimestamp(i * 180)} - ${name}`)
      .join('\n');
  }, [tone, chapterSourceMode, narrativeScenes, loopSlots]);

  const [chaptersText, setChaptersText] = useState<string>(computedChaptersFromManifest);

  useEffect(() => {
    setChaptersText(computedChaptersFromManifest);
  }, [computedChaptersFromManifest]);

  // г) Теги YouTube (Tags): 30 релевантных тегов единой строкой через запятую (до 500 символов)
  const [tagsString, setTagsString] = useState<string>(
    'dark mystery, classified files, 1974 alpine tape, unexplained signal, abandoned station, cold war mystery, documentary 4k, investigative doc, unsolved history, audio anomaly, ghost broadcast, secret bunker, reel to reel tape, declassified archive, true mystery story, snowbound outpost, acoustic phenomenon, mystery documentary, deep dive history, lost recording, 50 year nda, vanished crew, forensic investigation, cinematic doc, eerie history, numbers station, arctic anomaly, dark history, mysterious broadcast, aether studio'
  );

  const copyWithToast = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onNotify(`${label} скопировано в буфер обмена!`, 'success');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Генерация по тональности (локальный мгновенный пресет + Gemini API)
  const applyTonePresetsLocally = useCallback(
    (selectedTone: SeoToneStyle) => {
      const presetsByTone: Record<
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

      const selected = presetsByTone[selectedTone];
      setTitles([
        {
          id: 'A',
          category: 'Intrigue',
          categoryRu: 'Интрига (Intrigue)',
          title: selected.titles[0].slice(0, 60)
        },
        {
          id: 'B',
          category: 'Contradiction',
          categoryRu: 'Противоречие (Contradiction)',
          title: selected.titles[1].slice(0, 60)
        },
        {
          id: 'C',
          category: 'Drama',
          categoryRu: 'Драма (Cinematic Drama)',
          title: selected.titles[2].slice(0, 60)
        }
      ]);
      setDescription(selected.desc);
      setTagsString(selected.tags.slice(0, 495));
    },
    []
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

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
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
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-60"
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
            onClick={handleDownloadMetadataTxt}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/20"
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
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
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

      {/* а) КЛИКАБЕЛЬНЫЕ ЗАГОЛОВКИ (A/B TITLES): 3 КОНТРАСТНЫХ ВАРИАНТА ДО 60 СИМВОЛОВ */}
      <div className="bg-[#0b0f17] border border-amber-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              а) Кликабельные заголовки (A/B Titles • 3 контрастных варианта строго до 60 символов)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-amber-300">
            Natural US English • Лимит до 60 символов
          </span>
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
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {len}/60 симв.
                    </span>
                  </div>

                  <input
                    type="text"
                    maxLength={60}
                    value={item.title}
                    onChange={e => {
                      const val = e.target.value.slice(0, 60);
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
                    className="flex-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
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
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg text-[11px] cursor-pointer transition"
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
            className="w-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
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
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
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
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
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
            className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono bg-slate-900 border border-slate-700 text-slate-300 px-2.5 py-0.5 rounded">
              Тегов: <strong>{tagsListCount}</strong>
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${
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
            className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition"
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
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-md shadow-amber-500/15"
          >
            <Download className="w-4 h-4" /> 📥 Скачать metadata.txt (Полный пакет)
          </button>
        </div>
      </div>
    </div>
  );
};
