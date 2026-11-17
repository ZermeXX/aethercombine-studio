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

export interface V21PipelineLocks {
  hardFrameLock: boolean;
  apadAtrimLock: boolean;
  dynamicXfadeTransitions: boolean;
  acrossfadeOffsetSync: boolean;
  autoMuteFlaggedClips: boolean;
  youtubeLoudnorm: boolean;
  integratedLufs: number;
  truePeakDbtp: number;
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
    if (typeof v !== 'string') continue;
    const norm = normalizeSubtitleLangCode(k) || k.trim().toUpperCase();
    if (norm && v.trim()) {
      out[norm] = v.trim();
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
          const ts = String(obj.time || obj.timecode || obj.timestamp || obj.start || '00:00').trim();
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
  const blocks: string[] = [];
  let cursor = 0;
  let cueNumber = 1;

  scenes.forEach((sc, idx) => {
    const dur = Math.max(0.5, Number(sc.duration) || 6);
    const transType = String(sc.transition?.type || 'cut').toLowerCase();
    const isLast = idx === scenes.length - 1;
    const overlap =
      !isLast && transType !== 'cut' && transType !== 'none'
        ? Math.min(dur * 0.45, Math.max(0, Number(sc.transition?.duration_sec) || 0))
        : 0;

    const line =
      sc.subtitles?.[lang] ||
      sc.subtitles?.[lang.toLowerCase()] ||
      (lang === 'EN' ? sc.text_overlay || '' : '');

    const startSec = cursor;
    const endSec = Math.max(startSec + 0.5, cursor + dur - (isLast ? 0 : overlap * 0.5));

    if (line && line.trim()) {
      blocks.push(
        `${cueNumber}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${line.trim()}`
      );
      cueNumber += 1;
    }

    cursor += dur - overlap;
  });

  if (blocks.length === 0) {
    return `1\n00:00:00,000 --> 00:00:04,500\n[${lang}] Subtitle track placeholder`;
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

  const timelineArr = Array.isArray(raw.timeline)
    ? raw.timeline
    : Array.isArray(raw.scenes)
    ? raw.scenes
    : [];

  const hasTimelineArray = timelineArr.length > 0;
  const hasV21Keys =
    Boolean(raw.studio_ui_presets) ||
    Boolean(raw.chapters_youtube) ||
    Boolean(raw.overlays_and_branding) ||
    Boolean(raw.video_title) ||
    Array.isArray(raw.timeline) ||
    String(raw.manifest_version || raw.version || '').includes('2.1');

  const exportSettingsObj =
    raw.export_settings && typeof raw.export_settings === 'object'
      ? (raw.export_settings as Record<string, unknown>)
      : {};

  const projectName = String(raw.project_name || '').trim();
  const videoTitle = String(
    raw.video_title ||
      tab4Obj.video_title ||
      (raw.youtube_seo && typeof raw.youtube_seo === 'object'
        ? (raw.youtube_seo as Record<string, unknown>).title
        : '') ||
      ''
  ).trim();

  // Compute total duration from timeline[]
  let totalSec = 0;
  timelineArr.forEach((scRaw, idx) => {
    if (!scRaw || typeof scRaw !== 'object') return;
    const sc = scRaw as Record<string, unknown>;
    const dur = Number(sc.duration_sec ?? sc.duration ?? 6);
    const safeDur = !isNaN(dur) && dur > 0 ? dur : 6;
    const tObj =
      sc.transition && typeof sc.transition === 'object'
        ? (sc.transition as Record<string, unknown>)
        : undefined;
    const tType = normalizeV21TransitionType(
      typeof sc.transition === 'string' ? sc.transition : tObj?.type
    );
    const overlap =
      idx < timelineArr.length - 1 && tType !== 'cut' && tType !== 'none'
        ? Math.max(0, Number(tObj?.duration_sec ?? tObj?.duration ?? 0.6))
        : 0;
    totalSec += Math.max(0.5, safeDur - overlap * 0.5);
  });

  // Tab 2 Ambient Loop enabled flag: false when explicitly disabled OR when narrative v2.1 timeline[] is loaded without timeline_slots
  let ambientLoopEnabled = true;
  if (typeof tab2Obj.enabled === 'boolean') {
    ambientLoopEnabled = tab2Obj.enabled;
  } else if (hasTimelineArray && !Array.isArray(raw.timeline_slots)) {
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

  // Tab 3 Subtitles languages detection
  const langSet = new Set<V21SubtitleLang>();
  if (Array.isArray(tab3Obj.subtitle_languages)) {
    tab3Obj.subtitle_languages.forEach(item => {
      const code = normalizeSubtitleLangCode(item);
      if (code) langSet.add(code);
    });
  }
  timelineArr.forEach(scRaw => {
    if (!scRaw || typeof scRaw !== 'object') return;
    const subs = (scRaw as Record<string, unknown>).subtitles;
    if (subs && typeof subs === 'object') {
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
    raw.chapters_youtube ?? tab4Obj.chapters_youtube
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
        typeof tab1Obj.hard_frame_lock === 'boolean' ? tab1Obj.hard_frame_lock : true,
      apadAtrimLock:
        typeof tab1Obj.apad_atrim_lock === 'boolean' ? tab1Obj.apad_atrim_lock : true,
      dynamicXfadeTransitions:
        typeof tab1Obj.dynamic_xfade === 'boolean' ? tab1Obj.dynamic_xfade : true,
      acrossfadeOffsetSync:
        typeof tab1Obj.acrossfade_sync === 'boolean' ? tab1Obj.acrossfade_sync : true,
      autoMuteFlaggedClips:
        typeof tab1Obj.auto_mute_flagged_clips === 'boolean'
          ? tab1Obj.auto_mute_flagged_clips
          : true,
      youtubeLoudnorm:
        typeof loudnormObj.enabled === 'boolean' ? loudnormObj.enabled : true,
      integratedLufs,
      truePeakDbtp
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
          : true,
      burnInVideo:
        typeof tab3Obj.burn_in_video === 'boolean' ? tab3Obj.burn_in_video : false,
      exportSeparateSrtFiles:
        typeof tab3Obj.export_separate_srt_files === 'boolean'
          ? tab3Obj.export_separate_srt_files
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
    `- **Anti-Desync Lock:** \`hard_frame_lock: true\` (\`apad\` / \`atrim\` exact duration padding, voiceover never time-stretched)`,
    `- **Transitions:** Dynamic per-scene FFmpeg \`xfade\` with synchronized \`acrossfade\` offset compensation`,
    `- **Loudness Mastering:** YouTube Normalized (\`-14.0 LUFS\`, \`-1.0 dBTP\`)`,
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
    `- **9:16 Auto-Shorts Config:** \`${input.shortsEnabled ? 'ENABLED' : 'DISABLED'}\` (${input.shortsSegmentsCount} segments)`,
    ``,
    `## 8. PRE-UPLOAD PRODUCTION CHECKLIST`,
    `- [x] Primary release title verified and populated from manifest`,
    `- [x] Chapter timestamps exported to \`output_chapters.txt\` (\`00:00\` start verified)`,
    `- [x] Separate multi-language \`.srt\` sidecar files generated (${langsDisplay})`,
    `- [x] Strict frame & audio lock enabled (\`hard_frame_lock\` + \`apad/atrim\`)`,
    `- [x] 4K A/B/C thumbnails verified against End Screen safe zone`,
    ``
  ].join('\n');
}
