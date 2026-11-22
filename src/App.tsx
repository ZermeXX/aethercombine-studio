/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Clapperboard,
  Repeat,
  Image as ImageIcon,
  Zap,
  Github,
  Film,
  FolderUp,
  Music,
  LayoutGrid,
  Play,
  Headphones,
  Infinity as InfinityIcon,
  Sparkles,
  RefreshCw,
  Download,
  Wand2,
  ExternalLink,
  X,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  AlertTriangle,
  ArrowRight,
  FileText,
  Sliders,
  CheckCircle2,
  CloudUpload,
  Subtitles,
  Mic,
  Package,
  Send,
  Flag,
  ListOrdered,
  Trash2,
  Clock,
  ChevronDown,
  RotateCcw,
  Terminal
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { initDriveAuth, getRestoredGoogleSession } from './googleDriveAuth';
import { sanitizeLogText } from './utils/logSanitizer';
import { GoogleDriveDirectUploader } from './components/GoogleDriveDirectUploader';
import {
  MontageCombineView,
  NarrativeSceneItem,
  ShortsExportManifestBlock,
  SubtitlesFlexibleConfig
} from './components/MontageCombineView';
import { VerbaFlowTextWorkbench } from './components/VerbaFlowTextWorkbench';
import { ThumbnailStudioView, ThumbnailFontStyleId } from './components/ThumbnailStudioView';
import { ImageArtEditorView, ArtEditorIncomingAsset } from './components/ImageArtEditorView';
import {
  AmbientShaderBackdrop,
  AmbientShaderMode,
  AMBIENT_SHADER_STORAGE_KEY,
  getInitialAmbientShaderMode
} from './components/AmbientShaderBackdrop';
import { YouTubeSeoView } from './components/YouTubeSeoView';
import {
  LiveTerminal,
  TerminalLogEntry,
  TerminalRunnerState,
  formatTerminalTime
} from './components/StudioTerminal';
import {
  YoutubeSeoState,
  YoutubeSeoManifestBlock,
  YOUTUBE_SEO_STORAGE_KEY,
  loadStoredYoutubeSeoState,
  toEnglishChapterTitle,
  buildEnglishYoutubeSeoBlock
} from './utils/englishExport';
import { V21SubtitleLang, parseV21ManifestObject } from './utils/manifestV21';
import { serializeCompactDispatchJson } from './utils/manifestDispatch';
import {
  AetherActiveRenderJob,
  AetherCombineDraftSlice,
  AetherWorkspaceDraft,
  clearActiveRenderJob,
  clearWorkspaceDraft,
  loadActiveRenderJob,
  loadGoogleAuthRecord,
  loadTelegramSession,
  loadWorkspaceDraft,
  saveActiveRenderJob,
  saveGoogleAuthPatch,
  saveTelegramSession,
  saveWorkspaceDraft
} from './utils/aetherPersistence';

type TabId = 'combine' | 'loop' | 'verbaflow' | 'seo' | 'thumb' | 'editor';
type StudioFormatPresetId = 'histoviva_doc' | 'ambient_loop_3h';

interface SceneItem {
  id: string;
  name: string;
  file?: File;
  url: string;
  type: 'video' | 'image' | 'script_block';
  duration: number;
  subtitle?: string;
}

export interface SlotInsertItem {
  insert_id: string;
  asset_id: string;
  file_name: string;
  filename?: string;
  timecode_label?: string;
  trigger_at_sec: number;
  duration_sec: number;
  transition_in: { type: 'dissolve' | 'fade'; duration_sec: number };
  transition_out: { type: 'dissolve' | 'fade' | 'none'; duration_sec: number };
  hold_until_end?: boolean;
  audio_soft_compressor?: boolean;
  max_peak_over_bed_db?: number;
}

export interface SlotTransitionOut {
  type: 'xfade' | 'fade' | 'dissolve' | 'none';
  duration_sec: number;
}

export interface TimelineSlot {
  slot_index: number;
  slot_id: string;
  act_title?: string;
  act_timecode?: string;
  title: string;
  asset_id: string;
  file_name: string;
  video_file?: string;
  voiceover_file?: string;
  assets?: { video_file?: string; voiceover_file?: string; [key: string]: unknown };
  base_content?: { file_name: string; [key: string]: unknown };
  start_sec?: number;
  end_sec?: number;
  source_clip_duration_sec: number;
  internal_loop_crossfade_sec: number;
  slot_duration_sec: number;
  inserts: SlotInsertItem[];
  slot_transition_out: SlotTransitionOut;
}

export interface ContinuousBedConfig {
  enabled: boolean;
  asset_id: string;
  file_name: string;
  loop_entire_duration?: boolean;
  acrossfade_sec: number;
  veo_native_audio: boolean;
  veo_audio_weight: number;
  bed_audio_weight: number;
}

export interface LoopMasterAudioConfig {
  enabled: boolean;
  file_name: string;
  start_timecode: string;
  weight: number;
}

export interface SeamlessAsymmetryConfig {
  enabled: boolean;
  random_interval: [number, number];
}

export interface AudioMasteringConfig {
  loudnorm_enabled: boolean;
  integrated_lufs: number;
  true_peak_dbtp: number;
  lra: number;
  e3_soft_attack_compressor: boolean;
  e3_max_peak_over_bed_db: number;
}

interface LoopBuildManifest {
  version: string;
  manifest_version?: string;
  enabled?: boolean;
  project_name: string;
  video_title?: string;
  chapters_youtube?: string;
  spec_profile: string;
  hours: number;
  calculated_project_duration_sec: number;
  resolution: '720p' | '1080p' | '2k' | '4k';
  video_codec: 'libx265' | 'libx264';
  fps: 24 | 30 | 60;
  audio_codec: 'aac';
  audio_bitrate_kbps: 320 | 256 | 192;
  native_audio_engine: string;
  bitrate_preset: 'standard' | 'cinema' | 'eco';
  crf: number;
  export_settings: {
    video_codec: 'libx264' | 'libx265';
    preset: 'ultrafast' | 'veryfast' | 'medium';
    draft_mode?: boolean;
    crf: number;
    resolution: '720p' | '1080p' | '2k' | '4k';
    fps: 24 | 30 | 60;
    audio_bitrate_kbps: 320 | 256 | 192;
    subtitles: SubtitlesFlexibleConfig;
  };
  subtitles: SubtitlesFlexibleConfig;
  subtitles_export?: {
    enabled: boolean;
    burn_in_video: boolean;
    export_separate_srt_files: boolean;
    strict_scene_duration_lock: boolean;
    languages: string[];
  };
  act_crossfade_sec: number;
  internal_clip_duration_sec: number;
  internal_loop_crossfade_sec: number;
  final_black_screen_enabled: boolean;
  final_black_screen_sec: number;
  audio_mastering: AudioMasteringConfig;
  seamless_asymmetry: SeamlessAsymmetryConfig;
  random_interval: [number, number];
  crossfade_loop: boolean;
  seamless_mode: 'crossfade' | 'pingpong';
  video_crossfade_sec: number;
  audio_crossfade_sec: number;
  use_embedded_audio: boolean;
  video_filename?: string;
  audio_filename?: string;
  gdrive_folder_id: string;
  cloud_export: { target_folder_id: string };
  continuous_bed: ContinuousBedConfig;
  master_audio: LoopMasterAudioConfig;
  shorts_factory?: { enabled: boolean; clip_duration_sec: number };
  youtube_seo?: YoutubeSeoManifestBlock;
  timeline_slots: TimelineSlot[];
}

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'info' | 'error' | 'success';
  action?: ToastAction;
}

interface SavedManifestPreset {
  id: string;
  name: string;
  savedAt: string;
  manifest: LoopBuildManifest;
}

interface QueuedManifestItem {
  id: string;
  projectName: string;
  codec: 'libx264' | 'libx265';
  crf: number;
  fps: number;
  resolution: '720p' | '1080p' | '2k' | '4k';
  hours: number;
  slotsCount: number;
  addedAt: string;
  manifest: LoopBuildManifest;
}

const MANIFEST_PRESETS_STORAGE_KEY = 'ac_manifest_presets_v1';
const BATCH_QUEUE_STORAGE_KEY = 'ac_batch_queue_v1';
const RENDER_REPO_WORKFLOW_URL =
  'https://github.com/ZermeXX/aetherflow-render/blob/main/.github/workflows/render_loop.yml';

const formatTimeHMS = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/** YouTube разрешает End Screen только в последние 5–20 секунд ролика. */
const computeEndScreenWindow = (durationSec: number): string => {
  if (!Number.isFinite(durationSec) || durationSec < 25) return '';
  const start = Math.max(0, durationSec - 20);
  const end = Math.max(start + 5, durationSec - 5);
  return `${formatTimeHMS(start)}-${formatTimeHMS(end)}`;
};

/** P1: собирает полный текст сценария из манифеста (full_script или поля сцен по порядку). */
const extractScriptTextFromManifest = (raw: Record<string, unknown>): string => {
  const direct = typeof raw.full_script === 'string' ? raw.full_script.trim() : '';
  if (direct) return direct;
  const lists = [raw.timeline, raw.scenes, raw.timeline_slots, raw.slots];
  const entries = lists.find((l): l is unknown[] => Array.isArray(l));
  if (!entries || entries.length === 0) return '';
  const parts: string[] = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const subs = (e.subtitles && typeof e.subtitles === 'object' ? e.subtitles : {}) as Record<
      string,
      unknown
    >;
    for (const c of [e.narration, e.script, e.text, e.voiceover_text, subs.ru, subs.en, e.text_overlay]) {
      if (typeof c === 'string' && c.trim()) parts.push(c.trim());
    }
  }
  return parts.join('\n\n').trim();
};

/** P1: главы из manifest.chapters_youtube либо из таймкодов сцен. */
const extractChaptersFromManifest = (raw: Record<string, unknown>): string => {
  const direct = typeof raw.chapters_youtube === 'string' ? raw.chapters_youtube.trim() : '';
  if (direct) return direct;
  const lists = [raw.timeline, raw.scenes, raw.timeline_slots, raw.slots];
  const entries = lists.find((l): l is unknown[] => Array.isArray(l));
  if (!entries || entries.length === 0) return '';
  const lines: string[] = [];
  let cursor = 0;
  entries.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const e = item as Record<string, unknown>;
    const dur = Number(e.duration_sec ?? e.duration ?? 0) || 0;
    const start = Number(e.voice_start_sec ?? e.start_sec ?? cursor);
    const label =
      (typeof e.title === 'string' && e.title.trim()) ||
      (typeof e.name === 'string' && e.name.trim()) ||
      `Scene ${idx + 1}`;
    const s = Math.max(0, Math.floor(start));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    lines.push(`${hh}:${mm}:${ss} ${label}`);
    cursor = start + dur;
  });
  return lines.join('\n');
};

const INITIAL_TIMELINE_SLOTS: TimelineSlot[] = [
  {
    slot_index: 1,
    slot_id: 'SLOT_01',
    act_title: 'Акт 1 (0:00–0:30)',
    act_timecode: '0:00:00 – 0:30:00',
    title: 'Акт 1 (0:00–0:30)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 0,
    end_sec: 1800,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1800,
    inserts: [],
    slot_transition_out: { type: 'xfade', duration_sec: 90.0 }
  },
  {
    slot_index: 2,
    slot_id: 'SLOT_02',
    act_title: 'Акт 2 (0:30–1:00)',
    act_timecode: '0:30:00 – 1:00:00',
    title: 'Акт 2 (0:30–1:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 1800,
    end_sec: 3690,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1890,
    inserts: [],
    slot_transition_out: { type: 'xfade', duration_sec: 90.0 }
  },
  {
    slot_index: 3,
    slot_id: 'SLOT_03',
    act_title: 'Акт 3 (1:00–1:40)',
    act_timecode: '1:00:00 – 1:40:00',
    title: 'Акт 3 (1:00–1:40)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 3600,
    end_sec: 6090,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 2490,
    inserts: [],
    slot_transition_out: { type: 'xfade', duration_sec: 90.0 }
  },
  {
    slot_index: 4,
    slot_id: 'SLOT_04',
    act_title: 'Акт 4 (1:40–2:00)',
    act_timecode: '1:40:00 – 2:00:00',
    title: 'Акт 4 (1:40–2:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 6000,
    end_sec: 7290,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1290,
    inserts: [],
    slot_transition_out: { type: 'xfade', duration_sec: 90.0 }
  },
  {
    slot_index: 5,
    slot_id: 'SLOT_05',
    act_title: 'Акт 5 (2:00–2:40)',
    act_timecode: '2:00:00 – 2:40:00',
    title: 'Акт 5 (2:00–2:40)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 7200,
    end_sec: 9690,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 2490,
    inserts: [],
    slot_transition_out: { type: 'xfade', duration_sec: 90.0 }
  },
  {
    slot_index: 6,
    slot_id: 'SLOT_06',
    act_title: 'Акт 6 (2:40–3:00)',
    act_timecode: '2:40:00 – 3:00:00',
    title: 'Акт 6 (2:40–3:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 9600,
    end_sec: 10890,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1290,
    inserts: [],
    slot_transition_out: { type: 'none', duration_sec: 0 }
  }
];

/**
 P0: старый инлайн-шаблон workflow удалён из клиента.
 Источник правды — репозиторий раннера.
*/
const WORKFLOW_LOOP_YAML = `# Актуальный workflow хранится ТОЛЬКО в репозитории раннера:
${RENDER_REPO_WORKFLOW_URL}
НЕ вставляйте сюда старые шаблоны из студии — они перезапишут P0-фиксы:
loop-baker, мосты актов 90с, санитайз секретов, stream-upload, guard пустых слотов.
Правьте файл напрямую в репозитории раннера.`;

const DEFAULT_SEO_SCRIPT_TEXT =
  'In the classified archives of the alpine station, a strange low-frequency hum was recorded. Within twenty-four hours, the entire facility was sealed under a fifty-year non-disclosure order. The official report blamed an avalanche, yet every instrument kept broadcasting for three weeks.';

const DEFAULT_VERBAFLOW_SOURCE_TEXT =
  'В 1974 году в архивах альпийской метеостанции нашли кассету с записью странного низкочастотного гула. Станцию закрыли за 24 часа, а персонал подписал неразглашение на 50 лет. Официальная версия гласила, что сошла лавина, но все приборы продолжали передавать сигнал еще три недели.';

const DEFAULT_RENDER_SPECS_SUMMARY =
  'libx264 / High / CRF 18 / yuv420p / 3840x2160 / 24fps CFR / -14.0 LUFS / -1.0 dBTP';

const DEFAULT_AUDIO_MASTERING: AudioMasteringConfig = {
  loudnorm_enabled: true,
  integrated_lufs: -16,
  true_peak_dbtp: -3,
  lra: 11,
  e3_soft_attack_compressor: true,
  e3_max_peak_over_bed_db: 6
};

const DEFAULT_CONTINUOUS_BED: ContinuousBedConfig = {
  enabled: false,
  asset_id: '',
  file_name: '',
  loop_entire_duration: true,
  acrossfade_sec: 1.0,
  veo_native_audio: true,
  veo_audio_weight: 0.85,
  bed_audio_weight: 0.55
};

const DEFAULT_LOOP_MASTER_AUDIO: LoopMasterAudioConfig = {
  enabled: false,
  file_name: '',
  start_timecode: '00:00:00',
  weight: 1.0
};

const DEFAULT_SEAMLESS_ASYMMETRY: SeamlessAsymmetryConfig = {
  enabled: true,
  random_interval: [1200, 2400]
};

export default function App() {
  const [bootSnapshot] = useState(() => {
    const googleAuth = loadGoogleAuthRecord();
    const restoredGoogleSession = getRestoredGoogleSession();
    const draft = loadWorkspaceDraft();
    const activeJob = loadActiveRenderJob();
    return { googleAuth, restoredGoogleSession, draft, activeJob };
  });
  const bootDraft = bootSnapshot.draft;
  const bootRunningJob =
    bootSnapshot.activeJob && bootSnapshot.activeJob.status === 'running'
      ? bootSnapshot.activeJob
      : null;

  const [workspaceResetKey, setWorkspaceResetKey] = useState<number>(0);
  const [initialCombineDraft, setInitialCombineDraft] = useState<AetherCombineDraftSlice | null>(
    () => bootDraft?.combine ?? null
  );
  const combineDraftSliceRef = useRef<AetherCombineDraftSlice | undefined>(
    bootDraft?.combine ?? undefined
  );
  const [combineDraftRev, setCombineDraftRev] = useState<number>(0);
  const [isResetProjectModalOpen, setIsResetProjectModalOpen] = useState<boolean>(false);
  const draftDebounceTimerRef = useRef<number | null>(null);
  const suppressNextDraftSaveRef = useRef<boolean>(false);

  const handleCombineDraftChange = useCallback((slice: AetherCombineDraftSlice) => {
    combineDraftSliceRef.current = slice;
    setCombineDraftRev(prev => prev + 1);
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>('combine');
  const [tabPulseKey, setTabPulseKey] = useState<number>(0);
  const handleSelectTab = (nextTab: TabId) => {
    setActiveTab(nextTab);
    setTabPulseKey(prev => prev + 1);
  };

  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [filmFormat, setFilmFormat] = useState<string>('16:9');
  const [filmResolution, setFilmResolution] = useState<string>('4k');
  const [transferredScript, setTransferredScript] = useState<string>('');
  const [externalNarrativeScenes, setExternalNarrativeScenes] = useState<NarrativeSceneItem[] | null>(
    null
  );
  const [activeNarrativeScenes, setActiveNarrativeScenes] = useState<NarrativeSceneItem[]>([]);
  const [externalMasterAudioFile, setExternalMasterAudioFile] = useState<{
    fileName: string;
    file?: File;
    durationSec?: number;
  } | null>(null);
  const [seoScriptText, setSeoScriptText] = useState<string>(
    () => bootDraft?.project?.seo_script_text ?? DEFAULT_SEO_SCRIPT_TEXT
  );
  const [verbaFlowChaptersTxt, setVerbaFlowChaptersTxt] = useState<string>(
    () => bootDraft?.project?.verbaflow_chapters_txt ?? ''
  );
  const [activeFormatPreset, setActiveFormatPreset] = useState<StudioFormatPresetId>(() =>
    bootDraft?.project?.active_format_preset === 'ambient_loop_3h'
      ? 'ambient_loop_3h'
      : 'histoviva_doc'
  );
  const [rhythmProfilePreset, setRhythmProfilePreset] = useState<
    'historical_storytelling' | 'ambient_meditative' | null
  >(null);
  const [shortsExportConfig, setShortsExportConfig] = useState<ShortsExportManifestBlock | undefined>(
    undefined
  );
  const [externalThumbFontStyle, setExternalThumbFontStyle] =
    useState<ThumbnailFontStyleId | null>(null);
  const [loopProjectName, setLoopProjectName] = useState<string>(
    () => bootDraft?.project?.name || 'HistoViva Documentary 4K'
  );
  const [ambientLoopEnabled, setAmbientLoopEnabled] = useState<boolean>(
    () => bootDraft?.project?.ambient_loop_enabled ?? true
  );
  const [externalV21Manifest, setExternalV21Manifest] = useState<{
    raw: Record<string, unknown>;
    fileName: string;
    nonce: number;
  } | null>(null);
  const [externalSceneSubtitleEdit, setExternalSceneSubtitleEdit] = useState<{
    sceneIndex: number;
    lang: string;
    text: string;
    nonce: number;
  } | null>(null);
  const [externalThumbSlotTitle, setExternalThumbSlotTitle] = useState<{
    slot: 'A' | 'B' | 'C';
    title: string;
    context?: string;
    nonce: number;
  } | null>(null);
  const [strictSceneDurationLock, setStrictSceneDurationLock] = useState<boolean>(
    () => bootDraft?.render_settings?.strict_scene_duration_lock ?? true
  );
  const [sidecarBurnInVideo, setSidecarBurnInVideo] = useState<boolean>(
    () => bootDraft?.render_settings?.sidecar_burn_in_video ?? false
  );
  const [exportSeparateSrtFiles, setExportSeparateSrtFiles] = useState<boolean>(
    () => bootDraft?.render_settings?.export_separate_srt_files ?? true
  );
  const [selectedSubtitleLanguages, setSelectedSubtitleLanguages] = useState<V21SubtitleLang[]>(
    () =>
      Array.isArray(bootDraft?.render_settings?.selected_subtitle_languages) &&
      bootDraft.render_settings.selected_subtitle_languages.length > 0
        ? (bootDraft.render_settings.selected_subtitle_languages as V21SubtitleLang[])
        : ['EN', 'RU']
  );
  const [renderSpecsSummary, setRenderSpecsSummary] = useState<string>(
    () => bootDraft?.render_settings?.render_specs_summary || DEFAULT_RENDER_SPECS_SUMMARY
  );
  const [exportOutputChaptersEnabled, setExportOutputChaptersEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.export_output_chapters_enabled ?? true
  );
  const [exportReleaseCardMdEnabled, setExportReleaseCardMdEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.export_release_card_md_enabled ?? true
  );
  const [manifestThumbnailSlots, setManifestThumbnailSlots] = useState<{
    A: string;
    B: string;
    C: string;
  }>({
    A: 'thumbnail_4k_3840x2160_A.jpg',
    B: 'thumbnail_4k_3840x2160_B.jpg',
    C: 'thumbnail_4k_3840x2160_C.jpg'
  });
  const [endScreenSafeZone, setEndScreenSafeZone] = useState<string>(
    () => bootDraft?.project?.end_screen_safe_zone || ''
  );
  const [manifestDurationBadge, setManifestDurationBadge] = useState<string>(
    () => bootDraft?.project?.manifest_duration_badge || ''
  );
  const [youtubeSeoState, setYoutubeSeoState] = useState<YoutubeSeoState>(() =>
    loadStoredYoutubeSeoState()
  );

  useEffect(() => {
    try {
      localStorage.setItem(YOUTUBE_SEO_STORAGE_KEY, JSON.stringify(youtubeSeoState));
    } catch {
      // ignore storage quota errors
    }
  }, [youtubeSeoState]);

  const exportYoutubeSeoBlock = useMemo(
    () => buildEnglishYoutubeSeoBlock(youtubeSeoState, loopProjectName),
    [youtubeSeoState, loopProjectName]
  );

  const [loopMedia, setLoopMedia] = useState<File | null>(null);
  const [loopAudio, setLoopAudio] = useState<File | null>(null);
  const [uploadedLoopAssets, setUploadedLoopAssets] = useState<Record<string, File>>({});
  const [timelineSlots, setTimelineSlots] = useState<TimelineSlot[]>(() =>
    Array.isArray(bootDraft?.render_settings?.timeline_slots) &&
    bootDraft.render_settings.timeline_slots.length > 0
      ? (bootDraft.render_settings.timeline_slots as TimelineSlot[])
      : INITIAL_TIMELINE_SLOTS
  );
  const [videoCodec, setVideoCodec] = useState<'libx265' | 'libx264'>(() =>
    bootDraft?.render_settings?.video_codec === 'libx265' ? 'libx265' : 'libx264'
  );
  const [videoCrf, setVideoCrf] = useState<number>(() => bootDraft?.render_settings?.video_crf ?? 20);
  const [videoFps, setVideoFps] = useState<24 | 30 | 60>(() =>
    bootDraft?.render_settings?.video_fps === 30 || bootDraft?.render_settings?.video_fps === 60
      ? bootDraft.render_settings.video_fps
      : 24
  );
  const [audioBitrateKbps, setAudioBitrateKbps] = useState<320 | 256 | 192>(() =>
    bootDraft?.render_settings?.audio_bitrate_kbps === 256 ||
    bootDraft?.render_settings?.audio_bitrate_kbps === 192
      ? bootDraft.render_settings.audio_bitrate_kbps
      : 320
  );
  const [actCrossfadeSec, setActCrossfadeSec] = useState<number>(
    () => bootDraft?.render_settings?.act_crossfade_sec ?? 90.0
  );
  const [internalLoopCrossfadeSec, setInternalLoopCrossfadeSec] = useState<number>(
    () => bootDraft?.render_settings?.internal_loop_crossfade_sec ?? 1.0
  );
  const [finalBlackScreenEnabled, setFinalBlackScreenEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.final_black_screen_enabled ?? true
  );
  const [finalBlackScreenSec, setFinalBlackScreenSec] = useState<number>(
    () => bootDraft?.render_settings?.final_black_screen_sec ?? 2.0
  );
  const [audioMastering, setAudioMastering] = useState<AudioMasteringConfig>(() => ({
    ...DEFAULT_AUDIO_MASTERING,
    ...((bootDraft?.render_settings?.audio_mastering as Partial<AudioMasteringConfig>) || {})
  }));
  const [continuousBed, setContinuousBed] = useState<ContinuousBedConfig>(() => ({
    ...DEFAULT_CONTINUOUS_BED,
    ...((bootDraft?.render_settings?.continuous_bed as Partial<ContinuousBedConfig>) || {})
  }));
  const [loopMasterAudio, setLoopMasterAudio] = useState<LoopMasterAudioConfig>(() => ({
    ...DEFAULT_LOOP_MASTER_AUDIO,
    ...((bootDraft?.render_settings?.loop_master_audio as Partial<LoopMasterAudioConfig>) || {})
  }));
  const [seamlessAsymmetry, setSeamlessAsymmetry] = useState<SeamlessAsymmetryConfig>(() => ({
    ...DEFAULT_SEAMLESS_ASYMMETRY,
    ...((bootDraft?.render_settings?.seamless_asymmetry as Partial<SeamlessAsymmetryConfig>) || {})
  }));
  const [loopHours, setLoopHours] = useState<number>(() => bootDraft?.render_settings?.loop_hours ?? 3);
  const [loopResolution, setLoopResolution] = useState<'720p' | '1080p' | '2k' | '4k'>(() =>
    bootDraft?.render_settings?.loop_resolution === '720p' ||
    bootDraft?.render_settings?.loop_resolution === '1080p' ||
    bootDraft?.render_settings?.loop_resolution === '2k' ||
    bootDraft?.render_settings?.loop_resolution === '4k'
      ? bootDraft.render_settings.loop_resolution
      : '4k'
  );
  const [loopDraftMode, setLoopDraftMode] = useState<boolean>(
    () => bootDraft?.render_settings?.loop_draft_mode ?? false
  );
  const [bitratePreset, setBitratePreset] = useState<'standard' | 'cinema' | 'eco'>(() =>
    bootDraft?.render_settings?.bitrate_preset === 'standard' ||
    bootDraft?.render_settings?.bitrate_preset === 'eco'
      ? bootDraft.render_settings.bitrate_preset
      : 'cinema'
  );
  const [seamlessTransitionMode, setSeamlessTransitionMode] = useState<'crossfade' | 'pingpong'>(
    () => (bootDraft?.render_settings?.seamless_transition_mode === 'pingpong' ? 'pingpong' : 'crossfade')
  );
  const [seamlessStitchEnabled, setSeamlessStitchEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.seamless_stitch_enabled ?? true
  );
  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(
    () => bootDraft?.render_settings?.crossfade_duration ?? 1.0
  );
  const [audioCrossfadeDuration, setAudioCrossfadeDuration] = useState<number>(
    () => bootDraft?.render_settings?.audio_crossfade_duration ?? 90.0
  );
  const [audioCrossfadeEnabled, setAudioCrossfadeEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.audio_crossfade_enabled ?? true
  );
  const [useEmbeddedAudio, setUseEmbeddedAudio] = useState<boolean>(
    () => bootDraft?.render_settings?.use_embedded_audio ?? true
  );
  const [expectedVideoFilename, setExpectedVideoFilename] = useState<string>(
    () => bootDraft?.render_settings?.expected_video_filename ?? ''
  );
  const [expectedAudioFilename, setExpectedAudioFilename] = useState<string>(
    () => bootDraft?.render_settings?.expected_audio_filename ?? ''
  );
  const [importedManifestName, setImportedManifestName] = useState<string>('');
  const [showFilterComplexPreview, setShowFilterComplexPreview] = useState<boolean>(true);
  const [isLoopDispatching, setIsLoopDispatching] = useState<boolean>(false);
  const [savedManifestPresets, setSavedManifestPresets] = useState<SavedManifestPreset[]>(() => {
    try {
      const raw = localStorage.getItem(MANIFEST_PRESETS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SavedManifestPreset[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(MANIFEST_PRESETS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) && parsed[0]?.id ? String(parsed[0].id) : '';
    } catch {
      return '';
    }
  });
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [selectedScrubberInsert, setSelectedScrubberInsert] = useState<{
    slotIdx: number;
    insIdx: number;
  } | null>(null);
  const [batchQueue, setBatchQueue] = useState<QueuedManifestItem[]>(() => {
    try {
      const raw = localStorage.getItem(BATCH_QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueuedManifestItem[]) : [];
    } catch {
      return [];
    }
  });

  const lastDispatchWasPreflightRef = useRef<boolean>(false);
  const queueAutoConsumedRunRef = useRef<string | number | null>(null);
  const dispatchLoopWorkflowRef = useRef<
    | ((
        preflightOnly: boolean,
        overrideManifest?: LoopBuildManifest,
        options?: { bypassActiveGuard?: boolean }
      ) => Promise<void>)
    | null
  >(null);

  const [loopBurnInSubtitles, setLoopBurnInSubtitles] = useState<boolean>(
    () => bootDraft?.render_settings?.loop_burn_in_subtitles ?? false
  );
  const [loopUploadSrtToDrive, setLoopUploadSrtToDrive] = useState<boolean>(
    () => bootDraft?.render_settings?.loop_upload_srt_to_drive ?? true
  );
  const [loopSubtitleLanguage, setLoopSubtitleLanguage] = useState<
    'en' | 'ru' | 'es' | 'de' | 'fr' | 'original'
  >(() => bootDraft?.render_settings?.loop_subtitle_language ?? 'en');
  const [loopSrtCustomContent, setLoopSrtCustomContent] = useState<string>(
    () => bootDraft?.render_settings?.loop_srt_custom_content ?? ''
  );
  const [shortsFactoryEnabled, setShortsFactoryEnabled] = useState<boolean>(
    () => bootDraft?.render_settings?.shorts_factory_enabled ?? false
  );
  const [showLoopAdvancedAccordion, setShowLoopAdvancedAccordion] = useState<boolean>(false);
  const [thumbImg, setThumbImg] = useState<HTMLImageElement | null>(null);
  const [thumbTitle, setThumbTitle] = useState<string>(
    () => bootDraft?.project?.thumb_title || 'SEALED ARCHIVE'
  );
  const [thumbBadge, setThumbBadge] = useState<string>(
    () => bootDraft?.project?.thumb_badge || '4k_ultra_hd,documentary,lost_archives'
  );
  const [artEditorIncomingAsset, setArtEditorIncomingAsset] =
    useState<ArtEditorIncomingAsset | null>(null);
  const [editorEditedCoverAUrl, setEditorEditedCoverAUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ambientShaderMode, setAmbientShaderMode] = useState<AmbientShaderMode>(() =>
    getInitialAmbientShaderMode()
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      try {
        const stored = window.localStorage.getItem(AMBIENT_SHADER_STORAGE_KEY);
        if (!stored) {
          setAmbientShaderMode(e.matches ? 'eco' : 'live');
        }
      } catch {
        setAmbientShaderMode(e.matches ? 'eco' : 'live');
      }
    };
    mediaQuery.addEventListener('change', handleMotionChange);
    return () => mediaQuery.removeEventListener('change', handleMotionChange);
  }, []);

  const toggleAmbientShaderMode = () => {
    setAmbientShaderMode(prev => {
      const next: AmbientShaderMode = prev === 'live' ? 'eco' : 'live';
      try {
        window.localStorage.setItem(AMBIENT_SHADER_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      showToast(
        next === 'live'
          ? '✨ Включён «Живой фон» (24fps Ambient Scroll Shader)'
          : '⚡ Включён «Экономный режим» — фоновый шейдер остановлен (0% GPU)',
        'info'
      );
      return next;
    });
  };

  const applyStudioFormatPreset = (presetId: StudioFormatPresetId) => {
    setActiveFormatPreset(presetId);
    if (presetId === 'histoviva_doc') {
      handleSelectTab('combine');
      setRhythmProfilePreset('historical_storytelling');
      setExternalThumbFontStyle('medieval_serif');
      setThumbBadge('4k_ultra_hd,documentary,lost_archives');
      setYoutubeSeoState(prev => ({ ...prev, tone: 'Historical Doc' }));
      showToast(
        '🏛️ Активирован пресет «HistoViva • Документальный (~10 мин)»: профиль Historical Storytelling (2.5–8 сек), стили Живопись / Графический роман и документальные бейджи обложки!',
        'success'
      );
    } else {
      handleSelectTab('loop');
      setRhythmProfilePreset('ambient_meditative');
      setLoopHours(3);
      setActCrossfadeSec(1.8);
      setInternalLoopCrossfadeSec(1.8);
      setExternalThumbFontStyle('gold_ice_magic');
      setThumbBadge('3_hours,no_ads_seamless,deep_sleep');
      setYoutubeSeoState(prev => ({ ...prev, tone: 'Cozy Ambient' }));
      showToast(
        '🌙 Активирован пресет «Ambient Loop • 3 Часа (Атмосфера)»: медитативный профиль (10–18 сек, кроссфейды 1.8 сек), шрифт Gold & Ice Magic и бейджи 3 HOURS • NO ADS • SEAMLESS • DEEP SLEEP!',
        'success'
      );
    }
  };

  const [sourceText, setSourceText] = useState<string>(
    () => bootDraft?.verbaflow?.source_text ?? DEFAULT_VERBAFLOW_SOURCE_TEXT
  );
  const [ghToken, setGhToken] = useState<string>(() => bootSnapshot.googleAuth.github_token || '');
  const [ghRepo, setGhRepo] = useState<string>(
    () => bootSnapshot.googleAuth.repo || 'ZermeXX/aetherflow-render'
  );
  const [ghBranch, setGhBranch] = useState<string>(() => bootSnapshot.googleAuth.branch || 'main');
  const [gdriveFolderId, setGdriveFolderId] = useState<string>(
    () => bootSnapshot.googleAuth.drive_folder_id || '1OuuxKa85KAR-zz9TFXv6Ccg99fZ6JpuK'
  );
  const [telegramBotToken, setTelegramBotToken] = useState<string>(
    () => loadTelegramSession().bot_token
  );
  const [telegramChatId, setTelegramChatId] = useState<string>(() => loadTelegramSession().chat_id);

  useEffect(() => {
    saveGoogleAuthPatch({
      github_token: ghToken,
      repo: ghRepo,
      branch: ghBranch,
      drive_folder_id: gdriveFolderId
    });
  }, [ghToken, ghRepo, ghBranch, gdriveFolderId]);

  useEffect(() => {
    if (suppressNextDraftSaveRef.current) {
      suppressNextDraftSaveRef.current = false;
      return;
    }
    if (draftDebounceTimerRef.current !== null) {
      window.clearTimeout(draftDebounceTimerRef.current);
    }
    draftDebounceTimerRef.current = window.setTimeout(() => {
      const draftPayload: AetherWorkspaceDraft = {
        version: 1,
        updated_at: Date.now(),
        project: {
          name: loopProjectName,
          active_format_preset: activeFormatPreset,
          thumb_title: thumbTitle,
          thumb_badge: thumbBadge,
          seo_script_text: seoScriptText,
          verbaflow_chapters_txt: verbaFlowChaptersTxt,
          ambient_loop_enabled: ambientLoopEnabled,
          end_screen_safe_zone: endScreenSafeZone,
          manifest_duration_badge: manifestDurationBadge
        },
        verbaflow: {
          source_text: sourceText
        },
        combine: combineDraftSliceRef.current,
        render_settings: {
          timeline_slots: timelineSlots,
          video_codec: videoCodec,
          video_crf: videoCrf,
          video_fps: videoFps,
          audio_bitrate_kbps: audioBitrateKbps,
          act_crossfade_sec: actCrossfadeSec,
          internal_loop_crossfade_sec: internalLoopCrossfadeSec,
          final_black_screen_enabled: finalBlackScreenEnabled,
          final_black_screen_sec: finalBlackScreenSec,
          audio_mastering: audioMastering as unknown as Record<string, unknown>,
          continuous_bed: continuousBed as unknown as Record<string, unknown>,
          loop_master_audio: loopMasterAudio as unknown as Record<string, unknown>,
          seamless_asymmetry: seamlessAsymmetry as unknown as Record<string, unknown>,
          loop_hours: loopHours,
          loop_resolution: loopResolution,
          loop_draft_mode: loopDraftMode,
          bitrate_preset: bitratePreset,
          seamless_transition_mode: seamlessTransitionMode,
          seamless_stitch_enabled: seamlessStitchEnabled,
          crossfade_duration: crossfadeDuration,
          audio_crossfade_duration: audioCrossfadeDuration,
          audio_crossfade_enabled: audioCrossfadeEnabled,
          use_embedded_audio: useEmbeddedAudio,
          expected_video_filename: expectedVideoFilename,
          expected_audio_filename: expectedAudioFilename,
          loop_burn_in_subtitles: loopBurnInSubtitles,
          loop_upload_srt_to_drive: loopUploadSrtToDrive,
          loop_subtitle_language: loopSubtitleLanguage,
          loop_srt_custom_content: loopSrtCustomContent,
          shorts_factory_enabled: shortsFactoryEnabled,
          strict_scene_duration_lock: strictSceneDurationLock,
          sidecar_burn_in_video: sidecarBurnInVideo,
          export_separate_srt_files: exportSeparateSrtFiles,
          selected_subtitle_languages: selectedSubtitleLanguages,
          render_specs_summary: renderSpecsSummary,
          export_output_chapters_enabled: exportOutputChaptersEnabled,
          export_release_card_md_enabled: exportReleaseCardMdEnabled
        }
      };
      saveWorkspaceDraft(draftPayload);
      draftDebounceTimerRef.current = null;
    }, 400);
    return () => {
      if (draftDebounceTimerRef.current !== null) {
        window.clearTimeout(draftDebounceTimerRef.current);
      }
    };
  }, [
    loopProjectName,
    activeFormatPreset,
    thumbTitle,
    thumbBadge,
    seoScriptText,
    verbaFlowChaptersTxt,
    ambientLoopEnabled,
    endScreenSafeZone,
    manifestDurationBadge,
    sourceText,
    combineDraftRev,
    timelineSlots,
    videoCodec,
    videoCrf,
    videoFps,
    audioBitrateKbps,
    actCrossfadeSec,
    internalLoopCrossfadeSec,
    finalBlackScreenEnabled,
    finalBlackScreenSec,
    audioMastering,
    continuousBed,
    loopMasterAudio,
    seamlessAsymmetry,
    loopHours,
    loopResolution,
    loopDraftMode,
    bitratePreset,
    seamlessTransitionMode,
    seamlessStitchEnabled,
    crossfadeDuration,
    audioCrossfadeDuration,
    audioCrossfadeEnabled,
    useEmbeddedAudio,
    expectedVideoFilename,
    expectedAudioFilename,
    loopBurnInSubtitles,
    loopUploadSrtToDrive,
    loopSubtitleLanguage,
    loopSrtCustomContent,
    shortsFactoryEnabled,
    strictSceneDurationLock,
    sidecarBurnInVideo,
    exportSeparateSrtFiles,
    selectedSubtitleLanguages,
    renderSpecsSummary,
    exportOutputChaptersEnabled,
    exportReleaseCardMdEnabled
  ]);

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [showYamlPreview, setShowYamlPreview] = useState<boolean>(false);
  const [modalToken, setModalToken] = useState<string>('');
  const [modalRepo, setModalRepo] = useState<string>('');
  const [modalBranch, setModalBranch] = useState<string>('main');
  const [modalGdriveFolderId, setModalGdriveFolderId] = useState<string>('');
  const [modalTelegramBotToken, setModalTelegramBotToken] = useState<string>('');
  const [modalTelegramChatId, setModalTelegramChatId] = useState<string>('');
  const [driveUser, setDriveUser] = useState<User | null>(
    () => bootSnapshot.restoredGoogleSession?.user ?? null
  );
  const [driveToken, setDriveToken] = useState<string | null>(
    () => bootSnapshot.restoredGoogleSession?.accessToken ?? null
  );

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveToken(token);
      },
      () => {
        setDriveUser(null);
        setDriveToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const bootElapsedSeconds = bootRunningJob
    ? Math.max(0, Math.floor((Date.now() - bootRunningJob.started_at) / 1000))
    : 0;
  const [isRenderLogPanelOpen, setIsRenderLogPanelOpen] = useState<boolean>(() =>
    Boolean(bootRunningJob)
  );
  const [renderStatus, setRenderStatus] = useState<{
    visible: boolean;
    status: 'idle' | 'running' | 'success' | 'failure';
    runnerPhase?: 'queued' | 'running';
    title: string;
    desc: string;
    stepLabel: string;
    seconds: number;
    runUrl: string;
    runId?: number;
  }>(() =>
    bootRunningJob
      ? {
          visible: true,
          status: 'running',
          runnerPhase: 'running',
          title:
            bootRunningJob.title ||
            `Сборка «${bootRunningJob.project_name}» выполняется в GitHub Actions...`,
          desc:
            bootRunningJob.desc ||
            `Workflow: ${bootRunningJob.workflow} • Ветка: ${bootRunningJob.branch} • Репозиторий: ${bootRunningJob.repo}`,
          stepLabel:
            bootRunningJob.step_label || 'Шаг: Возобновление опроса GitHub Actions (каждые 5с)...',
          seconds: bootElapsedSeconds,
          runUrl:
            bootRunningJob.run_url ||
            (bootRunningJob.run_id
              ? `https://github.com/${bootRunningJob.repo}/actions/runs/${bootRunningJob.run_id}`
              : `https://github.com/${bootRunningJob.repo}/actions`),
          runId: bootRunningJob.run_id ?? undefined
        }
      : {
          visible: false,
          status: 'idle',
          runnerPhase: undefined,
          title: 'Облачный рендер запущен...',
          desc: 'GitHub Actions FFmpeg выполняет компиляцию кадров',
          stepLabel: 'Шаг: Скачивание клипов из Google Drive...',
          seconds: 0,
          runUrl: 'https://github.com/ZermeXX/aetherflow-render/actions'
        }
  );
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogEntry[]>(() => {
    if (!bootRunningJob) return [];
    return [
      ...bootRunningJob.logs,
      {
        id: `${Date.now()}-resumed`,
        text: `[${formatTerminalTime(bootElapsedSeconds)}] 🔄 Сессия восстановлена после перезагрузки — опрос GitHub Actions возобновлён (каждые 5с)...`,
        level: 'info'
      }
    ];
  });
  const seenStepsRef = useRef<Record<string, string>>(
    (() => {
      const seeded: Record<string, string> = {};
      if (bootRunningJob?.logs) {
        for (const entry of bootRunningJob.logs) {
          const inProg = entry.text.match(/⚙️ Выполняется шаг:\s*(.+?)...$/);
          if (inProg) seeded[`name:${inProg[1].trim()}`] = 'in_progress';
          const okMatch = entry.text.match(/✅ Шаг\s+(.+?)\s+завершён успешно.$/);
          if (okMatch) seeded[`name:${okMatch[1].trim()}`] = 'completed_success';
          const failMatch = entry.text.match(/❌ Сбой на шаге:\s*(.+?)!$/);
          if (failMatch) seeded[`name:${failMatch[1].trim()}`] = 'completed_failure';
        }
      }
      return seeded;
    })()
  );
  const secondsRef = useRef<number>(bootElapsedSeconds);
  const dispatchTimeRef = useRef<number>(bootRunningJob?.started_at ?? 0);
  const activeRunIdRef = useRef<number | null>(bootRunningJob?.run_id ?? null);
  const resumedFromStorageRef = useRef<boolean>(Boolean(bootRunningJob));
  const activeRenderMetaRef = useRef<{
    repo: string;
    workflow: string;
    branch: string;
    started_at: number;
    project_name: string;
  } | null>(
    bootRunningJob
      ? {
          repo: bootRunningJob.repo,
          workflow: bootRunningJob.workflow,
          branch: bootRunningJob.branch,
          started_at: bootRunningJob.started_at,
          project_name: bootRunningJob.project_name
        }
      : null
  );

  const appendTerminalLog = useCallback(
    (text: string, level: TerminalLogEntry['level'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      setTerminalLogs(prev => [...prev, { id, text: sanitizeLogText(text), level }]);
    },
    []
  );

  const clearTerminalLogs = useCallback(() => {
    setTerminalLogs([]);
    if (renderStatus.status !== 'running') {
      activeRenderMetaRef.current = null;
      clearActiveRenderJob();
    }
  }, [renderStatus.status]);

  useEffect(() => {
    const meta = activeRenderMetaRef.current;
    if (!meta) return;
    if (
      renderStatus.status !== 'running' &&
      renderStatus.status !== 'success' &&
      renderStatus.status !== 'failure'
    ) {
      return;
    }
    const jobRecord: AetherActiveRenderJob = {
      status: renderStatus.status,
      repo: meta.repo,
      workflow: meta.workflow,
      branch: meta.branch,
      started_at: meta.started_at,
      run_id: activeRunIdRef.current ?? renderStatus.runId ?? null,
      project_name: meta.project_name,
      logs: terminalLogs,
      title: renderStatus.title,
      desc: renderStatus.desc,
      step_label: renderStatus.stepLabel,
      run_url: renderStatus.runUrl
    };
    saveActiveRenderJob(jobRecord);
  }, [
    renderStatus.status,
    renderStatus.runId,
    renderStatus.title,
    renderStatus.desc,
    renderStatus.stepLabel,
    renderStatus.runUrl,
    terminalLogs
  ]);

  const terminalRunnerStatus: TerminalRunnerState =
    renderStatus.status === 'running'
      ? renderStatus.runnerPhase === 'queued'
        ? 'queued'
        : 'running'
      : renderStatus.status === 'success'
        ? 'success'
        : renderStatus.status === 'failure'
          ? 'failed'
          : 'idle';
  const isRunnerActive = terminalRunnerStatus === 'running' || terminalRunnerStatus === 'queued';

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const scenesInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const manifestInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback(
    (text: string, type: 'info' | 'error' | 'success' = 'info', action?: ToastAction) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts(prev => [...prev.slice(-2), { id, text: sanitizeLogText(text), type, action }]);
      window.setTimeout(
        () => {
          setToasts(prev => prev.filter(t => t.id !== id));
        },
        action ? 9000 : 2500
      );
    },
    []
  );

  const playRenderSuccessChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const playTone = (freq: number, startTime: number, duration: number, peakGain: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
      };
      playTone(523.25, now, 0.35, 0.16);
      playTone(659.25, now, 0.35, 0.12);
      playTone(783.99, now + 0.16, 0.55, 0.18);
      playTone(1046.5, now + 0.16, 0.65, 0.14);
    } catch {
      // Игнорируем блокировку автовоспроизведения браузером
    }
  }, []);

  const triggerBrowserRenderNotification = useCallback(() => {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification('Рендер завершен', {
          body: 'Видео успешно выгружено в вашу папку Google Drive'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification('Рендер завершен', {
              body: 'Видео успешно выгружено в вашу папку Google Drive'
            });
          }
        });
      }
    } catch {
      // Игнорируем ограничения iframe/браузера для Notification
    }
  }, []);

  const sendTelegramRenderAlert = useCallback(
    async (statusType: 'success' | 'error', messageDetails: string, runUrl?: string) => {
      const botToken = telegramBotToken.trim();
      const chatId = telegramChatId.trim();
      if (!botToken || !chatId) return;
      try {
        const icon = statusType === 'success' ? '✅' : '❌';
        const text =
          `${icon} *AetherCombine 4K Cloud Render*\n` +
          `${messageDetails}\n` +
          `📁 Google Drive Folder: \`${gdriveFolderId || 'not set'}\`\n` +
          (runUrl ? `🔗 [GitHub Actions Run](${runUrl})` : '');
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });
      } catch {
        // Игнорируем сетевые ошибки Telegram API
      }
    },
    [telegramBotToken, telegramChatId, gdriveFolderId]
  );

  const mapGitHubStepToRussian = useCallback((rawStepName?: string, stepIdx?: number): string => {
    if (!rawStepName) {
      return 'Шаг: Скачивание клипов из Google Drive...';
    }
    const lower = rawStepName.toLowerCase();
    if (
      lower.includes('upload') ||
      lower.includes('выгруз') ||
      (lower.includes('rclone') && (stepIdx ?? 0) > 4)
    ) {
      return 'Шаг: Выгрузка готового 4K мастера в Google Drive...';
    }
    if (
      lower.includes('ffmpeg') ||
      lower.includes('render') ||
      lower.includes('autonomous') ||
      lower.includes('loop') ||
      lower.includes('сборк') ||
      lower.includes('таймлайн')
    ) {
      return 'Шаг: Рендеринг и сборка таймлайна в FFmpeg...';
    }
    if (
      lower.includes('download') ||
      lower.includes('release') ||
      lower.includes('asset') ||
      lower.includes('checkout') ||
      lower.includes('python') ||
      lower.includes('install') ||
      lower.includes('rclone') ||
      lower.includes('drive') ||
      lower.includes('скачив')
    ) {
      return 'Шаг: Скачивание клипов из Google Drive...';
    }
    return `Шаг: ${rawStepName}...`;
  }, []);

  useEffect(() => {
    if (!renderStatus.visible || renderStatus.status !== 'running') return;
    const timer = setInterval(() => {
      setRenderStatus(prev => {
        const nextSec = prev.seconds + 1;
        secondsRef.current = nextSec;
        return { ...prev, seconds: nextSec };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [renderStatus.visible, renderStatus.status]);

  const cancelActiveRenderRun = useCallback(async () => {
    const githubToken = ghToken.trim();
    if (!githubToken) {
      showToast('Укажите GitHub Personal Access Token для отмены сборки!', 'error');
      return;
    }
    let activeRunId = activeRunIdRef.current || renderStatus.runId;
    const cancelTargetRepo = (
      activeRenderMetaRef.current?.repo ||
      ghRepo ||
      'ZermeXX/aetherflow-render'
    ).trim();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    try {
      if (!activeRunId) {
        const runsRes = await fetch(
          `https://api.github.com/repos/${cancelTargetRepo}/actions/runs?event=workflow_dispatch&per_page=5`,
          { headers }
        );
        if (runsRes.ok) {
          const runsData = (await runsRes.json()) as {
            workflow_runs?: Array<{ id: number; status: string }>;
          };
          const running = (runsData.workflow_runs || []).find(
            r => r.status === 'in_progress' || r.status === 'queued'
          );
          if (running) {
            activeRunId = running.id;
            activeRunIdRef.current = running.id;
          }
        }
      }
      if (!activeRunId) {
        showToast('Активный run_id еще не зарегистрирован на стороне GitHub Actions', 'info');
        return;
      }
      await fetch(
        `https://api.github.com/repos/${cancelTargetRepo}/actions/runs/${activeRunId}/cancel`,
        { method: 'POST', headers }
      );
      appendTerminalLog('[ПРЕРВАНО]: Запрос на отмену отправлен в GitHub Actions.', 'error');
      setRenderStatus(prev => ({
        ...prev,
        status: 'failure',
        title: '⏹ Сборка отменена пользователем',
        stepLabel: '[ПРЕРВАНО]: Запрос на отмену отправлен в GitHub Actions.'
      }));
      showToast('Запрос на отмену отправлен в GitHub Actions', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendTerminalLog(`[ПРЕРВАНО]: Запрос на отмену отправлен в GitHub Actions (${msg}).`, 'error');
    }
  }, [ghToken, ghRepo, renderStatus.runId, appendTerminalLog, showToast]);

  useEffect(() => {
    if (!renderStatus.visible || renderStatus.status !== 'running') return;
    const targetRepo = (
      activeRenderMetaRef.current?.repo ||
      ghRepo ||
      'ZermeXX/aetherflow-render'
    ).trim();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken.trim()}`;
    }
    let isCancelled = false;
    type GhWorkflowRun = {
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
    };
    const pollGitHubActions = async () => {
      try {
        const startTime = dispatchTimeRef.current;
        let latestRun: GhWorkflowRun | undefined;
        if (activeRunIdRef.current !== null) {
          const directRes = await fetch(
            `https://api.github.com/repos/${targetRepo}/actions/runs/${activeRunIdRef.current}`,
            { headers }
          );
          if (directRes.ok && !isCancelled) {
            latestRun = (await directRes.json()) as GhWorkflowRun;
          }
        }
        if (!latestRun) {
          const runsRes = await fetch(
            `https://api.github.com/repos/${targetRepo}/actions/runs?event=workflow_dispatch&per_page=5`,
            { headers }
          );
          if (!runsRes.ok || isCancelled) return;
          const runsData = (await runsRes.json()) as { workflow_runs?: GhWorkflowRun[] };
          const rawRuns = runsData.workflow_runs || [];
          if (rawRuns.length === 0 || isCancelled) return;
          const candidateRuns = rawRuns.filter(run => {
            if (activeRunIdRef.current !== null && run.id === activeRunIdRef.current) {
              return true;
            }
            const runCreatedTime = new Date(run.created_at).getTime();
            const isCancelledOrCompleted =
              run.status === 'cancelled' ||
              run.status === 'completed' ||
              run.conclusion === 'cancelled';
            if (isCancelledOrCompleted && runCreatedTime < startTime) {
              return false;
            }
            if (run.status === 'queued' || run.status === 'in_progress') {
              return true;
            }
            return runCreatedTime >= startTime;
          });
          latestRun =
            activeRunIdRef.current !== null
              ? candidateRuns.find(r => r.id === activeRunIdRef.current) || candidateRuns[0]
              : candidateRuns[0];
        }
        if (!latestRun || isCancelled) return;
        if (activeRunIdRef.current === null) {
          activeRunIdRef.current = latestRun.id;
        }
        const runId = latestRun.id;
        const runUrl = latestRun.html_url || `https://github.com/${targetRepo}/actions`;
        const jobsRes = await fetch(
          `https://api.github.com/repos/${targetRepo}/actions/runs/${runId}/jobs`,
          { headers }
        );
        let activeStepText = 'Шаг: Скачивание клипов из Google Drive...';
        let failedStepName = '';
        let jobId: number | undefined;
        if (jobsRes.ok) {
          const jobsData = (await jobsRes.json()) as {
            jobs?: Array<{
              id?: number;
              steps?: Array<{
                name: string;
                status: string;
                conclusion: string | null;
                number?: number;
              }>;
            }>;
          };
          const primaryJob = jobsData.jobs?.[0];
          jobId = primaryJob?.id;
          const steps = primaryJob?.steps || [];
          steps.forEach(step => {
            const stepKey = `${runId}-${step.number ?? step.name}`;
            const nameKey = `name:${step.name.trim()}`;
            const prevRecorded = seenStepsRef.current[stepKey] || seenStepsRef.current[nameKey];
            const timeStr = formatTerminalTime(secondsRef.current);
            if (step.status === 'in_progress' && !prevRecorded) {
              seenStepsRef.current[stepKey] = 'in_progress';
              seenStepsRef.current[nameKey] = 'in_progress';
              appendTerminalLog(`[${timeStr}] ⚙️ Выполняется шаг: ${step.name}...`, 'step');
            } else if (step.status === 'completed') {
              if (step.conclusion === 'success' && prevRecorded !== 'completed_success') {
                seenStepsRef.current[stepKey] = 'completed_success';
                seenStepsRef.current[nameKey] = 'completed_success';
                appendTerminalLog(`[${timeStr}] ✅ Шаг ${step.name} завершён успешно.`, 'success');
              } else if (step.conclusion === 'failure' && prevRecorded !== 'completed_failure') {
                seenStepsRef.current[stepKey] = 'completed_failure';
                seenStepsRef.current[nameKey] = 'completed_failure';
                appendTerminalLog(`[${timeStr}] ❌ Сбой на шаге: ${step.name}!`, 'error');
              }
            }
          });
          const inProgressStep = steps.find(s => s.status === 'in_progress');
          const failedStep = steps.find(s => s.conclusion === 'failure');
          if (inProgressStep) {
            activeStepText = mapGitHubStepToRussian(inProgressStep.name, inProgressStep.number);
          } else if (steps.length > 0) {
            const completedCount = steps.filter(s => s.status === 'completed').length;
            if (completedCount >= steps.length - 1) {
              activeStepText = 'Шаг: Выгрузка готового 4K мастера в Google Drive...';
            } else if (completedCount >= 3) {
              activeStepText = 'Шаг: Рендеринг и сборка таймлайна в FFmpeg...';
            }
          }
          if (failedStep) {
            failedStepName = failedStep.name;
          }
        }
        if (isCancelled) return;
        if (latestRun.status === 'completed') {
          const finalTimeStr = formatTerminalTime(secondsRef.current);
          if (latestRun.conclusion === 'success') {
            appendTerminalLog(
              `[${finalTimeStr}] 🎉 Рендер и выгрузка мастера в Google Drive завершены успешно!`,
              'success'
            );
            setRenderStatus(prev => ({
              ...prev,
              status: 'success',
              runId,
              runUrl,
              title: '✅ Готово! 4K мастер успешно собран и выгружен на Google Drive',
              stepLabel: 'Шаг: Выгрузка готового 4K мастера в Google Drive завершена (100%)'
            }));
            playRenderSuccessChime();
            triggerBrowserRenderNotification();
            void sendTelegramRenderAlert(
              'success',
              `Рендер успешно завершён за ${finalTimeStr}! Видео и субтитры выгружены на Google Диск.`,
              runUrl
            );
            showToast('✅ Готово! 4K мастер успешно собран и выгружен на Google Drive', 'success');
            if (jobId) {
              try {
                const jobLogRes = await fetch(
                  `https://api.github.com/repos/${targetRepo}/actions/jobs/${jobId}/logs`,
                  { headers }
                );
                if (jobLogRes.ok && !isCancelled) {
                  const fullLogText = await jobLogRes.text();
                  if (fullLogText && fullLogText.trim()) {
                    const logLines = fullLogText.split(/\r?\n/).filter(Boolean);
                    const tailLines =
                      logLines.length > 350 ? logLines.slice(logLines.length - 350) : logLines;
                    setTerminalLogs(prev => [
                      ...prev,
                      {
                        id: `${Date.now()}-log-header`,
                        text: `\n--- 📄 ПОЛНЫЙ ОТЧЕТ ЗАДАЧИ GITHUB ACTIONS / FFMPEG (job_id: ${jobId}) ---`,
                        level: 'info'
                      },
                      ...tailLines.map((line, idx) => ({
                        id: `${Date.now()}-raw-${idx}`,
                        text: sanitizeLogText(line),
                        level: 'raw' as const
                      }))
                    ]);
                  }
                }
              } catch {
                // Если CORS или токен не разрешают редирект логов, не прерываем успешный статус
              }
            }
          } else {
            appendTerminalLog(
              `[${finalTimeStr}] ❌ Сборка прервана с ошибкой. Проверьте детали в логе выше.`,
              'error'
            );
            const errStepInfo = failedStepName
              ? `на шаге «${failedStepName}»`
              : `(статус: ${latestRun.conclusion || 'failure'})`;
            setRenderStatus(prev => ({
              ...prev,
              status: 'failure',
              runId,
              runUrl,
              title: `❌ Сбой облачной сборки ${errStepInfo}`,
              stepLabel: failedStepName
                ? `Ошибка на шаге: ${failedStepName}`
                : 'Шаг завершился с ошибкой выполнения в GitHub Actions'
            }));
            void sendTelegramRenderAlert(
              'error',
              `Сбой облачной сборки ${errStepInfo} (${finalTimeStr}).`,
              runUrl
            );
            showToast(`Ошибка рендера в GitHub Actions ${errStepInfo}`, 'error');
            if (jobId) {
              try {
                const jobLogRes = await fetch(
                  `https://api.github.com/repos/${targetRepo}/actions/jobs/${jobId}/logs`,
                  { headers }
                );
                if (jobLogRes.ok && !isCancelled) {
                  const fullLogText = await jobLogRes.text();
                  if (fullLogText && fullLogText.trim()) {
                    const logLines = fullLogText.split(/\r?\n/).filter(Boolean);
                    const tailLines =
                      logLines.length > 350 ? logLines.slice(logLines.length - 350) : logLines;
                    setTerminalLogs(prev => [
                      ...prev,
                      {
                        id: `${Date.now()}-err-log-header`,
                        text: `\n--- 📄 ПОЛНЫЙ ОТЧЕТ ОШИБКИ ЗАДАЧИ GITHUB ACTIONS / FFMPEG (job_id: ${jobId}) ---`,
                        level: 'error'
                      },
                      ...tailLines.map((line, idx) => ({
                        id: `${Date.now()}-err-raw-${idx}`,
                        text: sanitizeLogText(line),
                        level: 'raw' as const
                      }))
                    ]);
                  }
                }
              } catch {
                // Игнорируем ошибку CORS при чтении текстового лога
              }
            }
          }
        } else {
          setRenderStatus(prev => ({
            ...prev,
            status: 'running',
            runnerPhase: latestRun.status === 'queued' ? 'queued' : 'running',
            runId,
            runUrl,
            stepLabel: activeStepText
          }));
        }
      } catch {
        // Сетевые задержки при опросе не прерывают таймер
      }
    };
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPollingWithDelay = async () => {
      const initialDelayMs = resumedFromStorageRef.current ? 0 : 4500;
      resumedFromStorageRef.current = false;
      if (initialDelayMs > 0) {
        await new Promise(r => setTimeout(r, initialDelayMs));
      }
      if (isCancelled) return;
      await pollGitHubActions();
      if (isCancelled) return;
      interval = setInterval(pollGitHubActions, 5000);
    };
    void startPollingWithDelay();
    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [
    renderStatus.visible,
    renderStatus.status,
    ghRepo,
    ghToken,
    mapGitHubStepToRussian,
    playRenderSuccessChime,
    triggerBrowserRenderNotification,
    sendTelegramRenderAlert,
    showToast,
    appendTerminalLog
  ]);

  useEffect(() => {
    if (
      renderStatus.status !== 'success' ||
      lastDispatchWasPreflightRef.current ||
      batchQueue.length === 0
    ) {
      return;
    }
    const completedKey =
      renderStatus.runId ?? `success-${renderStatus.seconds}-${renderStatus.runUrl}`;
    if (queueAutoConsumedRunRef.current === completedKey) {
      return;
    }
    queueAutoConsumedRunRef.current = completedKey;
    const [nextItem, ...restQueue] = batchQueue;
    if (!nextItem) return;
    const timer = setTimeout(() => {
      setBatchQueue(restQueue);
      localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, JSON.stringify(restQueue));
      appendTerminalLog(
        `[QUEUE] 🚀 Текущий run завершён (completed/success). Авто-запуск следующего манифеста из очереди: «${nextItem.projectName}» (осталось в очереди: ${restQueue.length})...`,
        'step'
      );
      showToast(
        `Очередь сборок: авто-запуск «${nextItem.projectName}» (${restQueue.length} осталось)`,
        'info'
      );
      if (dispatchLoopWorkflowRef.current) {
        void dispatchLoopWorkflowRef.current(false, nextItem.manifest, { bypassActiveGuard: true });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    renderStatus.status,
    renderStatus.runId,
    renderStatus.seconds,
    renderStatus.runUrl,
    batchQueue,
    appendTerminalLog,
    showToast
  ]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };
  const totalDurationSec = scenes.reduce((acc, sc) => acc + sc.duration, 0);
  const charCount = sourceText.length;
  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;

  const estimateLoopSizeGb = useCallback(() => {
    const base4kGbPerHour =
      videoCodec === 'libx264'
        ? 8.2
        : bitratePreset === 'cinema'
          ? 11.8
          : bitratePreset === 'standard'
            ? 6.4
            : 3.8;
    const resMultiplier =
      loopResolution === '4k'
        ? 1.0
        : loopResolution === '2k'
          ? 0.48
          : loopResolution === '1080p'
            ? 0.24
            : 0.11;
    const rawGb = loopHours * base4kGbPerHour * resMultiplier;
    return Math.round(rawGb * 10) / 10;
  }, [loopHours, loopResolution, bitratePreset, videoCodec]);

  const getScaleFilter = (res: '720p' | '1080p' | '2k' | '4k') =>
    res === '4k'
      ? 'scale=3840:2160'
      : res === '2k'
        ? 'scale=2560:1440'
        : res === '1080p'
          ? 'scale=1920:1080'
          : 'scale=1280:720';
  const getResolutionLabel = (res: '720p' | '1080p' | '2k' | '4k') =>
    res === '4k' ? '4K' : res === '2k' ? '2K' : res === '1080p' ? '1080p' : 'Draft 720p';
  const getPresetShortLabel = (preset: 'standard' | 'cinema' | 'eco') =>
    preset === 'cinema' ? 'Master Cinema' : preset === 'standard' ? 'YouTube Standard' : 'Эконом';

  const handleSceneFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    const files: File[] = Array.from(fileList);
    const newScenes: SceneItem[] = files.map((file: File) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'image',
      duration: 6
    }));
    setScenes(prev => [...prev, ...newScenes]);
    e.target.value = '';
  };

  const removeScene = (index: number) => {
    setScenes(prev => {
      const target = prev[index];
      if (target && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const clearScenes = () => {
    scenes.forEach(sc => {
      if (sc.url.startsWith('blob:')) URL.revokeObjectURL(sc.url);
    });
    setScenes([]);
    setTransferredScript('');
  };

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const openConfigModal = () => {
    setModalToken(ghToken);
    setModalRepo(ghRepo);
    setModalBranch(ghBranch || 'main');
    setModalGdriveFolderId(gdriveFolderId);
    setModalTelegramBotToken(telegramBotToken);
    setModalTelegramChatId(telegramChatId);
    setIsConfigOpen(true);
  };

  const closeConfigModal = () => {
    setIsConfigOpen(false);
  };

  const saveGitHubConfig = () => {
    const trimmedToken = modalToken.trim();
    const trimmedRepo = modalRepo.trim();
    const trimmedBranch = modalBranch.trim() || 'main';
    const trimmedFolder = modalGdriveFolderId.trim();
    const trimmedTgToken = modalTelegramBotToken.trim();
    const trimmedTgChat = modalTelegramChatId.trim();
    setGhToken(trimmedToken);
    setGhRepo(trimmedRepo);
    setGhBranch(trimmedBranch);
    setGdriveFolderId(trimmedFolder);
    setTelegramBotToken(trimmedTgToken);
    setTelegramChatId(trimmedTgChat);
    // P0: секреты (PAT / Telegram) — только sessionStorage через persistence-модуль.
    localStorage.setItem('ac_gh_repo', trimmedRepo);
    localStorage.setItem('ac_gh_branch', trimmedBranch);
    localStorage.setItem('ac_gdrive_folder_id', trimmedFolder);
    saveTelegramSession({ bot_token: trimmedTgToken, chat_id: trimmedTgChat });
    saveGoogleAuthPatch({
      github_token: trimmedToken,
      repo: trimmedRepo,
      branch: trimmedBranch,
      drive_folder_id: trimmedFolder
    });
    closeConfigModal();
    showToast('Конфигурация GitHub Actions, Google Drive и Telegram сохранена', 'success');
  };

  const confirmResetWorkspaceProject = () => {
    if (draftDebounceTimerRef.current !== null) {
      window.clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    suppressNextDraftSaveRef.current = true;
    clearWorkspaceDraft();
    combineDraftSliceRef.current = undefined;
    setInitialCombineDraft(null);
    setLoopProjectName('HistoViva Documentary 4K');
    setActiveFormatPreset('histoviva_doc');
    setThumbTitle('SEALED ARCHIVE');
    setThumbBadge('4k_ultra_hd,documentary,lost_archives');
    setSeoScriptText(DEFAULT_SEO_SCRIPT_TEXT);
    setVerbaFlowChaptersTxt('');
    setSourceText(DEFAULT_VERBAFLOW_SOURCE_TEXT);
    setAmbientLoopEnabled(true);
    setEndScreenSafeZone('');
    setManifestDurationBadge('');
    setTimelineSlots(INITIAL_TIMELINE_SLOTS);
    setVideoCodec('libx264');
    setVideoCrf(20);
    setVideoFps(24);
    setAudioBitrateKbps(320);
    setActCrossfadeSec(90.0);
    setInternalLoopCrossfadeSec(1.0);
    setFinalBlackScreenEnabled(true);
    setFinalBlackScreenSec(2.0);
    setAudioMastering({ ...DEFAULT_AUDIO_MASTERING });
    setContinuousBed({ ...DEFAULT_CONTINUOUS_BED });
    setLoopMasterAudio({ ...DEFAULT_LOOP_MASTER_AUDIO });
    setSeamlessAsymmetry({ ...DEFAULT_SEAMLESS_ASYMMETRY });
    setLoopHours(3);
    setLoopResolution('4k');
    setLoopDraftMode(false);
    setBitratePreset('cinema');
    setSeamlessTransitionMode('crossfade');
    setSeamlessStitchEnabled(true);
    setCrossfadeDuration(1.0);
    setAudioCrossfadeDuration(90.0);
    setAudioCrossfadeEnabled(true);
    setUseEmbeddedAudio(true);
    setExpectedVideoFilename('');
    setExpectedAudioFilename('');
    setImportedManifestName('');
    setLoopBurnInSubtitles(false);
    setLoopUploadSrtToDrive(true);
    setLoopSubtitleLanguage('en');
    setLoopSrtCustomContent('');
    setShortsFactoryEnabled(false);
    setStrictSceneDurationLock(true);
    setSidecarBurnInVideo(false);
    setExportSeparateSrtFiles(true);
    setSelectedSubtitleLanguages(['EN', 'RU']);
    setRenderSpecsSummary(DEFAULT_RENDER_SPECS_SUMMARY);
    setExportOutputChaptersEnabled(true);
    setExportReleaseCardMdEnabled(true);
    setWorkspaceResetKey(prev => prev + 1);
    setIsResetProjectModalOpen(false);
    showToast('Проект и черновик сброшены к настройкам по умолчанию', 'success');
  };

  const copyWorkflowTemplate = () => {
    window.open(RENDER_REPO_WORKFLOW_URL, '_blank', 'noopener');
    showToast('Открыт актуальный render_loop.yml в репозитории раннера', 'info');
  };

  const showStatusBar = (
    title: string,
    desc: string,
    repo: string,
    customDispatchTime?: number,
    meta?: { workflow?: string; branch?: string; projectName?: string }
  ) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    const cleanRepo = (repo || 'ZermeXX/aetherflow-render').trim();
    const startedAt = customDispatchTime || new Date().getTime();
    const resolvedWorkflow = meta?.workflow || 'render_scenes.yml';
    const resolvedBranch = (meta?.branch || ghBranch || 'main').trim();
    const resolvedProjectName = meta?.projectName || loopProjectName || 'Aether Combine Project';
    dispatchTimeRef.current = startedAt;
    activeRunIdRef.current = null;
    secondsRef.current = 0;
    seenStepsRef.current = {};
    resumedFromStorageRef.current = false;
    activeRenderMetaRef.current = {
      repo: cleanRepo,
      workflow: resolvedWorkflow,
      branch: resolvedBranch,
      started_at: startedAt,
      project_name: resolvedProjectName
    };
    const initialLogs: TerminalLogEntry[] = [
      {
        id: `${Date.now()}-init`,
        text: `[00:00] 🚀 Инициализация dispatch в репозиторий ${cleanRepo}...`,
        level: 'info'
      }
    ];
    const initialRunUrl = `https://github.com/${cleanRepo}/actions`;
    const initialStepLabel = 'Шаг: Очередь и скачивание клипов из Google Drive...';
    saveActiveRenderJob({
      status: 'running',
      repo: cleanRepo,
      workflow: resolvedWorkflow,
      branch: resolvedBranch,
      started_at: startedAt,
      run_id: null,
      project_name: resolvedProjectName,
      logs: initialLogs,
      title,
      desc,
      step_label: initialStepLabel,
      run_url: initialRunUrl
    });
    setIsRenderLogPanelOpen(true);
    setTerminalLogs(initialLogs);
    setRenderStatus({
      visible: true,
      status: 'running',
      runnerPhase: 'queued',
      title,
      desc,
      stepLabel: initialStepLabel,
      seconds: 0,
      runUrl: initialRunUrl
    });
  };

  const calculatedProjectDurationSec = timelineSlots.reduce((acc, slot, idx) => {
    const isLast = idx === timelineSlots.length - 1;
    const overlap =
      !isLast && slot.slot_transition_out.type !== 'none'
        ? Math.max(0, Number(slot.slot_transition_out.duration_sec) || 0)
        : 0;
    return acc + Math.max(1, Number(slot.slot_duration_sec) || 0) - overlap;
  }, 0);
  const totalInsertsCount = timelineSlots.reduce(
    (acc, slot) => acc + (Array.isArray(slot.inserts) ? slot.inserts.length : 0),
    0
  );
  const effectiveEndScreenSafeZone =
    endScreenSafeZone.trim() || computeEndScreenWindow(calculatedProjectDurationSec);
  const emptySlotNumbers = timelineSlots
    .map((s, i) => ((s.file_name || s.base_content?.file_name || '').trim() ? null : i + 1))
    .filter((n): n is number => n !== null);
  const canDispatchLoop = emptySlotNumbers.length === 0;

  const isAssetMatched = useCallback(
    (fileName?: string, assetId?: string): boolean => {
      const fn = (fileName || '').trim().toLowerCase();
      const aid = (assetId || '').trim().toLowerCase();
      if (!fn && !aid) return false;
      if (
        loopMedia &&
        ((fn && loopMedia.name.toLowerCase() === fn) ||
          (aid && loopMedia.name.toLowerCase().includes(aid)))
      ) {
        return true;
      }
      if (
        loopAudio &&
        ((fn && loopAudio.name.toLowerCase() === fn) ||
          (aid && loopAudio.name.toLowerCase().includes(aid)))
      ) {
        return true;
      }
      return Object.keys(uploadedLoopAssets).some(key => {
        const k = key.toLowerCase();
        const baseNoExt = k.replace(/\.[^.]+$/, '');
        return Boolean((fn && k === fn) || (aid && (baseNoExt === aid || k.includes(aid))));
      });
    },
    [loopMedia, loopAudio, uploadedLoopAssets]
  );

  const handleLoopFilesSelected = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const videoFiles: File[] = [];
      const audioFiles: File[] = [];
      files.forEach(f => {
        const lower = f.name.toLowerCase();
        if (
          f.type.startsWith('audio/') ||
          lower.endsWith('.mp3') ||
          lower.endsWith('.wav') ||
          lower.endsWith('.aac') ||
          lower.endsWith('.flac')
        ) {
          audioFiles.push(f);
        } else {
          videoFiles.push(f);
        }
      });
      if (videoFiles.length > 0) {
        setLoopMedia(videoFiles[0]);
      }
      if (audioFiles.length > 0) {
        setLoopAudio(audioFiles[0]);
        setContinuousBed(prev => ({ ...prev, enabled: true, file_name: audioFiles[0].name }));
      }
      setUploadedLoopAssets(prev => {
        const next = { ...prev };
        files.forEach(f => {
          next[f.name] = f;
        });
        return next;
      });
      if (videoFiles.length > 0) {
        setTimelineSlots(prev => {
          const next = prev.map(sl => ({
            ...sl,
            inserts: sl.inserts.map(ins => ({ ...ins }))
          }));
          let qIdx = 0;
          for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
            if (!next[i].file_name.trim()) {
              const exactName = videoFiles[qIdx].name;
              next[i] = {
                ...next[i],
                file_name: exactName,
                base_content: { ...(next[i].base_content || {}), file_name: exactName }
              };
              qIdx += 1;
            }
          }
          for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
            for (let j = 0; j < next[i].inserts.length && qIdx < videoFiles.length; j++) {
              if (!next[i].inserts[j].file_name.trim()) {
                const exactName = videoFiles[qIdx].name;
                next[i].inserts[j] = {
                  ...next[i].inserts[j],
                  file_name: exactName,
                  filename: exactName
                };
                qIdx += 1;
              }
            }
          }
          if (qIdx === 0) {
            for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
              const exactName = videoFiles[qIdx].name;
              next[i] = {
                ...next[i],
                file_name: exactName,
                base_content: { ...(next[i].base_content || {}), file_name: exactName }
              };
              qIdx += 1;
            }
            for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
              for (let j = 0; j < next[i].inserts.length && qIdx < videoFiles.length; j++) {
                const exactName = videoFiles[qIdx].name;
                next[i].inserts[j] = {
                  ...next[i].inserts[j],
                  file_name: exactName,
                  filename: exactName
                };
                qIdx += 1;
              }
            }
          }
          return next;
        });
      }
      showToast(
        `Файлы добавлены (${files.length} шт.) — слоты таймлайна заполнены, запущена выгрузка в Google Drive!`,
        'success'
      );
    },
    [showToast]
  );

  const handleLoopMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    const files: File[] = Array.from(fileList);
    handleLoopFilesSelected(files);
    e.target.value = '';
  };

  const handleLoopAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoopAudio(file);
      setUploadedLoopAssets(prev => ({ ...prev, [file.name]: file }));
      setContinuousBed(prev => ({ ...prev, file_name: file.name }));
      if (expectedAudioFilename && file.name === expectedAudioFilename) {
        showToast(`Аудиофайл «${file.name}» успешно привязан к манифесту!`, 'success');
      }
    }
  };

  const handleExactLoopHoursChange = (val: string) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;
    const clamped = Math.max(3, Math.min(10, parsed));
    setLoopHours(clamped);
  };

  const syncSlotsToTargetHours = (targetHours: number) => {
    const clampedH = Math.max(3, Math.min(10, targetHours));
    setLoopHours(clampedH);
    const totalTargetSec = clampedH * 3600;
    setTimelineSlots(prev => {
      if (!prev.length) return prev;
      const perSlot = Math.round(totalTargetSec / prev.length);
      return prev.map((sl, idx) => ({
        ...sl,
        slot_duration_sec: perSlot,
        slot_transition_out:
          idx === prev.length - 1
            ? sl.slot_transition_out
            : {
                type: sl.slot_transition_out.type === 'none' ? 'xfade' : sl.slot_transition_out.type,
                duration_sec: sl.slot_transition_out.duration_sec || crossfadeDuration
              }
      }));
    });
  };

  const applyBlizzard3HSpecPreset = () => {
    setTimelineSlots(prev =>
      INITIAL_TIMELINE_SLOTS.map((baseSlot, idx) => {
        const existing = prev[idx];
        const preservedFile = existing?.file_name || '';
        return {
          ...baseSlot,
          file_name: preservedFile,
          base_content: { ...(existing?.base_content || {}), file_name: preservedFile },
          asset_id: existing?.asset_id || '',
          inserts: existing?.inserts ? [...existing.inserts] : []
        };
      })
    );
    setLoopHours(3);
    setVideoCodec('libx264');
    setVideoCrf(20);
    setVideoFps(24);
    setAudioBitrateKbps(320);
    setActCrossfadeSec(90.0);
    setInternalLoopCrossfadeSec(1.0);
    setFinalBlackScreenEnabled(true);
    setFinalBlackScreenSec(2.0);
    setAudioMastering({
      loudnorm_enabled: true,
      integrated_lufs: -16,
      true_peak_dbtp: -3,
      lra: 11,
      e3_soft_attack_compressor: true,
      e3_max_peak_over_bed_db: 6
    });
    showToast(
      'Применены параметры кодирования 3:00:00 (H.264 CRF 20, 24fps, AAC 320k, стыки 90с, loudnorm -16 LUFS) с сохранением ваших имен файлов!',
      'success'
    );
  };

  const addTimelineSlot = () => {
    setTimelineSlots(prev => {
      const nextIdx = prev.length + 1;
      const padded = String(nextIdx).padStart(2, '0');
      const updatedPrev = prev.map((s, i) =>
        i === prev.length - 1 && s.slot_transition_out.type === 'none'
          ? { ...s, slot_transition_out: { type: 'xfade' as const, duration_sec: actCrossfadeSec } }
          : s
      );
      return [
        ...updatedPrev,
        {
          slot_index: nextIdx,
          slot_id: `SLOT_${padded}`,
          act_title: `Акт ${nextIdx}`,
          title: `Акт ${nextIdx}`,
          act_timecode: `Акт #${nextIdx}`,
          asset_id: '',
          file_name: '',
          base_content: { file_name: '' },
          source_clip_duration_sec: 10,
          internal_loop_crossfade_sec: internalLoopCrossfadeSec,
          slot_duration_sec: 1800,
          inserts: [],
          slot_transition_out: { type: 'none' as const, duration_sec: 0 }
        }
      ];
    });
    showToast('Добавлен новый слот в таймлайн', 'info');
  };

  const generateNSlotsPreset = (count: number) => {
    const totalSec = loopHours * 3600;
    const perSlotSec = Math.max(120, Math.round((totalSec + (count - 1) * actCrossfadeSec) / count));
    setTimelineSlots(prev =>
      Array.from({ length: count }, (_, idx) => {
        const num = idx + 1;
        const pad = String(num).padStart(2, '0');
        const isLast = idx === count - 1;
        const existing = prev[idx];
        const preservedFileName = existing?.file_name || '';
        return {
          slot_index: num,
          slot_id: existing?.slot_id || `SLOT_${pad}`,
          act_title: existing?.act_title || existing?.title || `Слот ${num}`,
          title: existing?.title || existing?.act_title || `Слот ${num}`,
          act_timecode: existing?.act_timecode || `Слот #${num}`,
          asset_id: existing?.asset_id || '',
          file_name: preservedFileName,
          base_content: { ...(existing?.base_content || {}), file_name: preservedFileName },
          source_clip_duration_sec: existing?.source_clip_duration_sec ?? 10,
          internal_loop_crossfade_sec:
            existing?.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec,
          slot_duration_sec: perSlotSec,
          inserts: existing?.inserts ? [...existing.inserts] : [],
          slot_transition_out: isLast
            ? { type: 'none' as const, duration_sec: 0 }
            : { type: 'xfade' as const, duration_sec: actCrossfadeSec }
        };
      })
    );
    showToast(`Сформирован таймлайн на ${count} слотов со стыками актов ${actCrossfadeSec}с!`, 'success');
  };

  const removeTimelineSlot = (slotIdx: number) => {
    setTimelineSlots(prev => {
      if (prev.length <= 1) {
        showToast('В таймлайне должен оставаться минимум 1 слот!', 'error');
        return prev;
      }
      return prev.filter((_, idx) => idx !== slotIdx).map((s, idx) => ({ ...s, slot_index: idx + 1 }));
    });
  };

  const updateTimelineSlotField = <K extends keyof TimelineSlot>(
    slotIdx: number,
    field: K,
    value: TimelineSlot[K]
  ) => {
    setTimelineSlots(prev =>
      prev.map((s, idx) => {
        if (idx !== slotIdx) return s;
        const updated: TimelineSlot = { ...s, [field]: value };
        if (field === 'file_name') {
          updated.base_content = { ...(s.base_content || {}), file_name: String(value ?? '') };
        }
        if (field === 'title') {
          updated.act_title = String(value ?? '');
        }
        if (field === 'act_title') {
          updated.title = String(value ?? '');
        }
        return updated;
      })
    );
  };

  const addInsertToSlot = (slotIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => {
        if (idx !== slotIdx) return slot;
        const nextNum = slot.inserts.length + 1;
        const isE3Style = nextNum === 3;
        const isE2Style = nextNum === 2;
        const lastTrigger =
          slot.inserts.length > 0 ? slot.inserts[slot.inserts.length - 1].trigger_at_sec : 0;
        const suggestedTrigger = Math.min(
          Math.max(30, slot.slot_duration_sec - 15),
          lastTrigger + 120
        );
        const newInsert: SlotInsertItem = {
          insert_id: `E${nextNum}`,
          timecode_label: isE3Style
            ? `E${nextNum} • in 1.5с / БЕЗ fade out`
            : isE2Style
              ? `E${nextNum} • in 1.5с / out 3.0с`
              : `E${nextNum} • in 1.5с / out 1.5с`,
          asset_id: '',
          file_name: '',
          trigger_at_sec: suggestedTrigger,
          duration_sec: 10,
          transition_in: { type: isE3Style ? 'fade' : 'dissolve', duration_sec: 1.5 },
          transition_out: isE3Style
            ? { type: 'none', duration_sec: 0 }
            : { type: 'dissolve', duration_sec: isE2Style ? 3.0 : 1.5 },
          hold_until_end: isE3Style,
          audio_soft_compressor: isE3Style,
          max_peak_over_bed_db: isE3Style ? 6 : undefined
        };
        return { ...slot, inserts: [...slot.inserts, newInsert] };
      })
    );
  };

  const clearSlotInserts = (slotIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => (idx === slotIdx ? { ...slot, inserts: [] } : slot))
    );
    showToast(`Слот #${slotIdx + 1} переведен в режим чистого фонового лупа (inserts: [])`, 'info');
  };

  const removeInsertFromSlot = (slotIdx: number, insertIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => {
        if (idx !== slotIdx) return slot;
        const filtered = slot.inserts
          .filter((_, i) => i !== insertIdx)
          .map((ins, i) => ({ ...ins, insert_id: `E${i + 1}` }));
        return { ...slot, inserts: filtered };
      })
    );
  };

  const updateSlotInsert = (
    slotIdx: number,
    insertIdx: number,
    patch: Partial<SlotInsertItem>
  ) => {
    setTimelineSlots(prev =>
      prev.map((slot, sIdx) => {
        if (sIdx !== slotIdx) return slot;
        const nextInserts = slot.inserts.map((ins, iIdx) => {
          if (iIdx !== insertIdx) return ins;
          const updated: SlotInsertItem = { ...ins, ...patch };
          if (patch.file_name !== undefined) {
            updated.filename = patch.file_name;
          }
          return updated;
        });
        return { ...slot, inserts: nextInserts };
      })
    );
  };

  const buildFFmpegFilterComplexPreview = useCallback((): {
    inputsArgs: string[];
    filterLines: string[];
    finalVideoMap: string;
    finalAudioMap: string;
    encodingFlags: string;
  } => {
    const scaleWh =
      loopResolution === '4k'
        ? '3840:2160'
        : loopResolution === '2k'
          ? '2560:1440'
          : loopResolution === '1080p'
            ? '1920:1080'
            : '1280:720';
    const inputsArgs: string[] = [];
    const filterLines: string[] = [];
    let inputIdx = 0;
    const slotVideoNodes: {
      label: string;
      durationSec: number;
      transitionOut: SlotTransitionOut;
    }[] = [];
    const slotAudioLabels: string[] = [];
    let cumulativeSlotStartSec = 0;
    timelineSlots.forEach((slot, sIdx) => {
      const slotDur = Math.max(10, Number(slot.slot_duration_sec) || 1800);
      const clipDur = Math.max(2, Number(slot.source_clip_duration_sec) || 10);
      const seamSec = Math.max(
        0.2,
        Math.min(
          clipDur * 0.45,
          Number(slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec) || 1.0
        )
      );
      const effStep = Math.max(1, clipDur - seamSec);
      const loopSteps = Math.max(1, Math.ceil(slotDur / effStep));
      const baseInput = inputIdx++;
      const slotFileName = (slot.file_name || '').trim() || 'MISSING_FILE.mp4';
      inputsArgs.push(
        `-stream_loop ${loopSteps} -t ${slotDur} -i "${slotFileName}" # [Слот #${slot.slot_index}: ${slot.act_timecode || ''} • исходник ${clipDur}с со швом xfade+acrossfade=${seamSec.toFixed(1)}с]`
      );
      let curVideoLabel = `v_slot_${sIdx}_base`;
      filterLines.push(
        `# Слот #${slot.slot_index} (${slot.title}): бесшовная склейка ${clipDur}с исходника через xfade=duration=${seamSec.toFixed(1)}:offset=${(clipDur - seamSec).toFixed(1)} @ ${videoFps}fps`
      );
      filterLines.push(
        `[${baseInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},format=yuv420p,trim=duration=${slotDur},setpts=PTS-STARTPTS[${curVideoLabel}]`
      );
      let curAudioLabel = `a_slot_${sIdx}_base`;
      filterLines.push(
        `[${baseInput}:a]atrim=duration=${slotDur},asetpts=PTS-STARTPTS[${curAudioLabel}]`
      );
      if (Array.isArray(slot.inserts) && slot.inserts.length > 0) {
        slot.inserts.forEach((ins, insIdx) => {
          const insInput = inputIdx++;
          const trig = Math.max(0, Number(ins.trigger_at_sec) || 0);
          const absProjectSec = cumulativeSlotStartSec + trig;
          const dur = Math.max(1, Number(ins.duration_sec) || 10);
          const fadeInType = ins.transition_in?.type || 'dissolve';
          const fadeInDur = Math.max(0.1, Number(ins.transition_in?.duration_sec) || 1.5);
          const fadeOutType = ins.transition_out?.type ?? 'dissolve';
          const fadeOutDur = Math.max(0, Number(ins.transition_out?.duration_sec) || 0);
          const holdToEnd = Boolean(ins.hold_until_end || fadeOutType === 'none' || fadeOutDur <= 0);
          const insLabel = `v_s${sIdx}_${ins.insert_id || `E${insIdx + 1}`}`;
          const nextOverlayLabel = `v_slot_${sIdx}_ovr_${insIdx + 1}`;
          const insFileName = (ins.file_name || '').trim() || 'MISSING_INSERT.mp4';
          inputsArgs.push(
            `-i "${insFileName}" # [${ins.insert_id} @ глобальный таймкод ${absProjectSec}с / локальный +${trig}с]`
          );
          if (holdToEnd) {
            filterLines.push(
              `[${insInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},format=yuva420p,fade=t=in:st=0:d=${fadeInDur}:alpha=1,tpad=stop_mode=clone:stop_duration=${Math.max(1, slotDur - trig)},setpts=PTS-STARTPTS+${trig}/TB[${insLabel}] # ${ins.insert_id}: in ${fadeInDur}s (${fadeInType}) / БЕЗ fade out`
            );
            filterLines.push(
              `[${curVideoLabel}][${insLabel}]overlay=enable='gte(t,${trig})':eof_action=pass[${nextOverlayLabel}]`
            );
          } else {
            const fadeOutStart = Math.max(fadeInDur, dur - fadeOutDur);
            filterLines.push(
              `[${insInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},format=yuva420p,fade=t=in:st=0:d=${fadeInDur}:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}:alpha=1,setpts=PTS-STARTPTS+${trig}/TB[${insLabel}] # ${ins.insert_id}: in ${fadeInDur}s / out ${fadeOutDur}s`
            );
            filterLines.push(
              `[${curVideoLabel}][${insLabel}]overlay=enable='between(t,${trig},${trig + dur})':eof_action=pass[${nextOverlayLabel}]`
            );
          }
          curVideoLabel = nextOverlayLabel;
          const insAudioLabel = `a_s${sIdx}_${ins.insert_id || `E${insIdx + 1}`}`;
          const nextSlotAudioLabel = `a_slot_${sIdx}_mix_${insIdx + 1}`;
          const delayMs = Math.round(trig * 1000);
          const isE3Soft = Boolean(
            ins.audio_soft_compressor ||
              ins.insert_id.toUpperCase() === 'E3' ||
              audioMastering.e3_soft_attack_compressor
          );
          const peakLimitDb = Number(
            ins.max_peak_over_bed_db ?? audioMastering.e3_max_peak_over_bed_db ?? 6
          );
          const aFadeOutChain =
            !holdToEnd && fadeOutDur > 0
              ? `,afade=t=out:st=${Math.max(0.1, dur - fadeOutDur).toFixed(2)}:d=${fadeOutDur}`
              : '';
          if (isE3Soft && ins.insert_id.toUpperCase() === 'E3') {
            filterLines.push(
              `[${insInput}:a]afade=t=in:st=0:d=${fadeInDur}${aFadeOutChain},acompressor=attack=45:release=250:ratio=3:threshold=-18dB:knee=6dB:makeup=2dB,alimiter=limit=${peakLimitDb.toFixed(1)}dB:attack=15:release=100,adelay=${delayMs}|${delayMs}[${insAudioLabel}]`
            );
          } else {
            filterLines.push(
              `[${insInput}:a]afade=t=in:st=0:d=${fadeInDur}${aFadeOutChain},adelay=${delayMs}|${delayMs}[${insAudioLabel}]`
            );
          }
          filterLines.push(
            `[${curAudioLabel}][${insAudioLabel}]amix=inputs=2:duration=first:dropout_transition=0:weights='1.0 0.85'[${nextSlotAudioLabel}]`
          );
          curAudioLabel = nextSlotAudioLabel;
        });
      }
      slotAudioLabels.push(curAudioLabel);
      const transOut = slot.slot_transition_out || { type: 'none', duration_sec: 0 };
      slotVideoNodes.push({ label: curVideoLabel, durationSec: slotDur, transitionOut: transOut });
      const overlap = transOut.type !== 'none' ? Number(transOut.duration_sec) || 0 : 0;
      cumulativeSlotStartSec += slotDur - overlap;
    });
    let chainedVideoLabel = slotVideoNodes[0]?.label || '0:v';
    let accumOffset = slotVideoNodes[0]?.durationSec || 0;
    if (slotVideoNodes.length > 1) {
      let prevLabel = slotVideoNodes[0].label;
      for (let i = 1; i < slotVideoNodes.length; i++) {
        const prevTrans = slotVideoNodes[i - 1].transitionOut;
        const nextNode = slotVideoNodes[i];
        const chainLabel = `v_act_chain_${i}`;
        if (prevTrans.type === 'none' || prevTrans.duration_sec <= 0) {
          filterLines.push(`[${prevLabel}][${nextNode.label}]concat=n=2:v=1:a=0[${chainLabel}]`);
          accumOffset += nextNode.durationSec;
        } else {
          const xfadeType = prevTrans.type === 'dissolve' ? 'dissolve' : 'fade';
          const dur = prevTrans.duration_sec;
          const offset = Math.max(0, accumOffset - dur);
          const boundaryMin = Math.round(offset / 60);
          const boundaryH = Math.floor(boundaryMin / 60);
          const boundaryRemMin = String(boundaryMin % 60).padStart(2, '0');
          filterLines.push(
            `[${prevLabel}][${nextNode.label}]xfade=transition=${xfadeType}:duration=${dur}:offset=${offset}[${chainLabel}] # Стык актов ${boundaryH}:${boundaryRemMin} (${offset}с)`
          );
          accumOffset = offset + nextNode.durationSec;
        }
        prevLabel = chainLabel;
      }
      chainedVideoLabel = prevLabel;
    }
    let finalVideoMap = chainedVideoLabel;
    const lastTrans = slotVideoNodes[slotVideoNodes.length - 1]?.transitionOut;
    if (lastTrans && lastTrans.type !== 'none' && lastTrans.duration_sec > 0) {
      const fd = lastTrans.duration_sec;
      const st = Math.max(0, accumOffset - fd);
      filterLines.push(`[${chainedVideoLabel}]fade=t=out:st=${st}:d=${fd}[v_faded_end]`);
      chainedVideoLabel = 'v_faded_end';
      finalVideoMap = chainedVideoLabel;
    }
    if (finalBlackScreenEnabled && finalBlackScreenSec > 0) {
      const crackFadeStart = Math.max(0, accumOffset - 1.5);
      filterLines.push(
        `[${chainedVideoLabel}]fade=t=out:st=${crackFadeStart.toFixed(1)}:d=1.5,tpad=stop_mode=add:stop_duration=${finalBlackScreenSec.toFixed(1)}:color=black[v_master_out]`
      );
      finalVideoMap = 'v_master_out';
    }
    if (loopBurnInSubtitles) {
      filterLines.push(
        `[${finalVideoMap}]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=45'[v_subtitled]`
      );
      finalVideoMap = 'v_subtitled';
    }
    let veoAudioChain = slotAudioLabels[0] || '0:a';
    if (slotAudioLabels.length > 1) {
      let prevAudio = slotAudioLabels[0];
      for (let i = 1; i < slotAudioLabels.length; i++) {
        const prevTrans = slotVideoNodes[i - 1].transitionOut;
        const aDur =
          prevTrans.type !== 'none' && prevTrans.duration_sec > 0
            ? prevTrans.duration_sec
            : actCrossfadeSec;
        const outAudio = `a_act_chain_${i}`;
        filterLines.push(
          `[${prevAudio}][${slotAudioLabels[i]}]acrossfade=d=${aDur}:c1=tri:c2=tri[${outAudio}]`
        );
        prevAudio = outAudio;
      }
      veoAudioChain = prevAudio;
    }
    let preMasterAudio = veoAudioChain;
    const activeMixInputs: string[] = [`[${veoAudioChain}]`];
    const activeMixWeights: number[] = [continuousBed.veo_audio_weight];
    if (continuousBed.enabled && continuousBed.file_name.trim()) {
      const bedInput = inputIdx++;
      const loopFlag = continuousBed.loop_entire_duration !== false ? '-stream_loop -1 ' : '';
      inputsArgs.push(
        `${loopFlag}-t ${calculatedProjectDurationSec} -i "${continuousBed.file_name.trim()}" # [Слой 1: Фоновый эмбиент]`
      );
      filterLines.push(
        `[${bedInput}:a]afade=t=in:st=0:d=${continuousBed.acrossfade_sec},atrim=duration=${calculatedProjectDurationSec},asetpts=PTS-STARTPTS[a_bed]`
      );
      activeMixInputs.push('[a_bed]');
      activeMixWeights.push(continuousBed.bed_audio_weight);
    }
    if (loopMasterAudio.enabled && loopMasterAudio.file_name.trim()) {
      const masterIn = inputIdx++;
      inputsArgs.push(`-i "${loopMasterAudio.file_name.trim()}" # [Слой 2: Мастер-аудиодорожка]`);
      filterLines.push(
        `[${masterIn}:a]atrim=duration=${calculatedProjectDurationSec},asetpts=PTS-STARTPTS[a_master_track]`
      );
      activeMixInputs.push('[a_master_track]');
      activeMixWeights.push(loopMasterAudio.weight);
    }
    if (activeMixInputs.length > 1) {
      filterLines.push(
        `${activeMixInputs.join('')}amix=inputs=${activeMixInputs.length}:duration=first:weights='${activeMixWeights.join(' ')}'[a_mixed]`
      );
      preMasterAudio = 'a_mixed';
    }
    if (finalBlackScreenEnabled && finalBlackScreenSec > 0) {
      const fadeOutSt = Math.max(0, accumOffset - 1.5);
      filterLines.push(
        `[${preMasterAudio}]afade=t=out:st=${fadeOutSt.toFixed(1)}:d=1.5,apad=pad_dur=${finalBlackScreenSec.toFixed(1)}[a_padded]`
      );
      preMasterAudio = 'a_padded';
    }
    let finalAudioMap = preMasterAudio;
    if (audioMastering.loudnorm_enabled) {
      const iLufs = Math.max(-18, Math.min(-14, Number(audioMastering.integrated_lufs) || -16));
      const tpDb = Math.min(-3, Number(audioMastering.true_peak_dbtp) || -3);
      const lraVal = Math.max(1, Number(audioMastering.lra) || 11);
      filterLines.push(
        `[${preMasterAudio}]loudnorm=I=${iLufs}:TP=${tpDb}:LRA=${lraVal}[a_master_loudnorm]`
      );
      finalAudioMap = 'a_master_loudnorm';
    }
    const crfVal = videoCrf;
    const h264Preset = loopDraftMode || loopResolution === '720p' ? 'ultrafast' : 'veryfast';
    const codecFlags =
      videoCodec === 'libx265'
        ? `-c:v libx265 -preset medium -crf ${crfVal} -tag:v hvc1 -pix_fmt yuv420p -r ${videoFps}`
        : `-c:v libx264 -preset ${h264Preset} -crf ${crfVal} -pix_fmt yuv420p -r ${videoFps}`;
    const audioFlags = `-c:a aac -b:a ${audioBitrateKbps}k -ar 48000`;
    return {
      inputsArgs,
      filterLines,
      finalVideoMap,
      finalAudioMap,
      encodingFlags: `${codecFlags} ${audioFlags}`
    };
  }, [
    timelineSlots,
    loopResolution,
    loopDraftMode,
    internalLoopCrossfadeSec,
    videoFps,
    actCrossfadeSec,
    finalBlackScreenEnabled,
    finalBlackScreenSec,
    loopBurnInSubtitles,
    continuousBed,
    loopMasterAudio,
    calculatedProjectDurationSec,
    audioMastering,
    videoCrf,
    videoCodec,
    audioBitrateKbps
  ]);
  const ffmpegPreview = buildFFmpegFilterComplexPreview();

  const formatSrtTimeFromSeconds = (sec: number): string => {
    const safe = Math.max(0, sec);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${Str
     return (
    <div className="relative min-h-screen flex flex-col justify-between selection:bg-amber-500/30 bg-[#080c14] text-[#f8fafc] overflow-x-hidden">
      <AmbientShaderBackdrop mode={ambientShaderMode} />
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#080c14]/85 backdrop-blur-xl px-3 sm:px-4 py-2.5 sm:py-3 shadow-[0_16px_40px_-15px_rgba(0,0,0,0.85)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 shadow-[0_8px_20px_-4px_rgba(245,158,11,0.45)]">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-extrabold tracking-tight text-[#f8fafc] whitespace-nowrap">
                AETHER{' '}
                <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                  COMBINE
                </span>
              </h1>
              <p className="hidden 2xl:block text-[11px] text-white/50 truncate">
                4K Production Studio • GitHub Actions → Google Drive
              </p>
            </div>
          </div>
          <div className="order-3 w-full xl:order-none xl:w-auto flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#090d16]/90 border border-white/[0.08] rounded-2xl p-1.5 shadow-inner">
            <button
              type="button"
              onClick={() => applyStudioFormatPreset('histoviva_doc')}
              className={`min-h-[40px] xl:min-h-[36px] shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFormatPreset === 'histoviva_doc'
                  ? 'bg-indigo-500/25 border border-indigo-400/60 text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,0.3)]'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title="Переключить на Повествовательный монтаж, профиль Historical Storytelling (2.5–8 сек) и документальные бейджи"
            >
              <span>🏛️ HistoViva • Документальный (~10 мин)</span>
            </button>
            <button
              type="button"
              onClick={() => applyStudioFormatPreset('ambient_loop_3h')}
              className={`min-h-[40px] xl:min-h-[36px] shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFormatPreset === 'ambient_loop_3h'
                  ? 'bg-amber-500/25 border border-amber-400/60 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title="Переключить на Многочасовой Луп, медитативный профиль (10–18 сек) и бейджи 3 HOURS • NO ADS • DEEP SLEEP"
            >
              <span>🌙 Ambient Loop • 3 Часа (Атмосфера)</span>
            </button>
            <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-white/[0.08]">
              <input
                type="text"
                value={loopProjectName}
                onChange={e => setLoopProjectName(e.target.value)}
                placeholder="Название ролика..."
                title="Свободное уникальное название текущего видеопроекта"
                className="bg-slate-950/90 border border-slate-800 focus:border-indigo-400 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-200 outline-none w-40 2xl:w-44"
              />
              <input
                type="text"
                value={thumbTitle}
                onChange={e => setThumbTitle(e.target.value)}
                placeholder="Заголовок обложки..."
                title="Свободный заголовок 4K обложки для текущего выпуска"
                className="bg-slate-950/90 border border-slate-800 focus:border-amber-400 rounded-lg px-2.5 py-1 text-[11px] font-mono text-amber-300 outline-none w-36 2xl:w-40"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleAmbientShaderMode}
              aria-pressed={ambientShaderMode === 'live'}
              title={
                ambientShaderMode === 'live'
                  ? 'Активен плавный шейдер 24fps. Нажмите для включения Экономного режима'
                  : 'Активен Экономный режим (0% нагрузки на GPU). Нажмите для включения Живого фона'
              }
              className={`min-h-[40px] sm:min-h-[44px] flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-2 text-xs font-bold cursor-pointer transition ${
                ambientShaderMode === 'live'
                  ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 border-cyan-400/45 text-cyan-200 shadow-[0_0_18px_rgba(14,116,144,0.28)]'
                  : 'bg-[#0f1623]/85 border-white/[0.08] text-amber-300 hover:border-amber-400/40'
              }`}
            >
              {ambientShaderMode === 'live' ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="whitespace-nowrap hidden sm:inline">✨ Живой фон</span>
                  <span className="whitespace-nowrap sm:hidden">✨ Фон</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="whitespace-nowrap hidden sm:inline">⚡ Экономный режим</span>
                  <span className="whitespace-nowrap sm:hidden">⚡ Эконом</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsResetProjectModalOpen(true)}
              title="Очистить черновик проекта и сбросить сцены, сценарий и настройки рендера"
              className="min-h-[40px] sm:min-h-[44px] flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0f1623]/85 hover:bg-rose-950/35 hover:border-rose-500/45 text-slate-300 hover:text-rose-200 px-2.5 sm:px-3 py-2 text-xs font-bold cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="whitespace-nowrap hidden sm:inline">Сбросить проект</span>
            </button>
            <button
              type="button"
              onClick={openConfigModal}
              className="min-h-[40px] sm:min-h-[44px] flex shrink-0 items-center gap-2 sm:gap-3 rounded-xl border border-white/[0.08] bg-[#0f1623]/85 hover:bg-[#0f1623] hover:border-amber-400/40 px-2.5 sm:px-4 py-2 text-xs cursor-pointer shadow-inner"
            >
              <span
                id="gh-status-indicator"
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isGhConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                }`}
              />
              <span
                id="gh-status-text"
                className="font-mono text-amber-300 truncate max-w-[100px] sm:max-w-[160px] xl:max-w-none"
              >
                {ghRepo || 'ZermeXX/aetherflow-render'}
              </span>
              <span className="h-4 w-px bg-white/[0.1] hidden md:inline-block" />
              <span className="hidden md:flex items-center gap-1.5 font-mono text-[11px] font-medium text-emerald-400 whitespace-nowrap">
                <HardDrive
                  className={`w-3.5 h-3.5 ${
                    isGdriveConfigured ? 'text-emerald-400' : 'text-emerald-400/75'
                  }`}
                />
                <span>GDrive Ready</span>
              </span>
            </button>
          </div>
        </div>
        <nav
          role="tablist"
          aria-label="Цехи продакшна AetherCombine"
          className="mx-auto mt-2.5 sm:mt-3 flex max-w-[1600px] flex-nowrap overflow-x-auto no-scrollbar xl:flex-wrap items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-[#0f1623]/85 backdrop-blur-md p-1.5"
        >
          {[
            {
              id: 'combine' as TabId,
              domId: 'tab-combine',
              cls: 'nav-tab-combine',
              iconCls: 'nav-icon-combine',
              emoji: '🎬',
              glow: 'rgba(147,51,234,0.95)',
              label: 'Повествовательный монтаж'
            },
            {
              id: 'loop' as TabId,
              domId: 'tab-loop',
              cls: 'nav-tab-loop',
              iconCls: 'nav-icon-loop',
              emoji: '🔁',
              glow: 'rgba(245,158,11,0.95)',
              label: 'Многочасовой Луп (N-Слотов)'
            },
            {
              id: 'verbaflow' as TabId,
              domId: 'tab-verbaflow',
              cls: 'nav-tab-verbaflow',
              iconCls: 'nav-icon-verbaflow',
              emoji: '📝',
              glow: 'rgba(56,189,248,0.95)',
              label: 'VerbaFlow • Сценарии & Текст'
            },
            {
              id: 'seo' as TabId,
              domId: 'tab-seo',
              cls: 'nav-tab-seo',
              iconCls: 'nav-icon-seo',
              emoji: '📈',
              glow: 'rgba(14,165,233,0.95)',
              label: 'YouTube SEO'
            },
            {
              id: 'thumb' as TabId,
              domId: 'tab-thumb',
              cls: 'nav-tab-thumb',
              iconCls: 'nav-icon-thumb',
              emoji: '🎨',
              glow: 'rgba(16,185,129,0.95)',
              label: '4К Превью & Арт-цех'
            },
            {
              id: 'editor' as TabId,
              domId: 'tab-editor',
              cls: 'nav-tab-editor',
              iconCls: 'nav-icon-editor',
              emoji: '🖼️',
              glow: 'rgba(34,211,238,0.95)',
              label: 'Арт-Редактор & Фон'
            }
          ].map(tabItem => {
            const isActive = activeTab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectTab(tabItem.id)}
                id={tabItem.domId}
                className={`relative group nav-tab ${tabItem.cls} min-h-[44px] shrink-0 flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap cursor-pointer overflow-hidden ${
                  isActive
                    ? 'active text-[#f8fafc] border border-amber-400/45 shadow-[0_6px_20px_-4px_rgba(245,158,11,0.28)]'
                    : 'border border-transparent text-white/60 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeStudioTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-emerald-500/15 -z-0"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  key={isActive ? `${tabItem.id}-active-${tabPulseKey}` : `${tabItem.id}-idle`}
                  className={`relative z-10 icon-container nav-icon-box ${tabItem.iconCls}`}
                  aria-hidden="true"
                >
                  <span
                    style={{ filter: `drop-shadow(0 0 8px ${tabItem.glow})` }}
                    className="text-[16px] leading-none select-none"
                  >
                    {tabItem.emoji}
                  </span>
                </span>
                <span className="relative z-10">{tabItem.label}</span>
              </button>
            );
          })}
        </nav>
      </header>
      <main
        onPaste={handleGlobalManifestPaste}
        className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-6 overflow-x-hidden"
      >
        <section
          id="view-combine"
          className={`studio-view space-y-6 ${activeTab === 'combine' ? '' : 'hidden'}`}
        >
          <MontageCombineView
            key={`combine-workspace-${workspaceResetKey}`}
            ghToken={ghToken}
            ghRepo={ghRepo}
            ghBranch={ghBranch}
            gdriveFolderId={gdriveFolderId}
            onGdriveFolderIdChange={newFolder => {
              setGdriveFolderId(newFolder);
              localStorage.setItem('ac_gdrive_folder_id', newFolder);
            }}
            driveUser
            driveUser={driveUser}
            driveToken={driveToken}
            onDriveAuthChange={(u, t) => {
              setDriveUser(u);
              setDriveToken(t);
            }}
            externalProjectName={loopProjectName}
            onExternalProjectNameChange={setLoopProjectName}
            rhythmProfilePreset={rhythmProfilePreset}
            onConsumeRhythmProfilePreset={() => setRhythmProfilePreset(null)}
            shortsExportConfig={shortsExportConfig}
            transferredScript={transferredScript}
            onClearTransferredScript={() => setTransferredScript('')}
            externalScenes={externalNarrativeScenes}
            onConsumeExternalScenes={() => setExternalNarrativeScenes(null)}
            externalMasterAudioFile={externalMasterAudioFile}
            onConsumeExternalMasterAudio={() => setExternalMasterAudioFile(null)}
            onScenesChange={setActiveNarrativeScenes}
            externalV21Manifest={externalV21Manifest}
            onConsumeExternalV21Manifest={() => setExternalV21Manifest(null)}
            onImportFullManifest={(raw, fileName) =>
              applyV21CrossTabSettings(raw, fileName, { syncCombine: false })
            }
            onV21LocksChange={(_locks, summary) => setRenderSpecsSummary(summary)}
            externalSceneSubtitleEdit={externalSceneSubtitleEdit}
            onConsumeExternalSceneSubtitleEdit={() => setExternalSceneSubtitleEdit(null)}
            youtubeSeo={exportYoutubeSeoBlock}
            chaptersYoutubeText={verbaFlowChaptersTxt}
            subtitlesExportConfig={{
              strictSceneDurationLock,
              burnInVideo: sidecarBurnInVideo,
              exportSeparateSrtFiles,
              languages: selectedSubtitleLanguages
            }}
            telegramBotToken={telegramBotToken}
            telegramChatId={telegramChatId}
            onOpenConfigModal={openConfigModal}
            onStartRenderStatus={showStatusBar}
            onNotify={showToast}
            encodeManifestBase64={encodeManifestBase64}
            terminalStatus={terminalRunnerStatus}
            terminalSeconds={renderStatus.seconds}
            terminalLogs={terminalLogs}
            terminalRunUrl={renderStatus.runUrl}
            onClearTerminalLogs={clearTerminalLogs}
            onCancelRenderRun={cancelActiveRenderRun}
            initialCombineDraft={initialCombineDraft}
            onCombineDraftChange={handleCombineDraftChange}
          />
        </section>
        <section
          id="view-loop"
          className={`studio-view space-y-6 ${activeTab === 'loop' ? '' : 'hidden'}`}
        >
          <div className="aether-surface rounded-2xl p-3.5 sm:p-6 space-y-5 sm:space-y-6">
            <div
              className={`rounded-xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 transition ${
                ambientLoopEnabled
                  ? 'bg-emerald-950/20 border-emerald-500/35 text-emerald-200'
                  : 'bg-amber-950/25 border-amber-400/50 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs">
                <Repeat
                  className={`w-4 h-4 shrink-0 ${
                    ambientLoopEnabled ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                />
                <div>
                  <span className="font-bold">
                    {ambientLoopEnabled
                      ? 'Ambient Loop Active (enabled: true)'
                      : 'Ambient Loop Disabled (enabled: false — Single-Pass Documentary Render)'}
                  </span>
                  <p className="text-[11px] text-white/60">
                    {ambientLoopEnabled
                      ? 'Многочасовое зацикливание активно для сборки длинных 3–10 ч эмбиент-выпусков.'
                      : 'Автоматически отключено при импорте документального v2.1 манифеста с timeline[].'}
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-mono font-bold cursor-pointer select-none bg-[#0b0f19]/80 border border-white/[0.1] rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={ambientLoopEnabled}
                  onChange={e => setAmbientLoopEnabled(e.target.checked)}
                  className="accent-amber-400 w-4 h-4"
                />
                <span>enabled: {ambientLoopEnabled ? 'true' : 'false'}</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div className="space-y-2 flex-1 min-w-0 sm:min-w-[260px]">
                <h2 className="text-base sm:text-lg font-bold text-[#f8fafc] flex items-center gap-2">
                  <Repeat className="text-amber-400 w-5 h-5 shrink-0" />
                  <span>Многочасовой Луп (N-Слотов) — Конструктор 4K</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Project Name:
                  </label>
                  <input
                    type="text"
                    value={loopProjectName}
                    onChange={e => setLoopProjectName(e.target.value)}
                    placeholder="Ambient Loop 4K"
                    className="min-h-[40px] bg-[#080c14]/90 border border-white/[0.12] focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs font-semibold text-[#f8fafc] w-full sm:w-80 outline-none"
                  />
                </div>
                <p className="text-xs text-white/55">
                  Экспорт{' '}
                  <code className="font-mono text-amber-300">
                    {videoCodec} (CRF {videoCrf})
                  </code>{' '}
                  {videoFps} fps • AAC {audioBitrateKbps} kbps • Стыки актов {actCrossfadeSec}с •
                  Петли 10с (шов {internalLoopCrossfadeSec.toFixed(1)}с)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-white/75">
                <span className="text-cyan-300">
                  {videoCodec === 'libx265' ? 'H.265' : 'H.264'} • CRF {videoCrf} • {videoFps}fps
                </span>
                <span className="text-white/25">•</span>
                <span className="text-emerald-300 font-semibold">
                  Актов: {timelineSlots.length} • Вставок: {totalInsertsCount} •{' '}
                  {formatTimeHMS(calculatedProjectDurationSec)}
                </span>
              </div>
            </div>
            <div className="aether-card rounded-2xl p-4 space-y-3 border border-amber-400/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-[#f8fafc] uppercase tracking-wider">
                      JSON-манифест сборки • Проект «{loopProjectName || 'Ambient Loop 4K'}»
                    </h3>
                    <p className="text-[11px] text-white/55">
                      Универсальный парсер слотов{' '}
                      <code className="font-mono text-amber-300">timeline_slots</code> (1–50+),
                      кривых <code className="font-mono text-amber-300">transition_in/out</code> и{' '}
                      <code className="font-mono text-emerald-300">audio_mastering</code>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={manifestInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportManifestFile}
                  />
                  <button
                    type="button"
                    onClick={applyBlizzard3HSpecPreset}
                    className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-cyan-400/40 text-cyan-200 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    ⚡ Сбросить к 6 актам (3:00:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => manifestInputRef.current?.click()}
                    className="min-h-[44px] btn-artistic-premium px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderUp className="w-4 h-4" />
                    <span>📄 Импортировать JSON-манифест</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportManifestFile}
                    className="min-h-[44px] bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#f8fafc] font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>💾 Экспорт JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => generateNSlotsPreset(10)}
                    className="min-h-[44px] bg-white/[0.04] hover:bg-white/[0.08] border border-amber-400/30 text-amber-300 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                    title="Сгенерировать 10 слотов с динамическими массивами inserts"
                  >
                    Пресет 10 слотов
                  </button>
                </div>
              </div>
              {expectedVideoFilename && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-xs ${
                    isAssetMatched(expectedVideoFilename)
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {isAssetMatched(expectedVideoFilename) ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>
                      {isAssetMatched(expectedVideoFilename)
                        ? `Файл манифеста подтвержден: ${expectedVideoFilename} загружен в зону дропа`
                        : `Ожидается файл: ${expectedVideoFilename} — загрузите его в зону дропа`}
                    </span>
                  </div>
                  {importedManifestName && (
                    <span className="text-[10px] font-mono bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                      Манифест: {importedManifestName}
                    </span>
                  )}
                </div>
              )}
            </div>
            <GoogleDriveDirectUploader
              targetFolderId={gdriveFolderId}
              onTargetFolderIdChange={newFolder => {
                setGdriveFolderId(newFolder);
                localStorage.setItem('ac_gdrive_folder_id', newFolder);
              }}
              driveUser={driveUser}
              driveToken={driveToken}
              onAuthChange={(u, t) => {
                setDriveUser(u);
                setDriveToken(t);
              }}
              onFilesSelected={handleLoopFilesSelected}
              onNotify={showToast}
              accentColor="amber"
              title="Перетащите исходные видеоклипы сюда или выберите файлы (Прямая выгрузка в Google Drive)"
              subtitle="Верхняя дропзона — единственное место загрузки файлов на Google Диск. Имена файлов сразу заполняют слоты таймлайна."
            />
            <LiveTerminal
              status={terminalRunnerStatus}
              elapsedSeconds={renderStatus.seconds}
              logs={terminalLogs}
              runUrl={renderStatus.runUrl}
              onClearLogs={clearTerminalLogs}
              onCopyLogs={() => {
                navigator.clipboard.writeText(
                  terminalLogs.map(l => sanitizeLogText(l.text)).join('\n')
                );
                showToast('Лог скопирован (секреты замаскированы)', 'info');
              }}
              onCancelRun={cancelActiveRenderRun}
            />
            <div className="bg-[#0b0f17] border border-sky-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" /> Упаковка слотов таймлайна в YouTube SEO
                </h3>
                <p className="text-[11px] text-slate-400">
                  Вся текстовая мета-упаковка и генерация на базе Gemini вынесены в отдельную вкладку
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectTab('seo')}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                <Package className="w-3.5 h-3.5" /> Открыть «📦 YouTube SEO» →
              </button>
            </div>
          </div>
        </section>
        <section
          id="view-thumb"
          className={`studio-view space-y-6 ${activeTab === 'thumb' ? '' : 'hidden'}`}
        >
          <ThumbnailStudioView
            thumbTitle={thumbTitle}
            onThumbTitleChange={setThumbTitle}
            thumbBadge={thumbBadge}
            onThumbBadgeChange={setThumbBadge}
            externalFontStyle={externalThumbFontStyle}
            onConsumeExternalFontStyle={() => setExternalThumbFontStyle(null)}
            externalCoverAImageUrl={editorEditedCoverAUrl}
            onConsumeExternalCoverAImage={() => setEditorEditedCoverAUrl(null)}
            manifestThumbnailSlots={manifestThumbnailSlots}
            endScreenSafeZone={effectiveEndScreenSafeZone}
            manifestDurationBadge={manifestDurationBadge}
            externalSlotTitle={externalThumbSlotTitle}
            onConsumeExternalSlotTitle={() => setExternalThumbSlotTitle(null)}
            youtubeMockTitle={loopProjectName}
            scriptContext={seoScriptText || sourceText}
            onSendToArtEditor={(imageDataUrl, slotLabel) => {
              setArtEditorIncomingAsset({
                dataUrl: imageDataUrl,
                label: slotLabel,
                nonce: Date.now()
              });
              handleSelectTab('editor');
            }}
            onNotify={showToast}
          />
        </section>
        <section
          id="view-editor"
          className={`studio-view space-y-6 ${activeTab === 'editor' ? '' : 'hidden'}`}
        >
          <ImageArtEditorView
            incomingAsset={artEditorIncomingAsset}
            onApplyToThumbnailCoverA={editedUrl => {
              setEditorEditedCoverAUrl(editedUrl);
              handleSelectTab('thumb');
              showToast('🎨 Обработанный арт применён к Обложке A!', 'success');
            }}
            onNotify={showToast}
          />
        </section>
        <section
          id="view-verbaflow"
          className={`studio-view space-y-6 ${activeTab === 'verbaflow' ? '' : 'hidden'}`}
        >
          <VerbaFlowTextWorkbench
            key={`verbaflow-workspace-${workspaceResetKey}`}
            sourceText={sourceText}
            onSourceTextChange={setSourceText}
            projectName={loopProjectName}
            narrativeScenes={activeNarrativeScenes}
            onUpdateSceneSubtitle={(sceneIndex, lang, text) =>
              setExternalSceneSubtitleEdit({ sceneIndex, lang, text, nonce: Date.now() })
            }
            strictSceneDurationLock={strictSceneDurationLock}
            onStrictSceneDurationLockChange={setStrictSceneDurationLock}
            sidecarBurnInVideo={sidecarBurnInVideo}
            onSidecarBurnInVideoChange={setSidecarBurnInVideo}
            exportSeparateSrtFiles={exportSeparateSrtFiles}
            onExportSeparateSrtFilesChange={setExportSeparateSrtFiles}
            selectedSubtitleLanguages={selectedSubtitleLanguages}
            onSelectedSubtitleLanguagesChange={setSelectedSubtitleLanguages}
            onImportManifestFile={handleVerbaFlowManifestFile}
            onScriptFileLoaded={handleVerbaFlowScriptLoaded}
            onSendToVoiceStudio={ttsReadyText => {
              setTransferredScript(ttsReadyText);
              showToast('🎙️ Текст очищен и подготовлен в «Дикторском цехе» VerbaFlow!', 'success');
            }}
            onSendToYoutubeSeo={(fullScript, newScenes) => {
              setSeoScriptText(fullScript);
              setTransferredScript(fullScript);
              if (newScenes.length > 0) setActiveNarrativeScenes(newScenes);
              handleSelectTab('seo');
              showToast('📈 Сценарий и структура сцен переданы в YouTube SEO!', 'success');
            }}
            onSendChaptersToYoutubeSeo={(chaptersTxt, chaptersCount, totalDurationFormatted) => {
              setVerbaFlowChaptersTxt(chaptersTxt);
              setSeoScriptText(sourceText);
              handleSelectTab('seo');
              showToast(
                `📑 ${chaptersCount} глав (${totalDurationFormatted}) переданы в output_chapters.txt!`,
                'success'
              );
            }}
            onSendScenesToTimeline={(newScenes, fullScript) => {
              setExternalNarrativeScenes(newScenes);
              setActiveNarrativeScenes(newScenes);
              setTransferredScript(fullScript);
              setSeoScriptText(fullScript);
              handleSelectTab('combine');
              showToast(
                `🎬 В Ритм-карту передано ${newScenes.length} сцен с расчётом duration и векторами камеры!`,
                'success'
              );
            }}
            onNotify={showToast}
          />
        </section>
        <section
          id="view-seo"
          className={`studio-view space-y-6 ${activeTab === 'seo' ? '' : 'hidden'}`}
        >
          <YouTubeSeoView
            projectName={loopProjectName}
            scriptContext={seoScriptText || transferredScript || sourceText}
            narrativeScenes={activeNarrativeScenes}
            loopSlots={timelineSlots}
            externalChaptersTxt={verbaFlowChaptersTxt}
            onClearExternalChapters={() => {
              setVerbaFlowChaptersTxt('');
              showToast('Переключено на автоматический расчёт глав по Ритм-карте.', 'info');
            }}
            seoState={youtubeSeoState}
            onSeoStateChange={setYoutubeSeoState}
            shortsExportConfig={shortsExportConfig}
            onShortsExportChange={setShortsExportConfig}
            renderSpecsSummary={renderSpecsSummary}
            activeSubtitleLanguages={selectedSubtitleLanguages}
            endScreenSafeZone={effectiveEndScreenSafeZone}
            exportOutputChaptersEnabled={exportOutputChaptersEnabled}
            onExportOutputChaptersEnabledChange={setExportOutputChaptersEnabled}
            exportReleaseCardMdEnabled={exportReleaseCardMdEnabled}
            onExportReleaseCardMdEnabledChange={setExportReleaseCardMdEnabled}
            onApplyTitleToThumbnail={selectedTitle => {
              const words = selectedTitle
                .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .join(' ')
                .toUpperCase();
              if (words) setThumbTitle(words);
              handleSelectTab('thumb');
              showToast(`Хук «${words}» передан на 4K обложку!`, 'success');
            }}
            onApplyTitleToSlot={(slot, titleEn, ctx) => {
              setExternalThumbSlotTitle({ slot, title: titleEn, context: ctx, nonce: Date.now() });
              handleSelectTab('thumb');
              showToast(`🎨 Заголовок отправлен на обложку ${slot}!`, 'success');
            }}
            onNotify={showToast}
          />
        </section>
        {renderStatus.visible && (
          <div
            id="render-status-bar"
            className={`bg-[#0f172a] border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl transition-all duration-300 ${
              renderStatus.status === 'success'
                ? 'border-emerald-400/60 shadow-[0_0_25px_rgba(52,211,153,0.18)]'
                : renderStatus.status === 'failure'
                  ? 'border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.18)]'
                  : 'border-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.14)]'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="relative flex items-center justify-center w-4 h-4">
                {renderStatus.status === 'running' && (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-gradient-to-tr from-amber-400 to-indigo-400 shadow-[0_0_10px_#fbbf24]" />
                  </>
                )}
                {renderStatus.status === 'success' && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                )}
                {renderStatus.status === 'failure' && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow-[0_0_12px_#f43f5e]" />
                )}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-xs font-bold ${
                    renderStatus.status === 'success'
                      ? 'text-emerald-300'
                      : renderStatus.status === 'failure'
                        ? 'text-rose-300'
                        : 'text-slate-100'
                  }`}
                  id="render-status-title"
                >
                  {renderStatus.title}
                </p>
                <p
                  className={`text-xs font-medium ${
                    renderStatus.status === 'success'
                      ? 'text-emerald-400/90'
                      : renderStatus.status === 'failure'
                        ? 'text-rose-400/90'
                        : 'text-amber-300'
                  }`}
                  id="render-status-step"
                >
                  {renderStatus.stepLabel}
                </p>
                <p className="text-[11px] text-slate-400" id="render-status-desc">
                  {renderStatus.desc}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                id="render-timer"
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
                  renderStatus.status === 'success'
                    ? 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40'
                    : renderStatus.status === 'failure'
                      ? 'text-rose-300 bg-rose-950/40 border-rose-500/40'
                      : 'text-amber-300 bg-[#090d16] border-slate-800'
                }`}
              >
                {formatTimeHMS(renderStatus.seconds)}
              </span>
              <button
                type="button"
                onClick={() => setIsRenderLogPanelOpen(prev => !prev)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer transition ${
                  isRenderLogPanelOpen
                    ? 'text-amber-300 bg-amber-500/15 border-amber-400/50'
                    : 'text-slate-300 hover:text-amber-300 bg-slate-900 border-slate-700'
                }`}
                title="Открыть или свернуть живой лог рендера"
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>{isRenderLogPanelOpen ? 'Свернуть лог' : 'Открыть лог'}</span>
              </button>
              <a
                id="gh-run-link"
                href={renderStatus.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-300 hover:text-amber-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
              >
                Смотреть лог в GitHub <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              </a>
            </div>
            {isRenderLogPanelOpen && (
              <div className="w-full pt-3 border-t border-white/[0.08]">
                <LiveTerminal
                  status={terminalRunnerStatus}
                  elapsedSeconds={renderStatus.seconds}
                  logs={terminalLogs}
                  runUrl={renderStatus.runUrl}
                  onClearLogs={clearTerminalLogs}
                  onCopyLogs={() => {
                    navigator.clipboard.writeText(
                      terminalLogs.map(l => sanitizeLogText(l.text)).join('\n')
                    );
                    showToast('Лог скопирован (секреты замаскированы)', 'info');
                  }}
                  onCancelRun={cancelActiveRenderRun}
                />
              </div>
            )}
          </div>
        )}
      </main>
      {isResetProjectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-project-modal-title"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-[#111622] border border-rose-500/35 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="reset-project-modal-title" className="text-sm font-bold text-slate-100">
                    Сбросить проект?
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Очистка локального черновика{' '}
                    <code className="font-mono text-rose-300">aether_workspace_draft</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetProjectModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Будут сброшены название проекта, сценарий VerbaFlow, сцены, оверлеи и настройки
              рендера. Подключения Google Auth, GitHub Token и Google Drive Folder ID сохранятся.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsResetProjectModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmResetWorkspaceProject}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold cursor-pointer transition shadow-md shadow-rose-500/20"
              >
                Да, сбросить проект
              </button>
            </div>
          </div>
        </div>
      )}
      {isConfigOpen && (
        <div
          id="gh-modal"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-[#111622] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Github className="text-amber-500 w-5 h-5" /> Подключение GitHub Раннера &amp;
                выгрузка в Google Drive
              </h3>
              <button
                type="button"
                onClick={closeConfigModal}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 bg-[#0b0f17] p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                  <Github className="w-4 h-4" /> 1. Параметры GitHub Actions
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    GitHub Personal Access Token (PAT):
                  </label>
                  <input
                    type="password"
                    id="gh-token"
                    value={modalToken}
                    onChange={e => setModalToken(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    placeholder="github_pat_..."
                  />
                  <span className="text-[10px] text-slate-500">
                    Fine-grained: Actions (read/write) на репозиторий раннера. Хранится только в
                    sessionStorage текущей вкладки.
                  </span>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Репозиторий (username/repo):
                  </label>
                  <input
                    type="text"
                    id="gh-repo"
                    value={modalRepo}
                    onChange={e => setModalRepo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    placeholder="ZermeXX/aetherflow-render"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Ветка:</label>
                  <input
                    type="text"
                    id="gh-branch"
                    value={modalBranch}
                    onChange={e => setModalBranch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-3 bg-[#0b0f17] p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" /> 2. Выгрузка в Google Drive (Rclone)
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    GDRIVE_FOLDER_ID (ID целевой папки на Google Диске):
                  </label>
                  <input
                    type="text"
                    id="gdrive-folder-id"
                    value={modalGdriveFolderId}
                    onChange={e => setModalGdriveFolderId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    placeholder="1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv"
                  />
                  <span className="text-[10px] text-slate-500">
                    Передаётся в манифесте как cloud_export.target_folder_id.
                  </span>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-[11px] text-emerald-200 leading-relaxed">
                  🔐 Ключ Service Account / rclone.conf хранится <b>только в GitHub Secrets</b>{' '}
                  раннера (<code className="font-mono">RCLONE_CONFIG</code>). В браузер он не
                  попадает. Загрузка файлов идёт через ваш OAuth-вход Google.
                </div>
              </div>
            </div>
            <div className="bg-[#0b0f17] p-4 rounded-xl border border-sky-500/30 space-y-3">
              <div className="text-xs font-bold text-sky-400 uppercase flex items-center gap-1.5">
                <Send className="w-4 h-4" /> 3. Уведомления в Telegram (Bot API)
              </div>
              <p className="text-[11px] text-slate-400">
                Мгновенное сообщение при успешной выгрузке мастера или при сбое сборки. Значения
                хранятся в sessionStorage; для раннера продублируйте их в GitHub Secrets.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Telegram Bot Token:</label>
                  <input
                    type="password"
                    value={modalTelegramBotToken}
                    onChange={e => setModalTelegramBotToken(e.target.value)}
                    placeholder="123456789:ABCdef..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-sky-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Telegram Chat ID:</label>
                  <input
                    type="text"
                    value={modalTelegramChatId}
                    onChange={e => setModalTelegramChatId(e.target.value)}
                    placeholder="-1001234567890 или 123456789"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-sky-400 font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowYamlPreview(prev => !prev)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  {showYamlPreview
                    ? '▼ Скрыть примечание о workflow раннера'
                    : '▶ Где лежит актуальный .github/workflows/render_loop.yml'}
                </button>
                <button
                  type="button"
                  onClick={copyWorkflowTemplate}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Открыть актуальный YAML
                </button>
              </div>
              {showYamlPreview && (
                <pre className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-56 custom-scroll whitespace-pre-wrap">
                  {WORKFLOW_LOOP_YAML}
                </pre>
              )}
            </div>
            <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveGitHubConfig}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Сохранить конфигурацию
              </button>
              <button
                type="button"
                onClick={copyWorkflowTemplate}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" /> Workflow раннера
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 md:bottom-auto md:top-3.5 md:right-4 md:left-auto md:translate-x-0 z-[60] pointer-events-none flex flex-col items-center md:items-end gap-1.5 px-3 max-w-[calc(100vw-24px)] md:max-w-md"
      >
        <AnimatePresence mode="popLayout">
          {toasts.slice(-2).map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -18, scale: 0.84 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 460, damping: 30 }}
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              title="Нажмите, чтобы скрыть уведомление"
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full border text-xs font-semibold shadow-[0_14px_38px_rgba(0,0,0,0.72)] backdrop-blur-xl cursor-pointer ${
                t.type === 'error'
                  ? 'bg-[#1a0b12]/90 border-rose-400/50 text-rose-100'
                  : t.type === 'success'
                    ? 'bg-[#091512]/90 border-emerald-400/50 text-emerald-100'
                    : 'bg-[#090D16]/90 border-amber-400/45 text-slate-100'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : t.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
              )}
              <span className="leading-snug text-left">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    t.action?.onClick();
                  }}
                  className="ml-1 shrink-0 px-2.5 py-1 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] transition cursor-pointer"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <footer className="relative z-10 border-t border-white/[0.08] bg-[#080c14]/90 backdrop-blur-md py-3.5 px-6 text-center text-xs text-white/55 font-mono">
        AetherCombine Studio • Cloud 4K Production Pipeline (GitHub Actions FFmpeg + Rclone Google
        Drive)
      </footer>
    </div>
  );
}
