import {LoopBuilderHeader} from './components/LoopBuilderHeader';
import {IsolatedProjectEditor} from './design-system/IsolatedProjectEditor';
/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StudioShell } from './design-system/StudioShell';
import {ProjectContextPreview} from './design-system/ProjectContextPreview';
import {readWorkspaceSelection,saveWorkspaceSelection,type WorkspaceId} from './design-system/workspaces';
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
  transition_in: {
    type: 'dissolve' | 'fade';
    duration_sec: number;
  };
  transition_out: {
    type: 'dissolve' | 'fade' | 'none';
    duration_sec: number;
  };
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
  assets?: {
    video_file?: string;
    voiceover_file?: string;
    [key: string]: unknown;
  };
  base_content?: {
    file_name: string;
    [key: string]: unknown;
  };
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
  cloud_export: {
    target_folder_id: string;
  };
  continuous_bed: ContinuousBedConfig;
  master_audio: LoopMasterAudioConfig;
  shorts_factory?: {
    enabled: boolean;
    clip_duration_sec: number;
  };
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
 Копирование его в раннер перезаписывало fixes (loop-baker, мосты актов,
 санитайз секретов, stream-upload). Источник правды — репозиторий раннера.
 */
const WORKFLOW_LOOP_YAML = `# Актуальный workflow хранится ТОЛЬКО в репозитории раннера:
# ${RENDER_REPO_WORKFLOW_URL}
#
# НЕ вставляйте сюда старые шаблоны из студии — они перезапишут P0-фиксы:
# loop-baker, мосты актов 90с, санитайз секретов, stream-upload, guard пустых слотов.
# Правьте файл напрямую в репозитории раннера.`;

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

export default function App(){
 // Do not unmount live legacy production state: isolated mode is only offered before mounting it.
 const [mode,setMode]=useState<'choose'|'legacy'|'isolated'>(()=>new URLSearchParams(window.location.search).get('v9-project-preview')==='1'?'choose':'legacy');
 if(mode==='choose')return <main className="mx-auto max-w-xl space-y-4 p-6 text-studio-text"><h1>AetherCombine Studio V9.0</h1><p>Choose legacy production or the isolated project editor preview. No automatic migration.</p><button type="button" onClick={()=>setMode('legacy')}>Open legacy Studio</button><button type="button" onClick={()=>setMode('isolated')}>Open isolated project editor</button></main>;
 if(mode==='isolated')return <IsolatedProjectEditor onExit={()=>setMode('choose')}/>;
 return <LegacyStudio/>;
}
function LegacyStudio() {
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
  const [workspace,setWorkspace] = useState<WorkspaceId>(readWorkspaceSelection);
  const handleWorkspaceChange = (next:WorkspaceId) => {
    setWorkspace(next);
    saveWorkspaceSelection(next);
  };
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
  const [externalSlotTitlePatch, setExternalSlotTitlePatch] = useState<{
    slot: 'A' | 'B' | 'C';
    title: string;
    nonce: number;
  } | null>(null);

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
  const [videoCrf, setVideoCrf] = useState<number>(
    () => bootDraft?.render_settings?.video_crf ?? 20
  );
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
  const [loopHours, setLoopHours] = useState<number>(
    () => bootDraft?.render_settings?.loop_hours ?? 3
  );
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
    () =>
      bootDraft?.render_settings?.seamless_transition_mode === 'pingpong' ? 'pingpong' : 'crossfade'
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
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
          })
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
    showToast(
      `Сформирован таймлайн на ${count} слотов со стыками актов ${actCrossfadeSec}с!`,
      'success'
    );
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
      inputsArgs.push(
        `-i "${loopMasterAudio.file_name.trim()}" # [Слой 2: Мастер-аудиодорожка]`
      );
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
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const buildLoopSrtContent = useCallback(
    (lang: 'en' | 'ru' | 'es' | 'de' | 'fr' | 'original' = loopSubtitleLanguage): string => {
      let cursor = 0;
      const localizedDefaults: Record<'en' | 'ru' | 'es' | 'de' | 'fr' | 'original', string[]> = {
        en: [
          'Act I: The Frozen Perimeter & Distant Wind',
          'Act II: Deepening Blizzard & Sub-Zero Resonance',
          'Act III: Whiteout Horizon & Midnight Pulse',
          'Act IV: Eye of the Storm & Silent Telemetry',
          'Act V: Glacial Echoes & Heavy Snowfall',
          'Act VI: Final Embers & Dawn Stillness'
        ],
        ru: [
          'Акт I: Замерзший периметр и далекий шторм',
          'Акт II: Усиливающаяся метель и низкочастотный гул',
          'Акт III: Белый горизонт и полуночный импульс',
          'Акт IV: Эпицентр бури и тихая телеметрия',
          'Акт V: Ледниковое эхо и густой снегопад',
          'Акт VI: Финальные искры и предрассветный штиль'
        ],
        es: [
          'Acto I: El perímetro helado y el viento lejano',
          'Acto II: Tormenta intensa y resonancia bajo cero',
          'Acto III: Horizonte blanco y pulso de medianoche',
          'Acto IV: El ojo de la tormenta y telemetría silenciosa',
          'Acto V: Ecos glaciares y nevada intensa',
          'Acto VI: Brasas finales y calma del amanecer'
        ],
        de: [
          'Akt I: Der gefrorene Perimeter und ferner Wind',
          'Akt II: Zunehmender Schneesturm und Sub-Zero-Resonanz',
          'Akt III: Weißer Horizont und Mitternachtspuls',
          'Akt IV: Auge des Sturms und stille Telemetrie',
          'Akt V: Gletscherechos und starker Schneefall',
          'Akt VI: Letzte Glut und Morgendämmerung'
        ],
        fr: [
          'Acte I : Le périmètre gelé et le vent lointain',
          'Acte II : Blizzard intense et résonance sous zéro',
          'Acte III : Horizon blanc et impulsion de minuit',
          'Acte IV : L’œil de la tempête et télémétrie silencieuse',
          'Acte V : Échos glaciaires et fortes chutes de neige',
          'Acte VI : Dernières braises et calme de l’aube'
        ],
        original: [
          'Act I: The Frozen Perimeter & Distant Wind',
          'Act II: Deepening Blizzard & Sub-Zero Resonance',
          'Act III: Whiteout Horizon & Midnight Pulse',
          'Act IV: Eye of the Storm & Silent Telemetry',
          'Act V: Glacial Echoes & Heavy Snowfall',
          'Act VI: Final Embers & Dawn Stillness'
        ]
      };

      const blocks = timelineSlots.map((slot, idx) => {
        const isLast = idx === timelineSlots.length - 1;
        const overlap =
          !isLast && slot.slot_transition_out.type !== 'none'
            ? slot.slot_transition_out.duration_sec
            : 0;
        const effectiveDur = Math.max(5, slot.slot_duration_sec - overlap);
        const start = cursor;
        const end = cursor + effectiveDur - 0.5;
        cursor += effectiveDur;
        const rawTitle = (slot.act_title || slot.title || '').trim();
        const fallbackList = localizedDefaults[lang] || localizedDefaults.en;
        const lineText =
          lang === 'original' && rawTitle ? rawTitle : fallbackList[idx % fallbackList.length];
        return `${idx + 1}\n${formatSrtTimeFromSeconds(start)} --> ${formatSrtTimeFromSeconds(end)}\n${lineText}`;
      });
      return blocks.join('\n\n');
    },
    [timelineSlots, loopSubtitleLanguage]
  );

  const resolvedLoopSrtContent = loopSrtCustomContent.trim()
    ? loopSrtCustomContent
    : buildLoopSrtContent(loopSubtitleLanguage);

  const handleDownloadLoopSrtFile = () => {
    const fileName = `subtitles_${loopSubtitleLanguage}.srt`;
    const srtPayload = loopSrtCustomContent.trim()
      ? loopSrtCustomContent
      : buildLoopSrtContent(loopSubtitleLanguage);
    if (!loopSrtCustomContent.trim()) {
      setLoopSrtCustomContent(srtPayload);
    }
    const blob = new Blob([srtPayload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Файл ${fileName} скачан на устройство!`, 'success');
  };

  const loopSubtitlesManifestObj: SubtitlesFlexibleConfig = {
    enabled: Boolean(loopBurnInSubtitles || loopUploadSrtToDrive),
    burn_in: loopBurnInSubtitles,
    upload_srt: loopUploadSrtToDrive,
    language: loopSubtitleLanguage,
    srt_filename: `subtitles_${loopSubtitleLanguage}.srt`,
    srt_content: loopBurnInSubtitles || loopUploadSrtToDrive ? resolvedLoopSrtContent : ''
  };

  const currentManifest: LoopBuildManifest = {
    version: '4.0-universal',
    manifest_version: '2.2-FINAL',
    enabled: ambientLoopEnabled,
    project_name: loopProjectName.trim() || 'Ambient Loop 4K',
    ...(exportYoutubeSeoBlock?.title ? { video_title: exportYoutubeSeoBlock.title } : {}),
    ...(verbaFlowChaptersTxt.trim() ? { chapters_youtube: verbaFlowChaptersTxt.trim() } : {}),
    spec_profile:
      importedManifestName ||
      `${loopProjectName.trim() || 'Ambient Loop 4K'} (${videoCodec} CRF ${videoCrf} • ${videoFps}fps • AAC ${audioBitrateKbps}kbps)`,
    hours: loopHours,
    calculated_project_duration_sec: calculatedProjectDurationSec,
    resolution: loopResolution,
    video_codec: videoCodec,
    fps: videoFps,
    audio_codec: 'aac',
    audio_bitrate_kbps: audioBitrateKbps,
    native_audio_engine: 'Omni 1.2 Flash',
    bitrate_preset: bitratePreset,
    crf: videoCrf,
    export_settings: {
      video_codec: videoCodec,
      preset:
        loopDraftMode || loopResolution === '720p'
          ? 'ultrafast'
          : videoCodec === 'libx264'
            ? 'veryfast'
            : 'medium',
      draft_mode: loopDraftMode || loopResolution === '720p',
      crf: videoCrf,
      resolution: loopResolution,
      fps: videoFps,
      audio_bitrate_kbps: audioBitrateKbps,
      subtitles: loopSubtitlesManifestObj
    },
    subtitles: loopSubtitlesManifestObj,
    subtitles_export: {
      enabled: exportSeparateSrtFiles || sidecarBurnInVideo || loopSubtitlesManifestObj.enabled,
      burn_in_video: sidecarBurnInVideo,
      export_separate_srt_files: exportSeparateSrtFiles,
      strict_scene_duration_lock: strictSceneDurationLock,
      languages: selectedSubtitleLanguages
    },
    crossfade_loop: seamlessStitchEnabled,
    seamless_mode: seamlessTransitionMode,
    act_crossfade_sec: actCrossfadeSec,
    internal_clip_duration_sec: timelineSlots[0]?.source_clip_duration_sec ?? 10,
    internal_loop_crossfade_sec: internalLoopCrossfadeSec,
    video_crossfade_sec: crossfadeDuration,
    audio_crossfade_sec: audioCrossfadeEnabled ? audioCrossfadeDuration : 0,
    use_embedded_audio: useEmbeddedAudio,
    final_black_screen_enabled: finalBlackScreenEnabled,
    final_black_screen_sec: finalBlackScreenSec,
    audio_mastering: audioMastering,
    seamless_asymmetry: seamlessAsymmetry,
    random_interval: seamlessAsymmetry.random_interval,
    video_filename: loopMedia?.name || timelineSlots[0]?.file_name || expectedVideoFilename || '',
    ...(useEmbeddedAudio
      ? {}
      : {
          audio_filename:
            loopAudio?.name ||
            continuousBed.file_name ||
            loopMasterAudio.file_name ||
            expectedAudioFilename ||
            ''
        }),
    gdrive_folder_id: gdriveFolderId || '',
    cloud_export: { target_folder_id: gdriveFolderId || '' },
    continuous_bed: continuousBed,
    master_audio: loopMasterAudio,
    ...(shortsFactoryEnabled
      ? { shorts_factory: { enabled: true, clip_duration_sec: 38 } }
      : {}),
    youtube_seo: exportYoutubeSeoBlock,
    timeline_slots: timelineSlots.map((slot, idx) => {
      const englishChapterTitle = toEnglishChapterTitle(
        slot.act_title ?? slot.title ?? '',
        idx,
        slot.act_timecode
      );
      const resolvedVideoFile = (
        slot.file_name ||
        slot.video_file ||
        slot.assets?.video_file ||
        ''
      ).trim();
      const resolvedVoiceoverFile = (slot.voiceover_file || slot.assets?.voiceover_file || '').trim();
      return {
        ...slot,
        act_title: englishChapterTitle,
        title: englishChapterTitle,
        file_name: resolvedVideoFile,
        video_file: resolvedVideoFile,
        voiceover_file: resolvedVoiceoverFile,
        assets: {
          ...(slot.assets || {}),
          video_file: resolvedVideoFile,
          voiceover_file: resolvedVoiceoverFile
        },
        base_content: { ...(slot.base_content || {}), file_name: resolvedVideoFile },
        inserts: slot.inserts.map(ins => ({
          ...ins,
          file_name: ins.file_name ?? '',
          filename: ins.file_name ?? ''
        }))
      };
    })
  };

  const toBase64 = (str: string): string => {
    try {
      const bytes = new TextEncoder().encode(str);
      const binString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
      return btoa(binString);
    } catch {
      return btoa(unescape(encodeURIComponent(str)));
    }
  };

  const encodeManifestBase64 = (manifestObj: unknown): string => {
    return toBase64(JSON.stringify(manifestObj));
  };

  const normalizeTimelineSlot = (rawSlot: Record<string, unknown>, idx: number): TimelineSlot => {
    const num = idx + 1;
    const pad = String(num).padStart(2, '0');
    const baseContent =
      rawSlot.base_content && typeof rawSlot.base_content === 'object'
        ? (rawSlot.base_content as Record<string, unknown>)
        : undefined;
    const slotAssets =
      rawSlot.assets && typeof rawSlot.assets === 'object'
        ? (rawSlot.assets as Record<string, unknown>)
        : undefined;

    const rawFileName = String(
      slotAssets?.video_file ||
        rawSlot.video_file ||
        rawSlot.file_name ||
        baseContent?.file_name ||
        baseContent?.filename ||
        baseContent?.asset_name ||
        baseContent?.video_file ||
        rawSlot.filename ||
        rawSlot.asset_name ||
        ''
    ).trim();
    const rawVoiceoverFile = String(
      slotAssets?.voiceover_file || rawSlot.voiceover_file || rawSlot.audio_file || ''
    ).trim();

    let rawInserts: unknown[] = [];
    if (Array.isArray(rawSlot.inserts)) {
      rawInserts = rawSlot.inserts;
    } else if (rawSlot.insert && typeof rawSlot.insert === 'object') {
      rawInserts = [rawSlot.insert];
    }

    const parsedInserts: SlotInsertItem[] = rawInserts
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, insIdx) => {
        const insertId = String(item.insert_id || item.id || `E${insIdx + 1}`);
        const isE3 = insertId.toUpperCase() === 'E3';
        const isE2 = insertId.toUpperCase() === 'E2';
        const itemBaseContent =
          item.base_content && typeof item.base_content === 'object'
            ? (item.base_content as Record<string, unknown>)
            : undefined;
        const rawInsertFileName = String(
          item.file_name ||
            item.filename ||
            item.asset_name ||
            item.video_file ||
            itemBaseContent?.file_name ||
            itemBaseContent?.filename ||
            ''
        ).trim();
        const transInObj =
          item.transition_in && typeof item.transition_in === 'object'
            ? (item.transition_in as Record<string, unknown>)
            : {};
        const tInType =
          transInObj.type === 'fade' || item.transition_in === 'fade' ? 'fade' : 'dissolve';
        const tInDur =
          Number(transInObj.duration_sec ?? item.fade_in_sec ?? item.transition_duration_sec ?? 1.5) ||
          1.5;
        const transOutObj =
          item.transition_out && typeof item.transition_out === 'object'
            ? (item.transition_out as Record<string, unknown>)
            : {};
        const rawOutType = String(
          transOutObj.type ?? (item.hold_until_end || isE3 ? 'none' : 'dissolve')
        ).toLowerCase();
        const tOutType: 'dissolve' | 'fade' | 'none' =
          rawOutType === 'none' ? 'none' : rawOutType === 'fade' ? 'fade' : 'dissolve';
        const defaultOutDur = isE3 ? 0 : isE2 ? 3.0 : 1.5;
        const tOutDur =
          tOutType === 'none'
            ? 0
            : Number(transOutObj.duration_sec ?? item.fade_out_sec ?? defaultOutDur) || defaultOutDur;
        const holdUntilEnd = Boolean(item.hold_until_end ?? (tOutType === 'none' || isE3));
        const insStartSec = typeof item.start_sec === 'number' ? item.start_sec : undefined;
        const insEndSec = typeof item.end_sec === 'number' ? item.end_sec : undefined;
        const insComputedDur =
          insStartSec !== undefined && insEndSec !== undefined && insEndSec > insStartSec
            ? insEndSec - insStartSec
            : undefined;
        return {
          insert_id: insertId,
          timecode_label:
            typeof item.timecode_label === 'string'
              ? item.timecode_label
              : typeof item.title === 'string'
                ? item.title
                : undefined,
          asset_id: String(item.asset_id ?? item.id ?? ''),
          file_name: rawInsertFileName,
          filename: rawInsertFileName,
          trigger_at_sec: Math.max(0, Number(item.trigger_at_sec ?? item.start_sec ?? 0) || 0),
          duration_sec: Math.max(1, Number(item.duration_sec ?? insComputedDur ?? 10) || 10),
          transition_in: { type: tInType, duration_sec: tInDur },
          transition_out: { type: tOutType, duration_sec: tOutDur },
          hold_until_end: holdUntilEnd,
          audio_soft_compressor: Boolean(item.audio_soft_compressor ?? isE3),
          max_peak_over_bed_db: Number(item.max_peak_over_bed_db ?? 6) || 6
        };
      });

    const rawTransOut =
      rawSlot.slot_transition_out && typeof rawSlot.slot_transition_out === 'object'
        ? (rawSlot.slot_transition_out as Record<string, unknown>)
        : rawSlot.transition_out && typeof rawSlot.transition_out === 'object'
          ? (rawSlot.transition_out as Record<string, unknown>)
          : {};
    const outTypeRaw = String(rawTransOut.type ?? 'xfade').toLowerCase();
    const outType: SlotTransitionOut['type'] =
      outTypeRaw === 'none'
        ? 'none'
        : outTypeRaw === 'dissolve'
          ? 'dissolve'
          : outTypeRaw === 'fade'
            ? 'fade'
            : 'xfade';
    const outDur =
      outType === 'none' ? 0 : Math.max(0, Number(rawTransOut.duration_sec ?? 90.0) || 90.0);

    const startSec = typeof rawSlot.start_sec === 'number' ? rawSlot.start_sec : undefined;
    const endSec = typeof rawSlot.end_sec === 'number' ? rawSlot.end_sec : undefined;
    const rangeDurationSec =
      startSec !== undefined && endSec !== undefined && endSec >= startSec
        ? endSec - startSec
        : undefined;
    const resolvedDurationSec = Number(
      rawSlot.slot_duration_sec ??
        baseContent?.slot_duration_sec ??
        rawSlot.duration_sec ??
        rangeDurationSec ??
        1800
    );
    const resolvedActTitle = String(rawSlot.act_title || rawSlot.title || '');
    const resolvedSlotId = String(rawSlot.slot_id ?? `SLOT_${pad}`);
    const resolvedAssetId = String(rawSlot.asset_id || baseContent?.asset_id || '');

    return {
      slot_index: Number(rawSlot.slot_index ?? num) || num,
      slot_id: resolvedSlotId,
      act_title: resolvedActTitle,
      title: resolvedActTitle,
      act_timecode:
        typeof rawSlot.act_timecode === 'string'
          ? rawSlot.act_timecode
          : startSec !== undefined && endSec !== undefined
            ? `${startSec}s – ${endSec}s`
            : undefined,
      asset_id: resolvedAssetId,
      file_name: rawFileName,
      video_file: rawFileName,
      ...(rawVoiceoverFile ? { voiceover_file: rawVoiceoverFile } : {}),
      assets: {
        ...(slotAssets || {}),
        video_file: rawFileName,
        ...(rawVoiceoverFile ? { voiceover_file: rawVoiceoverFile } : {})
      },
      base_content: { ...(baseContent || {}), file_name: rawFileName },
      ...(startSec !== undefined ? { start_sec: startSec } : {}),
      ...(endSec !== undefined ? { end_sec: endSec } : {}),
      source_clip_duration_sec: Math.max(
        1,
        Number(
          rawSlot.source_clip_duration_sec ??
            baseContent?.source_clip_duration_sec ??
            baseContent?.clip_duration_sec ??
            10
        ) || 10
      ),
      internal_loop_crossfade_sec: Math.max(
        0.1,
        Number(
          rawSlot.internal_loop_crossfade_sec ??
            baseContent?.internal_loop_crossfade_sec ??
            baseContent?.loop_crossfade_sec ??
            1.0
        ) || 1.0
      ),
      slot_duration_sec: Math.max(1, resolvedDurationSec || 1800),
      inserts: parsedInserts,
      slot_transition_out: { type: outType, duration_sec: outDur }
    };
  };

  const extractFullScriptFromManifest = useCallback((raw: Record<string, unknown>): string => {
    const directCandidates = [
      raw.full_script,
      raw.script_text,
      raw.script,
      raw.narration_script,
      raw.voiceover_script
    ];
    for (const cand of directCandidates) {
      if (typeof cand === 'string' && cand.trim().length > 10) {
        return cand.trim();
      }
    }
    const timelineObj =
      raw.timeline && typeof raw.timeline === 'object' && !Array.isArray(raw.timeline)
        ? (raw.timeline as Record<string, unknown>)
        : undefined;
    const rawItems = Array.isArray(raw.timeline)
      ? raw.timeline
      : Array.isArray(raw.scenes)
        ? raw.scenes
        : Array.isArray(timelineObj?.scenes)
          ? (timelineObj?.scenes as unknown[])
          : Array.isArray(raw.timeline_slots)
            ? raw.timeline_slots
            : Array.isArray(raw.slots)
              ? raw.slots
              : [];

    const lines: string[] = [];
    rawItems.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      const subs =
        obj.subtitles && typeof obj.subtitles === 'object'
          ? (obj.subtitles as Record<string, unknown>)
          : undefined;
      const narration =
        (typeof subs?.RU === 'string' && subs.RU.trim()) ||
        (typeof subs?.ru === 'string' && subs.ru.trim()) ||
        (typeof obj.narration === 'string' && obj.narration.trim()) ||
        (typeof obj.voiceover_text === 'string' && obj.voiceover_text.trim()) ||
        (typeof obj.script_text === 'string' && obj.script_text.trim()) ||
        (typeof obj.script === 'string' && obj.script.trim()) ||
        (typeof obj.text === 'string' && obj.text.trim()) ||
        (typeof subs?.EN === 'string' && subs.EN.trim()) ||
        (typeof subs?.en === 'string' && subs.en.trim()) ||
        (typeof obj.text_overlay === 'string' && obj.text_overlay.trim()) ||
        '';
      if (narration) {
        lines.push(`[Сцена ${idx + 1}] ${narration.trim()}`);
      }
    });
    return lines.join('\n\n').trim();
  }, []);

  const applyV21CrossTabSettings = (
    raw: Record<string, unknown>,
    sourceLabel: string,
    options?: { syncCombine?: boolean }
  ) => {
    const parsed = parseV21ManifestObject(raw);
    if (!parsed.isV21Manifest) return;
    if (parsed.projectName) {
      setLoopProjectName(parsed.projectName);
    }
    setAmbientLoopEnabled(parsed.ambientLoopEnabled);
    setStrictSceneDurationLock(parsed.tab3Verbaflow.strictSceneDurationLock);
    setSidecarBurnInVideo(parsed.tab3Verbaflow.burnInVideo);
    setExportSeparateSrtFiles(parsed.tab3Verbaflow.exportSeparateSrtFiles);
    setSelectedSubtitleLanguages(parsed.tab3Verbaflow.subtitleLanguages);
    if (parsed.videoTitle) {
      const nextTitle = parsed.videoTitle.slice(0, 100);
      setYoutubeSeoState(prev => ({
        ...prev,
        selectedTitleId: 'A',
        titles: prev.titles.map((item, idx) =>
          idx === 0 || item.id === prev.selectedTitleId ? { ...item, title: nextTitle } : item
        )
      }));
    }
    if (parsed.tab4Seo.chaptersYoutubeText) {
      setVerbaFlowChaptersTxt(parsed.tab4Seo.chaptersYoutubeText);
    }
    setExportOutputChaptersEnabled(parsed.tab4Seo.exportOutputChaptersTxt);
    setExportReleaseCardMdEnabled(parsed.tab4Seo.exportReleaseCardMd);
    setManifestThumbnailSlots(parsed.tab5Art.thumbnailSlots);
    setEndScreenSafeZone(parsed.tab5Art.endScreenSafeZone);
    const extractedScript = extractFullScriptFromManifest(raw);
    if (extractedScript) {
      setSourceText(extractedScript);
      setSeoScriptText(extractedScript);
      setTransferredScript(extractedScript);
    }
    if (parsed.totalDurationFormatted) {
      setManifestDurationBadge(parsed.totalDurationFormatted);
    }
    if (options?.syncCombine) {
      setExternalV21Manifest({ raw, fileName: sourceLabel, nonce: Date.now() });
    }
  };

  const applyManifestObject = (raw: Record<string, unknown>, sourceLabel: string) => {
    applyV21CrossTabSettings(raw, sourceLabel, { syncCombine: true });
    const extractedFromManifest = extractFullScriptFromManifest(raw);
    if (extractedFromManifest) {
      setSourceText(extractedFromManifest);
      setSeoScriptText(extractedFromManifest);
      setTransferredScript(extractedFromManifest);
    }

    const timelineObj =
      raw.timeline && typeof raw.timeline === 'object'
        ? (raw.timeline as Record<string, unknown>)
        : undefined;
    const exportSettingsObj =
      raw.export_settings && typeof raw.export_settings === 'object'
        ? (raw.export_settings as Record<string, unknown>)
        : raw.encoding && typeof raw.encoding === 'object'
          ? (raw.encoding as Record<string, unknown>)
          : undefined;
    const cloudExportObj =
      raw.cloud_export && typeof raw.cloud_export === 'object'
        ? (raw.cloud_export as Record<string, unknown>)
        : undefined;

    const rawSlots = Array.isArray(raw.timeline_slots)
      ? raw.timeline_slots
      : Array.isArray(raw.slots)
        ? raw.slots
        : Array.isArray(timelineObj?.timeline_slots)
          ? (timelineObj?.timeline_slots as unknown[])
          : Array.isArray(timelineObj?.slots)
            ? (timelineObj?.slots as unknown[])
            : null;

    if (rawSlots && rawSlots.length > 0) {
      const normalized = rawSlots
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s, idx) => normalizeTimelineSlot(s, idx));
      if (normalized.length > 0) {
        setTimelineSlots(normalized);
        const totalSec = normalized.reduce((acc, sl, idx) => {
          const isLast = idx === normalized.length - 1;
          const overlap =
            !isLast && sl.slot_transition_out.type !== 'none' ? sl.slot_transition_out.duration_sec : 0;
          return acc + sl.slot_duration_sec - overlap;
        }, 0);
        const derivedHours = Math.max(3, Math.min(10, Math.round(totalSec / 3600) || 3));
        if (raw.hours === undefined) {
          setLoopHours(derivedHours);
        }
        setExpectedVideoFilename(normalized[0]?.file_name || '');
      }
    }

    if (typeof raw.project_name === 'string' && raw.project_name.trim()) {
      setLoopProjectName(raw.project_name.trim());
    }

    if (raw.continuous_bed && typeof raw.continuous_bed === 'object') {
      const bedObj = raw.continuous_bed as Record<string, unknown>;
      const bedFileName = String(bedObj.file_name || bedObj.filename || bedObj.asset_name || '').trim();
      setContinuousBed(prev => ({
        enabled: typeof bedObj.enabled === 'boolean' ? bedObj.enabled : Boolean(bedFileName),
        asset_id: typeof bedObj.asset_id === 'string' ? bedObj.asset_id : '',
        file_name: bedFileName,
        loop_entire_duration:
          typeof bedObj.loop_entire_duration === 'boolean' ? bedObj.loop_entire_duration : true,
        acrossfade_sec:
          typeof bedObj.acrossfade_sec === 'number' ? bedObj.acrossfade_sec : prev.acrossfade_sec,
        veo_native_audio:
          typeof bedObj.veo_native_audio === 'boolean' ? bedObj.veo_native_audio : prev.veo_native_audio,
        veo_audio_weight:
          typeof bedObj.veo_audio_weight === 'number' ? bedObj.veo_audio_weight : prev.veo_audio_weight,
        bed_audio_weight:
          typeof bedObj.bed_audio_weight === 'number' ? bedObj.bed_audio_weight : prev.bed_audio_weight
      }));
    }

    if (raw.master_audio && typeof raw.master_audio === 'object') {
      const maObj = raw.master_audio as Record<string, unknown>;
      const maFile = String(maObj.file_name || maObj.filename || '').trim();
      setLoopMasterAudio(prev => ({
        enabled: typeof maObj.enabled === 'boolean' ? maObj.enabled : Boolean(maFile),
        file_name: maFile,
        start_timecode:
          typeof maObj.start_timecode === 'string' ? maObj.start_timecode : prev.start_timecode,
        weight: typeof maObj.weight === 'number' ? maObj.weight : prev.weight
      }));
    }

    if (Array.isArray(raw.random_interval) && raw.random_interval.length >= 2) {
      const minInt = Math.max(60, Number(raw.random_interval[0]) || 1200);
      const maxInt = Math.max(minInt, Number(raw.random_interval[1]) || 2400);
      setSeamlessAsymmetry({ enabled: true, random_interval: [minInt, maxInt] });
    }

    const rawCodec = raw.video_codec ?? exportSettingsObj?.video_codec ?? exportSettingsObj?.codec;
    if (rawCodec === 'libx265' || rawCodec === 'libx264') {
      setVideoCodec(rawCodec);
      setVideoCrf(rawCodec === 'libx265' ? 22 : 20);
    } else if (typeof rawCodec === 'string') {
      if (rawCodec.toLowerCase().includes('265') || rawCodec.toLowerCase().includes('hevc')) {
        setVideoCodec('libx265');
        setVideoCrf(22);
      } else if (rawCodec.toLowerCase().includes('264')) {
        setVideoCodec('libx264');
        setVideoCrf(20);
      }
    }

    const rawFps = Number(raw.fps ?? exportSettingsObj?.fps);
    if (rawFps === 24 || rawFps === 30 || rawFps === 60) {
      setVideoFps(rawFps as 24 | 30 | 60);
    }
    const rawAudioBitrate = Number(raw.audio_bitrate_kbps ?? exportSettingsObj?.audio_bitrate_kbps);
    if (rawAudioBitrate === 320 || rawAudioBitrate === 256 || rawAudioBitrate === 192) {
      setAudioBitrateKbps(rawAudioBitrate as 320 | 256 | 192);
    }
    if (typeof raw.act_crossfade_sec === 'number' && raw.act_crossfade_sec > 0) {
      setActCrossfadeSec(raw.act_crossfade_sec);
    }
    if (typeof raw.internal_loop_crossfade_sec === 'number' && raw.internal_loop_crossfade_sec > 0) {
      setInternalLoopCrossfadeSec(raw.internal_loop_crossfade_sec);
    }
    if (typeof raw.final_black_screen_enabled === 'boolean') {
      setFinalBlackScreenEnabled(raw.final_black_screen_enabled);
    }
    if (typeof raw.final_black_screen_sec === 'number' && raw.final_black_screen_sec >= 0) {
      setFinalBlackScreenSec(raw.final_black_screen_sec);
    }

    if (raw.audio_mastering && typeof raw.audio_mastering === 'object') {
      const am = raw.audio_mastering as Record<string, unknown>;
      setAudioMastering(prev => ({
        loudnorm_enabled:
          typeof am.loudnorm_enabled === 'boolean' ? am.loudnorm_enabled : prev.loudnorm_enabled,
        integrated_lufs:
          typeof am.integrated_lufs === 'number'
            ? Math.max(-18, Math.min(-14, am.integrated_lufs))
            : prev.integrated_lufs,
        true_peak_dbtp:
          typeof am.true_peak_dbtp === 'number' ? Math.min(-1, am.true_peak_dbtp) : prev.true_peak_dbtp,
        lra: typeof am.lra === 'number' ? am.lra : prev.lra,
        e3_soft_attack_compressor:
          typeof am.e3_soft_attack_compressor === 'boolean'
            ? am.e3_soft_attack_compressor
            : prev.e3_soft_attack_compressor,
        e3_max_peak_over_bed_db:
          typeof am.e3_max_peak_over_bed_db === 'number'
            ? am.e3_max_peak_over_bed_db
            : prev.e3_max_peak_over_bed_db
      }));
    }

    if (raw.hours !== undefined) {
      setLoopHours(Math.max(3, Math.min(10, Number(raw.hours) || 3)));
    }

    const rawRes = raw.resolution ?? exportSettingsObj?.resolution;
    if (typeof rawRes === 'string') {
      const normRes = rawRes.toLowerCase();
      if (normRes === '720p' || normRes === '1080p' || normRes === '2k' || normRes === '4k') {
        setLoopResolution(normRes);
        setLoopDraftMode(normRes === '720p');
      } else if (normRes.includes('3840') || normRes.includes('2160')) {
        setLoopResolution('4k');
      } else if (normRes.includes('2560') || normRes.includes('1440')) {
        setLoopResolution('2k');
      } else if (normRes.includes('1920') || normRes.includes('1080')) {
        setLoopResolution('1080p');
      } else if (normRes.includes('1280') || normRes.includes('720')) {
        setLoopResolution('720p');
        setLoopDraftMode(true);
      }
    }

    const rawPreset = raw.bitrate_preset ?? exportSettingsObj?.bitrate_preset;
    const rawCrf = raw.crf ?? exportSettingsObj?.crf;
    if (typeof rawCrf === 'number' && rawCrf >= 14 && rawCrf <= 32) {
      setVideoCrf(rawCrf);
    }
    if (typeof rawPreset === 'string') {
      const normPreset = rawPreset.toLowerCase();
      if (normPreset === 'cinema' || normPreset === 'standard' || normPreset === 'eco') {
        setBitratePreset(normPreset);
      } else if (normPreset.includes('cinema') || normPreset.includes('master')) {
        setBitratePreset('cinema');
      } else if (normPreset.includes('eco')) {
        setBitratePreset('eco');
      } else {
        setBitratePreset('standard');
      }
    } else if (typeof rawCrf === 'number') {
      if (rawCrf <= 19) setBitratePreset('cinema');
      else if (rawCrf >= 25) setBitratePreset('eco');
      else setBitratePreset('standard');
    }

    if (typeof raw.crossfade_loop === 'boolean') {
      setSeamlessStitchEnabled(raw.crossfade_loop);
    } else if (typeof raw.seamless_crossfade === 'boolean') {
      setSeamlessStitchEnabled(raw.seamless_crossfade);
    }
    if (typeof raw.seamless_mode === 'string') {
      if (raw.seamless_mode === 'pingpong' || raw.seamless_mode === 'crossfade') {
        setSeamlessTransitionMode(raw.seamless_mode);
      }
    }
    const vFade = Number(raw.video_crossfade_sec ?? raw.seamless_crossfade);
    if (!isNaN(vFade) && vFade >= 0.5 && vFade <= 5.0) {
      setCrossfadeDuration(vFade);
      setSeamlessStitchEnabled(true);
    }
    const aFade = Number(raw.audio_crossfade_sec);
    if (!isNaN(aFade)) {
      if (aFade > 0) {
        setAudioCrossfadeEnabled(true);
        setAudioCrossfadeDuration(aFade);
      } else {
        setAudioCrossfadeEnabled(false);
      }
    }

    if (typeof raw.use_embedded_audio === 'boolean') {
      setUseEmbeddedAudio(raw.use_embedded_audio);
    }

    const resolvedFolderId = String(
      cloudExportObj?.target_folder_id ||
        cloudExportObj?.gdrive_folder_id ||
        cloudExportObj?.folder_id ||
        raw.target_folder_id ||
        raw.gdrive_folder_id ||
        ''
    ).trim();
    if (resolvedFolderId) {
      setGdriveFolderId(resolvedFolderId);
      localStorage.setItem('ac_gdrive_folder_id', resolvedFolderId);
    }

    if (typeof raw.video_filename === 'string') {
      setExpectedVideoFilename(raw.video_filename.trim());
    }
    if (typeof raw.audio_filename === 'string') {
      setExpectedAudioFilename(raw.audio_filename.trim());
    }

    const rawSubsObj =
      (raw.subtitles && typeof raw.subtitles === 'object'
        ? (raw.subtitles as Record<string, unknown>)
        : undefined) ||
      (exportSettingsObj?.subtitles && typeof exportSettingsObj.subtitles === 'object'
        ? (exportSettingsObj.subtitles as Record<string, unknown>)
        : undefined);
    if (rawSubsObj) {
      if (typeof rawSubsObj.burn_in === 'boolean') {
        setLoopBurnInSubtitles(rawSubsObj.burn_in);
      }
      if (typeof rawSubsObj.upload_srt === 'boolean') {
        setLoopUploadSrtToDrive(rawSubsObj.upload_srt);
      }
      if (typeof rawSubsObj.language === 'string') {
        const l = rawSubsObj.language.toLowerCase();
        if (l.startsWith('ru')) setLoopSubtitleLanguage('ru');
        else if (l.startsWith('es')) setLoopSubtitleLanguage('es');
        else if (l.startsWith('de')) setLoopSubtitleLanguage('de');
        else if (l.startsWith('fr')) setLoopSubtitleLanguage('fr');
        else if (l.startsWith('orig')) setLoopSubtitleLanguage('original');
        else setLoopSubtitleLanguage('en');
      }
      if (typeof rawSubsObj.srt_content === 'string' && rawSubsObj.srt_content.trim()) {
        setLoopSrtCustomContent(rawSubsObj.srt_content);
      }
    }

    if (raw.shorts_factory && typeof raw.shorts_factory === 'object') {
      setShortsFactoryEnabled(Boolean((raw.shorts_factory as Record<string, unknown>).enabled));
    } else {
      setShortsFactoryEnabled(false);
    }

    const importedSceneCount = Array.isArray(raw.timeline)
      ? raw.timeline.length
      : Array.isArray(raw.scenes)
        ? raw.scenes.length
        : 0;

    setImportedManifestName(sourceLabel);
    showToast(
      `JSON-манифест «${sourceLabel}» (${
        rawSlots
          ? `${rawSlots.length} слотов`
          : importedSceneCount > 0
            ? `${importedSceneCount} сцен`
            : 'конфиг'
      }) успешно применен!`,
      'success'
    );
  };

  const handleGlobalManifestPaste = (e: React.ClipboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    const rawText = e.clipboardData?.getData('text/plain')?.trim();
    if (!rawText || (!rawText.startsWith('{') && !rawText.startsWith('['))) return;
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        e.preventDefault();
        applyManifestObject({ scenes: parsed }, 'clipboard_manifest.json');
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        (Array.isArray((parsed as Record<string, unknown>).timeline) ||
          Array.isArray((parsed as Record<string, unknown>).scenes) ||
          Array.isArray((parsed as Record<string, unknown>).timeline_slots) ||
          Array.isArray((parsed as Record<string, unknown>).slots) ||
          (parsed as Record<string, unknown>).manifest_version ||
          (parsed as Record<string, unknown>).project_name)
      ) {
        e.preventDefault();
        applyManifestObject(parsed as Record<string, unknown>, 'clipboard_manifest.json');
      }
    } catch {
      // Игнорируем обычный текст из буфера обмена
    }
  };

  const handleImportManifestFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
          showToast('Некорректный формат JSON-манифеста!', 'error');
          return;
        }
        applyManifestObject(parsed as Record<string, unknown>, file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast('Ошибка чтения JSON: ' + msg, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportManifestFile = () => {
    const jsonString = JSON.stringify(currentManifest, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const baseName = importedManifestName
      ? importedManifestName.replace(/\.json$/i, '')
      : `project_manifest_${videoCodec}_${videoFps}fps_${loopResolution}`;
    const exportFileName = `${baseName}.json`;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Манифест ${exportFileName} экспортирован!`, 'success');
  };

  const handleAttachSlotFile = (slotIdx: number, file: File | null) => {
    if (!file) return;
    setLoopMedia(file);
    setUploadedLoopAssets(prev => ({ ...prev, [file.name]: file }));
    updateTimelineSlotField(slotIdx, 'file_name', file.name);
    showToast(`К слоту #${slotIdx + 1} прикреплен локальный файл «${file.name}»`, 'success');
  };

  const handleAttachInsertFile = (slotIdx: number, insIdx: number, file: File | null) => {
    if (!file) return;
    setUploadedLoopAssets(prev => ({ ...prev, [file.name]: file }));
    updateSlotInsert(slotIdx, insIdx, { file_name: file.name });
    showToast(
      `К вставке E${insIdx + 1} (слот #${slotIdx + 1}) прикреплен файл «${file.name}»`,
      'success'
    );
  };

  const saveManifestPreset = () => {
    const cleanName =
      presetNameInput.trim() ||
      `${loopProjectName.trim() || 'Ambient Loop 4K'} (${timelineSlots.length} сл. • ${videoCodec})`;
    const newPreset: SavedManifestPreset = {
      id: `preset-${Date.now()}`,
      name: cleanName,
      savedAt: new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      manifest: JSON.parse(JSON.stringify(currentManifest)) as LoopBuildManifest
    };
    setSavedManifestPresets(prev => {
      const updated = [newPreset, ...prev.filter(p => p.name !== cleanName)].slice(0, 30);
      localStorage.setItem(MANIFEST_PRESETS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setSelectedPresetId(newPreset.id);
    setPresetNameInput('');
    showToast(`💾 Пресет «${cleanName}» сохранён в браузере!`, 'success');
  };

  const loadSelectedManifestPreset = () => {
    const preset = savedManifestPresets.find(p => p.id === selectedPresetId);
    if (!preset) {
      showToast('Выберите сохранённый пресет из списка для загрузки.', 'info');
      return;
    }
    applyManifestObject(preset.manifest as unknown as Record<string, unknown>, `preset:${preset.name}`);
    showToast(
      `📂 Загружен пресет «${preset.name}» (${preset.manifest.timeline_slots.length} сл.)`,
      'success'
    );
  };

  const deleteSelectedManifestPreset = () => {
    if (!selectedPresetId) return;
    const target = savedManifestPresets.find(p => p.id === selectedPresetId);
    setSavedManifestPresets(prev => {
      const updated = prev.filter(p => p.id !== selectedPresetId);
      localStorage.setItem(MANIFEST_PRESETS_STORAGE_KEY, JSON.stringify(updated));
      setSelectedPresetId(updated[0]?.id || '');
      return updated;
    });
    if (target) {
      showToast(`🗑 Пресет «${target.name}» удалён`, 'info');
    }
  };

  const enqueueCurrentManifest = () => {
    const manifestSnapshot = JSON.parse(JSON.stringify(currentManifest)) as LoopBuildManifest;
    const item: QueuedManifestItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      projectName: manifestSnapshot.project_name || 'Ambient Loop 4K',
      codec: manifestSnapshot.video_codec,
      crf: manifestSnapshot.crf,
      fps: manifestSnapshot.fps,
      resolution: manifestSnapshot.resolution,
      hours: manifestSnapshot.hours,
      slotsCount: manifestSnapshot.timeline_slots.length,
      addedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      manifest: manifestSnapshot
    };
    setBatchQueue(prev => {
      const next = [...prev, item];
      localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    showToast(
      `➕ Манифест «${item.projectName}» добавлен в очередь сборок (всего в очереди: ${batchQueue.length + 1})`,
      'success'
    );
  };

  const removeFromBatchQueue = (id: string) => {
    setBatchQueue(prev => {
      const next = prev.filter(item => item.id !== id);
      localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearBatchQueue = () => {
    setBatchQueue([]);
    localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, JSON.stringify([]));
    showToast('Очередь сборок очищена', 'info');
  };

  const startNextFromBatchQueue = () => {
    if (isRunnerActive || isLoopDispatching) {
      showToast(
        'Дождитесь завершения активного run — следующий манифест стартует автоматически!',
        'info'
      );
      return;
    }
    const [nextItem, ...restQueue] = batchQueue;
    if (!nextItem) return;
    setBatchQueue(restQueue);
    localStorage.setItem(BATCH_QUEUE_STORAGE_KEY, JSON.stringify(restQueue));
    void dispatchLoopWorkflow(false, nextItem.manifest);
  };

  const dispatchLoopWorkflow = async (
    preflightOnly: boolean,
    overrideManifest?: LoopBuildManifest,
    options?: { bypassActiveGuard?: boolean }
  ) => {
    if (!options?.bypassActiveGuard && (isRunnerActive || isLoopDispatching)) {
      showToast(
        'Раннер уже выполняет задачу (RUNNING/QUEUED). Дождитесь завершения или отмените текущий run.',
        'info'
      );
      return;
    }
    const githubToken = ghToken.trim();
    if (!githubToken) {
      showToast('Настройте подключение к GitHub (Personal Access Token)!', 'error');
      openConfigModal();
      return;
    }

    const baseManifestToSend = overrideManifest || currentManifest;
    const manifestToSend: LoopBuildManifest = {
      ...baseManifestToSend,
      youtube_seo: baseManifestToSend.youtube_seo || exportYoutubeSeoBlock,
      timeline_slots: baseManifestToSend.timeline_slots.map((slot, idx) => {
        const englishChapterTitle = toEnglishChapterTitle(
          slot.act_title ?? slot.title ?? '',
          idx,
          slot.act_timecode
        );
        return { ...slot, act_title: englishChapterTitle, title: englishChapterTitle };
      })
    };

    const emptySlots = manifestToSend.timeline_slots
      .map((s, i) => ((s.file_name || s.base_content?.file_name || '').trim() ? null : i + 1))
      .filter((n): n is number => n !== null);
    if (emptySlots.length > 0) {
      showToast(
        `Пустые file_name в слотах: ${emptySlots.join(', ')}. Заполните их перед запуском.`,
        'error'
      );
      return;
    }

    if (!preflightOnly && (manifestToSend.hours < 3 || manifestToSend.hours > 10)) {
      showToast('Длительность лупа должна быть строго от 3 до 10 часов!', 'error');
      return;
    }

    const targetRepo = (ghRepo || 'ZermeXX/aetherflow-render').trim();
    const targetBranch = (ghBranch || 'main').trim();
    const startTime = Date.now();
    const scaleFlag = getScaleFilter(manifestToSend.resolution);
    const crfVal = manifestToSend.crf;

    const compactLoopPayloadObj = {
      manifest_version: manifestToSend.manifest_version || '2.2-FINAL',
      enabled: manifestToSend.enabled,
      project_name: manifestToSend.project_name,
      hours: manifestToSend.hours,
      calculated_project_duration_sec: manifestToSend.calculated_project_duration_sec,
      resolution: manifestToSend.resolution,
      video_codec: manifestToSend.video_codec,
      fps: manifestToSend.fps,
      audio_codec: manifestToSend.audio_codec,
      audio_bitrate_kbps: manifestToSend.audio_bitrate_kbps,
      bitrate_preset: manifestToSend.bitrate_preset,
      crf: manifestToSend.crf,
      export_settings: {
        video_codec: manifestToSend.export_settings.video_codec,
        preset: manifestToSend.export_settings.preset,
        draft_mode: manifestToSend.export_settings.draft_mode,
        crf: manifestToSend.export_settings.crf,
        resolution: manifestToSend.export_settings.resolution,
        fps: manifestToSend.export_settings.fps,
        audio_bitrate_kbps: manifestToSend.export_settings.audio_bitrate_kbps
      },
      subtitles: manifestToSend.subtitles,
      ...(manifestToSend.subtitles_export ? { subtitles_export: manifestToSend.subtitles_export } : {}),
      crossfade_loop: manifestToSend.crossfade_loop,
      seamless_mode: manifestToSend.seamless_mode,
      act_crossfade_sec: manifestToSend.act_crossfade_sec,
      internal_clip_duration_sec: manifestToSend.internal_clip_duration_sec,
      internal_loop_crossfade_sec: manifestToSend.internal_loop_crossfade_sec,
      video_crossfade_sec: manifestToSend.video_crossfade_sec,
      audio_crossfade_sec: manifestToSend.audio_crossfade_sec,
      use_embedded_audio: manifestToSend.use_embedded_audio,
      final_black_screen_enabled: manifestToSend.final_black_screen_enabled,
      final_black_screen_sec: manifestToSend.final_black_screen_sec,
      audio_mastering: manifestToSend.audio_mastering,
      seamless_asymmetry: manifestToSend.seamless_asymmetry,
      random_interval: manifestToSend.random_interval,
      video_filename: manifestToSend.video_filename,
      ...(manifestToSend.audio_filename ? { audio_filename: manifestToSend.audio_filename } : {}),
      gdrive_folder_id: manifestToSend.gdrive_folder_id,
      cloud_export: manifestToSend.cloud_export,
      continuous_bed: manifestToSend.continuous_bed,
      master_audio: manifestToSend.master_audio,
      ...(manifestToSend.shorts_factory ? { shorts_factory: manifestToSend.shorts_factory } : {}),
      timeline_slots: manifestToSend.timeline_slots.map((slot, idx) => ({
        slot_index: idx + 1,
        slot_id: slot.slot_id,
        act_title: slot.act_title,
        act_timecode: slot.act_timecode,
        file_name: slot.file_name,
        ...(slot.voiceover_file ? { voiceover_file: slot.voiceover_file } : {}),
        base_content: slot.base_content,
        source_clip_duration_sec: slot.source_clip_duration_sec,
        internal_loop_crossfade_sec: slot.internal_loop_crossfade_sec,
        slot_duration_sec: slot.slot_duration_sec,
        slot_transition_out: slot.slot_transition_out,
        inserts: slot.inserts.map(ins => ({
          file_name: ins.file_name,
          trigger_at_sec: ins.trigger_at_sec,
          duration_sec: ins.duration_sec,
          transition_in: ins.transition_in,
          transition_out: ins.transition_out,
          ...(ins.hold_until_end ? { hold_until_end: true } : {}),
          ...(ins.audio_soft_compressor ? { audio_soft_compressor: true } : {}),
          ...(ins.max_peak_over_bed_db !== undefined
            ? { max_peak_over_bed_db: ins.max_peak_over_bed_db }
            : {})
        }))
      }))
    };

    const serializedLoop = serializeCompactDispatchJson(compactLoopPayloadObj);
    if (serializedLoop.exceedsLimit) {
      showToast(
        'Манифест слишком большой для API — скачайте manifest.json и закиньте его в папку Google Drive',
        'error',
        { label: 'Скачать manifest.json', onClick: handleExportManifestFile }
      );
      return;
    }

    const manifestPayloadJson = serializedLoop.payload;
    lastDispatchWasPreflightRef.current = preflightOnly;
    setIsLoopDispatching(true);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${targetRepo}/actions/workflows/render_loop.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({
            ref: targetBranch,
            inputs: {
              manifest_payload: manifestPayloadJson,
              preflight_only: preflightOnly ? 'true' : 'false'
            }
          })
        }
      );

      if (response.status === 204) {
        const statusTitle = preflightOnly
          ? '🔍 Preflight-проверка файлов на GDrive запущена...'
          : `Сборка «${manifestToSend.project_name}» запущена в GitHub Actions!`;
        const statusDesc = preflightOnly
          ? `Режим preflight_only: "true" (~15 сек) | Проверка всех слотов, вставок и аудио в папке ${manifestToSend.gdrive_folder_id || 'GDrive'}`
          : `Проект: ${manifestToSend.project_name} | Кодек: ${manifestToSend.video_codec} (CRF ${crfVal}) | Хронометраж: ${formatTimeHMS(manifestToSend.calculated_project_duration_sec)} | ${scaleFlag}`;
        showStatusBar(statusTitle, statusDesc, targetRepo, startTime, {
          workflow: 'render_loop.yml',
          branch: targetBranch,
          projectName: manifestToSend.project_name
        });
        appendTerminalLog(
          preflightOnly
            ? '[00:00] 🔍 Запущена быстрая Preflight-проверка наличия файлов на Google Drive (preflight_only: "true")...'
            : `[00:00] ✅ Сборка «${manifestToSend.project_name}» запущена в GitHub Actions! Ожидание регистрации нового workflow run (4 сек)...`,
          'success'
        );
        showToast(statusTitle, 'success');
      } else {
        const errText = await response.text().catch(() => '');
        const exactError = sanitizeLogText(errText.trim() || response.statusText || `HTTP ${response.status}`);
        setRenderStatus(prev => ({
          ...prev,
          visible: true,
          status: 'failure',
          runnerPhase: undefined,
          title: `❌ Ошибка запуска GitHub Actions (${response.status})`,
          stepLabel: exactError
        }));
        appendTerminalLog(`[00:00] ❌ Ошибка GitHub API (${response.status}): ${exactError}`, 'error');
        showToast(`Ошибка GitHub API (${response.status}): ${exactError}`, 'error');
      }
    } catch (e) {
      const msg = sanitizeLogText(e instanceof Error ? e.message : String(e));
      setRenderStatus(prev => ({
        ...prev,
        visible: true,
        status: 'failure',
        runnerPhase: undefined,
        title: '❌ Сетевой сбой при вызове GitHub API',
        stepLabel: msg
      }));
      appendTerminalLog(`[00:00] ❌ Сбой запуска сборки: ${msg}`, 'error');
      showToast('Сбой запуска облачной сборки: ' + msg, 'error');
    } finally {
      setIsLoopDispatching(false);
    }
  };

  dispatchLoopWorkflowRef.current = dispatchLoopWorkflow;

  const startLoopRender = () => dispatchLoopWorkflow(false);
  const startPreflightCheck = () => dispatchLoopWorkflow(true);

  const renderThumbnailCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1280, 720);

    if (thumbImg) {
      ctx.drawImage(thumbImg, 0, 0, 1280, 720);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#334155';
      ctx.font = '24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Загрузите изображение для предпросмотра', 640, 360);
    }

    const trimmedTitle = (thumbTitle || '').trim();
    if (trimmedTitle) {
      const grad = ctx.createLinearGradient(0, 400, 0, 720);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 400, 1280, 320);
    }

    if (thumbBadge && thumbBadge !== 'none') {
      const firstId = thumbBadge.split(',')[0]?.trim();
      const labelMap: Record<string, string> = {
        '4k_ultra_hd': '4K ULTRA HD',
        '4k_gold': '4K ULTRA HD',
        documentary: 'DOCUMENTARY',
        true_story: 'TRUE STORY',
        full_story: 'FULL STORY',
        untold_history: 'UNTOLD HISTORY',
        lost_archives: 'LOST ARCHIVES',
        real_footage: 'REAL FOOTAGE',
        deep_dive: 'DEEP DIVE',
        no_ads: 'NO ADS',
        '3_hours': '3 HOURS',
        no_ads_seamless: 'NO ADS • SEAMLESS',
        ambience_asmr: 'AMBIENCE • ASMR',
        deep_sleep: 'DEEP SLEEP',
        cozy_fireplace: 'COZY FIREPLACE',
        winter_nights: 'WINTER NIGHTS',
        rain_and_thunder: 'RAIN & THUNDER',
        study_and_focus: 'STUDY & FOCUS'
      };
      const bText = labelMap[firstId || ''] || '4K ULTRA HD';
      const badgeX = 1280 - 220;
      const badgeY = 30;
      const badgeW = 190;
      const badgeH = 42;
      const r = 8;
      ctx.fillStyle = 'rgba(9, 13, 22, 0.90)';
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const nativeRoundRect = (
        ctx as CanvasRenderingContext2D & { roundRect?: (...args: number[]) => void }
      ).roundRect;
      if (typeof nativeRoundRect === 'function') {
        nativeRoundRect.call(ctx, badgeX, badgeY, badgeW, badgeH, r);
      } else {
        ctx.moveTo(badgeX + r, badgeY);
        ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + badgeH, r);
        ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX, badgeY + badgeH, r);
        ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY, r);
        ctx.arcTo(badgeX, badgeY, badgeX + badgeW, badgeY, r);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FDE047';
      ctx.font = '800 13px "Montserrat", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bText, badgeX + 95, badgeY + 26);
    }

    if (trimmedTitle) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px "Bebas Neue", sans-serif';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 12;
      ctx.fillText(trimmedTitle.toUpperCase(), 50, 660);
      ctx.shadowBlur = 0;
    }
  }, [thumbImg, thumbBadge, thumbTitle]);

  useEffect(() => {
    if (activeTab === 'thumb') {
      renderThumbnailCanvas();
    }
  }, [activeTab, renderThumbnailCanvas]);

  const loadThumbBaseImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          setThumbImg(img);
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const downloadThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'thumbnail_4k.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  const isGhConnected = Boolean(ghToken && ghRepo);
  const isGdriveConfigured = Boolean(gdriveFolderId);
  const estimatedGb = estimateLoopSizeGb();
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
                <span>{isGdriveConfigured ? "GDrive Configured" : "GDrive Not configured"}</span>
              </span>
            </button>
          </div>
        </div>


      </header>

      <StudioShell active={activeTab} onSelect={handleSelectTab} workspace={workspace} onWorkspaceChange={handleWorkspaceChange}>
      <ProjectContextPreview key={workspace} workspace={workspace}/>
      <main
        onPaste={handleGlobalManifestPaste}
        className="relative z-10 flex-1 min-w-0 max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-6 overflow-x-hidden"
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
            terminalStatus="idle"
            terminalSeconds={0}
            terminalLogs={[]}
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

            <LoopBuilderHeader loopProjectName={loopProjectName} setLoopProjectName={setLoopProjectName} videoCodec={videoCodec} videoCrf={videoCrf} videoFps={videoFps} audioBitrateKbps={audioBitrateKbps} actCrossfadeSec={actCrossfadeSec} internalLoopCrossfadeSec={internalLoopCrossfadeSec} slotCount={timelineSlots.length} totalInsertsCount={totalInsertsCount} durationLabel={formatTimeHMS(calculatedProjectDurationSec)}/>

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

            <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider block">
                      2-Слойный Аудио-Микшер (Фоновый эмбиент + Мастер-аудиодорожка)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Микширование аудиослоев в{' '}
                      <code className="text-amber-300 font-mono">filter_complex</code> с финальной
                      нормализацией{' '}
                      <code className="text-sky-400 font-mono">
                        loudnorm=I={audioMastering.integrated_lufs}:TP=
                        {audioMastering.true_peak_dbtp}:LRA={audioMastering.lra}
                      </code>
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-bold text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={continuousBed.enabled}
                        onChange={e =>
                          setContinuousBed(prev => ({ ...prev, enabled: e.target.checked }))
                        }
                        className="accent-amber-500 w-4 h-4"
                      />
                      <span>а) Фоновый эмбиент (непрерывный фоновый звук)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={continuousBed.loop_entire_duration !== false}
                        onChange={e =>
                          setContinuousBed(prev => ({
                            ...prev,
                            loop_entire_duration: e.target.checked
                          }))
                        }
                        className="accent-emerald-400 w-3.5 h-3.5"
                      />
                      <span>Зациклить на всю длину видео</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        Имя файла фонового эмбиента (в Google Drive):
                      </label>
                      <input
                        type="text"
                        value={continuousBed.file_name}
                        onChange={e =>
                          setContinuousBed(prev => ({
                            ...prev,
                            enabled: Boolean(e.target.value.trim()) || prev.enabled,
                            file_name: e.target.value
                          }))
                        }
                        placeholder="ambient_wind_loop.wav"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        Громкость (вес):
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        max={2.0}
                        step={0.05}
                        value={continuousBed.bed_audio_weight}
                        onChange={e =>
                          setContinuousBed(prev => ({
                            ...prev,
                            bed_audio_weight: Math.max(0.1, Number(e.target.value) || 0.55)
                          }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-sky-300 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-bold text-indigo-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loopMasterAudio.enabled}
                        onChange={e =>
                          setLoopMasterAudio(prev => ({ ...prev, enabled: e.target.checked }))
                        }
                        className="accent-indigo-500 w-4 h-4"
                      />
                      <span>б) Мастер-аудиодорожка (озвучка / саундтрек)</span>
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      Синхронный мастер-трек
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        Имя файла мастер-аудио (в Google Drive):
                      </label>
                      <input
                        type="text"
                        value={loopMasterAudio.file_name}
                        onChange={e =>
                          setLoopMasterAudio(prev => ({
                            ...prev,
                            enabled: Boolean(e.target.value.trim()) || prev.enabled,
                            file_name: e.target.value
                          }))
                        }
                        placeholder="master_voiceover_or_ost.mp3"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-indigo-300 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        Таймкод старта:
                      </label>
                      <input
                        type="text"
                        value={loopMasterAudio.start_timecode}
                        onChange={e =>
                          setLoopMasterAudio(prev => ({
                            ...prev,
                            start_timecode: e.target.value
                          }))
                        }
                        placeholder="00:00:00"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        Громкость (вес):
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        max={2.0}
                        step={0.05}
                        value={loopMasterAudio.weight}
                        onChange={e =>
                          setLoopMasterAudio(prev => ({
                            ...prev,
                            weight: Math.max(0.1, Number(e.target.value) || 1.0)
                          }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="aether-card rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLoopAdvancedAccordion(prev => !prev)}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#f8fafc] uppercase tracking-wider block truncate">
                      Продвинутая инженерия петли (Seamless Asymmetry • Стыки актов • Loudnorm)
                    </span>
                    <span className="text-[11px] text-white/55 block truncate font-mono">
                      random_interval: [{seamlessAsymmetry.random_interval[0]}..
                      {seamlessAsymmetry.random_interval[1]}s] • Crossfade {actCrossfadeSec}s •
                      loudnorm I={audioMastering.integrated_lufs} LUFS
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-2.5 py-0.5 rounded-full">
                    {showLoopAdvancedAccordion ? 'СВЕРНУТЬ' : 'НАСТРОИТЬ'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-white/60 transition-transform duration-200 ${
                      showLoopAdvancedAccordion ? 'rotate-180 text-emerald-400' : ''
                    }`}
                  />
                </div>
              </button>

              {showLoopAdvancedAccordion && (
                <div className="p-4 border-t border-white/[0.08] space-y-4">
                  <div className="bg-[#080c14]/80 border border-emerald-500/25 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <div>
                          <span className="text-xs font-bold text-[#f8fafc] uppercase tracking-wider block">
                            Рандомизатор швов и интервалов (Seamless Asymmetry)
                          </span>
                          <span className="text-[11px] text-white/55">
                            Непериодическое наложение микровставок (
                            <code className="text-emerald-300 font-mono">
                              random_interval: [{seamlessAsymmetry.random_interval[0]},{' '}
                              {seamlessAsymmetry.random_interval[1]}]
                            </code>{' '}
                            сек) с мягким кроссфейдом 1.5 сек
                          </span>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-bold text-emerald-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seamlessAsymmetry.enabled}
                          onChange={e =>
                            setSeamlessAsymmetry(prev => ({ ...prev, enabled: e.target.checked }))
                          }
                          className="accent-emerald-500 w-4 h-4"
                        />
                        <span>Seamless Asymmetry активен</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="text-[10px] text-white/55 uppercase block mb-1">
                          Мин. интервал микровставки (сек):
                        </label>
                        <input
                          type="number"
                          min={60}
                          max={3600}
                          step={60}
                          value={seamlessAsymmetry.random_interval[0]}
                          onChange={e => {
                            const v = Math.max(60, Number(e.target.value) || 1200);
                            setSeamlessAsymmetry(prev => ({
                              ...prev,
                              random_interval: [v, Math.max(v, prev.random_interval[1])]
                            }));
                          }}
                          className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-3 py-1.5 font-mono text-emerald-300 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/55 uppercase block mb-1">
                          Макс. интервал микровставки (сек):
                        </label>
                        <input
                          type="number"
                          min={120}
                          max={7200}
                          step={60}
                          value={seamlessAsymmetry.random_interval[1]}
                          onChange={e => {
                            const v = Math.max(
                              seamlessAsymmetry.random_interval[0],
                              Number(e.target.value) || 2400
                            );
                            setSeamlessAsymmetry(prev => ({
                              ...prev,
                              random_interval: [prev.random_interval[0], v]
                            }));
                          }}
                          className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-3 py-1.5 font-mono text-emerald-300 outline-none"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            setTimelineSlots(prev =>
                              prev.map((sl, idx) => {
                                if (!sl.inserts.length) return sl;
                                return {
                                  ...sl,
                                  inserts: sl.inserts.map((ins, iIdx) => {
                                    const minI = seamlessAsymmetry.random_interval[0];
                                    const maxI = seamlessAsymmetry.random_interval[1];
                                    const randTrig = Math.min(
                                      Math.max(30, sl.slot_duration_sec - 20),
                                      Math.round(
                                        minI / 3 +
                                          (((idx + 1) * (iIdx + 1) * 173) %
                                            Math.max(120, maxI - minI))
                                      )
                                    );
                                    return {
                                      ...ins,
                                      trigger_at_sec: randTrig,
                                      transition_in: { ...ins.transition_in, duration_sec: 1.5 }
                                    };
                                  })
                                };
                              })
                            );
                            showToast(
                              `Интервалы микровставок рандомизированы по окну [${seamlessAsymmetry.random_interval[0]}, ${seamlessAsymmetry.random_interval[1]}] сек!`,
                              'success'
                            );
                          }}
                          className="w-full min-h-[44px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold py-2 px-3 rounded-xl text-xs cursor-pointer"
                        >
                          🎲 Перемешать таймкоды микровставок
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#080c14]/80 border border-white/[0.08] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                          Стыки актов &amp; Бесшовная петля
                        </span>
                        <span className="text-[10px] font-mono text-white/55">
                          {actCrossfadeSec}с / {internalLoopCrossfadeSec.toFixed(1)}с
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            Crossfade между актами (сек):
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={180}
                            step={5}
                            value={actCrossfadeSec}
                            onChange={e => {
                              const val = Math.max(1, Number(e.target.value) || 90);
                              setActCrossfadeSec(val);
                              setTimelineSlots(prev =>
                                prev.map((s, idx) =>
                                  idx === prev.length - 1
                                    ? s
                                    : {
                                        ...s,
                                        slot_transition_out: {
                                          ...s.slot_transition_out,
                                          duration_sec: val
                                        }
                                      }
                                )
                              );
                            }}
                            className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs font-mono text-amber-300 font-bold outline-none focus:border-amber-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            Шов петли исходника (сек):
                          </label>
                          <input
                            type="number"
                            min={0.2}
                            max={4.0}
                            step={0.1}
                            value={internalLoopCrossfadeSec}
                            onChange={e => {
                              const val = Math.max(
                                0.2,
                                Math.min(4.0, Number(e.target.value) || 1.0)
                              );
                              setInternalLoopCrossfadeSec(val);
                              setTimelineSlots(prev =>
                                prev.map(s => ({ ...s, internal_loop_crossfade_sec: val }))
                              );
                            }}
                            className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs font-mono text-emerald-300 font-bold outline-none focus:border-amber-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            Черный экран в финале (сек):
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={finalBlackScreenEnabled}
                              onChange={e => setFinalBlackScreenEnabled(e.target.checked)}
                              className="accent-amber-500 w-4 h-4"
                            />
                            <input
                              type="number"
                              min={0.5}
                              max={10}
                              step={0.5}
                              disabled={!finalBlackScreenEnabled}
                              value={finalBlackScreenSec}
                              onChange={e =>
                                setFinalBlackScreenSec(
                                  Math.max(0.5, Number(e.target.value) || 2.0)
                                )
                              }
                              className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs font-mono text-[#f8fafc] outline-none disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#080c14]/80 border border-sky-500/25 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                        <span className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                          Нормализация Loudnorm &amp; Лимитер E3
                        </span>
                        <label className="flex items-center gap-1.5 text-[11px] text-sky-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={audioMastering.loudnorm_enabled}
                            onChange={e =>
                              setAudioMastering(prev => ({
                                ...prev,
                                loudnorm_enabled: e.target.checked
                              }))
                            }
                            className="accent-sky-400"
                          />
                          <span className="font-mono">
                            I={audioMastering.integrated_lufs}:TP={audioMastering.true_peak_dbtp}
                            :LRA={audioMastering.lra}
                          </span>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            Target LUFS:
                          </label>
                          <input
                            type="number"
                            min={-18}
                            max={-14}
                            step={0.5}
                            value={audioMastering.integrated_lufs}
                            onChange={e =>
                              setAudioMastering(prev => ({
                                ...prev,
                                integrated_lufs: Math.max(
                                  -18,
                                  Math.min(-14, Number(e.target.value) || -16)
                                )
                              }))
                            }
                            className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs font-mono text-sky-300 font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            True-Peak (dBTP):
                          </label>
                          <input
                            type="number"
                            min={-9}
                            max={-3}
                            step={0.5}
                            value={audioMastering.true_peak_dbtp}
                            onChange={e =>
                              setAudioMastering(prev => ({
                                ...prev,
                                true_peak_dbtp: Math.min(-3, Number(e.target.value) || -3)
                              }))
                            }
                            className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs font-mono text-sky-300 font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            LRA:
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={20}
                            step={1}
                            value={audioMastering.lra}
                            onChange={e =>
                              setAudioMastering(prev => ({
                                ...prev,
                                lra: Math.max(5, Math.min(20, Number(e.target.value) || 11))
                              }))
                            }
                            className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs font-mono text-[#f8fafc] outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/55 uppercase block mb-1">
                            Пик E3 (дБ):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={audioMastering.e3_soft_attack_compressor}
                              onChange={e =>
                                setAudioMastering(prev => ({
                                  ...prev,
                                  e3_soft_attack_compressor: e.target.checked
                                }))
                              }
                              className="accent-emerald-500"
                            />
                            <input
                              type="number"
                              min={1}
                              max={6}
                              step={0.5}
                              value={audioMastering.e3_max_peak_over_bed_db}
                              onChange={e =>
                                setAudioMastering(prev => ({
                                  ...prev,
                                  e3_max_peak_over_bed_db: Math.min(
                                    6,
                                    Math.max(1, Number(e.target.value) || 6)
                                  )
                                }))
                              }
                              className="w-full min-h-[40px] bg-[#0f1623] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs font-mono text-emerald-300 font-bold outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-amber-500" /> Архитектура таймлайна: Слоты
                    актов (<code className="text-amber-400">timeline_slots: [{timelineSlots.length}]</code>)
                    &amp; Асимметричные вставки <code className="text-emerald-400">inserts</code>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Сумма <code className="text-slate-300">slot_duration_sec</code> за вычетом
                    кроссфейдов ={' '}
                    <strong className="text-amber-400">{calculatedProjectDurationSec} сек</strong> (
                    {(calculatedProjectDurationSec / 3600).toFixed(2)} ч /{' '}
                    {formatTimeHMS(calculatedProjectDurationSec)})
                    {finalBlackScreenEnabled
                      ? ` + ${finalBlackScreenSec.toFixed(1)}с черный экран в финале`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1.5">
                    <input
                      type="text"
                      value={presetNameInput}
                      onChange={e => setPresetNameInput(e.target.value)}
                      placeholder={loopProjectName ? `Имя (${loopProjectName})` : 'Имя пресета...'}
                      className="min-h-[38px] sm:min-h-[32px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 w-32 sm:w-36 outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={saveManifestPreset}
                      className="min-h-[38px] sm:min-h-[32px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-semibold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer whitespace-nowrap"
                      title="Сохранить слоты, врезки, кодек и папку GDrive в браузер"
                    >
                      💾 Сохранить пресет
                    </button>
                    <select
                      aria-label="Выбор локального пресета манифеста"
                      value={selectedPresetId}
                      onChange={e => setSelectedPresetId(e.target.value)}
                      className="min-h-[38px] sm:min-h-[32px] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[170px] outline-none focus:border-sky-500"
                    >
                      {savedManifestPresets.length === 0 ? (
                        <option value="">Нет сохранённых пресетов</option>
                      ) : (
                        savedManifestPresets.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.savedAt})
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={loadSelectedManifestPreset}
                      disabled={savedManifestPresets.length === 0}
                      className="min-h-[38px] sm:min-h-[32px] bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed border border-sky-500/40 text-sky-300 font-semibold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer whitespace-nowrap"
                      title="Загрузить выбранный пресет манифеста в редактор"
                    >
                      📂 Загрузить пресет
                    </button>
                    {savedManifestPresets.length > 0 && (
                      <button
                        type="button"
                        onClick={deleteSelectedManifestPreset}
                        className="min-h-[38px] sm:min-h-[32px] text-slate-500 hover:text-rose-400 px-2 py-1 rounded-lg text-[11px] transition cursor-pointer"
                        title="Удалить выбранный пресет"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addTimelineSlot}
                    className="min-h-[40px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    + Добавить слот (#{timelineSlots.length + 1})
                  </button>
                  <button
                    type="button"
                    onClick={applyBlizzard3HSpecPreset}
                    className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-sky-500/40 text-sky-300 px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Сбросить к 6 актам (3:00:00)
                  </button>
                </div>
              </div>

              {(() => {
                const totalSpan = Math.max(1, calculatedProjectDurationSec);
                const actPalette = [
                  'from-purple-600/80 to-indigo-600/80 border-purple-400/50',
                  'from-amber-500/80 to-orange-600/80 border-amber-300/50',
                  'from-sky-500/80 to-cyan-600/80 border-sky-300/50',
                  'from-emerald-500/80 to-teal-600/80 border-emerald-300/50',
                  'from-pink-500/80 to-rose-600/80 border-pink-300/50',
                  'from-violet-500/80 to-fuchsia-600/80 border-violet-300/50'
                ];
                let cursorSec = 0;
                const scrubberActs: Array<{
                  slotIdx: number;
                  slotId: string;
                  title: string;
                  startSec: number;
                  slotDur: number;
                  overlapOut: number;
                  effectiveStep: number;
                }> = [];
                const scrubberInserts: Array<{
                  slotIdx: number;
                  insIdx: number;
                  ins: SlotInsertItem;
                  globalSec: number;
                  timecodeHMS: string;
                }> = [];

                timelineSlots.forEach((slot, sIdx) => {
                  const isLast = sIdx === timelineSlots.length - 1;
                  const slotDur = Math.max(1, Number(slot.slot_duration_sec) || 1800);
                  const overlapOut =
                    !isLast && slot.slot_transition_out.type !== 'none'
                      ? Math.min(
                          slotDur,
                          Math.max(0, Number(slot.slot_transition_out.duration_sec) || 0)
                        )
                      : 0;
                  const effectiveStep = Math.max(1, slotDur - overlapOut);
                  const slotStart = cursorSec;
                  scrubberActs.push({
                    slotIdx: sIdx,
                    slotId: slot.slot_id,
                    title: slot.act_title || slot.title || `Акт #${sIdx + 1}`,
                    startSec: slotStart,
                    slotDur,
                    overlapOut,
                    effectiveStep
                  });
                  (slot.inserts || []).forEach((ins, insIdx) => {
                    const globalSec = Math.min(
                      totalSpan,
                      slotStart + Math.max(0, Number(ins.trigger_at_sec) || 0)
                    );
                    scrubberInserts.push({
                      slotIdx: sIdx,
                      insIdx,
                      ins,
                      globalSec,
                      timecodeHMS: formatTimeHMS(globalSec)
                    });
                  });
                  cursorSec += effectiveStep;
                });

                const activeEditInsert =
                  selectedScrubberInsert &&
                  timelineSlots[selectedScrubberInsert.slotIdx]?.inserts?.[
                    selectedScrubberInsert.insIdx
                  ]
                    ? {
                        slotIdx: selectedScrubberInsert.slotIdx,
                        insIdx: selectedScrubberInsert.insIdx,
                        ins: timelineSlots[selectedScrubberInsert.slotIdx].inserts[
                          selectedScrubberInsert.insIdx
                        ],
                        actStartSec: scrubberActs[selectedScrubberInsert.slotIdx]?.startSec ?? 0
                      }
                    : null;

                return (
                  <div className="bg-[#080c14] border border-slate-800/90 rounded-xl p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 font-semibold text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Визуальная карта таймлайна (Timeline Scrubber)</span>
                        <span className="font-mono text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                          00:00:00 — {formatTimeHMS(calculatedProjectDurationSec)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400/40 border border-amber-300/70" />
                          Зона кроссфейда
                        </span>
                        <span className="flex items-center gap-1">
                          <Flag className="w-3 h-3 text-emerald-400" />
                          Врезка ({scrubberInserts.length}) — клик для правки
                        </span>
                      </div>
                    </div>

                    <div className="relative pt-7 pb-2 px-3 overflow-x-hidden select-none">
                      {scrubberInserts.map(item => {
                        const leftPct = Math.min(
                          99.2,
                          Math.max(0.8, (item.globalSec / totalSpan) * 100)
                        );
                        const isSelected =
                          selectedScrubberInsert?.slotIdx === item.slotIdx &&
                          selectedScrubberInsert?.insIdx === item.insIdx;
                        return (
                          <button
                            key={`flag-${item.slotIdx}-${item.insIdx}-${item.ins.insert_id}`}
                            type="button"
                            onClick={() => {
                              setSelectedScrubberInsert({
                                slotIdx: item.slotIdx,
                                insIdx: item.insIdx
                              });
                              const el = document.getElementById(
                                `insert-card-${item.slotIdx}-${item.insIdx}`
                              );
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            style={{ left: `${leftPct}%` }}
                            className="group/flag absolute top-0 bottom-1 -translate-x-1/2 z-20 flex flex-col items-center cursor-pointer focus:outline-none"
                            title={`${item.ins.insert_id} • ${item.timecodeHMS} (${
                              item.ins.file_name || 'без файла'
                            })`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shadow-md border transition flex items-center gap-0.5 whitespace-nowrap ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 border-white scale-110 shadow-amber-400/50'
                                  : 'bg-emerald-500 text-slate-950 border-emerald-200/70 group-hover/flag:bg-amber-400 group-hover/flag:scale-110'
                              }`}
                            >
                              <Flag className="w-2.5 h-2.5 fill-current" />
                              {item.ins.insert_id}
                            </span>
                            <span
                              className={`w-[2px] flex-1 transition ${
                                isSelected
                                  ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                                  : 'bg-emerald-400/85 group-hover/flag:bg-amber-300'
                              }`}
                            />
                            <span className="pointer-events-none opacity-0 group-hover/flag:opacity-100 transition-opacity duration-150 absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-amber-400/60 text-amber-300 font-mono text-[10px] px-2 py-0.5 rounded-md shadow-xl whitespace-nowrap z-30">
                              {item.timecodeHMS} • {item.ins.insert_id}
                            </span>
                          </button>
                        );
                      })}

                      <div className="relative h-10 w-full rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                        {scrubberActs.map(act => {
                          const leftPct = (act.startSec / totalSpan) * 100;
                          const widthPct = (act.effectiveStep / totalSpan) * 100;
                          const colorCls = actPalette[act.slotIdx % actPalette.length];
                          return (
                            <div
                              key={`act-seg-${act.slotIdx}-${act.slotId}`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              className={`absolute top-0 bottom-0 bg-gradient-to-r ${colorCls} border-r flex items-center justify-center px-1.5 overflow-hidden`}
                              title={`${act.title} • Старт ${formatTimeHMS(act.startSec)} (${act.slotDur}с)`}
                            >
                              <span className="text-[10px] font-mono font-bold text-white drop-shadow truncate">
                                #{act.slotIdx + 1} {act.title}
                              </span>
                            </div>
                          );
                        })}
                        {scrubberActs.map(act => {
                          if (act.overlapOut <= 0) return null;
                          const xfadeStart = act.startSec + act.effectiveStep;
                          const leftPct = (xfadeStart / totalSpan) * 100;
                          const widthPct = Math.max(0.8, (act.overlapOut / totalSpan) * 100);
                          return (
                            <div
                              key={`xfade-zone-${act.slotIdx}`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              className="absolute top-0 bottom-0 z-10 bg-amber-300/35 backdrop-blur-[1px] border-x border-amber-200/80 flex items-center justify-center"
                              title={`Кроссфейд Акт #${act.slotIdx + 1} → #${act.slotIdx + 2}: ${act.overlapOut}с`}
                            >
                              <span className="text-[8px] font-mono font-bold text-slate-950 bg-amber-300/80 px-1 rounded hidden md:inline">
                                ⇄{act.overlapOut}s
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1 px-0.5">
                        <span>00:00:00</span>
                        <span>{formatTimeHMS(Math.round(totalSpan * 0.25))}</span>
                        <span>{formatTimeHMS(Math.round(totalSpan * 0.5))}</span>
                        <span>{formatTimeHMS(Math.round(totalSpan * 0.75))}</span>
                        <span>{formatTimeHMS(totalSpan)}</span>
                      </div>
                    </div>

                    {activeEditInsert && (
                      <div className="bg-slate-900/95 border border-amber-500/45 rounded-xl p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="bg-amber-400 text-slate-950 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                              {activeEditInsert.ins.insert_id} • Акт #{activeEditInsert.slotIdx + 1}
                            </span>
                            <span className="font-mono text-emerald-300 text-[11px]">
                              Глобальный таймкод:{' '}
                              {formatTimeHMS(
                                activeEditInsert.actStartSec +
                                  (Number(activeEditInsert.ins.trigger_at_sec) || 0)
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedScrubberInsert(null)}
                            className="text-slate-400 hover:text-white text-xs cursor-pointer px-1.5 py-0.5 rounded bg-slate-800"
                          >
                            ✕ Закрыть
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                          <div className="col-span-2">
                            <label className="text-[9px] text-slate-400 block mb-0.5">
                              Файл клипа врезки:
                            </label>
                            <input
                              type="text"
                              value={activeEditInsert.ins.file_name}
                              onChange={e =>
                                updateSlotInsert(activeEditInsert.slotIdx, activeEditInsert.insIdx, {
                                  file_name: e.target.value
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-200 outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">
                              trigger_at_sec (в акте):
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={activeEditInsert.ins.trigger_at_sec}
                              onChange={e =>
                                updateSlotInsert(activeEditInsert.slotIdx, activeEditInsert.insIdx, {
                                  trigger_at_sec: Math.max(0, Number(e.target.value) || 0)
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-amber-300 outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">
                              duration_sec:
                            </label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={activeEditInsert.ins.duration_sec}
                              onChange={e =>
                                updateSlotInsert(activeEditInsert.slotIdx, activeEditInsert.insIdx, {
                                  duration_sec: Math.max(1, Number(e.target.value) || 10)
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-200 outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">
                              fade_in / fade_out (с):
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0.1}
                                step={0.5}
                                value={activeEditInsert.ins.transition_in.duration_sec}
                                onChange={e =>
                                  updateSlotInsert(
                                    activeEditInsert.slotIdx,
                                    activeEditInsert.insIdx,
                                    {
                                      transition_in: {
                                        ...activeEditInsert.ins.transition_in,
                                        duration_sec: Math.max(0.1, Number(e.target.value) || 1.5)
                                      }
                                    }
                                  )
                                }
                                className="w-1/2 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-emerald-300 outline-none"
                              />
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={activeEditInsert.ins.transition_out?.duration_sec ?? 0}
                                onChange={e => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  updateSlotInsert(
                                    activeEditInsert.slotIdx,
                                    activeEditInsert.insIdx,
                                    {
                                      hold_until_end: val === 0,
                                      transition_out: {
                                        type: val === 0 ? 'none' : 'dissolve',
                                        duration_sec: val
                                      }
                                    }
                                  );
                                }}
                                className="w-1/2 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-amber-300 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-4 max-h-[580px] overflow-y-auto custom-scroll pr-1">
                {timelineSlots.map((slot, sIdx) => {
                  const isLastSlot = sIdx === timelineSlots.length - 1;
                  const slotMatched = isAssetMatched(slot.file_name, slot.asset_id);
                  const seamSec = slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec;
                  const effStep = Math.max(1, slot.source_clip_duration_sec - seamSec);
                  const loopIterations = Math.max(1, Math.ceil(slot.slot_duration_sec / effStep));
                  return (
                    <div
                      key={slot.slot_id + '-' + sIdx}
                      className="bg-[#111622] border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
                            #{slot.slot_index} • {slot.slot_id}
                          </span>
                          {slot.act_timecode && (
                            <span className="text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded">
                              {slot.act_timecode}
                            </span>
                          )}
                          <input
                            type="text"
                            value={slot.act_title ?? slot.title}
                            placeholder="Название акта / слота"
                            onChange={e => updateTimelineSlotField(sIdx, 'title', e.target.value)}
                            className="min-h-[38px] sm:min-h-[32px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-100 w-full sm:w-72 outline-none focus:border-amber-500"
                          />
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              slotMatched
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                : slot.file_name
                                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                                  : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                            }`}
                          >
                            {slotMatched
                              ? '✓ Ассет в дропзоне'
                              : slot.file_name
                                ? `Ожидается: ${slot.file_name}`
                                : 'Имя файла не задано'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400">
                            Петля: {loopIterations}× по {slot.source_clip_duration_sec}с (шов{' '}
                            {seamSec.toFixed(1)}с)
                          </span>
                          <button
                            type="button"
                            onClick={() => removeTimelineSlot(sIdx)}
                            className="min-h-[38px] sm:min-h-[32px] text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-950/30 border border-rose-500/30 cursor-pointer"
                          >
                            Удалить слот
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Базовый файл (file_name):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={slot.file_name}
                              placeholder="Из JSON или прикрепите 📎"
                              onChange={e =>
                                updateTimelineSlotField(sIdx, 'file_name', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none focus:border-amber-500"
                            />
                            <label
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-2 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer shrink-0"
                              title="Прикрепить локальный видеофайл к слоту"
                            >
                              📎
                              <input
                                type="file"
                                accept="video/*,image/*"
                                className="hidden"
                                onChange={e =>
                                  handleAttachSlotFile(sIdx, e.target.files?.[0] || null)
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Исходник (сек) / Шов петли (сек):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={2}
                              max={600}
                              value={slot.source_clip_duration_sec}
                              onChange={e =>
                                updateTimelineSlotField(
                                  sIdx,
                                  'source_clip_duration_sec',
                                  Math.max(2, Number(e.target.value) || 10)
                                )
                              }
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 outline-none"
                              title="Длительность исходного клипа (сек)"
                            />
                            <input
                              type="number"
                              min={0.2}
                              max={4.0}
                              step={0.1}
                              value={slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec}
                              onChange={e =>
                                updateTimelineSlotField(
                                  sIdx,
                                  'internal_loop_crossfade_sec',
                                  Math.max(0.2, Number(e.target.value) || 1.0)
                                )
                              }
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-emerald-400 outline-none"
                              title="Внутренний шов video+audio crossfade (сек)"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            ID ассета (asset_id):
                          </label>
                          <input
                            type="text"
                            value={slot.asset_id}
                            onChange={e => updateTimelineSlotField(sIdx, 'asset_id', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Длительность слота (сек):
                          </label>
                          <input
                            type="number"
                            min={10}
                            step={30}
                            value={slot.slot_duration_sec}
                            onChange={e =>
                              updateTimelineSlotField(
                                sIdx,
                                'slot_duration_sec',
                                Math.max(10, Number(e.target.value) || 1800)
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Стык акта (slot_transition_out):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={slot.slot_transition_out.type}
                              onChange={e => {
                                const newType = e.target.value as SlotTransitionOut['type'];
                                updateTimelineSlotField(sIdx, 'slot_transition_out', {
                                  type: newType,
                                  duration_sec:
                                    newType === 'none'
                                      ? 0
                                      : slot.slot_transition_out.duration_sec || actCrossfadeSec
                                });
                              }}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                            >
                              <option value="xfade">xfade (crossfade)</option>
                              <option value="dissolve">xfade (dissolve)</option>
                              <option value="none">none (конец акта)</option>
                            </select>
                            {slot.slot_transition_out.type !== 'none' && (
                              <input
                                type="number"
                                min={0.5}
                                max={180}
                                step={1}
                                value={slot.slot_transition_out.duration_sec}
                                onChange={e =>
                                  updateTimelineSlotField(sIdx, 'slot_transition_out', {
                                    ...slot.slot_transition_out,
                                    duration_sec: Math.max(0.5, Number(e.target.value) || 90.0)
                                  })
                                }
                                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-xs font-mono text-amber-400 text-center outline-none"
                                title="Длительность межактового crossfade (сек)"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#0b0f17] border border-slate-800/90 rounded-xl p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-amber-400 uppercase">
                              Асимметричные вставки{' '}
                              <code className="font-mono">inserts: [{slot.inserts.length}]</code>
                            </span>
                            {slot.inserts.length === 0 ? (
                              <span className="text-[10px] bg-slate-900 border border-slate-700 text-slate-400 px-2 py-0.5 rounded">
                                Пустой массив → чистый фоновый луп без оверлеев
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">
                                Кривые fade_in / fade_out (
                                {slot.inserts.map(i => i.insert_id).join(', ')})
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => addInsertToSlot(sIdx)}
                              className="min-h-[40px] sm:min-h-[34px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            >
                              + Добавить вставку E{slot.inserts.length + 1}
                            </button>
                            {slot.inserts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => clearSlotInserts(sIdx)}
                                className="min-h-[40px] sm:min-h-[34px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                              >
                                Очистить вставки
                              </button>
                            )}
                          </div>
                        </div>

                        {slot.inserts.length > 0 && (
                          <div className="grid grid-cols-1 gap-2.5">
                            {slot.inserts.map((ins, insIdx) => {
                              const insMatched = isAssetMatched(ins.file_name, ins.asset_id);
                              const isNoFadeOut = Boolean(
                                ins.hold_until_end || ins.transition_out?.type === 'none'
                              );
                              const isHighlightedByScrubber =
                                selectedScrubberInsert?.slotIdx === sIdx &&
                                selectedScrubberInsert?.insIdx === insIdx;
                              return (
                                <div
                                  id={`insert-card-${sIdx}-${insIdx}`}
                                  key={ins.insert_id + '-' + insIdx}
                                  className={`bg-slate-900/90 border rounded-lg p-3 space-y-2 text-[11px] transition ${
                                    isHighlightedByScrubber
                                      ? 'border-amber-400 ring-2 ring-amber-400/40'
                                      : 'border-slate-800'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                                        {ins.insert_id}
                                      </span>
                                      {ins.timecode_label && (
                                        <span className="text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded">
                                          {ins.timecode_label}
                                        </span>
                                      )}
                                      <span className="text-slate-400 font-mono text-[10px]">
                                        Локальный триггер: +{ins.trigger_at_sec}s • in{' '}
                                        {ins.transition_in.duration_sec}s /{' '}
                                        {isNoFadeOut
                                          ? 'БЕЗ fade out'
                                          : `out ${ins.transition_out.duration_sec}s`}
                                      </span>
                                      {ins.audio_soft_compressor && (
                                        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                                          Soft-Attack Limiter &le; +{ins.max_peak_over_bed_db ?? 6} dB
                                        </span>
                                      )}
                                      {insMatched && (
                                        <span className="text-[9px] text-emerald-400 font-mono">
                                          ✓ Файл найден
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeInsertFromSlot(sIdx, insIdx)}
                                      className="text-rose-400 hover:text-rose-300 text-[10px] cursor-pointer"
                                    >
                                      ✕ Удалить
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                                    <div className="col-span-2">
                                      <label className="text-[9px] text-slate-500 block">
                                        Файл клипа вставки:
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={ins.file_name}
                                          placeholder="Из JSON или прикрепите 📎"
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              file_name: e.target.value
                                            })
                                          }
                                          className="w-full bg-[#0b0f17] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-amber-500"
                                        />
                                        <label
                                          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-1.5 py-1 rounded text-[10px] cursor-pointer shrink-0"
                                          title="Прикрепить локальный файл вставки"
                                        >
                                          📎
                                          <input
                                            type="file"
                                            accept="video/*,image/*"
                                            className="hidden"
                                            onChange={e =>
                                              handleAttachInsertFile(
                                                sIdx,
                                                insIdx,
                                                e.target.files?.[0] || null
                                              )
                                            }
                                          />
                                        </label>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        trigger_at_sec (в слоте):
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        step={10}
                                        value={ins.trigger_at_sec}
                                        onChange={e =>
                                          updateSlotInsert(sIdx, insIdx, {
                                            trigger_at_sec: Math.max(0, Number(e.target.value) || 0)
                                          })
                                        }
                                        className="w-full bg-[#0b0f17] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-amber-400 outline-none focus:border-amber-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        fade_in (сек / тип):
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0.1}
                                          max={10}
                                          step={0.5}
                                          value={ins.transition_in.duration_sec}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              transition_in: {
                                                ...ins.transition_in,
                                                duration_sec: Math.max(
                                                  0.1,
                                                  Number(e.target.value) || 1.5
                                                )
                                              }
                                            })
                                          }
                                          className="w-12 bg-[#0b0f17] border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-emerald-400 outline-none"
                                        />
                                        <select
                                          value={ins.transition_in.type}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              transition_in: {
                                                ...ins.transition_in,
                                                type: e.target.value as 'dissolve' | 'fade'
                                              }
                                            })
                                          }
                                          className="flex-1 bg-[#0b0f17] border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-200 outline-none"
                                        >
                                          <option value="dissolve">dissolve</option>
                                          <option value="fade">fade</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        fade_out (режим / сек):
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={ins.transition_out?.type || 'dissolve'}
                                          onChange={e => {
                                            const nextType = e.target.value as
                                              | 'dissolve'
                                              | 'fade'
                                              | 'none';
                                            updateSlotInsert(sIdx, insIdx, {
                                              hold_until_end: nextType === 'none',
                                              transition_out: {
                                                type: nextType,
                                                duration_sec:
                                                  nextType === 'none'
                                                    ? 0
                                                    : ins.transition_out?.duration_sec || 1.5
                                              }
                                            });
                                          }}
                                          className="flex-1 bg-[#0b0f17] border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-200 outline-none"
                                        >
                                          <option value="dissolve">dissolve</option>
                                          <option value="fade">fade</option>
                                          <option value="none">БЕЗ fade out</option>
                                        </select>
                                        {ins.transition_out?.type !== 'none' && (
                                          <input
                                            type="number"
                                            min={0.1}
                                            max={15}
                                            step={0.5}
                                            value={ins.transition_out?.duration_sec ?? 1.5}
                                            onChange={e =>
                                              updateSlotInsert(sIdx, insIdx, {
                                                hold_until_end: false,
                                                transition_out: {
                                                  type: ins.transition_out?.type || 'dissolve',
                                                  duration_sec: Math.max(
                                                    0.1,
                                                    Number(e.target.value) || 1.5
                                                  )
                                                }
                                              })
                                            }
                                            className="w-12 bg-[#0b0f17] border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-amber-400 outline-none"
                                          />
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                      <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer py-1">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(ins.audio_soft_compressor)}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              audio_soft_compressor: e.target.checked,
                                              max_peak_over_bed_db: 6
                                            })
                                          }
                                          className="accent-emerald-500"
                                        />
                                        <span>Soft-Attack +6dB</span>
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isLastSlot && slot.slot_transition_out.type === 'none' && (
                        <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Финальный акт имеет{' '}
                          <code>slot_transition_out.type === &quot;none&quot;</code>
                          {finalBlackScreenEnabled
                            ? ` — затухание в ${finalBlackScreenSec.toFixed(1)}-секундный черный экран.`
                            : '.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase">
                  3. Быстрая синхронизация длительности проекта по слотам (от 3 до 10 часов)
                </label>
                <span className="text-xs text-amber-400 font-mono">
                  Расчетная сумма слотов с вычетом переходов: {calculatedProjectDurationSec} сек
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                {[
                  { hours: 3, label: '3 Часа (3:00:00)' },
                  { hours: 5, label: '5 Часов' },
                  { hours: 8, label: '8 Часов' },
                  { hours: 10, label: '10 Часов' }
                ].map(item => (
                  <button
                    key={item.hours}
                    type="button"
                    onClick={() =>
                      item.hours === 3
                        ? applyBlizzard3HSpecPreset()
                        : syncSlotsToTargetHours(item.hours)
                    }
                    className={`loop-h-btn py-3.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      loopHours === item.hours
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/10'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/60'
                    }`}
                  >
                    [ {item.label} ]
                  </button>
                ))}
                <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Точно (3–10ч):</span>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    step={1}
                    value={loopHours}
                    onChange={e => handleExactLoopHoursChange(e.target.value)}
                    className="w-16 bg-[#0b0f17] border border-amber-500/40 rounded-lg px-2 py-1 text-center text-xs font-bold text-amber-400 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    4. Граф FFmpeg <code className="text-amber-400">filter_complex</code> (
                    {videoCodec} CRF {videoCrf} • {videoFps}fps • AAC {audioBitrateKbps}k • loudnorm
                    I={audioMastering.integrated_lufs})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canDispatchLoop}
                    title={
                      canDispatchLoop
                        ? 'Скопировать граф filter_complex'
                        : 'Заполните file_name всех слотов — граф с пустыми входами не копируется'
                    }
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${ffmpegPreview.filterLines.join(';\n')}\n# Кодек: ${ffmpegPreview.encodingFlags}`
                      );
                      showToast('Граф FFmpeg filter_complex скопирован в буфер обмена!', 'success');
                    }}
                    className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Copy className="w-3 h-3" /> Копировать filter_complex
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterComplexPreview(prev => !prev)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showFilterComplexPreview ? 'Свернуть' : 'Развернуть'}
                  </button>
                </div>
              </div>
              {showFilterComplexPreview && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Входные потоки (
                    <code className="text-amber-300">{ffmpegPreview.inputsArgs.length} входов</code>
                    ): петли со швом {internalLoopCrossfadeSec.toFixed(1)}с + асимметричные вставки +
                    кроссфейды актов + 2-слойный аудио-микшер +{' '}
                    <code className="text-sky-300">loudnorm</code>:
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-emerald-300/90 overflow-x-auto max-h-60 custom-scroll leading-relaxed">
                    {`# Входы FFmpeg:\n${ffmpegPreview.inputsArgs.join(' \\\n  ')}\n\n# filter_complex:\n${ffmpegPreview.filterLines.join(';\n')}\n\n# Кодирование и маппинг:\n-map "[${ffmpegPreview.finalVideoMap}]" -map "[${ffmpegPreview.finalAudioMap}]" ${ffmpegPreview.encodingFlags} -t ${calculatedProjectDurationSec + (finalBlackScreenEnabled ? finalBlackScreenSec : 0)}`}
                  </pre>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
              <div className="aether-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#f8fafc] uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" /> 5. Настройки экспорта и видеокодека
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-400/30 px-2.5 py-0.5 rounded-full">
                    {videoCodec} • CRF {videoCrf} • {videoFps}fps • AAC {audioBitrateKbps}k
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/55 uppercase block">
                      Видеокодек (
                      <code className="font-mono text-amber-300">export_settings.video_codec</code>):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        {
                          id: 'libx264' as const,
                          title: 'H.264 (libx264 • CRF 20)',
                          sub: 'Скоростной рендер YouTube 4K'
                        },
                        {
                          id: 'libx265' as const,
                          title: 'H.265 (libx265 • CRF 22)',
                          sub: 'Архивное HEVC сжатие'
                        }
                      ].map(codecOpt => {
                        const active = videoCodec === codecOpt.id;
                        return (
                          <button
                            key={codecOpt.id}
                            type="button"
                            onClick={() => {
                              setVideoCodec(codecOpt.id);
                              setVideoCrf(codecOpt.id === 'libx264' ? 20 : 22);
                            }}
                            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left cursor-pointer flex flex-col justify-center ${
                              active
                                ? 'btn-artistic-premium'
                                : 'bg-[#080c14]/80 border-white/[0.08] text-white/70 hover:text-white'
                            }`}
                          >
                            <span className="text-xs font-extrabold">{codecOpt.title}</span>
                            <span
                              className={`text-[10px] ${
                                active ? 'text-slate-900/80 font-medium' : 'text-white/50'
                              }`}
                            >
                              {codecOpt.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-white/55 uppercase block mb-1.5">
                        Частота кадров (FPS):
                      </label>
                      <div className="flex gap-1.5">
                        {([24, 30, 60] as const).map(fpsVal => {
                          const active = videoFps === fpsVal;
                          return (
                            <button
                              key={fpsVal}
                              type="button"
                              onClick={() => setVideoFps(fpsVal)}
                              className={`min-h-[44px] flex-1 rounded-xl font-mono text-xs font-bold border cursor-pointer ${
                                active
                                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                  : 'bg-[#080c14]/80 border-white/[0.08] text-white/60 hover:text-white'
                              }`}
                            >
                              {fpsVal}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-white/55 uppercase block mb-1.5">
                        Качество (CRF):
                      </label>
                      <input
                        type="number"
                        min={14}
                        max={30}
                        value={videoCrf}
                        onChange={e =>
                          setVideoCrf(
                            Math.max(
                              14,
                              Math.min(
                                30,
                                Number(e.target.value) || (videoCodec === 'libx264' ? 20 : 22)
                              )
                            )
                          )
                        }
                        className="w-full min-h-[44px] bg-[#080c14]/90 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-white/55 uppercase block mb-1.5">
                        Аудио AAC (kbps):
                      </label>
                      <div className="flex gap-1.5">
                        {([320, 256, 192] as const).map(brVal => {
                          const active = audioBitrateKbps === brVal;
                          return (
                            <button
                              key={brVal}
                              type="button"
                              onClick={() => setAudioBitrateKbps(brVal)}
                              className={`min-h-[44px] flex-1 rounded-xl font-mono text-[11px] font-bold border cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                                  : 'bg-[#080c14]/80 border-white/[0.08] text-white/60 hover:text-white'
                              }`}
                            >
                              {brVal}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-white/55 uppercase block">
                        Разрешение рендера:
                      </label>
                      <label className="min-h-[38px] flex items-center gap-1.5 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 px-3 py-1 rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={loopDraftMode || loopResolution === '720p'}
                          onChange={e => {
                            const checked = e.target.checked;
                            setLoopDraftMode(checked);
                            if (checked) {
                              setVideoCodec('libx264');
                              setLoopResolution('720p');
                            } else if (loopResolution === '720p') {
                              setLoopResolution('4k');
                            }
                          }}
                          className="accent-amber-400 w-3.5 h-3.5"
                        />
                        <span>⚡ Черновик Draft 720p ultrafast</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: '720p' as const, label: '720p Draft', dim: '1280×720' },
                        { id: '1080p' as const, label: '1080p FHD', dim: '1920×1080' },
                        { id: '2k' as const, label: '2K QHD', dim: '2560×1440' },
                        { id: '4k' as const, label: '4K UHD', dim: '3840×2160' }
                      ].map(resOpt => {
                        const active = loopResolution === resOpt.id;
                        return (
                          <button
                            key={resOpt.id}
                            type="button"
                            onClick={() => {
                              setLoopResolution(resOpt.id);
                              setLoopDraftMode(resOpt.id === '720p');
                            }}
                            className={`min-h-[44px] px-3 py-2 rounded-xl border text-left cursor-pointer flex flex-col justify-center ${
                              active
                                ? 'bg-emerald-500/20 border-emerald-400 text-[#f8fafc] shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                                : 'bg-[#080c14]/80 border-white/[0.08] text-white/65 hover:text-white'
                            }`}
                          >
                            <span className="text-xs font-extrabold">{resOpt.label}</span>
                            <span className="text-[10px] font-mono text-white/55">{resOpt.dim}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-[#080c14] border border-amber-400/35 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-amber-300 block">
                      Динамический калькулятор итогового веса ({videoCodec.toUpperCase()} {videoFps}
                      fps):
                    </span>
                    <span className="text-sm font-bold text-[#f8fafc]">
                      «{getResolutionLabel(loopResolution)} •{' '}
                      {loopDraftMode || loopResolution === '720p'
                        ? 'H.264 Ultrafast'
                        : videoCodec === 'libx264'
                          ? 'H.264 Fast'
                          : getPresetShortLabel(bitratePreset)}{' '}
                      • {loopHours} {loopHours >= 5 ? 'часов' : 'часа'} ~ {estimatedGb} ГБ»
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-300 bg-[#080c14]/90 px-2.5 py-1 rounded-lg border border-amber-400/30">
                    CRF {videoCrf} • AAC {audioBitrateKbps}k
                  </span>
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-indigo-300 uppercase flex items-center gap-1.5">
                      <Subtitles className="w-3.5 h-3.5 text-indigo-400" /> Настройки субтитров
                      (Hardsub / .SRT):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(['en', 'ru', 'de', 'es', 'fr', 'original'] as const).map(lang => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setLoopSubtitleLanguage(lang)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase border cursor-pointer ${
                            loopSubtitleLanguage === lang
                              ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                              : 'bg-[#080c14]/80 border-white/[0.08] text-white/55 hover:text-white'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="min-h-[44px] flex items-center gap-2 bg-[#080c14]/80 border border-white/[0.08] rounded-xl px-3 py-2 text-[11px] font-semibold text-indigo-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={loopBurnInSubtitles}
                        onChange={e => setLoopBurnInSubtitles(e.target.checked)}
                        className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                      />
                      <span>Вшить субтитры в видеоряд (Hardsub)</span>
                    </label>
                    <label className="min-h-[44px] flex items-center gap-2 bg-[#080c14]/80 border border-white/[0.08] rounded-xl px-3 py-2 text-[11px] font-semibold text-emerald-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={loopUploadSrtToDrive}
                        onChange={e => setLoopUploadSrtToDrive(e.target.checked)}
                        className="accent-emerald-500 w-3.5 h-3.5 shrink-0"
                      />
                      <span>Выгрузить .srt на Google Диск</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-white/55">
                      {loopBurnInSubtitles
                        ? 'FFmpeg: -vf "subtitles=subtitles.srt:..."'
                        : 'Чистый рендер без вшивания титров'}{' '}
                      {loopUploadSrtToDrive ? '• Rclone -> ./output/subtitles.srt' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadLoopSrtFile}
                      className="min-h-[38px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      📥 Скачать .SRT файл
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-2">
                  <label className="flex items-center justify-between gap-3 bg-gradient-to-r from-purple-500/10 via-[#080c14] to-[#080c14] border border-purple-500/35 hover:border-purple-400/70 rounded-xl px-3.5 py-3 cursor-pointer select-none">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={shortsFactoryEnabled}
                        onChange={e => setShortsFactoryEnabled(e.target.checked)}
                        className="accent-purple-500 w-4 h-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-purple-200 block">
                          📱 Генерировать пакет вертикальных Shorts (9:16)
                        </span>
                        <span className="text-[10px] text-white/55 block">
                          Автоматическая нарезка тизеров 1080×1920 по таймкодам врезок → папка{' '}
                          <code className="font-mono text-purple-300">Shorts/</code> на GDrive
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        shortsFactoryEnabled
                          ? 'bg-purple-500/25 border-purple-400/60 text-purple-200'
                          : 'bg-[#080c14] border-white/[0.1] text-white/50'
                      }`}
                    >
                      {shortsFactoryEnabled ? '9:16 ON' : 'OFF'}
                    </span>
                  </label>
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                      <CloudUpload className="w-3.5 h-3.5" /> Целевая папка Google Drive
                      (GDRIVE_FOLDER_ID):
                    </label>
                    <button
                      type="button"
                      onClick={openConfigModal}
                      className="text-[11px] text-white/55 hover:text-amber-300 underline cursor-pointer"
                    >
                      Настройки раннера (GitHub / Drive)
                    </button>
                  </div>
                  <input
                    type="text"
                    value={gdriveFolderId}
                    onChange={e => {
                      setGdriveFolderId(e.target.value);
                      localStorage.setItem('ac_gdrive_folder_id', e.target.value);
                    }}
                    placeholder="Напр.: 1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv"
                    className="w-full min-h-[42px] bg-[#080c14]/90 border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] outline-none focus:border-amber-400 font-mono"
                  />
                </div>
              </div>

              <div className="aether-card border border-emerald-500/25 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-[#f8fafc] uppercase tracking-wide">
                      Прямая отправка манифеста в GitHub Actions
                    </h4>
                    <p className="text-xs text-white/65 leading-relaxed">
                      При нажатии <strong>«🚀 Запустить облачную сборку»</strong> манифест проекта{' '}
                      <strong>«{loopProjectName || 'Ambient Loop 4K'}»</strong> (
                      <code className="font-mono text-amber-300">
                        {videoCodec} CRF {videoCrf} • {videoFps}fps
                      </code>
                      , слоты <code className="font-mono text-amber-300">timeline_slots[]</code>,
                      2-слойный аудио-микшер, <code className="font-mono text-sky-300">loudnorm</code>)
                      отправляется через{' '}
                      <code className="font-mono text-emerald-300">workflow_dispatch</code>.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08] text-[11px] text-white/55">
                  <span className="font-mono">
                    Актов: <code className="text-amber-300">{timelineSlots.length}</code> • Вставок:{' '}
                    <code className="text-emerald-300">{totalInsertsCount}</code> • Хронометраж:{' '}
                    <code className="text-cyan-300">
                      {formatTimeHMS(calculatedProjectDurationSec)}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      openConfigModal();
                      setShowYamlPreview(true);
                    }}
                    className="text-amber-300 hover:text-amber-200 font-semibold cursor-pointer"
                  >
                    Актуальный workflow раннера →
                  </button>
                </div>

                {!canDispatchLoop && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-3.5 py-2.5 text-[11px] text-rose-200 space-y-1"
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>Запуск заблокирован: не заполнены имена файлов</span>
                    </div>
                    <p className="font-mono text-[10.5px] text-rose-300/90">
                      Слоты без file_name: {emptySlotNumbers.join(', ')}. Загрузите клипы в дропзону
                      или впишите имена вручную — иначе граф получит пустые входы.
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2.5">
                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <button
                      type="button"
                      onClick={startLoopRender}
                      disabled={isRunnerActive || isLoopDispatching || !canDispatchLoop}
                      className={`min-h-[48px] flex-1 flex items-center justify-center gap-2 font-bold px-5 py-3.5 rounded-xl text-xs ${
                        isRunnerActive || isLoopDispatching || !canDispatchLoop
                          ? 'bg-slate-800/90 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-90 shadow-none'
                          : 'btn-primary-action cursor-pointer'
                      }`}
                    >
                      <InfinityIcon className="w-4 h-4 shrink-0" />
                      <span>
                        {isLoopDispatching
                          ? 'Отправка манифеста в GitHub Actions...'
                          : isRunnerActive
                            ? `⏳ Сборка ${
                                terminalRunnerStatus === 'queued' ? 'QUEUED' : 'RUNNING'
                              } • Таймер: ${formatTerminalTime(renderStatus.seconds)}`
                            : !canDispatchLoop
                              ? '🔒 Заполните file_name всех слотов'
                              : `🚀 Запустить облачную сборку (${
                                  videoCodec === 'libx264' ? 'H.264' : 'H.265'
                                } CRF ${videoCrf} • ${videoFps}fps • ${getResolutionLabel(
                                  loopResolution
                                )} ~ ${estimatedGb} ГБ)`}
                      </span>
                    </button>
                    {isRunnerActive && renderStatus.runUrl && (
                      <a
                        href={renderStatus.runUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 px-4 py-3 text-xs font-mono font-semibold text-cyan-200 whitespace-nowrap"
                      >
                        <span>Открыть Run в GitHub Actions</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <button
                      type="button"
                      onClick={startPreflightCheck}
                      disabled={isRunnerActive || isLoopDispatching}
                      className={`min-h-[44px] flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                        isRunnerActive || isLoopDispatching
                          ? 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/40 text-sky-300 cursor-pointer'
                      }`}
                    >
                      <span>🔍 Проверить файлы на GDrive (Preflight)</span>
                    </button>
                    <button
                      type="button"
                      onClick={enqueueCurrentManifest}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/45 bg-purple-500/15 hover:bg-purple-500/25 px-4 py-2.5 text-xs font-semibold text-purple-200 transition cursor-pointer whitespace-nowrap"
                      title="Поставить текущий манифест в локальную очередь"
                    >
                      <ListOrdered className="w-3.5 h-3.5 text-purple-300" />
                      <span>+ В очередь</span>
                      {batchQueue.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-md bg-purple-400 text-slate-950 font-mono text-[10px] font-bold">
                          {batchQueue.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {batchQueue.length > 0 && (
                    <div className="bg-[#080c14] border border-purple-500/35 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5">
                          <ListOrdered className="w-3.5 h-3.5" />
                          Очередь сборок (Batch Queue: {batchQueue.length})
                        </span>
                        <div className="flex items-center gap-1.5">
                          {!isRunnerActive && !isLoopDispatching && (
                            <button
                              type="button"
                              onClick={startNextFromBatchQueue}
                              className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" /> Запустить #1
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={clearBatchQueue}
                            className="text-slate-400 hover:text-rose-400 px-1.5 py-0.5 rounded text-[10px] cursor-pointer"
                          >
                            Очистить
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scroll pr-1">
                        {batchQueue.map((qItem, qIdx) => (
                          <div
                            key={qItem.id}
                            className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-mono font-bold text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded text-[10px]">
                                #{qIdx + 1}
                              </span>
                              <span className="font-semibold text-slate-200 truncate">
                                {qItem.projectName}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 hidden sm:inline">
                                {qItem.codec} CRF{qItem.crf} • {qItem.resolution} • {qItem.slotsCount}{' '}
                                сл.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromBatchQueue(qItem.id)}
                              className="text-slate-500 hover:text-rose-400 p-1 rounded cursor-pointer shrink-0"
                              title="Убрать из очереди"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

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
            externalSlotTitlePatch={externalSlotTitlePatch}
            onConsumeExternalSlotTitlePatch={() => setExternalSlotTitlePatch(null)}
            manifestThumbnailSlots={manifestThumbnailSlots}
            endScreenSafeZone={effectiveEndScreenSafeZone}
            manifestDurationBadge={manifestDurationBadge}
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
            onSourceTextChange={nextText => {
              setSourceText(nextText);
              setSeoScriptText(nextText);
            }}
            onImportManifestJson={(raw, fileName) => applyManifestObject(raw, fileName)}
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
            onApplyTitleToThumbnail={(selectedTitle, targetSlot = 'A') => {
              const words = selectedTitle
                .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 4)
                .join(' ')
                .toUpperCase();
              const finalHook = words || selectedTitle.slice(0, 32).toUpperCase();
              if (targetSlot === 'A' && finalHook) setThumbTitle(finalHook);
              setExternalSlotTitlePatch({
                slot: targetSlot,
                title: finalHook,
                nonce: Date.now()
              });
              handleSelectTab('thumb');
              showToast(`Хук «${finalHook}» передан на 4K обложку (Слот ${targetSlot})!`, 'success');
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
                {formatTime(renderStatus.seconds)}
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
      </StudioShell>

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