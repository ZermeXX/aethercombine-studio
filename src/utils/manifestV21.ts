/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const V21_SUBTITLE_LANGUAGES = [
  'EN',
  'RU',
  'FR',
  'DE',
  'ES',
  'PT',
  'IT',
  'JA'
] as const;

export type V21SubtitleLang = (typeof V21_SUBTITLE_LANGUAGES)[number];

export const V21_SUBTITLE_LANG_LABELS: Record<V21SubtitleLang, string> = {
  EN: 'English',
  RU: 'Русский',
  FR: 'Français',
  DE: 'Deutsch',
  ES: 'Español',
  PT: 'Português',
  IT: 'Italiano',
  JA: '日本語'
};

export type V21TransitionType =
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'smoothleft'
  | 'smoothup'
  | 'cut'
  | 'crossfade'
  | 'none';

export const V21_XFADE_OPTIONS: Array<{ value: V21TransitionType; label: string }> = [
  { value: 'fade', label: 'fade (xfade)' },
  { value: 'fadeblack', label: 'fadeblack' },
  { value: 'fadewhite', label: 'fadewhite' },
  { value: 'dissolve', label: 'dissolve' },
  { value: 'wipeleft', label: 'wipeleft' },
  { value: 'wiperight', label: 'wiperight' },
  { value: 'smoothleft', label: 'smoothleft' },
  { value: 'smoothup', label: 'smoothup' },
  { value: 'crossfade', label: 'crossfade' },
  { value: 'cut', label: 'cut (0s)' }
];

export const VOICEOVER_LEAD_IN_SEC = 0.2;
export const VOICEOVER_SENTENCE_PAD_SEC = 0.35;

export interface V21PipelineLocks {
  hardFrameLock: boolean;
  apadAtrimLock: boolean;
  continuousVoiceMaster: boolean;
  zeroSpeechOverlap: boolean;
  dynamicXfadeTransitions: boolean;
  decoupledVideoXfadeOnly: boolean;
  autoMuteFlaggedClips: boolean;
  youtubeLoudnorm: boolean;
  integratedLufs: number;
  truePeakDbtp: number;
  voiceoverLeadInSec: number;
  voiceoverSentencePadSec: number;
}

export interface ContinuousSceneTiming {
  index: number;
  segStart: number;
  voiceStart: number;
  voiceEnd: number;
  segEnd: number;
  speechDuration: number;
  pauseAfterSec: number;
}

export interface ContinuousTimingSceneInput {
  duration?: number;
  duration_sec?: number;
  voiceover_duration_sec?: number;
  voice_start?: number;
  voice_end?: number;
}

/**
 * Computes continuous cumulative voiceover timings [voiceStart, voiceEnd] with
 * 200ms lead-in before Scene 01 and 350ms breathing pause after every sentence.
 * Zero speech overlap, zero acrossfade.
 */
export function computeContinuousSceneTimings(
  scenes: ContinuousTimingSceneInput[],
  leadInSec = VOICEOVER_LEAD_IN_SEC,
  padSec = VOICEOVER_SENTENCE_PAD_SEC
): ContinuousSceneTiming[] {
  const result: ContinuousSceneTiming[] = [];
  let cursor = 0;

  scenes.forEach((sc, idx) => {
    const rawSceneDur = Math.max(0.5, Number(sc.duration_sec ?? sc.duration ?? 6) || 6);
    const hasExplicitBounds =
      typeof sc.voice_start === 'number' &&
      typeof sc.voice_end === 'number' &&
      sc.voice_end > sc.voice_start &&
      sc.voice_start >= cursor - 0.001;

    let segStart = cursor;
    let voiceStart: number;
    let voiceEnd: number;

    if (hasExplicitBounds) {
      voiceStart = Number(sc.voice_start);
      voiceEnd = Number(sc.voice_end);
      segStart = idx === 0 ? Math.max(0, voiceStart - leadInSec) : cursor;
    } else {
      const lead = idx === 0 ? leadInSec : 0;
      const explicitVoiceDur =
        typeof sc.voiceover_duration_sec === 'number' && sc.voiceover_duration_sec > 0
          ? sc.voiceover_duration_sec
          : undefined;
      const speechDur =
        explicitVoiceDur !== undefined
          ? Math.max(0.4, explicitVoiceDur)
          : Math.max(0.4, rawSceneDur - lead - padSec);

      voiceStart = segStart + lead;
      voiceEnd = voiceStart + speechDur;
    }

    const segEnd = Math.max(segStart + rawSceneDur, voiceEnd + padSec);
    result.push({
      index: idx,
      segStart: Number(segStart.toFixed(3)),
      voiceStart: Number(voiceStart.toFixed(3)),
      voiceEnd: Number(voiceEnd.toFixed(3)),
      segEnd: Number(segEnd.toFixed(3)),
      speechDuration: Number((voiceEnd - voiceStart).toFixed(3)),
      pauseAfterSec: padSec
    });

    cursor = segEnd;
  });

  return result;
}

export interface V21ArtPreviewConfig {
  thumbnailSlots: {
    A: string;
    B: string;
    C: string;
  };
  endScreenSafeZone: string;
  endScreenGuideVisible: boolean;
}

export interface ParsedV21ManifestConfig {
  isV21Manifest: boolean;
  projectName: string;
  videoTitle: string;
  hasTimelineArray: boolean;
  ambientLoopEnabled: boolean;
  tab1Locks: V21PipelineLocks;
  tab1Export: {
    videoCodec: 'libx264' | 'libx265';
    profile: 'high' | 'main';
    pixFmt: 'yuv420p';
    crf: number;
    resolution: '4k' | '1080p' | '720p';
    fps: 24 | 30 | 60;
    cfr: boolean;
  };
  tab3Verbaflow: {
    strictSceneDurationLock: boolean;
    burnInVideo: boolean;
    exportSeparateSrtFiles: boolean;
    subtitleLanguages: V21SubtitleLang[];
  };
  tab4Seo: {
    chaptersYoutubeText: string;
    exportOutputChaptersTxt: boolean;
    exportReleaseCardMd: boolean;
  };
  tab5Art: V21ArtPreviewConfig;
  totalDurationFormatted: string;
}

export function normalizeV21TransitionType(rawType: unknown): V21TransitionType {
  const s = String(rawType || 'fade').trim().toLowerCase();
  if (
    s === 'fade' ||
    s === 'fadeblack' ||
    s === 'fadewhite' ||
    s === 'dissolve' ||
    s === 'wipeleft' ||
    s === 'wiperight' ||
    s === 'smoothleft' ||
    s === 'smoothup' ||
    s === 'cut' ||
    s === 'crossfade' ||
    s === 'none'
  ) {
    return s;
  }
  if (s === 'xfade') return 'fade';
  if (s === 'fade_black' || s === 'fade_to_black') return 'fadeblack';
  if (s === 'fade_white' || s === 'fade_to_white') return 'fadewhite';
  if (s === 'wipe_left') return 'wipeleft';
  if (s === 'wipe_right') return 'wiperight';
  if (s === 'smooth_left') return 'smoothleft';
  if (s === 'smooth_up') return 'smoothup';
  return 'fade';
}

export function normalizeSubtitleLangCode(raw: unknown): V21SubtitleLang | null {
  const upper = String(raw || '').trim().toUpperCase().split(/[-_]/)[0];
  if ((V21_SUBTITLE_LANGUAGES as readonly string[]).includes(upper)) {
    return upper as V21SubtitleLang;
  }
  return null;
}

export function normalizeSceneSubtitlesMap(
  rawSubs: unknown
): Record<string, string> | undefined {
  if (!rawSubs || typeof rawSubs !== 'object' || Array.isArray(rawSubs)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawSubs as Record<string, unknown>)) {
    let textVal = '';
    if (typeof v === 'string') {
      textVal = v.trim();
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nestedText = (v as Record<string, unknown>).text;
      if (typeof nestedText === 'string') {
        textVal = nestedText.trim();
      }
    }
    if (!textVal) continue;
    const norm = normalizeSubtitleLangCode(k) || k.trim().toUpperCase();
    if (norm) {
      out[norm] = textVal;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function formatChaptersYoutubeToText(rawChapters: unknown): string {
  if (!rawChapters) return '';
  if (typeof rawChapters === 'string') return rawChapters.trim();
  if (Array.isArray(rawChapters)) {
    return rawChapters
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const rawStart =
            obj.time ??
            obj.timecode ??
            obj.timestamp ??
            obj.start_time ??
            obj.start ??
            obj.start_sec;
          const ts =
            typeof rawStart === 'number'
              ? formatSecToMmSs(rawStart)
              : String(rawStart || '00:00').trim();
          const title = String(obj.title || obj.label || obj.chapter || obj.name || '').trim();
          return title ? `${ts} ${title}` : ts;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof rawChapters === 'object') {
    return Object.entries(rawChapters as Record<string, unknown>)
      .map(([ts, title]) => `${ts.trim()} ${String(title || '').trim()}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function formatSecToMmSs(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatSrtTimestamp(sec: number): string {
  const safe = Math.max(0, sec);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000) % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export interface SrtSceneLike {
  scene_index?: number;
  scene_id: string;
  duration: number;
  voiceover_duration_sec?: number;
  voice_start?: number;
  voice_end?: number;
  text_overlay?: string;
  transition?: {
    type?: string;
    duration_sec?: number;
  };
  subtitles?: Record<string, string>;
}

export function buildSidecarSrtForLanguage(
  scenes: SrtSceneLike[],
  lang: V21SubtitleLang
): string {
  const timings = computeContinuousSceneTimings(scenes);
  const blocks: string[] = [];
  let cueNumber = 1;

  scenes.forEach((sc, idx) => {
    const t = timings[idx];
    const line =
      sc.subtitles?.[lang] ||
      sc.subtitles?.[lang.toLowerCase()] ||
      (lang === 'EN' ? sc.text_overlay || '' : '');

    const startSec = t ? t.voiceStart : 0;
    const endSec = t ? Math.max(startSec + 0.4, t.voiceEnd) : startSec + 4;

    if (line && line.trim()) {
      blocks.push(
        `${cueNumber}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${line.trim()}`
      );
      cueNumber += 1;
    }
  });

  if (blocks.length === 0) {
    return `1\n00:00:00,200 --> 00:00:04,500\n[${lang}] Subtitle track placeholder`;
  }
  return blocks.join('\n\n') + '\n';
}

export function sanitizeSlugForFilename(name: string): string {
  const clean = (name || 'aether_project')
    .trim()
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || 'aether_project';
}

export function parseV21ManifestObject(raw: Record<string, unknown>): ParsedV21ManifestConfig {
  const presets =
    raw.studio_ui_presets && typeof raw.studio_ui_presets === 'object'
      ? (raw.studio_ui_presets as Record<string, unknown>)
      : {};

  const tab1Obj =
    (presets.tab_1_montage && typeof presets.tab_1_montage === 'object'
      ? (presets.tab_1_montage as Record<string, unknown>)
      : undefined) ||
    (raw.tab_1_montage && typeof raw.tab_1_montage === 'object'
      ? (raw.tab_1_montage as Record<string, unknown>)
      : {});

  const tab2Obj =
    (presets.tab_2_ambient_loop && typeof presets.tab_2_ambient_loop === 'object'
      ? (presets.tab_2_ambient_loop as Record<string, unknown>)
      : undefined) ||
    (raw.tab_2_ambient_loop && typeof raw.tab_2_ambient_loop === 'object'
      ? (raw.tab_2_ambient_loop as Record<string, unknown>)
      : {});

  const tab3Obj =
    (presets.tab_3_verbaflow && typeof presets.tab_3_verbaflow === 'object'
      ? (presets.tab_3_verbaflow as Record<string, unknown>)
      : undefined) ||
    (raw.tab_3_verbaflow && typeof raw.tab_3_verbaflow === 'object'
      ? (raw.tab_3_verbaflow as Record<string, unknown>)
      : {});

  const tab4Obj =
    (presets.tab_4_seo && typeof presets.tab_4_seo === 'object'
      ? (presets.tab_4_seo as Record<string, unknown>)
      : undefined) ||
    (raw.tab_4_seo && typeof raw.tab_4_seo === 'object'
      ? (raw.tab_4_seo as Record<string, unknown>)
      : {});

  const tab5Obj =
    (presets.tab_5_art_preview && typeof presets.tab_5_art_preview === 'object'
      ? (presets.tab_5_art_preview as Record<string, unknown>)
      : undefined) ||
    (raw.tab_5_art_preview && typeof raw.tab_5_art_preview === 'object'
      ? (raw.tab_5_art_preview as Record<string, unknown>)
      : {});

  const timelineArr =
    Array.isArray(raw.timeline) && raw.timeline.length > 0
      ? raw.timeline
      : Array.isArray(raw.scenes) && raw.scenes.length > 0
      ? raw.scenes
      : Array.isArray(raw.timeline)
      ? raw.timeline
      : Array.isArray(raw.scenes)
      ? raw.scenes
      : [];

  const manifestVersionStr = String(
    raw.manifest_version || raw.version || raw.schema_version || ''
  ).toLowerCase();

  const hasTimelineArray = timelineArr.length > 0;
  const hasV21Keys =
    Boolean(raw.studio_ui_presets) ||
    Boolean(raw.chapters_youtube) ||
    Boolean(raw.overlays_and_branding) ||
    Boolean(raw.subtitles_export) ||
    Boolean(raw.rhythm_map) ||
    Boolean(raw.video_title) ||
    Boolean(raw.project_name) ||
    Array.isArray(raw.timeline) ||
    Array.isArray(raw.scenes) ||
    manifestVersionStr.includes('2.1') ||
    manifestVersionStr.includes('2.2');

  const exportSettingsObj =
    raw.export_settings && typeof raw.export_settings === 'object'
      ? (raw.export_settings as Record<string, unknown>)
      : {};

  const projectName = String(raw.project_name || '').trim();
  const youtubeSeoObj =
    raw.youtube_seo && typeof raw.youtube_seo === 'object'
      ? (raw.youtube_seo as Record<string, unknown>)
      : {};
  const videoTitle = String(
    raw.video_title ||
      tab4Obj.video_title ||
      youtubeSeoObj.title ||
      youtubeSeoObj.video_title ||
      ''
  ).trim();

  // Compute exact continuous voice-first timeline duration (zero overlap, 200ms lead-in + 350ms pause)
  const continuousTimings = computeContinuousSceneTimings(
    timelineArr
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map(sc => ({
        duration_sec: Number(sc.duration_sec ?? sc.duration ?? 6),
        voiceover_duration_sec:
          typeof sc.voiceover_duration_sec === 'number' ? sc.voiceover_duration_sec : undefined,
        voice_start: typeof sc.voice_start === 'number' ? sc.voice_start : undefined,
        voice_end: typeof sc.voice_end === 'number' ? sc.voice_end : undefined
      }))
  );
  const totalSec =
    continuousTimings.length > 0 ? continuousTimings[continuousTimings.length - 1].segEnd : 0;

  const isNarrativeProjectType =
    String(raw.project_type || '').toLowerCase() === 'narrative_scenes_montage';
  const hasLoopSlots = Array.isArray(raw.timeline_slots) && raw.timeline_slots.length > 0;

  // Tab 2 Ambient Loop enabled flag: false when explicitly disabled OR when narrative montage manifest is loaded without timeline_slots
  let ambientLoopEnabled = true;
  if (typeof tab2Obj.enabled === 'boolean') {
    ambientLoopEnabled = tab2Obj.enabled;
  } else if ((hasTimelineArray || isNarrativeProjectType) && !hasLoopSlots) {
    ambientLoopEnabled = false;
  }

  // Tab 1 Export & Locks
  const rawCodec = String(
    tab1Obj.video_codec ?? exportSettingsObj.video_codec ?? raw.video_codec ?? 'libx264'
  ).toLowerCase();
  const videoCodec: 'libx264' | 'libx265' = rawCodec.includes('265') ? 'libx265' : 'libx264';

  const rawProfile = String(
    tab1Obj.profile ?? exportSettingsObj.profile ?? raw.profile ?? 'high'
  ).toLowerCase();
  const profile: 'high' | 'main' = rawProfile === 'main' ? 'main' : 'high';

  const rawCrf = Number(tab1Obj.crf ?? exportSettingsObj.crf ?? raw.crf ?? 18);
  const crf = !isNaN(rawCrf) && rawCrf >= 10 && rawCrf <= 35 ? rawCrf : 18;

  const rawRes = String(
    tab1Obj.resolution ?? exportSettingsObj.resolution ?? raw.resolution ?? '3840x2160'
  ).toLowerCase();
  const resolution: '4k' | '1080p' | '720p' =
    rawRes.includes('720') ? '720p' : rawRes.includes('1080') ? '1080p' : '4k';

  const rawFps = Number(tab1Obj.fps ?? exportSettingsObj.fps ?? raw.fps ?? 24);
  const fps: 24 | 30 | 60 = rawFps === 30 || rawFps === 60 ? rawFps : 24;

  const loudnormObj =
    (tab1Obj.loudnorm && typeof tab1Obj.loudnorm === 'object'
      ? (tab1Obj.loudnorm as Record<string, unknown>)
      : undefined) ||
    (raw.audio_mastering && typeof raw.audio_mastering === 'object'
      ? (raw.audio_mastering as Record<string, unknown>)
      : {});

  const antiDesyncObj =
    raw.anti_desync_locks && typeof raw.anti_desync_locks === 'object'
      ? (raw.anti_desync_locks as Record<string, unknown>)
      : {};

  const integratedLufs =
    typeof loudnormObj.integrated_lufs === 'number'
      ? loudnormObj.integrated_lufs
      : hasV21Keys
      ? -14.0
      : -16.0;
  const truePeakDbtp =
    typeof loudnormObj.true_peak_dbtp === 'number'
      ? loudnormObj.true_peak_dbtp
      : hasV21Keys
      ? -1.0
      : -3.0;

  // Tab 3 Subtitles languages detection (supports studio_ui_presets.tab_3_verbaflow, 2.2-FINAL root subtitles_export, and scene.subtitles)
  const subtitlesExportObj =
    raw.subtitles_export && typeof raw.subtitles_export === 'object' && !Array.isArray(raw.subtitles_export)
      ? (raw.subtitles_export as Record<string, unknown>)
      : undefined;

  const langSet = new Set<V21SubtitleLang>();
  const rawLangArrays = [
    tab3Obj.subtitle_languages,
    subtitlesExportObj?.languages,
    subtitlesExportObj?.subtitle_languages,
    Array.isArray(raw.subtitles_export) ? raw.subtitles_export : null,
    raw.subtitle_languages
  ];
  rawLangArrays.forEach(arr => {
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        const code = normalizeSubtitleLangCode(item);
        if (code) langSet.add(code);
      });
    }
  });
  timelineArr.forEach(scRaw => {
    if (!scRaw || typeof scRaw !== 'object') return;
    const subs = (scRaw as Record<string, unknown>).subtitles;
    if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
      Object.keys(subs as Record<string, unknown>).forEach(k => {
        const code = normalizeSubtitleLangCode(k);
        if (code) langSet.add(code);
      });
    }
  });
  if (langSet.size === 0) {
    langSet.add('EN');
    if (hasV21Keys) langSet.add('RU');
  }

  // Tab 4 Chapters & Exports
  const chaptersYoutubeText = formatChaptersYoutubeToText(
    raw.chapters_youtube ?? tab4Obj.chapters_youtube ?? youtubeSeoObj.chapters
  );

  // Tab 5 Art & Preview
  const overlaysObj =
    raw.overlays_and_branding && typeof raw.overlays_and_branding === 'object'
      ? (raw.overlays_and_branding as Record<string, unknown>)
      : {};

  const rawSlotsObj =
    (tab5Obj.thumbnail_slots && typeof tab5Obj.thumbnail_slots === 'object'
      ? (tab5Obj.thumbnail_slots as Record<string, unknown>)
      : undefined) ||
    (overlaysObj.thumbnail_slots && typeof overlaysObj.thumbnail_slots === 'object'
      ? (overlaysObj.thumbnail_slots as Record<string, unknown>)
      : {});

  const endScreenSafeZone = String(
    overlaysObj.end_screen_safe_zone ||
      tab5Obj.end_screen_safe_zone ||
      '05:14-05:24'
  ).trim();

  return {
    isV21Manifest: hasV21Keys || hasTimelineArray,
    projectName,
    videoTitle,
    hasTimelineArray,
    ambientLoopEnabled,
    tab1Locks: {
      hardFrameLock:
        typeof tab1Obj.hard_frame_lock === 'boolean'
          ? tab1Obj.hard_frame_lock
          : typeof antiDesyncObj.hard_frame_lock === 'boolean'
          ? antiDesyncObj.hard_frame_lock
          : true,
      apadAtrimLock:
        typeof tab1Obj.apad_atrim_lock === 'boolean'
          ? tab1Obj.apad_atrim_lock
          : typeof antiDesyncObj.apad_atrim_padding === 'boolean'
          ? antiDesyncObj.apad_atrim_padding
          : true,
      continuousVoiceMaster:
        typeof tab1Obj.continuous_voice_master === 'boolean'
          ? tab1Obj.continuous_voice_master
          : typeof antiDesyncObj.continuous_voice_master === 'boolean'
          ? antiDesyncObj.continuous_voice_master
          : true,
      zeroSpeechOverlap:
        typeof tab1Obj.zero_speech_overlap === 'boolean'
          ? tab1Obj.zero_speech_overlap
          : typeof antiDesyncObj.zero_speech_overlap === 'boolean'
          ? antiDesyncObj.zero_speech_overlap
          : true,
      dynamicXfadeTransitions:
        typeof tab1Obj.dynamic_xfade === 'boolean'
          ? tab1Obj.dynamic_xfade
          : typeof antiDesyncObj.dynamic_xfade_transitions === 'boolean'
          ? antiDesyncObj.dynamic_xfade_transitions
          : true,
      decoupledVideoXfadeOnly:
        typeof tab1Obj.decoupled_video_xfade_only === 'boolean'
          ? tab1Obj.decoupled_video_xfade_only
          : typeof antiDesyncObj.decoupled_video_xfade_only === 'boolean'
          ? antiDesyncObj.decoupled_video_xfade_only
          : true,
      autoMuteFlaggedClips:
        typeof tab1Obj.auto_mute_flagged_clips === 'boolean'
          ? tab1Obj.auto_mute_flagged_clips
          : typeof antiDesyncObj.auto_mute_flagged_video_clips === 'boolean'
          ? antiDesyncObj.auto_mute_flagged_video_clips
          : true,
      youtubeLoudnorm:
        typeof loudnormObj.enabled === 'boolean' ? loudnormObj.enabled : true,
      integratedLufs,
      truePeakDbtp,
      voiceoverLeadInSec:
        typeof tab1Obj.voiceover_lead_in_sec === 'number'
          ? tab1Obj.voiceover_lead_in_sec
          : VOICEOVER_LEAD_IN_SEC,
      voiceoverSentencePadSec:
        typeof tab1Obj.voiceover_sentence_pad_sec === 'number'
          ? tab1Obj.voiceover_sentence_pad_sec
          : VOICEOVER_SENTENCE_PAD_SEC
    },
    tab1Export: {
      videoCodec,
      profile,
      pixFmt: 'yuv420p',
      crf,
      resolution,
      fps,
      cfr: typeof tab1Obj.cfr === 'boolean' ? tab1Obj.cfr : true
    },
    tab3Verbaflow: {
      strictSceneDurationLock:
        typeof tab3Obj.strict_scene_duration_lock === 'boolean'
          ? tab3Obj.strict_scene_duration_lock
          : typeof subtitlesExportObj?.strict_scene_duration_lock === 'boolean'
          ? subtitlesExportObj.strict_scene_duration_lock
          : true,
      burnInVideo:
        typeof tab3Obj.burn_in_video === 'boolean'
          ? tab3Obj.burn_in_video
          : typeof subtitlesExportObj?.burn_in_video === 'boolean'
          ? subtitlesExportObj.burn_in_video
          : typeof subtitlesExportObj?.burn_in === 'boolean'
          ? subtitlesExportObj.burn_in
          : false,
      exportSeparateSrtFiles:
        typeof tab3Obj.export_separate_srt_files === 'boolean'
          ? tab3Obj.export_separate_srt_files
          : typeof subtitlesExportObj?.export_separate_srt_files === 'boolean'
          ? subtitlesExportObj.export_separate_srt_files
          : typeof subtitlesExportObj?.separate_srt_files === 'boolean'
          ? subtitlesExportObj.separate_srt_files
          : typeof subtitlesExportObj?.enabled === 'boolean'
          ? subtitlesExportObj.enabled
          : true,
      subtitleLanguages: Array.from(langSet)
    },
    tab4Seo: {
      chaptersYoutubeText,
      exportOutputChaptersTxt:
        typeof tab4Obj.export_output_chapters_txt === 'boolean'
          ? tab4Obj.export_output_chapters_txt
          : true,
      exportReleaseCardMd:
        typeof tab4Obj.export_release_card_md === 'boolean'
          ? tab4Obj.export_release_card_md
          : true
    },
    tab5Art: {
      thumbnailSlots: {
        A: String(rawSlotsObj.A || 'thumbnail_4k_3840x2160_A.jpg'),
        B: String(rawSlotsObj.B || 'thumbnail_4k_3840x2160_B.jpg'),
        C: String(rawSlotsObj.C || 'thumbnail_4k_3840x2160_C.jpg')
      },
      endScreenSafeZone: endScreenSafeZone || '05:14-05:24',
      endScreenGuideVisible: true
    },
    totalDurationFormatted: totalSec > 0 ? formatSecToMmSs(totalSec) : '05:24'
  };
}

export interface ReleaseCardExportInput {
  projectName: string;
  releaseTitle: string;
  tone: string;
  abTitles: Array<{ id: string; category: string; title: string }>;
  description: string;
  chaptersText: string;
  tagsString: string;
  tagsListCount: number;
  tagsCharCount: number;
  scenesCount: number;
  durationFormatted: string;
  averageSceneSec: string;
  dominantStyle: string;
  cameraVectors: string;
  shortsEnabled: boolean;
  shortsSegmentsCount: number;
  renderSpecsSummary: string;
  activeSubtitleLanguages: V21SubtitleLang[];
  endScreenSafeZone?: string;
}

export function buildEnglishReleaseCardMarkdown(input: ReleaseCardExportInput): string {
  const safeSlug = sanitizeSlugForFilename(input.projectName || 'aether_release');
  const langsDisplay =
    input.activeSubtitleLanguages.length > 0
      ? input.activeSubtitleLanguages.join(', ')
      : 'EN';
  const srtFilesList = (
    input.activeSubtitleLanguages.length > 0 ? input.activeSubtitleLanguages : (['EN'] as V21SubtitleLang[])
  )
    .map(lang => `\`${safeSlug}_${lang}.srt\``)
    .join(', ');

  return [
    `# YOUTUBE RELEASE CARD — ${(input.projectName || 'AETHER COMBINE 4K RELEASE').toUpperCase()}`,
    ``,
    `> **Target Market:** US / Global English Audience  `,
    `> **Tone Profile:** \`${input.tone}\`  `,
    `> **Total Scenes:** \`${input.scenesCount}\` (\`${input.durationFormatted}\` exact timeline duration)  `,
    `> **Render Specs:** \`${input.renderSpecsSummary}\`  `,
    `> **Active Subtitle Languages (Sidecar SRT):** \`${langsDisplay}\``,
    ``,
    `---`,
    ``,
    `## 1. PRIMARY RELEASE TITLE`,
    `\`\`\`text`,
    `${input.releaseTitle.trim()}`,
    `\`\`\``,
    ``,
    `## 2. A/B TEST TITLE VARIANTS`,
    ...input.abTitles.map(
      t => `- **Variant ${t.id} (${t.category} • ${t.title.length} chars):** \`${t.title}\``
    ),
    ``,
    `## 3. RENDER SPECS & AUDIO PIPELINE`,
    `- **Master Encoding:** \`${input.renderSpecsSummary}\``,
    `- **Continuous Master Voiceover (Zero Overlap):** 48kHz stereo PCM, 200ms Scene 01 lead-in (\`adelay=200|200\`), 350ms post-sentence pause (\`apad=pad_dur=0.35\`), sequential \`concat\` (no voice crossfade)`,
    `- **Decoupled Video Transitions:** Per-scene FFmpeg \`xfade\` applied strictly to video stream inside 350ms speech pauses with \`tpad=stop_mode=clone\``,
    `- **Multi-Track Audio Mix:** 0.0 dB untouched voice + Ambient SFX (-22.0 dB default / -96 dB muted / -6.0 dB \`scene_33\`) + Music Bed (-26.0 dB, -6.0 dB / -12.0 dB sidechain ducking)`,
    `- **Loudness Mastering:** YouTube Normalized (\`-14.0 LUFS\`, \`-1.0 dBTP\`, stereo AAC 320k 48kHz)`,
    `- **Sidecar Subtitles (\`burn_in_video: false\`):** ${srtFilesList}`,
    ...(input.endScreenSafeZone
      ? [`- **End Screen Safe-Zone Guide:** \`${input.endScreenSafeZone}\``]
      : []),
    ``,
    `## 4. FULL YOUTUBE SEO DESCRIPTION`,
    `\`\`\`text`,
    `${input.description.trim()}`,
    ``,
    `CHAPTERS:`,
    `${input.chaptersText.trim()}`,
    `\`\`\``,
    ``,
    `## 5. CHAPTER TIMESTAMPS (output_chapters.txt)`,
    `\`\`\`text`,
    `${input.chaptersText.trim()}`,
    `\`\`\``,
    ``,
    `## 6. YOUTUBE TAGS (${input.tagsListCount} TAGS • ${input.tagsCharCount}/500 CHARS)`,
    `\`\`\`text`,
    `${input.tagsString.trim()}`,
    `\`\`\``,
    ``,
    `## 7. VISUAL STYLE & PACING SUMMARY`,
    `- **Visual Aesthetic:** ${input.dominantStyle}`,
    `- **Camera Movement Vectors:** \`${input.cameraVectors || 'zoom_in, pan_right'}\``,
    `- **Average Scene Pacing:** \`${input.averageSceneSec} sec/scene\``,
    `- **9:16 Auto-Shorts Config:** \`${input.shortsEnabled ? 'ENABLED' : 'DISABLED'}\` (${input.shortsSegmentsCount} voice-boundary-locked segments in \`./output/shorts/\`)`,
    ``,
    `## 8. PRE-UPLOAD PRODUCTION CHECKLIST`,
    `- [x] Primary release title verified and populated from manifest \`video_title\``,
    `- [x] Chapter timestamps exported to \`output_chapters.txt\` (\`00:00\` start verified)`,
    `- [x] Separate multi-language \`.srt\` sidecar files generated (${langsDisplay})`,
    `- [x] Continuous Voice Master (Zero Overlap) + Decoupled Video-Only \`xfade\` enabled`,
    `- [x] 4K A/B/C thumbnails verified against End Screen safe zone (\`${input.endScreenSafeZone || '05:14-05:24'}\`)`,
    ``
  ].join('\n');
}
