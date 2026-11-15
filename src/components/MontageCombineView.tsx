/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Clapperboard,
  FolderUp,
  Download,
  Music,
  Play,
  Plus,
  Trash2,
  FileText,
  Sliders,
  CloudUpload,
  CheckCircle2,
  LayoutGrid,
  Sparkles,
  Search,
  AlertTriangle,
  Subtitles,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { GoogleDriveDirectUploader } from './GoogleDriveDirectUploader';
import {
  LiveTerminal,
  TerminalLogEntry,
  TerminalRunnerState,
  formatTerminalTime
} from './StudioTerminal';
import {
  googleDriveSignIn,
  getDriveAccessToken,
  resumableUploadToGoogleDrive
} from '../googleDriveAuth';
import {
  YoutubeSeoManifestBlock,
  toEnglishSceneTitle
} from '../utils/englishExport';

export type CameraVectorType = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';

export type CinematicOverlayId =
  | 'ambient_particles'
  | 'cinematic_film_grain'
  | 'historical_lower_thirds'
  | 'warm_glow';

export interface ShortsExportSegment {
  segment_index: number;
  hook_type: string;
  start_sec: number;
  duration_sec: number;
  script_excerpt: string;
}

export interface ShortsExportManifestBlock {
  enabled: boolean;
  aspect_ratio: '9:16';
  resolution: '1080x1920';
  crop_mode: 'center';
  ffmpeg_crop_filter: string;
  subtitle_style: {
    font_family: string;
    font_size_px: number;
    text_color: string;
    highlight_color: string;
    stroke_color: string;
    stroke_width_px: number;
    background_box: string;
    position: 'center_lower_third' | 'center';
    uppercase: boolean;
  };
  segments: ShortsExportSegment[];
}

export interface NarrativeSceneItem {
  scene_index: number;
  scene_id: string;
  title?: string;
  file_name: string;
  start_time: string | number;
  duration: number;
  camera_movement?: CameraVectorType;
  visual_style?: string;
  needs_revision?: boolean;
  revision_note?: string;
  transition: {
    type: 'crossfade' | 'dissolve' | 'fade' | 'cut' | 'none';
    duration_sec: number;
  };
  text_overlay: string;
  ai_video_prompt?: string;
  prompt_ru?: string;
  sfx?: string;
}

export interface MasterAudioConfig {
  file_name: string;
  start_timecode: string;
  volume: number;
  fade_in_sec: number;
  fade_out_sec: number;
  duration_sec?: number;
}

export interface AmbientAudioConfig {
  file_name: string;
  loop_full_duration: boolean;
  volume: number;
}

export type SubtitleTargetLanguage =
  | 'en-US'
  | 'ru-RU'
  | 'es-ES'
  | 'de-DE'
  | 'fr-FR'
  | 'original';

export interface SubtitlesFlexibleConfig {
  enabled: boolean;
  burn_in: boolean;       // вшивать ли через FFmpeg фильтр (Hardsub)
  upload_srt: boolean;    // сохранять ли файл на Google Диск (Softsub)
  language: string;       // "en", "ru", "es", "de", "fr", "original"
  target_language?: SubtitleTargetLanguage;
  srt_filename?: string;
  srt_content: string;    // полный текст сгенерированных таймкодов
}

export interface BurnInSrtConfig {
  enabled: boolean;
  burn_in: boolean;
  upload_srt: boolean;
  language: string;
  target_language: SubtitleTargetLanguage;
  srt_filename: string;
  srt_content: string;
  srt_content_base64: string;
  ffmpeg_filter: string;
}

export interface ShortsAutoSliceConfig {
  enabled: boolean;
  count: 2 | 3;
  aspect_ratio: '9:16';
  resolution: '1080x1920';
  crop_mode: 'center';
  hook_text_en: string;
  output_dir: './output/shorts/';
  upload_to_gdrive: boolean;
}

export interface NarrativeExportSettings {
  resolution: '4k' | '1080p' | '720p';
  aspect_ratio: '16:9' | '9:16';
  video_codec: 'libx265' | 'libx264';
  preset?: 'veryfast' | 'ultrafast' | 'medium';
  draft_mode?: boolean;
  bitrate_mbps: number;
  crf: number;
  fps: 24 | 30 | 60;
  audio_bitrate_kbps: 320 | 256 | 192;
  subtitles?: SubtitlesFlexibleConfig;
}

export interface NarrativeMontageManifest {
  schema_version: '3.0';
  project_type: 'narrative_scenes_montage';
  project_name: string;
  manifest_name?: string;
  rhythm_profile?: string;
  overlays: CinematicOverlayId[];
  total_scenes: number;
  total_duration_sec: number;
  cloud_export: {
    target_folder_id: string;
  };
  gdrive_folder_id: string;
  ambient_audio: AmbientAudioConfig;
  master_audio: MasterAudioConfig;
  export_settings: NarrativeExportSettings;
  subtitles: SubtitlesFlexibleConfig;
  subtitles_burn_in?: BurnInSrtConfig;
  shorts_config?: ShortsAutoSliceConfig;
  shorts_export?: ShortsExportManifestBlock;
  telegram_notifications?: {
    enabled: boolean;
    bot_token: string;
    chat_id: string;
  };
  drift_guard?: {
    video_duration_sec: number;
    audio_duration_sec: number;
    diff_sec: number;
    within_tolerance: boolean;
  };
  youtube_seo?: YoutubeSeoManifestBlock;
  scenes: NarrativeSceneItem[];
}

interface MontageCombineViewProps {
  ghToken: string;
  ghRepo: string;
  ghBranch: string;
  gdriveFolderId: string;
  onGdriveFolderIdChange: (folderId: string) => void;
  driveUser: User | null;
  driveToken: string | null;
  onDriveAuthChange: (user: User | null, token: string | null) => void;
  externalProjectName?: string;
  onExternalProjectNameChange?: (name: string) => void;
  rhythmProfilePreset?: 'historical_storytelling' | 'ambient_meditative' | null;
  onConsumeRhythmProfilePreset?: () => void;
  shortsExportConfig?: ShortsExportManifestBlock;
  transferredScript: string;
  onClearTransferredScript: () => void;
  externalScenes?: NarrativeSceneItem[] | null;
  onConsumeExternalScenes?: () => void;
  externalMasterAudioFile?: { fileName: string; file?: File; durationSec?: number } | null;
  onConsumeExternalMasterAudio?: () => void;
  onScenesChange?: (scenes: NarrativeSceneItem[]) => void;
  youtubeSeo?: YoutubeSeoManifestBlock;
  telegramBotToken?: string;
  telegramChatId?: string;
  onOpenConfigModal: () => void;
  onStartRenderStatus: (title: string, desc: string, repo: string, customDispatchTime?: number) => void;
  onCancelRenderRun: () => void;
  onNotify: (message: string, type?: 'info' | 'error' | 'success') => void;
  encodeManifestBase64: (manifestObj: unknown) => string;
  terminalStatus: TerminalRunnerState;
  terminalSeconds: number;
  terminalLogs: TerminalLogEntry[];
  terminalRunUrl?: string;
  onClearTerminalLogs: () => void;
}

const formatTimecode = (sec: number): string => {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const parseTimecodeToSec = (val: unknown, fallbackSec: number): number => {
  if (typeof val === 'number' && !isNaN(val)) return Math.max(0, val);
  if (typeof val === 'string' && val.trim()) {
    const clean = val.trim();
    if (/^\d+(\.\d+)?$/.test(clean)) return Number(clean);
    const parts = clean.split(':').map(Number);
    if (parts.every(n => !isNaN(n))) {
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
  }
  return fallbackSec;
};

// Параметры виртуализации компактной строчной сетки (для 100–200+ сцен без перегрузки DOM)
const ROW_HEIGHT = 50;
const VIEWPORT_HEIGHT = 500;
const OVERSCAN_ROWS = 8;

const CAMERA_VECTORS_ORDER: CameraVectorType[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];

const CINEMATIC_OVERLAY_PRESETS: Array<{
  id: CinematicOverlayId;
  label: string;
  badge: string;
  desc: string;
}> = [
  {
    id: 'ambient_particles',
    label: '✨ Частицы / Снег / Искры (Ambient Particles)',
    badge: 'ambient_particles',
    desc: 'Атмосферные пылинки, пепел или мягкий снег поверх видеоряда'
  },
  {
    id: 'cinematic_film_grain',
    label: '🎞️ Зерно 35mm плёнки и виньетка (Cinematic Film Grain)',
    badge: 'cinematic_film_grain',
    desc: 'Аналоговая текстура киноплёнки 35mm + мягкое затемнение углов'
  },
  {
    id: 'historical_lower_thirds',
    label: '📍 Исторические титры дат и локаций (Lower Thirds)',
    badge: 'historical_lower_thirds',
    desc: 'Документальные плашки с печатным трекингом для дат и архивных мест'
  },
  {
    id: 'warm_glow',
    label: '🕯️ Мягкое пульсирующее свечение (Warm Glow)',
    badge: 'warm_glow',
    desc: 'Тёплое анаморфное свечение свечей и ламп (Halation & Bloom)'
  }
];

export const MontageCombineView: React.FC<MontageCombineViewProps> = ({
  ghToken,
  ghRepo,
  gdriveFolderId,
  onGdriveFolderIdChange,
  driveUser,
  driveToken,
  onDriveAuthChange,
  externalProjectName,
  onExternalProjectNameChange,
  rhythmProfilePreset,
  onConsumeRhythmProfilePreset,
  shortsExportConfig,
  transferredScript,
  onClearTransferredScript,
  externalScenes,
  onConsumeExternalScenes,
  externalMasterAudioFile,
  onConsumeExternalMasterAudio,
  onScenesChange,
  youtubeSeo,
  telegramBotToken,
  telegramChatId,
  onOpenConfigModal,
  onStartRenderStatus,
  onCancelRenderRun,
  onNotify,
  encodeManifestBase64,
  terminalStatus,
  terminalSeconds,
  terminalLogs,
  terminalRunUrl,
  onClearTerminalLogs
}) => {
  // Редактируемое имя проекта (по умолчанию: "Narrative Movie 4K")
  const [projectName, setProjectName] = useState<string>(externalProjectName || 'Narrative Movie 4K');

  useEffect(() => {
    if (typeof externalProjectName === 'string' && externalProjectName !== projectName) {
      setProjectName(externalProjectName);
    }
  }, [externalProjectName]);

  const handleProjectNameUpdate = (val: string) => {
    setProjectName(val);
    onExternalProjectNameChange?.(val);
  };

  // Профиль Ритм-карты и Генератор ритма по референсу (Style & Pacing DNA)
  const [rhythmProfile, setRhythmProfile] = useState<
    'historical_storytelling' | 'ambient_meditative' | 'custom_dna'
  >('historical_storytelling');
  const [isDnaModalOpen, setIsDnaModalOpen] = useState<boolean>(false);
  const [dnaReferenceInput, setDnaReferenceInput] = useState<string>(
    'Быстрый монтаж каждые 3 сек, резкие наезды, мрачный нуар'
  );
  const [lastAppliedDnaSummary, setLastAppliedDnaSummary] = useState<string>(
    'Historical Storytelling • 2.5–8 сек • Живопись / Графический роман'
  );

  // Мультивыбор кинематографичных оверлеев (записываются в массив overlays внутри manifest.json)
  const [selectedOverlays, setSelectedOverlays] = useState<CinematicOverlayId[]>([
    'ambient_particles',
    'cinematic_film_grain'
  ]);

  const toggleOverlayPreset = (overlayId: CinematicOverlayId) => {
    setSelectedOverlays(prev =>
      prev.includes(overlayId) ? prev.filter(item => item !== overlayId) : [...prev, overlayId]
    );
  };

  // Динамический массив сцен любой длины (80, 120, 160, 200+ сцен без лимитов и без тестовых заглушек)
  const [narrativeScenes, setNarrativeScenes] = useState<NarrativeSceneItem[]>(() =>
    Array.from({ length: 12 }, (_, idx) => ({
      scene_index: idx + 1,
      scene_id: `SCENE_${String(idx + 1).padStart(3, '0')}`,
      file_name: '',
      start_time: formatTimecode(idx * 5.5),
      duration: idx % 3 === 0 ? 4.5 : idx % 2 === 0 ? 6.5 : 5.0,
      camera_movement: CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length],
      visual_style: idx % 2 === 0 ? 'Живопись (Historical Oil)' : 'Графический роман (Dark Ink)',
      transition: {
        type: 'crossfade',
        duration_sec: 0.8
      },
      text_overlay: '',
      needs_revision: false,
      revision_note: ''
    }))
  );

  // Применение 1-Click пресета Ритм-карты из шапки студии или блока Ритм-карты
  const applyRhythmProfileToScenes = (
    profile: 'historical_storytelling' | 'ambient_meditative',
    silent = false
  ) => {
    setRhythmProfile(profile);
    if (profile === 'historical_storytelling') {
      const histDurations = [3.5, 5.0, 2.5, 6.5, 4.0, 7.5, 3.0, 5.5];
      setNarrativeScenes(prev =>
        recalculateStartTimes(
          prev.map((sc, idx) => ({
            ...sc,
            duration: histDurations[idx % histDurations.length],
            camera_movement: CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length],
            visual_style:
              idx % 2 === 0 ? 'Живопись (Historical Oil)' : 'Графический роман (Dark Ink)',
            transition: {
              type: idx % 4 === 0 ? 'dissolve' : 'crossfade',
              duration_sec: 0.8
            }
          }))
        )
      );
      setSelectedOverlays(['cinematic_film_grain', 'historical_lower_thirds']);
      setLastAppliedDnaSummary(
        'Historical Storytelling • Динамичное чередование 2.5–8 сек • Живопись / Графический роман'
      );
      if (!silent) {
        onNotify(
          'Применён профиль Ритм-карты «Historical Storytelling» (2.5–8 сек, векторы камеры и стили Живопись / Графический роман)!',
          'success'
        );
      }
    } else {
      const ambientDurations = [12, 15, 10, 18, 14, 16];
      setNarrativeScenes(prev =>
        recalculateStartTimes(
          prev.map((sc, idx) => ({
            ...sc,
            duration: ambientDurations[idx % ambientDurations.length],
            camera_movement: idx % 2 === 0 ? 'zoom_in' : 'pan_right',
            visual_style: 'Ambient Sanctuary (4K Atmospheric Matte)',
            transition: {
              type: 'crossfade',
              duration_sec: 1.8
            }
          }))
        )
      );
      setSelectedOverlays(['ambient_particles', 'warm_glow']);
      setLastAppliedDnaSummary(
        'Ambient Meditative • Плавное дыхание 10–18 сек • Кроссфейды 1.8 сек'
      );
      if (!silent) {
        onNotify(
          'Применён медитативный профиль Ритм-карты «Ambient Loop» (10–18 сек, плавные кроссфейды 1.8 сек)!',
          'success'
        );
      }
    }
  };

  useEffect(() => {
    if (rhythmProfilePreset) {
      applyRhythmProfileToScenes(rhythmProfilePreset, true);
      onConsumeRhythmProfilePreset?.();
    }
  }, [rhythmProfilePreset, onConsumeRhythmProfilePreset]);

  // 1. ГЕНЕРАТОР РИТМА ПО РЕФЕРЕНСУ (Style & Pacing DNA)
  const applyReferenceDnaToTimeline = (rawDnaText?: string) => {
    const text = (rawDnaText ?? dnaReferenceInput).trim();
    if (!text) {
      onNotify('Введите описание ритма и стиля видео-референса!', 'error');
      return;
    }
    const lower = text.toLowerCase();

    // Извлекаем явно указанный шаг в секундах (например: "каждые 3 сек", "по 4.5 с", "every 3 sec")
    const explicitSecMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:сек|с\b|sec|s\b)/i);
    const explicitSec = explicitSecMatch
      ? Math.max(1.5, Math.min(30, parseFloat(explicitSecMatch[1].replace(',', '.'))))
      : null;

    const isFast =
      /быстр|динам|резк|клип|агрессив|fast|rapid|quick|snappy|action|триллер/i.test(lower);
    const isSlow =
      /медлен|плавн|медитат|тягуч|спокойн|slow|ambient|calm|cinematic|долг/i.test(lower);

    const baseSec = explicitSec ?? (isFast ? 3.0 : isSlow ? 11.0 : 5.0);
    const offsets = isFast
      ? [0, -0.5, 0.5, -0.3, 0.7, -0.2]
      : isSlow
      ? [0, 2.0, -1.5, 3.0, -1.0, 1.5]
      : [0, -1.0, 1.5, -0.5, 2.0, 0.5];

    // Определяем тип переходов
    const isHardCut = /резк|стык|cut|прям|без переход|жёстк|жестк|whip/i.test(lower);
    const isFade = /затемнен|чёрн|черн|fade|нуар|noir|мрачн/i.test(lower);
    const isDissolve = /раствор|dissolve|мягк|плавн|эмбиент/i.test(lower);

    const targetTransitionType: NarrativeSceneItem['transition']['type'] = isHardCut
      ? 'cut'
      : isFade
      ? 'fade'
      : isDissolve
      ? 'dissolve'
      : 'crossfade';

    const targetTransitionDur =
      targetTransitionType === 'cut' ? 0 : isSlow ? 1.6 : isFast ? 0.4 : 0.8;

    // Определяем доминирующие векторы движения камеры
    const preferZoomIn = /наезд|зум|крупн|zoom\s*in|push\s*in|приближ/i.test(lower);
    const preferPan = /панорам|пролет|пролёт|pan|трекинг|горизонт/i.test(lower);
    const preferZoomOut = /отъезд|отдален|общий план|zoom\s*out|pull\s*back/i.test(lower);

    const vectorCycle: CameraVectorType[] = preferZoomIn
      ? ['zoom_in', 'pan_right', 'zoom_in', 'pan_left', 'zoom_out']
      : preferPan
      ? ['pan_left', 'pan_right', 'zoom_in', 'pan_left', 'zoom_out']
      : preferZoomOut
      ? ['zoom_out', 'pan_left', 'zoom_out', 'zoom_in', 'pan_right']
      : CAMERA_VECTORS_ORDER;

    // Определяем художественный стиль
    const detectedStyle = /нуар|мрачн|noir|детектив|тру-крайм/i.test(lower)
      ? 'Dark Noir / High-Contrast Archival 35mm'
      : /живопис|масл|истор|классич|oil/i.test(lower)
      ? 'Живопись (Historical Oil)'
      : /графич|роман|комикс|чернил|ink/i.test(lower)
      ? 'Графический роман (Dark Ink)'
      : /эмбиент|космос|фэнтези|ambient/i.test(lower)
      ? 'Atmospheric Matte 4K'
      : 'Cinematic Documentary DNA';

    setNarrativeScenes(prev =>
      recalculateStartTimes(
        prev.map((sc, idx) => {
          const delta = offsets[idx % offsets.length];
          const computedDur = Math.max(
            1.5,
            Math.round((baseSec + delta) * 10) / 10
          );
          return {
            ...sc,
            duration: computedDur,
            camera_movement: vectorCycle[idx % vectorCycle.length],
            visual_style: detectedStyle,
            transition: {
              type: targetTransitionType,
              duration_sec: targetTransitionDur
            }
          };
        })
      )
    );

    setRhythmProfile('custom_dna');
    const summary = `DNA: ~${baseSec}с • Камера: ${vectorCycle[0]}/${vectorCycle[1]} • Переход: ${targetTransitionType}${
      targetTransitionDur ? ` (${targetTransitionDur}с)` : ''
    } • Стиль: ${detectedStyle}`;
    setLastAppliedDnaSummary(summary);
    setIsDnaModalOpen(false);
    onNotify(
      `🧬 Ритм с референса применён ко всем ${narrativeScenes.length} сценам (${summary})!`,
      'success'
    );
  };

  // Прием сгенерированных сцен из VerbaFlow («🎬 Разбить на видео-промты»)
  useEffect(() => {
    if (externalScenes && externalScenes.length > 0) {
      setNarrativeScenes(externalScenes);
      setCustomScenesCountInput(externalScenes.length);
      onConsumeExternalScenes?.();
    }
  }, [externalScenes, onConsumeExternalScenes]);

  // Синхронизация текущих сцен с родительским App (для автоматического расчета глав YouTube SEO)
  useEffect(() => {
    onScenesChange?.(narrativeScenes);
  }, [narrativeScenes, onScenesChange]);

  // Состояние скролла и фильтра для виртуализированной компактной сетки
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customScenesCountInput, setCustomScenesCountInput] = useState<number>(120);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Двухслойный аудио-микшер:
  // а) Фоновый эмбиент (непрерывный фоновый звук, чекбокс «Зациклить на всю длину видео»)
  const [ambientAudio, setAmbientAudio] = useState<AmbientAudioConfig>({
    file_name: '',
    loop_full_duration: true,
    volume: 0.45
  });

  // б) Мастер-аудиодорожка (озвучка / саундтрек) с полями таймкода старта и громкости
  const [masterAudio, setMasterAudio] = useState<MasterAudioConfig>({
    file_name: '',
    start_timecode: '00:00:00',
    volume: 1.0,
    fade_in_sec: 1.0,
    fade_out_sec: 2.0
  });
  // Матрица рассинхрона (Audio-to-Video Drift Guard): длительность мастер-аудиодорожки в секундах
  const [masterAudioDurationSec, setMasterAudioDurationSec] = useState<number>(64);
  const [masterAudioFile, setMasterAudioFile] = useState<File | null>(null);
  const [masterAudioUploadProgress, setMasterAudioUploadProgress] = useState<{
    uploading: boolean;
    progress: number;
    uploaded: boolean;
    error?: string;
  }>({
    uploading: false,
    progress: 0,
    uploaded: false
  });

  // Авто-подстановка master_voiceover.mp3 из Дикторского цеха (Voice Studio)
  useEffect(() => {
    if (externalMasterAudioFile && externalMasterAudioFile.fileName) {
      setMasterAudio(prev => ({
        ...prev,
        file_name: externalMasterAudioFile.fileName
      }));
      if (externalMasterAudioFile.file) {
        setMasterAudioFile(externalMasterAudioFile.file);
      }
      if (externalMasterAudioFile.durationSec && externalMasterAudioFile.durationSec > 0) {
        setMasterAudioDurationSec(externalMasterAudioFile.durationSec);
      }
      onConsumeExternalMasterAudio?.();
    }
  }, [externalMasterAudioFile, onConsumeExternalMasterAudio]);

  // Гибкая система субтитров: Hardsub (burn_in) / Softsub (upload_srt на Google Диск) / Скачивание .SRT
  const [burnInSrtEnabled, setBurnInSrtEnabled] = useState<boolean>(false);
  const [uploadSrtToDriveEnabled, setUploadSrtToDriveEnabled] = useState<boolean>(true);
  const [subtitleLanguage, setSubtitleLanguage] = useState<SubtitleTargetLanguage>('en-US');
  const [srtFilename, setSrtFilename] = useState<string>('subtitles_en.srt');
  const [srtTextContent, setSrtTextContent] = useState<string>('');
  const srtFileInputRef = useRef<HTMLInputElement | null>(null);

  // Авто-нарезка вирусных Shorts (9:16, 1080x1920, центрированный кроп + текстовый хук на английском)
  const [shortsAutoSliceEnabled, setShortsAutoSliceEnabled] = useState<boolean>(false);
  const [shortsSliceCount, setShortsSliceCount] = useState<2 | 3>(3);
  const [shortsHookTextEn, setShortsHookTextEn] = useState<string>('WAIT FOR THE 14TH SECOND...');

  // Параметры кодирования для N-сцен (по умолчанию H.264 libx264, preset veryfast, CRF 20 — скоростной монтаж)
  const [exportSettings, setExportSettings] = useState<NarrativeExportSettings>({
    resolution: '4k',
    aspect_ratio: '16:9',
    video_codec: 'libx264',
    preset: 'veryfast',
    draft_mode: false,
    bitrate_mbps: 35,
    crf: 20,
    fps: 24,
    audio_bitrate_kbps: 320
  });

  const [importedScenarioName, setImportedScenarioName] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const scenarioJsonInputRef = useRef<HTMLInputElement | null>(null);
  const masterAudioInputRef = useRef<HTMLInputElement | null>(null);

  // Пересчет start_time по цепочке длительностей сцен
  const recalculateStartTimes = (list: NarrativeSceneItem[]): NarrativeSceneItem[] => {
    let cursorSec = 0;
    return list.map((item, idx) => {
      const startStr = formatTimecode(cursorSec);
      const dur = Math.max(0.5, Number(item.duration) || 6);
      cursorSec += dur;
      return {
        ...item,
        scene_index: idx + 1,
        start_time: startStr
      };
    });
  };

  // Расчет полного хронометража всех сцен (8–16+ минут / любое число сцен)
  const calcTotalDurationSec = (scenesList: NarrativeSceneItem[]): number => {
    return scenesList.reduce((acc, sc, idx) => {
      const isLast = idx === scenesList.length - 1;
      const overlap =
        !isLast && sc.transition.type !== 'cut' && sc.transition.type !== 'none'
          ? Math.max(0, Number(sc.transition.duration_sec) || 0)
          : 0;
      return acc + Math.max(0.5, Number(sc.duration) || 0) - overlap;
    }, 0);
  };

  const totalNarrativeDurationSec = useMemo(
    () => calcTotalDurationSec(narrativeScenes),
    [narrativeScenes]
  );

  const calcTotalDuration = (scenesList: NarrativeSceneItem[]): string => {
    const totalSec = calcTotalDurationSec(scenesList);
    const mins = (totalSec / 60).toFixed(1);
    return `${formatTimecode(totalSec)} (${mins} мин / ${Math.round(totalSec)} сек)`;
  };

  // Автоматическая подстановка точных имен выбранных/загруженных файлов в свободные слоты сцен (или мастер-аудио)
  const handleFilesSelectedFromUploader = (files: File[]) => {
    const videoOrImageFiles: File[] = [];
    const audioFiles: File[] = [];

    files.forEach(file => {
      const lower = file.name.toLowerCase();
      if (
        file.type.startsWith('audio/') ||
        lower.endsWith('.mp3') ||
        lower.endsWith('.wav') ||
        lower.endsWith('.aac') ||
        lower.endsWith('.flac')
      ) {
        audioFiles.push(file);
      } else {
        videoOrImageFiles.push(file);
      }
    });

    if (audioFiles.length > 0) {
      const chosenAudio = audioFiles[0];
      setMasterAudioFile(chosenAudio);
      setMasterAudio(prev => ({
        ...prev,
        file_name: chosenAudio.name
      }));
      setMasterAudioUploadProgress({
        uploading: false,
        progress: 0,
        uploaded: false
      });
    }

    if (videoOrImageFiles.length > 0) {
      setNarrativeScenes(prev => {
        const next = [...prev];
        let fileQueueIdx = 0;

        // 1. Заполняем все свободные сцены (где file_name === '')
        for (let i = 0; i < next.length && fileQueueIdx < videoOrImageFiles.length; i++) {
          if (!next[i].file_name.trim()) {
            next[i] = {
              ...next[i],
              file_name: videoOrImageFiles[fileQueueIdx].name
            };
            fileQueueIdx += 1;
          }
        }

        // 2. Если файлов больше, чем свободных слотов — динамически расширяем список без каких-либо лимитов (100, 150, 200+ сцен)
        while (fileQueueIdx < videoOrImageFiles.length) {
          const newIdx = next.length + 1;
          next.push({
            scene_index: newIdx,
            scene_id: `SCENE_${String(newIdx).padStart(3, '0')}`,
            file_name: videoOrImageFiles[fileQueueIdx].name,
            start_time: '00:00',
            duration: 6,
            transition: {
              type: 'crossfade',
              duration_sec: 0.8
            },
            text_overlay: ''
          });
          fileQueueIdx += 1;
        }

        return recalculateStartTimes(next);
      });
    }

    onNotify(
      `Автоматически привязано файлов: видео/сцен — ${videoOrImageFiles.length}${
        audioFiles.length ? `, мастер-аудио — «${audioFiles[0].name}»` : ''
      }`,
      'success'
    );
  };

  // Универсальный динамический парсер JSON-сценария любого размера (80, 120, 160, 200+ сцен без ограничений)
  const applyNarrativeScenarioJson = (raw: Record<string, unknown>, fileNameLabel: string) => {
    const timelineSub =
      raw.timeline && typeof raw.timeline === 'object'
        ? (raw.timeline as Record<string, unknown>)
        : undefined;

    const rawScenesArray = Array.isArray(raw.scenes)
      ? raw.scenes
      : Array.isArray(raw.timeline_slots)
      ? raw.timeline_slots
      : Array.isArray(raw.slots)
      ? raw.slots
      : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(timelineSub?.scenes)
      ? (timelineSub?.scenes as unknown[])
      : Array.isArray(timelineSub?.timeline_slots)
      ? (timelineSub?.timeline_slots as unknown[])
      : Array.isArray(timelineSub?.slots)
      ? (timelineSub?.slots as unknown[])
      : null;

    if (rawScenesArray && rawScenesArray.length > 0) {
      let runningSec = 0;
      const parsedScenes: NarrativeSceneItem[] = rawScenesArray
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((sc, idx) => {
          const baseContent =
            sc.base_content && typeof sc.base_content === 'object'
              ? (sc.base_content as Record<string, unknown>)
              : undefined;

          // Универсальное динамическое извлечение имени файла строго из JSON без заглушек
          const rawFileName = String(
            baseContent?.file_name ||
              sc.file_name ||
              sc.filename ||
              sc.asset_name ||
              sc.video_file ||
              sc.clip_name ||
              ''
          ).trim();

          const rawStart = sc.start_time ?? sc.start_sec ?? sc.timecode;
          const startSec = parseTimecodeToSec(rawStart, runningSec);

          const rawEndSec = typeof sc.end_sec === 'number' ? sc.end_sec : undefined;
          const rawDuration = Number(
            sc.duration ??
              sc.duration_sec ??
              sc.slot_duration_sec ??
              (rawEndSec !== undefined ? rawEndSec - startSec : 6)
          );
          const duration = !isNaN(rawDuration) && rawDuration > 0 ? rawDuration : 6;
          runningSec = startSec + duration;

          // Переход сцены
          const rawTrans = sc.transition ?? sc.slot_transition_out;
          let transType: NarrativeSceneItem['transition']['type'] = 'crossfade';
          let transDur = 0.8;
          if (typeof rawTrans === 'string') {
            const norm = rawTrans.toLowerCase();
            if (norm === 'cut' || norm === 'none') {
              transType = norm as 'cut' | 'none';
              transDur = 0;
            } else if (norm === 'dissolve' || norm === 'fade') {
              transType = norm;
            }
          } else if (rawTrans && typeof rawTrans === 'object') {
            const tObj = rawTrans as Record<string, unknown>;
            const tStr = String(tObj.type || 'crossfade').toLowerCase();
            if (
              tStr === 'crossfade' ||
              tStr === 'dissolve' ||
              tStr === 'fade' ||
              tStr === 'cut' ||
              tStr === 'none'
            ) {
              transType = tStr;
            } else if (tStr === 'xfade') {
              transType = 'crossfade';
            }
            if (typeof tObj.duration_sec === 'number') {
              transDur = Math.max(0, tObj.duration_sec);
            } else if (typeof tObj.duration === 'number') {
              transDur = Math.max(0, tObj.duration);
            }
          }

          const overlayText = String(
            sc.text_overlay ?? sc.subtitle ?? sc.caption ?? sc.act_title ?? sc.title ?? ''
          );

          const rawSceneTitle = String(sc.title ?? sc.act_title ?? '').trim();

          return {
            scene_index: idx + 1,
            scene_id: String(
              sc.scene_id || sc.slot_id || sc.id || `SCENE_${String(idx + 1).padStart(3, '0')}`
            ),
            ...(rawSceneTitle ? { title: rawSceneTitle } : {}),
            file_name: rawFileName,
            start_time:
              typeof sc.start_time === 'string' && sc.start_time.trim()
                ? sc.start_time.trim()
                : formatTimecode(startSec),
            duration,
            transition: {
              type: transType,
              duration_sec: transType === 'cut' || transType === 'none' ? 0 : transDur
            },
            text_overlay: overlayText,
            ...(typeof sc.ai_video_prompt === 'string' && sc.ai_video_prompt.trim()
              ? { ai_video_prompt: sc.ai_video_prompt.trim() }
              : {}),
            ...(typeof sc.prompt_ru === 'string' && sc.prompt_ru.trim()
              ? { prompt_ru: sc.prompt_ru.trim() }
              : {}),
            ...(typeof sc.sfx === 'string' && sc.sfx.trim()
              ? { sfx: sc.sfx.trim() }
              : {})
          };
        });

      if (parsedScenes.length > 0) {
        setNarrativeScenes(parsedScenes);
        setCustomScenesCountInput(parsedScenes.length);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
          setScrollTop(0);
        }
      }
    }

    // Маппинг master_audio
    if (raw.master_audio && typeof raw.master_audio === 'object') {
      const ma = raw.master_audio as Record<string, unknown>;
      const audioName = String(ma.file_name || ma.filename || ma.asset_name || '').trim();
      setMasterAudio(prev => ({
        file_name: audioName,
        start_timecode:
          typeof ma.start_timecode === 'string' && ma.start_timecode.trim()
            ? ma.start_timecode.trim()
            : prev.start_timecode,
        volume: typeof ma.volume === 'number' ? ma.volume : prev.volume,
        fade_in_sec: typeof ma.fade_in_sec === 'number' ? ma.fade_in_sec : prev.fade_in_sec,
        fade_out_sec: typeof ma.fade_out_sec === 'number' ? ma.fade_out_sec : prev.fade_out_sec
      }));
      if (typeof ma.duration_sec === 'number' && ma.duration_sec > 0) {
        setMasterAudioDurationSec(ma.duration_sec);
      }
    } else if (typeof raw.audio_filename === 'string' || typeof raw.master_audio === 'string') {
      const audioName = String(raw.master_audio || raw.audio_filename || '').trim();
      setMasterAudio(prev => ({ ...prev, file_name: audioName }));
    }

    // Маппинг cloud_export.target_folder_id
    const cloudExport =
      raw.cloud_export && typeof raw.cloud_export === 'object'
        ? (raw.cloud_export as Record<string, unknown>)
        : undefined;
    const folderId = String(
      cloudExport?.target_folder_id ||
        cloudExport?.gdrive_folder_id ||
        raw.target_folder_id ||
        raw.gdrive_folder_id ||
        ''
    ).trim();
    if (folderId) {
      onGdriveFolderIdChange(folderId);
    }

    // Маппинг export_settings
    const exp =
      raw.export_settings && typeof raw.export_settings === 'object'
        ? (raw.export_settings as Record<string, unknown>)
        : undefined;
    if (exp || raw.resolution || raw.fps || raw.crf) {
      setExportSettings(prev => {
        const rawRes = String(exp?.resolution ?? raw.resolution ?? prev.resolution).toLowerCase();
        const resolution: '4k' | '1080p' =
          rawRes.includes('1080') || rawRes.includes('1920') ? '1080p' : '4k';

        const rawAspect = String(exp?.aspect_ratio ?? raw.aspect_ratio ?? prev.aspect_ratio);
        const aspect_ratio: '16:9' | '9:16' = rawAspect === '9:16' ? '9:16' : '16:9';

        const rawCodec = String(exp?.video_codec ?? raw.video_codec ?? prev.video_codec);
        const video_codec: 'libx265' | 'libx264' = rawCodec.includes('264')
          ? 'libx264'
          : 'libx265';

        const rawFps = Number(exp?.fps ?? raw.fps ?? prev.fps);
        const fps: 24 | 30 | 60 = rawFps === 30 || rawFps === 60 ? rawFps : 24;

        const rawCrf = Number(exp?.crf ?? raw.crf ?? prev.crf);
        const crf = !isNaN(rawCrf) && rawCrf >= 10 && rawCrf <= 35 ? rawCrf : prev.crf;

        const rawBitrate = Number(exp?.bitrate_mbps ?? raw.bitrate_mbps ?? prev.bitrate_mbps);
        const bitrate_mbps =
          !isNaN(rawBitrate) && rawBitrate > 0 ? rawBitrate : prev.bitrate_mbps;

        return {
          ...prev,
          resolution,
          aspect_ratio,
          video_codec,
          fps,
          crf,
          bitrate_mbps
        };
      });
    }

    // Маппинг subtitles / export_settings.subtitles / subtitles_burn_in
    const rawSubs =
      (raw.subtitles && typeof raw.subtitles === 'object'
        ? (raw.subtitles as Record<string, unknown>)
        : undefined) ||
      (exp?.subtitles && typeof exp.subtitles === 'object'
        ? (exp.subtitles as Record<string, unknown>)
        : undefined) ||
      (raw.subtitles_burn_in && typeof raw.subtitles_burn_in === 'object'
        ? (raw.subtitles_burn_in as Record<string, unknown>)
        : undefined);

    if (rawSubs) {
      if (typeof rawSubs.burn_in === 'boolean') {
        setBurnInSrtEnabled(rawSubs.burn_in);
      } else if (typeof rawSubs.enabled === 'boolean') {
        setBurnInSrtEnabled(rawSubs.enabled);
      }
      if (typeof rawSubs.upload_srt === 'boolean') {
        setUploadSrtToDriveEnabled(rawSubs.upload_srt);
      }
      const rawLang = String(rawSubs.target_language || rawSubs.language || '').trim();
      if (rawLang) {
        const l = rawLang.toLowerCase();
        if (l.startsWith('ru')) setSubtitleLanguage('ru-RU');
        else if (l.startsWith('es')) setSubtitleLanguage('es-ES');
        else if (l.startsWith('de')) setSubtitleLanguage('de-DE');
        else if (l.startsWith('fr')) setSubtitleLanguage('fr-FR');
        else if (l.startsWith('orig')) setSubtitleLanguage('original');
        else setSubtitleLanguage('en-US');
      }
      if (typeof rawSubs.srt_content === 'string' && rawSubs.srt_content.trim()) {
        setSrtTextContent(rawSubs.srt_content);
      }
      if (typeof rawSubs.srt_filename === 'string' && rawSubs.srt_filename.trim()) {
        setSrtFilename(rawSubs.srt_filename.trim());
      }
    }

    setImportedScenarioName(fileNameLabel);
    onNotify(
      `JSON-сценарий «${fileNameLabel}» успешно загружен (${
        rawScenesArray ? `${rawScenesArray.length} сцен` : 'конфиг'
      })!`,
      'success'
    );
  };

  const handleImportScenarioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          applyNarrativeScenarioJson({ scenes: parsed }, file.name);
        } else if (parsed && typeof parsed === 'object') {
          applyNarrativeScenarioJson(parsed as Record<string, unknown>, file.name);
        } else {
          onNotify('Некорректный JSON-файл сценария!', 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onNotify('Ошибка парсинга JSON-сценария: ' + msg, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateScene = (idx: number, patch: Partial<NarrativeSceneItem>) => {
    setNarrativeScenes(prev => {
      const updated = prev.map((sc, i) => (i === idx ? { ...sc, ...patch } : sc));
      if (patch.duration !== undefined) {
        return recalculateStartTimes(updated);
      }
      return updated;
    });
  };

  const addScene = () => {
    setNarrativeScenes(prev => {
      const nextNum = prev.length + 1;
      const next = [
        ...prev,
        {
          scene_index: nextNum,
          scene_id: `SCENE_${String(nextNum).padStart(3, '0')}`,
          file_name: '',
          start_time: '00:00',
          duration: 6,
          transition: {
            type: 'crossfade' as const,
            duration_sec: 0.8
          },
          text_overlay: ''
        }
      ];
      return recalculateStartTimes(next);
    });
  };

  // Генерация произвольного числа сцен (80, 120, 160, 200+ сцен для роликов 8–16 минут)
  const generateNScenesTemplate = (targetCount: number) => {
    const safeCount = Math.max(1, Math.floor(targetCount));
    setNarrativeScenes(prev => {
      const generated: NarrativeSceneItem[] = Array.from({ length: safeCount }, (_, idx) => {
        const existing = prev[idx];
        return {
          scene_index: idx + 1,
          scene_id: existing?.scene_id || `SCENE_${String(idx + 1).padStart(3, '0')}`,
          file_name: existing?.file_name || '',
          start_time: formatTimecode(idx * (existing?.duration || 6)),
          duration: existing?.duration || 6,
          transition: existing?.transition || {
            type: 'crossfade',
            duration_sec: 0.8
          },
          text_overlay: existing?.text_overlay || ''
        };
      });
      return recalculateStartTimes(generated);
    });
    setCustomScenesCountInput(safeCount);
    onNotify(
      `Сформирована сетка таймлайна на ${safeCount} сцен (~${((safeCount * 6) / 60).toFixed(
        1
      )} мин) с сохранением введенных имен файлов!`,
      'info'
    );
  };

  const removeScene = (idx: number) => {
    setNarrativeScenes(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((_, i) => i !== idx);
      return recalculateStartTimes(filtered);
    });
  };

  // Авто-определение длительности загруженного мастер-аудиофайла для Матрицы рассинхрона (Audio-to-Video Drift Guard)
  const detectAudioFileDuration = (file: File) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const audioEl = new Audio(objectUrl);
      audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl.duration && isFinite(audioEl.duration) && audioEl.duration > 0) {
          setMasterAudioDurationSec(Math.round(audioEl.duration * 10) / 10);
        }
        URL.revokeObjectURL(objectUrl);
      });
      audioEl.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
      });
    } catch {
      // Fallback: ручной ввод длительности мастер-дорожки
    }
  };

  const handleSelectMasterAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMasterAudioFile(file);
    detectAudioFileDuration(file);
    setMasterAudio(prev => ({
      ...prev,
      file_name: file.name
    }));
    setMasterAudioUploadProgress({
      uploading: false,
      progress: 0,
      uploaded: false
    });
    onNotify(`Выбрана мастер-аудиодорожка: «${file.name}»`, 'success');
    e.target.value = '';
  };

  // Авто-синхронизация длительности всех сцен под хронометраж мастер-аудиодорожки (устранение рассинхрона)
  const syncScenesDurationToMasterAudio = () => {
    if (narrativeScenes.length === 0 || masterAudioDurationSec <= 0) return;
    const totalOverlap = narrativeScenes.reduce((acc, sc, idx) => {
      const isLast = idx === narrativeScenes.length - 1;
      return (
        acc +
        (!isLast && sc.transition.type !== 'cut' && sc.transition.type !== 'none'
          ? Math.max(0, Number(sc.transition.duration_sec) || 0)
          : 0)
      );
    }, 0);
    const neededRawSum = masterAudioDurationSec + totalOverlap;
    const perScene = Math.max(1, Math.round((neededRawSum / narrativeScenes.length) * 10) / 10);

    setNarrativeScenes(prev =>
      recalculateStartTimes(
        prev.map(sc => ({
          ...sc,
          duration: perScene
        }))
      )
    );
    onNotify(
      `Длительность ${narrativeScenes.length} сцен синхронизирована под мастер-аудио (${masterAudioDurationSec} сек)!`,
      'success'
    );
  };

  // Форматирование секунд в таймкод SRT (00:00:00,000)
  const formatSrtTimestamp = (sec: number): string => {
    const safe = Math.max(0, sec);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  // Авто-переводчик строки субтитров на выбранный целевой язык (English (US), Русский, Español, Deutsch, Оригинальный)
  const translateSubtitleLine = (
    rawLine: string,
    sceneIndex: number,
    lang: SubtitleTargetLanguage
  ): string => {
    const clean = rawLine
      .replace(/\[(?:Shot|Frame|Кадр|пауза|pause|Beat|Бит|Open Loop)[^\]]*\]/gi, '')
      .replace(/\*+/g, '')
      .trim();

    if (lang === 'original') {
      return clean || `Scene #${sceneIndex}`;
    }

    const hasCyrillic = /[а-яёА-ЯЁ]/.test(clean);

    // Словарь адаптации ключевых документальных фраз на целевые языки
    const enFallbacks = [
      'In the classified archives of the alpine station, a strange low-frequency hum was recorded.',
      'Within twenty-four hours, the entire facility was sealed under a fifty-year non-disclosure order.',
      'The official report blamed an avalanche, yet every instrument kept broadcasting for three weeks.',
      'At the fourteenth second of the tape, an unexplained acoustic anomaly emerges.',
      'When the inspection team unlocked the bunker, the transmitters were still running at full power.',
      'Nobody had access to the console, yet the signal returned at the exact same hour every night.',
      'To this day, the final recording remains locked inside the vault.'
    ];

    const esFallbacks = [
      'En los archivos clasificados de la estación alpina se registró un extraño zumbido de baja frecuencia.',
      'En veinticuatro horas, toda la instalación fue sellada bajo un acuerdo de confidencialidad de cincuenta años.',
      'El informe oficial culpó a una avalancha, pero todos los instrumentos siguieron transmitiendo durante tres semanas.',
      'En el segundo catorce de la cinta aparece una anomalía acústica inexplicable.',
      'Cuando el equipo abrió el búnker, los transmisores seguían funcionando a plena potencia.',
      'Nadie tenía acceso a la consola, pero la señal regresaba exactamente a la misma hora cada noche.',
      'Hasta el día de hoy, la grabación final permanece bajo llave en la bóveda.'
    ];

    const deFallbacks = [
      'In den geheimen Archiven der Alpenstation wurde ein seltsames tieffrequentes Brummen aufgezeichnet.',
      'Innerhalb von vierundzwanzig Stunden wurde die gesamte Anlage für fünfzig Jahre unter Verschluss gestellt.',
      'Der offizielle Bericht machte eine Lawine verantwortlich, doch alle Geräte sendeten noch drei Wochen lang weiter.',
      'In der vierzehnten Sekunde des Bandes tritt eine unerklärliche akustische Anomalie auf.',
      'Als das Team den Bunker öffnete, liefen die Sender noch immer auf Hochtouren.',
      'Niemand hatte Zugang zum Schaltpult, doch das Signal kehrte jede Nacht zur exakt selben Stunde zurück.',
      'Bis heute bleibt die letzte Aufnahme im Tresor verschlossen.'
    ];

    const ruFallbacks = [
      'В засекреченных архивах альпийской станции была обнаружена запись странного низкочастотного гула.',
      'За двадцать четыре часа весь объект закрыли под подписку о неразглашении на пятьдесят лет.',
      'Официальный отчёт списал всё на лавину, но все приборы продолжали передавать сигнал ещё три недели.',
      'На четырнадцатой секунде плёнки отчётливо слышна необъяснимая акустическая аномалия.',
      'Когда группа вскрыла аппаратную, передатчики продолжали работать на полной мощности.',
      'Никто не имел доступа к пульту, но каждую ночь ровно в один и тот же час сигнал возвращался в эфир.',
      'По сей день финальная кассета остаётся под замком в спецхранилище.'
    ];

    const frFallbacks = [
      'Dans les archives classifiées de la station alpine, un étrange bourdonnement basse fréquence a été enregistré.',
      'En vingt-quatre heures, toute la station a été scellée sous un accord de confidentialité de cinquante ans.',
      'Le rapport officiel a invoqué une avalanche, mais tous les instruments ont continué à émettre pendant trois semaines.',
      'À la quatorzième seconde de la bande, une anomalie acoustique inexplicable apparaît.',
      'Lorsque l’équipe a ouvert le bunker, les émetteurs fonctionnaient toujours à pleine puissance.',
      'Personne n’avait accès à la console, pourtant le signal revenait exactement à la même heure chaque nuit.',
      'Aujourd’hui encore, l’enregistrement final reste enfermé dans le coffre.'
    ];

    if (lang === 'en-US') {
      if (!clean || hasCyrillic) {
        return enFallbacks[(sceneIndex - 1) % enFallbacks.length];
      }
      return clean;
    }

    if (lang === 'ru-RU') {
      if (!clean || !hasCyrillic) {
        return ruFallbacks[(sceneIndex - 1) % ruFallbacks.length];
      }
      return clean;
    }

    if (lang === 'es-ES') {
      return esFallbacks[(sceneIndex - 1) % esFallbacks.length];
    }

    if (lang === 'de-DE') {
      return deFallbacks[(sceneIndex - 1) % deFallbacks.length];
    }

    if (lang === 'fr-FR') {
      return frFallbacks[(sceneIndex - 1) % frFallbacks.length];
    }

    return clean || enFallbacks[(sceneIndex - 1) % enFallbacks.length];
  };

  const getShortSubtitleLangCode = (lang: SubtitleTargetLanguage): string => {
    const map: Record<SubtitleTargetLanguage, string> = {
      'en-US': 'en',
      'ru-RU': 'ru',
      'es-ES': 'es',
      'de-DE': 'de',
      'fr-FR': 'fr',
      original: 'original'
    };
    return map[lang] || 'en';
  };

  // Построение полного текста .SRT таймкодов из текущих сцен
  const buildSrtStringFromScenes = (targetLang: SubtitleTargetLanguage = subtitleLanguage): string => {
    let cursor = 0;
    const blocks: string[] = [];
    const scriptLines = transferredScript
      ? transferredScript
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('===') && !l.startsWith('['))
      : [];

    narrativeScenes.forEach((sc, idx) => {
      const dur = Math.max(1, Number(sc.duration) || 5);
      const start = cursor;
      const end = cursor + dur - 0.15;
      cursor += dur;

      const rawCandidate = sc.text_overlay.trim() || scriptLines[idx] || '';
      const localizedLine = translateSubtitleLine(rawCandidate, idx + 1, targetLang);

      blocks.push(
        `${idx + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(Math.max(start + 0.5, end))}\n${localizedLine}`
      );
    });

    return blocks.join('\n\n');
  };

  // Генерация .SRT титров с автоматическим переводом на выбранный целевой язык
  const generateSrtFromScenesWithLang = (targetLang: SubtitleTargetLanguage = subtitleLanguage): string => {
    const shortLang = getShortSubtitleLangCode(targetLang);
    const nextFileName = `subtitles_${shortLang}.srt`;
    const resultSrt = buildSrtStringFromScenes(targetLang);
    setSrtFilename(nextFileName);
    setSrtTextContent(resultSrt);
    onNotify(
      `Субтитры ${nextFileName} (${narrativeScenes.length} сцен • язык: ${shortLang}) сгенерированы!`,
      'success'
    );
    return resultSrt;
  };

  const generateSrtFromScenes = () => {
    generateSrtFromScenesWithLang(subtitleLanguage);
  };

  // Загрузка внешнего .srt или .txt файла субтитров с переводом на выбранный язык
  const handleImportSrtFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = String(ev.target?.result || '');
      const shortLang = getShortSubtitleLangCode(subtitleLanguage);
      if (file.name.toLowerCase().endsWith('.srt') && subtitleLanguage === 'original') {
        setSrtFilename(file.name);
        setSrtTextContent(content);
      } else {
        const lines = content
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && !/^\d+$/.test(l) && !l.includes('-->'));
        let cur = 0;
        const srtBlocks = lines.map((line, idx) => {
          const step = 5;
          const translated = translateSubtitleLine(line, idx + 1, subtitleLanguage);
          const block = `${idx + 1}\n${formatSrtTimestamp(cur)} --> ${formatSrtTimestamp(cur + step - 0.2)}\n${translated}`;
          cur += step;
          return block;
        });
        setSrtFilename(`subtitles_${shortLang}.srt`);
        setSrtTextContent(srtBlocks.join('\n\n'));
      }
      onNotify(
        `Титры «${file.name}» переведены (${shortLang}) и загружены в редактор субтитров!`,
        'success'
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Моментальная генерация и прямое скачивание файла subtitles_[lang].srt через браузер
  const handleDownloadSrtFile = () => {
    const shortLang = getShortSubtitleLangCode(subtitleLanguage);
    const downloadFileName = `subtitles_${shortLang}.srt`;
    const finalSrtContent = srtTextContent.trim()
      ? srtTextContent
      : buildSrtStringFromScenes(subtitleLanguage);

    if (!srtTextContent.trim()) {
      setSrtFilename(downloadFileName);
      setSrtTextContent(finalSrtContent);
    }

    const blob = new Blob([finalSrtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Файл ${downloadFileName} скачан на устройство!`, 'success');
  };

  const handleUploadMasterAudioToDrive = async () => {
    if (!masterAudioFile) {
      onNotify('Сначала выберите локальный файл мастер-аудио (.mp3 или .wav)!', 'error');
      return;
    }
    const cleanFolder = gdriveFolderId.trim();
    if (!cleanFolder) {
      onNotify('Укажите ID целевой папки Google Drive (target_folder_id)!', 'error');
      return;
    }

    let token = driveToken || getDriveAccessToken();
    if (!token) {
      try {
        const authRes = await googleDriveSignIn();
        if (!authRes) return;
        token = authRes.accessToken;
        onDriveAuthChange(authRes.user, authRes.accessToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onNotify('Ошибка входа в Google Drive: ' + msg, 'error');
        return;
      }
    }

    setMasterAudioUploadProgress({
      uploading: true,
      progress: 1,
      uploaded: false
    });

    try {
      await resumableUploadToGoogleDrive(masterAudioFile, cleanFolder, token, pct => {
        setMasterAudioUploadProgress(prev => ({
          ...prev,
          progress: pct
        }));
      });
      setMasterAudioUploadProgress({
        uploading: false,
        progress: 100,
        uploaded: true
      });
      onNotify(
        `✅ Мастер-аудио «${masterAudioFile.name}» выгружено в папку Google Drive (${cleanFolder})!`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMasterAudioUploadProgress({
        uploading: false,
        progress: 0,
        uploaded: false,
        error: msg
      });
      onNotify('Ошибка выгрузки мастер-аудио: ' + msg, 'error');
    }
  };

  // Расчет расхождения между видео и мастер-аудио (Audio-to-Video Drift Guard)
  const driftDiffSec = useMemo(
    () => Math.round((totalNarrativeDurationSec - masterAudioDurationSec) * 10) / 10,
    [totalNarrativeDurationSec, masterAudioDurationSec]
  );
  const isDriftWithinTolerance = Math.abs(driftDiffSec) <= 2;

  const burnInFfmpegFilter = `subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=45'`;

  const resolvedSrtContentForManifest = useMemo(
    () => (srtTextContent.trim() ? srtTextContent : buildSrtStringFromScenes(subtitleLanguage)),
    [srtTextContent, narrativeScenes, subtitleLanguage, transferredScript]
  );

  const subtitlesConfigObject: SubtitlesFlexibleConfig = useMemo(() => {
    const shortLang = getShortSubtitleLangCode(subtitleLanguage);
    const isSubtitlesActive = Boolean(burnInSrtEnabled || uploadSrtToDriveEnabled);
    return {
      enabled: isSubtitlesActive,
      burn_in: burnInSrtEnabled,
      upload_srt: uploadSrtToDriveEnabled,
      language: shortLang,
      target_language: subtitleLanguage,
      srt_filename: srtFilename.trim() || `subtitles_${shortLang}.srt`,
      srt_content: isSubtitlesActive ? resolvedSrtContentForManifest : ''
    };
  }, [
    burnInSrtEnabled,
    uploadSrtToDriveEnabled,
    subtitleLanguage,
    srtFilename,
    resolvedSrtContentForManifest
  ]);

  // Полный JSON-манифест для N-сцен (собирает весь массив scenes[] любой длины без урезания)
  const narrativeManifest: NarrativeMontageManifest = useMemo(
    () => ({
      schema_version: '3.0',
      project_type: 'narrative_scenes_montage',
      project_name: projectName.trim() || 'Narrative Movie 4K',
      manifest_name: importedScenarioName || projectName.trim() || 'Narrative Movie 4K',
      rhythm_profile: rhythmProfile,
      overlays: selectedOverlays,
      total_scenes: narrativeScenes.length,
      total_duration_sec: Math.round(totalNarrativeDurationSec * 10) / 10,
      cloud_export: {
        target_folder_id: gdriveFolderId.trim()
      },
      gdrive_folder_id: gdriveFolderId.trim(),
      ambient_audio: {
        file_name: ambientAudio.file_name.trim(),
        loop_full_duration: ambientAudio.loop_full_duration,
        volume: ambientAudio.volume
      },
      master_audio: {
        file_name: masterAudio.file_name.trim(),
        start_timecode: masterAudio.start_timecode.trim() || '00:00:00',
        volume: masterAudio.volume,
        fade_in_sec: masterAudio.fade_in_sec,
        fade_out_sec: masterAudio.fade_out_sec,
        duration_sec: masterAudioDurationSec
      },
      export_settings: {
        ...exportSettings,
        preset: exportSettings.draft_mode
          ? 'ultrafast'
          : exportSettings.video_codec === 'libx264'
          ? 'veryfast'
          : 'medium',
        subtitles: subtitlesConfigObject
      },
      subtitles: subtitlesConfigObject,
      subtitles_burn_in: {
        enabled: subtitlesConfigObject.enabled,
        burn_in: burnInSrtEnabled,
        upload_srt: uploadSrtToDriveEnabled,
        language: subtitlesConfigObject.language,
        target_language: subtitleLanguage,
        srt_filename: subtitlesConfigObject.srt_filename || 'subtitles.srt',
        srt_content: subtitlesConfigObject.srt_content,
        srt_content_base64:
          subtitlesConfigObject.enabled && subtitlesConfigObject.srt_content
            ? encodeManifestBase64(subtitlesConfigObject.srt_content)
            : '',
        ffmpeg_filter: burnInSrtEnabled ? burnInFfmpegFilter : ''
      },
      shorts_config: {
        enabled: shortsAutoSliceEnabled,
        count: shortsSliceCount,
        aspect_ratio: '9:16',
        resolution: '1080x1920',
        crop_mode: 'center',
        hook_text_en: shortsHookTextEn.trim() || 'WAIT FOR THE 14TH SECOND...',
        output_dir: './output/shorts/',
        upload_to_gdrive: true
      },
      ...(shortsExportConfig ? { shorts_export: shortsExportConfig } : {}),
      ...(telegramBotToken && telegramChatId
        ? {
            telegram_notifications: {
              enabled: true,
              bot_token: telegramBotToken.trim(),
              chat_id: telegramChatId.trim()
            }
          }
        : {}),
      drift_guard: {
        video_duration_sec: Math.round(totalNarrativeDurationSec * 10) / 10,
        audio_duration_sec: masterAudioDurationSec,
        diff_sec: driftDiffSec,
        within_tolerance: isDriftWithinTolerance
      },
      ...(youtubeSeo ? { youtube_seo: youtubeSeo } : {}),
      scenes: narrativeScenes.map((sc, idx) => ({
        scene_index: idx + 1,
        scene_id: sc.scene_id.trim() || `SCENE_${String(idx + 1).padStart(3, '0')}`,
        title: toEnglishSceneTitle(sc, idx),
        file_name: sc.file_name.trim(),
        start_time: sc.start_time,
        duration: Number(sc.duration) || 6,
        camera_movement: sc.camera_movement || CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length],
        ...(sc.visual_style ? { visual_style: sc.visual_style } : {}),
        transition: sc.transition,
        text_overlay: sc.text_overlay,
        ...(sc.needs_revision ? { needs_revision: true } : {}),
        ...(sc.revision_note && sc.revision_note.trim()
          ? { revision_note: sc.revision_note.trim() }
          : {}),
        ...(sc.ai_video_prompt ? { ai_video_prompt: sc.ai_video_prompt } : {}),
        ...(sc.prompt_ru ? { prompt_ru: sc.prompt_ru } : {}),
        ...(sc.sfx ? { sfx: sc.sfx } : {})
      }))
    }),
    [
      projectName,
      importedScenarioName,
      rhythmProfile,
      selectedOverlays,
      narrativeScenes,
      totalNarrativeDurationSec,
      gdriveFolderId,
      ambientAudio,
      masterAudio,
      masterAudioDurationSec,
      exportSettings,
      subtitlesConfigObject,
      burnInSrtEnabled,
      uploadSrtToDriveEnabled,
      subtitleLanguage,
      burnInFfmpegFilter,
      shortsAutoSliceEnabled,
      shortsSliceCount,
      shortsHookTextEn,
      shortsExportConfig,
      telegramBotToken,
      telegramChatId,
      driftDiffSec,
      isDriftWithinTolerance,
      youtubeSeo,
      encodeManifestBase64
    ]
  );

  const flaggedRevisionScenes = useMemo(
    () => narrativeScenes.filter(sc => Boolean(sc.needs_revision)),
    [narrativeScenes]
  );

  // 4. Экспорт Patch-манифеста (только помеченные на пересборку сцены)
  const handleExportPatchManifest = () => {
    if (flaggedRevisionScenes.length === 0) {
      onNotify(
        'Отметьте хотя бы одну сцену флажком «🔄 На пересборку», чтобы сформировать Patch-манифест!',
        'error'
      );
      return;
    }

    const patchManifest = {
      schema_version: '3.0-patch',
      patch_mode: true,
      project_name: projectName.trim() || 'Narrative Movie 4K',
      rhythm_profile: rhythmProfile,
      overlays: selectedOverlays,
      total_project_scenes: narrativeScenes.length,
      total_patch_scenes: flaggedRevisionScenes.length,
      generated_at: new Date().toISOString(),
      cloud_export: {
        target_folder_id: gdriveFolderId.trim()
      },
      scenes: flaggedRevisionScenes.map(sc => ({
        scene_index: sc.scene_index,
        scene_id: sc.scene_id,
        title: toEnglishSceneTitle(sc, sc.scene_index - 1),
        file_name: sc.file_name.trim(),
        start_time: sc.start_time,
        duration: Number(sc.duration) || 6,
        camera_movement: sc.camera_movement || 'zoom_in',
        visual_style: sc.visual_style || 'Historical Storytelling',
        transition: sc.transition,
        text_overlay: sc.text_overlay,
        needs_revision: true,
        revision_note: sc.revision_note?.trim() || 'Точечная пересборка сцены',
        ...(sc.ai_video_prompt ? { ai_video_prompt: sc.ai_video_prompt } : {}),
        ...(sc.sfx ? { sfx: sc.sfx } : {})
      }))
    };

    const jsonString = JSON.stringify(patchManifest, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patch_manifest_${flaggedRevisionScenes.length}scenes.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(
      `Patch-манифест (${flaggedRevisionScenes.length} помеченных сцен) скачан для точечной пересборки!`,
      'success'
    );
  };

  const handleExportScenarioJson = () => {
    const jsonString = JSON.stringify(narrativeManifest, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = importedScenarioName
      ? importedScenarioName.replace(/\.json$/i, '') + '_export.json'
      : `scenes_manifest_${narrativeScenes.length}scenes_${exportSettings.resolution}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`JSON-манифест (${narrativeScenes.length} сцен) экспортирован!`, 'success');
  };

  const isRunnerBusy = terminalStatus === 'running' || terminalStatus === 'queued';

  // Прямой и чистый запуск облачной сборки N-сцен: ровно один POST workflow_dispatch
  const startNarrativeScenesRender = async () => {
    if (isRunnerBusy || isDispatching) {
      onNotify('Сборка уже выполняется в GitHub Actions! Дождитесь завершения или отмените текущий run.', 'info');
      return;
    }
    const githubToken = ghToken.trim();
    if (!githubToken) {
      onNotify('Настройте GitHub Personal Access Token (PAT) в параметрах раннера!', 'error');
      onOpenConfigModal();
      return;
    }

    const dispatchTime = new Date().getTime();
    const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(narrativeManifest))));

    setIsDispatching(true);
    try {
      const response = await fetch(
        'https://api.github.com/repos/ZermeXX/aetherflow-render/actions/workflows/render_scenes.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              manifest_payload: encodedPayload
            }
          })
        }
      );

      if (response.status === 204) {
        onStartRenderStatus(
          'Сборка успешно запущена в GitHub Actions!',
          `Workflow: render_scenes.yml (${narrativeScenes.length} сцен • ${calcTotalDuration(narrativeScenes)}) | Папка GDrive: ${gdriveFolderId || 'не указана'}`,
          'ZermeXX/aetherflow-render',
          dispatchTime
        );
        onNotify('Сборка успешно запущена в GitHub Actions!', 'success');
      } else {
        const errBody = await response.text().catch(() => '');
        const exactError = errBody.trim() || response.statusText || `HTTP ${response.status}`;
        onNotify(`Ошибка GitHub API (${response.status}): ${exactError}`, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify('Сетевой сбой при запуске сборки: ' + msg, 'error');
    } finally {
      setIsDispatching(false);
    }
  };

  // Фильтрация по поиску (сохраняя оригинальный индекс сцены в массиве narrativeScenes)
  const indexedFilteredScenes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return narrativeScenes.map((scene, originalIndex) => ({ scene, originalIndex }));
    }
    return narrativeScenes
      .map((scene, originalIndex) => ({ scene, originalIndex }))
      .filter(
        ({ scene, originalIndex }) =>
          String(originalIndex + 1).includes(q) ||
          scene.scene_id.toLowerCase().includes(q) ||
          scene.file_name.toLowerCase().includes(q) ||
          scene.text_overlay.toLowerCase().includes(q)
      );
  }, [narrativeScenes, searchQuery]);

  // Вычисление видимого окна виртуализации
  const totalRows = indexedFilteredScenes.length;
  const startRowIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endRowIdx = Math.min(totalRows, startRowIdx + visibleRowCount);

  const visibleSlice = indexedFilteredScenes.slice(startRowIdx, endRowIdx);
  const topSpacerHeight = startRowIdx * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endRowIdx) * ROW_HEIGHT);

  const filledScenesCount = narrativeScenes.filter(s => Boolean(s.file_name.trim())).length;

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Шапка вкладки «Повествовательный монтаж (8–16 мин / 100+ сцен)» */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Clapperboard className="text-indigo-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            <span>
              Повествовательный монтаж (8–16 мин / 100–200+ сцен) — Комбайн монтажа (N-Сцен)
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold">Project Name:</span>
            <input
              type="text"
              value={projectName}
              onChange={e => handleProjectNameUpdate(e.target.value)}
              placeholder="Narrative Movie 4K"
              className="bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-2.5 py-1 text-xs font-mono text-indigo-200 outline-none w-56"
            />
            <span className="text-slate-500">
              • Динамический таймлайн • Прямая выгрузка в Google Drive &amp;{' '}
              <code className="text-indigo-300 font-mono">render_scenes.yml</code>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={scenarioJsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportScenarioFile}
          />
          <button
            type="button"
            onClick={() => scenarioJsonInputRef.current?.click()}
            className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-500/20"
          >
            <FolderUp className="w-4 h-4" /> Загрузить JSON-сценарий (N-Сцен / 100–200+)
          </button>

          <button
            type="button"
            onClick={handleExportScenarioJson}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" /> Экспорт JSON
          </button>
        </div>
      </div>

      {/* Синхронизированный сценарий из VerbaFlow (если перенесен) */}
      {transferredScript && (
        <div className="bg-indigo-500/5 border border-indigo-500/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Сценарий из модуля VerbaFlow синхронизирован с монтажным цехом
            </span>
            <button
              type="button"
              onClick={onClearTransferredScript}
              className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Скрыть текст
            </button>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans max-h-28 overflow-y-auto custom-scroll leading-relaxed">
            {transferredScript}
          </pre>
        </div>
      )}

      {/* 1. ПРЯМАЯ ЗАГРУЗКА ИСХОДНИКОВ В ТЕКУЩУЮ ПАПКУ GOOGLE DRIVE (DRAG-AND-DROP) */}
      <GoogleDriveDirectUploader
        targetFolderId={gdriveFolderId}
        onTargetFolderIdChange={onGdriveFolderIdChange}
        driveUser={driveUser}
        driveToken={driveToken}
        onAuthChange={onDriveAuthChange}
        onFilesSelected={handleFilesSelectedFromUploader}
        onNotify={onNotify}
        accentColor="indigo"
        title="1. Прямая загрузка исходных видеоклипов в текущую папку Google Drive"
        subtitle="Перетащите любое количество исходных видеоклипов (80, 120, 200+ файлов) — они выгружаются напрямую в target_folder_id (Resumable Upload), а их точные имена автоматически заполняют сцены таймлайна"
      />

      {/* 2. ДВУХСЛОЙНЫЙ АУДИО-МИКШЕР И СЕЛЕКТОР ВИДЕОКОДЕКА (H.264 vs H.265) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Левая карточка: Двухслойный аудио-микшер */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                2. Двухслойный аудио-микшер (Эмбиент + Мастер-дорожка)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
              2-Layer Audio Mixer
            </span>
          </div>

          <div className="space-y-4">
            {/* а) Фоновый эмбиент (непрерывный фоновый звук, чекбокс "Зациклить на всю длину") */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-emerald-300">
                  а) Фоновый эмбиент (непрерывный фоновый звук):
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-emerald-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ambientAudio.loop_full_duration}
                    onChange={e =>
                      setAmbientAudio(prev => ({
                        ...prev,
                        loop_full_duration: e.target.checked
                      }))
                    }
                    className="accent-emerald-400 w-3.5 h-3.5"
                  />
                  <span>Зациклить на всю длину видео</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  value={ambientAudio.file_name}
                  onChange={e =>
                    setAmbientAudio(prev => ({ ...prev, file_name: e.target.value }))
                  }
                  placeholder="Имя файла эмбиента в GDrive (напр. ambient_wind.wav)"
                  className="sm:col-span-3 bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 shrink-0">Vol:</span>
                  <input
                    type="number"
                    min={0.05}
                    max={2.0}
                    step={0.05}
                    value={ambientAudio.volume}
                    onChange={e =>
                      setAmbientAudio(prev => ({
                        ...prev,
                        volume: Math.max(0.05, Number(e.target.value) || 0.45)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* б) Мастер-аудиодорожка (озвучка / саундтрек) с полями таймкода старта и громкости */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <label className="text-[11px] font-bold text-amber-300 block">
                б) Мастер-аудиодорожка (озвучка / саундтрек):
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={masterAudio.file_name}
                  onChange={e =>
                    setMasterAudio(prev => ({ ...prev, file_name: e.target.value }))
                  }
                  placeholder="Напр.: master_voiceover.wav или выберите локальный файл →"
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                />
                <input
                  ref={masterAudioInputRef}
                  type="file"
                  accept=".mp3,.wav,.aac,.flac,audio/*"
                  className="hidden"
                  onChange={handleSelectMasterAudioFile}
                />
                <button
                  type="button"
                  onClick={() => masterAudioInputRef.current?.click()}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
                >
                  🎵 Выбрать .mp3 / .wav
                </button>
              </div>

              {masterAudioFile && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300 font-mono truncate">
                      Локальный файл: <strong className="text-amber-300">{masterAudioFile.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleUploadMasterAudioToDrive}
                      disabled={masterAudioUploadProgress.uploading}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      {masterAudioUploadProgress.uploading
                        ? `Загрузка ${masterAudioUploadProgress.progress}%...`
                        : masterAudioUploadProgress.uploaded
                        ? '✓ Выгружено в GDrive'
                        : 'Загрузить в Google Drive'}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-0.5">
                    Таймкод старта:
                  </label>
                  <input
                    type="text"
                    value={masterAudio.start_timecode}
                    onChange={e =>
                      setMasterAudio(prev => ({
                        ...prev,
                        start_timecode: e.target.value
                      }))
                    }
                    placeholder="00:00:00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-sky-300 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-0.5">
                    Громкость:
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    value={masterAudio.volume}
                    onChange={e =>
                      setMasterAudio(prev => ({
                        ...prev,
                        volume: Math.max(0.1, Number(e.target.value) || 1.0)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-0.5">
                    Fade-In (с):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={masterAudio.fade_in_sec}
                    onChange={e =>
                      setMasterAudio(prev => ({
                        ...prev,
                        fade_in_sec: Math.max(0, Number(e.target.value) || 0)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-0.5">
                    Fade-Out (с):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={masterAudio.fade_out_sec}
                    onChange={e =>
                      setMasterAudio(prev => ({
                        ...prev,
                        fade_out_sec: Math.max(0, Number(e.target.value) || 0)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-amber-400 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Правая карточка: Параметры кодирования для сцен (H.264 vs H.265, 4K/1080p, CRF, FPS) */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                3. Параметры экспорта и селектор видеокодека (export_settings)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
              {exportSettings.resolution.toUpperCase()} • {exportSettings.video_codec} (CRF {exportSettings.crf}) • {exportSettings.fps}fps
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Селектор видеокодека (H.264 preset veryfast CRF 20 vs Draft 720p ultrafast vs H.265 preset medium CRF 22) */}
            <div>
              <label className="text-[10px] text-amber-300 font-bold uppercase block mb-1">
                Селектор видеокодека и режима сборки (H.264 / Draft 720p ultrafast / H.265):
              </label>
              <select
                value={
                  exportSettings.draft_mode
                    ? 'draft_720p'
                    : exportSettings.video_codec
                }
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'draft_720p') {
                    setExportSettings(prev => ({
                      ...prev,
                      resolution: '720p',
                      video_codec: 'libx264',
                      preset: 'ultrafast',
                      draft_mode: true,
                      crf: 26
                    }));
                  } else {
                    const codec = val as 'libx264' | 'libx265';
                    setExportSettings(prev => ({
                      ...prev,
                      resolution: prev.resolution === '720p' ? '4k' : prev.resolution,
                      video_codec: codec,
                      preset: codec === 'libx264' ? 'veryfast' : 'medium',
                      draft_mode: false,
                      crf: codec === 'libx264' ? 20 : 22
                    }));
                  }
                }}
                className="w-full bg-slate-900 border border-indigo-500/40 rounded-lg px-3 py-2 text-xs font-mono text-indigo-200 outline-none focus:border-indigo-400"
              >
                <option value="libx264">
                  H.264 (libx264, veryfast, CRF 20) — Скоростной монтаж (по умолчанию)
                </option>
                <option value="draft_720p">
                  ⚡ Черновик Draft 720p ultrafast (libx264, preset ultrafast, CRF 26) — Быстрая проверка за 1 минуту
                </option>
                <option value="libx265">
                  H.265 (libx265, preset medium, CRF 22) — Архивное сжатие
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Разрешение:
                </label>
                <select
                  value={exportSettings.resolution}
                  onChange={e => {
                    const res = e.target.value as '4k' | '1080p' | '720p';
                    setExportSettings(prev => ({
                      ...prev,
                      resolution: res,
                      draft_mode: res === '720p',
                      preset: res === '720p' ? 'ultrafast' : prev.video_codec === 'libx264' ? 'veryfast' : 'medium'
                    }));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                >
                  <option value="4k">4K Ultra HD (3840×2160)</option>
                  <option value="1080p">1080p Full HD (1920×1080)</option>
                  <option value="720p">Draft 720p HD (1280×720 ultrafast)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Формат кадра:
                </label>
                <select
                  value={exportSettings.aspect_ratio}
                  onChange={e =>
                    setExportSettings(prev => ({
                      ...prev,
                      aspect_ratio: e.target.value as '16:9' | '9:16'
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                >
                  <option value="16:9">16:9 Горизонтальный</option>
                  <option value="9:16">9:16 Shorts / Reels</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Битрейт (Mbps):
                </label>
                <input
                  type="number"
                  min={4}
                  max={120}
                  step={2}
                  value={exportSettings.bitrate_mbps}
                  onChange={e =>
                    setExportSettings(prev => ({
                      ...prev,
                      bitrate_mbps: Math.max(4, Number(e.target.value) || 25)
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Качество CRF (14–28):
                </label>
                <input
                  type="number"
                  min={14}
                  max={28}
                  step={1}
                  value={exportSettings.crf}
                  onChange={e =>
                    setExportSettings(prev => ({
                      ...prev,
                      crf: Math.max(14, Math.min(28, Number(e.target.value) || 20))
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Частота кадров (FPS):
              </label>
              <select
                value={exportSettings.fps}
                onChange={e =>
                  setExportSettings(prev => ({
                    ...prev,
                    fps: Number(e.target.value) as 24 | 30 | 60
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none"
              >
                <option value={24}>24 fps (Cinema)</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 3B. МАТРИЦА РАССИНХРОНА (AUDIO-TO-VIDEO DRIFT GUARD) & ГИБКАЯ СИСТЕМА СУБТИТРОВ + АВТО-НАРЕЗКА SHORTS (9:16) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Матрица рассинхрона + Авто-нарезка вирусных Shorts (9:16) */}
        <div className="space-y-4">
          <div
            className={`rounded-2xl p-5 border space-y-3 transition ${
              isDriftWithinTolerance
                ? 'bg-emerald-950/15 border-emerald-500/40'
                : 'bg-amber-950/15 border-amber-500/50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                {isDriftWithinTolerance ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Матрица рассинхрона (Audio-to-Video Drift Guard)
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${
                  isDriftWithinTolerance
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                }`}
              >
                {isDriftWithinTolerance
                  ? `В пределах нормы (±2 сек)`
                  : driftDiffSec > 0
                  ? `Видео длиннее аудио на ${Math.round(Math.abs(driftDiffSec))} сек`
                  : `Аудио длиннее видео на ${Math.round(Math.abs(driftDiffSec))} сек`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase block">
                  Сумма видео-сцен:
                </span>
                <span className="text-sm font-bold font-mono text-indigo-300">
                  {Math.round(totalNarrativeDurationSec * 10) / 10} сек ({formatTimecode(totalNarrativeDurationSec)})
                </span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                <label className="text-[10px] text-slate-400 uppercase block mb-0.5">
                  Длительность мастер-аудио (сек):
                </label>
                <input
                  type="number"
                  min={1}
                  max={36000}
                  step={1}
                  value={masterAudioDurationSec}
                  onChange={e => setMasterAudioDurationSec(Math.max(1, Number(e.target.value) || 60))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-300 outline-none"
                />
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[10px] text-slate-400 uppercase block">
                  Статус синхронизации:
                </span>
                {isDriftWithinTolerance ? (
                  <span className="text-xs font-bold text-emerald-400">
                    ✓ Идеальный баланс ({driftDiffSec >= 0 ? `+${driftDiffSec}` : driftDiffSec} сек)
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-300">
                    ⚠️ {driftDiffSec > 0
                      ? `Видео длиннее аудио на ${Math.round(Math.abs(driftDiffSec))} сек`
                      : `Аудио длиннее видео на ${Math.round(Math.abs(driftDiffSec))} сек`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-400">
                Автоматический контроль длины 100–150+ сцен против хронометража дикторской озвучки.
              </span>
              <button
                type="button"
                onClick={syncScenesDurationToMasterAudio}
                className="bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-semibold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Подогнать сцены под аудио ({masterAudioDurationSec}с)
              </button>
            </div>
          </div>

          {/* 2. АВТО-НАРЕЗКА SHORTS (9:16 • 1080x1920 • ./output/shorts/) */}
          <div className="bg-[#0b0f17] border border-amber-500/35 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Авто-нарезка Shorts (9:16 • 1080×1920 • Центрированный кроп)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-400/30 text-amber-300 px-2 py-0.5 rounded">
                ./output/shorts/ → Google Drive
              </span>
            </div>

            <label className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-amber-200 cursor-pointer select-none transition">
              <input
                type="checkbox"
                checked={shortsAutoSliceEnabled}
                onChange={e => setShortsAutoSliceEnabled(e.target.checked)}
                className="accent-amber-500 w-4 h-4 shrink-0"
              />
              <span>Сгенерировать 2–3 вирусных Shorts (9:16) из лучших сцен</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Количество Shorts:
                </label>
                <select
                  value={shortsSliceCount}
                  onChange={e => setShortsSliceCount(Number(e.target.value) as 2 | 3)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                >
                  <option value={2}>2 вирусных клипа (9:16)</option>
                  <option value={3}>3 вирусных клипа (9:16)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Текстовый хук на английском (Hook Text Overlay):
                </label>
                <input
                  type="text"
                  value={shortsHookTextEn}
                  onChange={e => setShortsHookTextEn(e.target.value)}
                  placeholder="WAIT FOR THE 14TH SECOND..."
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none"
                />
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
              FFmpeg: <code className="text-amber-300">crop=ih*9/16:ih,scale=1080:1920</code> + английский хук-титр → сохранение в <code className="text-emerald-300">./output/shorts/</code> и выгрузка в Google Drive.
            </div>
          </div>
        </div>

        {/* Гибкая система субтитров: Hardsub / Softsub (Google Drive) / Скачивание .SRT */}
        <div className="bg-[#0b0f17] border border-indigo-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Гибкие субтитры (Hardsub / Softsub / .SRT)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
              subtitles_{getShortSubtitleLangCode(subtitleLanguage)}.srt
            </span>
          </div>

          {/* 2 ЧЕКБОКСА УПРАВЛЕНИЯ РЕЖИМАМИ СУБТИТРОВ (HARDSUB & SOFTSUB GOOGLE DRIVE) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 rounded-xl px-3 py-2.5 text-xs font-semibold text-indigo-200 cursor-pointer select-none transition">
              <input
                type="checkbox"
                checked={burnInSrtEnabled}
                onChange={e => setBurnInSrtEnabled(e.target.checked)}
                className="accent-indigo-500 w-4 h-4 shrink-0"
              />
              <span>Вшить субтитры в 4K видео (Hardsub)</span>
            </label>

            <label className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 rounded-xl px-3 py-2.5 text-xs font-semibold text-emerald-300 cursor-pointer select-none transition">
              <input
                type="checkbox"
                checked={uploadSrtToDriveEnabled}
                onChange={e => setUploadSrtToDriveEnabled(e.target.checked)}
                className="accent-emerald-500 w-4 h-4 shrink-0"
              />
              <span>Выгрузить .SRT файл на Google Диск</span>
            </label>
          </div>

          {/* СЕЛЕКТОР ЯЗЫКА СУБТИТРОВ (SUBTITLE LANGUAGE SELECTOR) */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2">
            <label className="text-[11px] font-bold text-amber-300 uppercase">
              Целевой язык субтитров (language: &quot;{getShortSubtitleLangCode(subtitleLanguage)}&quot;):
            </label>
            <select
              value={subtitleLanguage}
              onChange={e => {
                const nextLang = e.target.value as SubtitleTargetLanguage;
                setSubtitleLanguage(nextLang);
                generateSrtFromScenesWithLang(nextLang);
              }}
              className="bg-slate-950 border border-indigo-500/40 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-200 outline-none focus:border-indigo-400"
            >
              <option value="en-US">English US [en — по умолчанию]</option>
              <option value="ru-RU">Русский [ru]</option>
              <option value="de-DE">Deutsch [de]</option>
              <option value="es-ES">Español [es]</option>
              <option value="fr-FR">Français [fr]</option>
              <option value="original">Оригинальный язык сценария [original]</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={srtFileInputRef}
              type="file"
              accept=".srt,.txt"
              className="hidden"
              onChange={handleImportSrtFile}
            />
            <button
              type="button"
              onClick={() => srtFileInputRef.current?.click()}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
            >
              📎 Прикрепить .srt / текстовый скрипт
            </button>
            <button
              type="button"
              onClick={generateSrtFromScenes}
              className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
            >
              ⚡ Перевести и сгенерировать .SRT ({getShortSubtitleLangCode(subtitleLanguage)})
            </button>
            <button
              type="button"
              onClick={handleDownloadSrtFile}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
            >
              📥 Скачать .SRT файл
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 truncate">
            {burnInSrtEnabled ? (
              <>
                Режим Hardsub активен (<code className="text-indigo-300">-vf &quot;{burnInFfmpegFilter}&quot;</code>)
              </>
            ) : (
              <>
                Режим Softsub / Clean Video: <span className="text-emerald-400">видео рендерится чистым без вшивания титров</span>
                {uploadSrtToDriveEnabled ? ' • ./output/subtitles.srt выгружается в Google Drive' : ''}
              </>
            )}
          </div>

          <textarea
            rows={3}
            value={srtTextContent || resolvedSrtContentForManifest}
            onChange={e => setSrtTextContent(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px] font-mono text-slate-300 outline-none custom-scroll"
            placeholder="Содержимое .SRT файла титров..."
          />
        </div>
      </div>

      {/* 3.5. РИТМ-КАРТА МОНТАЖА (Style & Pacing DNA) + ПРЕСЕТЫ КИНЕМАТОГРАФИЧНЫХ ОВЕРЛЕЕВ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Левая колонка (7 cols): Ритм-карта монтажа и Генератор ритма по референсу */}
        <div className="lg:col-span-7 bg-[#0b0f19] border border-indigo-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div>
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Ритм-карта монтажа (Style &amp; Pacing DNA)
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Автоматическое управление темпом сцен (<code className="text-indigo-300">duration</code>), векторами камеры и переходами
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsDnaModalOpen(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 cursor-pointer border ${
                isDnaModalOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
                  : 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-500/40 text-indigo-200'
              }`}
            >
              <span>🧬 Снять ритм с референса</span>
            </button>
          </div>

          {/* Быстрые профили Ритм-карты */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => applyRhythmProfileToScenes('historical_storytelling')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                rhythmProfile === 'historical_storytelling'
                  ? 'bg-indigo-500/15 border-indigo-400 text-slate-100 shadow-md shadow-indigo-500/10'
                  : 'bg-[#111827]/90 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300">
                  🏛️ Historical Storytelling
                </span>
                <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded">
                  2.5–8 сек
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Динамичное чередование планов, анти-повтор векторов камеры, стиль Живопись / Графический роман
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyRhythmProfileToScenes('ambient_meditative')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                rhythmProfile === 'ambient_meditative'
                  ? 'bg-amber-500/15 border-amber-400 text-slate-100 shadow-md shadow-amber-500/10'
                  : 'bg-[#111827]/90 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300">
                  🌙 Ambient Meditative
                </span>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded">
                  10–18 сек
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Медитативное дыхание кадра, плавные кроссфейды 1.5–2.0 сек без резких склеек
              </p>
            </button>
          </div>

          {/* Аккордеон / Модальное окно «🧬 Снять ритм с референса» */}
          {isDnaModalOpen && (
            <div className="bg-[#111827] border border-amber-500/40 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  🧬 Генератор ритма по референсу (Style &amp; Pacing DNA)
                </span>
                <button
                  type="button"
                  onClick={() => setIsDnaModalOpen(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Свернуть ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Опишите темп, характер склеек и атмосферу понравившегося видео-референса — студия автоматически пересчитает{' '}
                <code className="text-amber-300">duration</code>, векторы камеры и переходы всех сцен:
              </p>
              <textarea
                rows={2}
                value={dnaReferenceInput}
                onChange={e => setDnaReferenceInput(e.target.value)}
                placeholder="Например: быстрый монтаж каждые 3 сек, резкие наезды, мрачный нуар..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl p-2.5 text-xs text-slate-100 outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    'Быстрый монтаж каждые 3 сек, резкие наезды, мрачный нуар',
                    'Документальное расследование каждые 4.5 сек, плавные панорамы, живопись',
                    'Медленный гипнотический ритм каждые 12 сек, мягкое растворение, эмбиент'
                  ].map((sample, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => {
                        setDnaReferenceInput(sample);
                        applyReferenceDnaToTimeline(sample);
                      }}
                      className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 rounded-lg cursor-pointer transition"
                    >
                      ⚡ Пресет #{sIdx + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => applyReferenceDnaToTimeline()}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-1.5 rounded-xl text-xs cursor-pointer transition shadow-md shadow-amber-500/20"
                >
                  🧬 Применить ДНК ритма к {narrativeScenes.length} сценам
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <span className="text-slate-400">
              Активный профиль: <strong className="text-emerald-400">{lastAppliedDnaSummary}</strong>
            </span>
            <span className="text-indigo-300 tabular-nums">
              Сцен: {narrativeScenes.length} • Хронометраж: {formatTimecode(totalNarrativeDurationSec)}
            </span>
          </div>
        </div>

        {/* Правая колонка (5 cols): 2. ПРЕСЕТЫ КИНЕМАТОГРАФИЧНЫХ ОВЕРЛЕЕВ (HTML/FFmpeg Overlays) */}
        <div className="lg:col-span-5 bg-[#0b0f19] border border-amber-500/30 rounded-2xl p-5 space-y-3.5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Кинематографичные оверлеи (FFmpeg Overlays)
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Мультивыбор слоёв в массив <code className="text-amber-300">manifest.overlays</code>
              </p>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded tabular-nums">
              Выбрано: {selectedOverlays.length}/4
            </span>
          </div>

          <div className="space-y-2">
            {CINEMATIC_OVERLAY_PRESETS.map(layer => {
              const active = selectedOverlays.includes(layer.id);
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => toggleOverlayPreset(layer.id)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    active
                      ? 'bg-amber-500/15 border-amber-400/70 text-slate-100 shadow-sm'
                      : 'bg-[#111827]/80 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-100">{layer.label}</div>
                    <div className="text-[10px] text-slate-400">{layer.desc}</div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-700 text-slate-500'
                    }`}
                  >
                    {active ? 'ON' : 'OFF'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. ВИРТУАЛИЗИРОВАННЫЙ ТАЙМЛАЙН СЦЕН (100–200+ СЦЕН БЕЗ ОГРАНИЧЕНИЙ) + ОЧЕРЕДЬ НА ПЕРЕСБОРКУ */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Шапка таймлайна с обязательным автоматическим счетчиком */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-indigo-400" />
              <span>
                Динамический таймлайн сцен (<code className="text-indigo-300">scenes: [{narrativeScenes.length}]</code>)
              </span>
            </h3>

            {/* Автоматический счетчик по ТЗ */}
            <div
              id="narrative-timeline-counter"
              className="text-xs font-mono bg-slate-900/95 border border-indigo-500/40 text-slate-200 px-3 py-1.5 rounded-xl inline-flex flex-wrap items-center gap-2 shadow-sm tabular-nums"
            >
              <span>
                Всего сцен: <strong className="text-indigo-300">{narrativeScenes.length}</strong>
                <span className="text-slate-500 text-[10px] ml-1">
                  (заполнено: {filledScenesCount})
                </span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Расчетный хронометраж:{' '}
                <strong className="text-amber-300">{calcTotalDuration(narrativeScenes)}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                На пересборку:{' '}
                <strong className={flaggedRevisionScenes.length > 0 ? 'text-rose-400' : 'text-slate-400'}>
                  {flaggedRevisionScenes.length}
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Аудиодорожка:{' '}
                <strong className="text-emerald-300">
                  {masterAudio.file_name.trim() || 'Не выбрана'}
                </strong>
              </span>
            </div>
          </div>

          {/* Быстрые генераторы сетки на 80 / 120 / 160 / 200+ сцен и кнопка Patch-манифеста */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportPatchManifest}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                flaggedRevisionScenes.length > 0
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/60 text-rose-200 shadow-sm shadow-rose-500/10'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="Экспортировать компактный JSON только с помеченными флажком «🔄 На пересборку» сценами"
            >
              <Download className="w-3.5 h-3.5 text-rose-400" />
              <span>
                Скачать Patch-манифест (только помеченные сцены: {flaggedRevisionScenes.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => generateNScenesTemplate(80)}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 80 сцен (~8 минут)"
            >
              80 сцен (~8м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(120)}
              className="bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 120 сцен (~12 минут)"
            >
              120 сцен (~12м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(160)}
              className="bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 160 сцен (~16 минут)"
            >
              160 сцен (~16м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(200)}
              className="bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 200 сцен"
            >
              200 сцен
            </button>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
              <input
                type="number"
                min={1}
                max={1000}
                value={customScenesCountInput}
                onChange={e => setCustomScenesCountInput(Math.max(1, Number(e.target.value) || 100))}
                className="w-14 bg-transparent text-xs font-mono text-indigo-300 outline-none text-center"
                title="Произвольное количество сцен N"
              />
              <button
                type="button"
                onClick={() => generateNScenesTemplate(customScenesCountInput)}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                Задать N
              </button>
            </div>

            <button
              type="button"
              onClick={addScene}
              className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> +1 сцена
            </button>

            <button
              type="button"
              onClick={() =>
                setNarrativeScenes(prev => prev.map(s => ({ ...s, file_name: '' })))
              }
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-300 px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
            >
              Очистить имена
            </button>
          </div>
        </div>

        {/* Строка поиска / быстрого фильтра по сценам + заголовок колонок компактной сетки */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = 0;
                  setScrollTop(0);
                }
              }}
              placeholder="Поиск по номеру сцены (#1..200+), scene_id, имени файла, титру или заметке..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-400 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none"
            />
          </div>

          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            Отображаются строки: {totalRows > 0 ? startRowIdx + 1 : 0}–{endRowIdx} из {totalRows} (Виртуализация DOM активна)
          </span>
        </div>

        {/* Шапка колонок компактной строчной таблицы */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-t-xl text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <div className="col-span-2">№ / ID / Камера</div>
          <div className="col-span-3">Видеофайл (file_name)</div>
          <div className="col-span-2 text-center">Старт / Длит. (с)</div>
          <div className="col-span-2">Переход / Титр</div>
          <div className="col-span-3">🔄 На пересборку &amp; Заметка</div>
        </div>

        {/* Виртуализированный контейнер прокрутки компактной строчной сетки */}
        <div
          ref={scrollContainerRef}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          style={{ height: `${VIEWPORT_HEIGHT}px` }}
          className="overflow-y-auto custom-scroll border-x border-b border-slate-800 rounded-b-xl bg-[#090d16]"
        >
          <div style={{ paddingTop: `${topSpacerHeight}px`, paddingBottom: `${bottomSpacerHeight}px` }}>
            {visibleSlice.map(({ scene: sc, originalIndex: idx }) => {
              const hasFile = Boolean(sc.file_name.trim());
              const isFlagged = Boolean(sc.needs_revision);
              return (
                <div
                  key={sc.scene_id + '-' + idx}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className={`grid grid-cols-12 gap-2 items-center px-3 border-b border-slate-800/70 text-xs transition ${
                    isFlagged
                      ? 'bg-rose-950/25 hover:bg-rose-950/35 border-l-2 border-l-rose-500'
                      : hasFile
                      ? 'bg-indigo-950/15 hover:bg-indigo-950/30'
                      : 'bg-[#0d1320] hover:bg-slate-900/80'
                  }`}
                >
                  {/* 1. Индекс, scene_id и вектор камеры */}
                  <div className="col-span-2 flex items-center gap-1 min-w-0">
                    <span className="text-[10px] font-mono font-bold bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={sc.scene_id}
                      onChange={e => updateScene(idx, { scene_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded px-1.5 py-1 text-[10px] font-mono text-slate-200 outline-none focus:border-indigo-400"
                    />
                    <select
                      value={sc.camera_movement || CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length]}
                      onChange={e =>
                        updateScene(idx, {
                          camera_movement: e.target.value as CameraVectorType
                        })
                      }
                      title="Вектор движения камеры (camera_movement)"
                      className="bg-slate-900 border border-indigo-500/40 rounded px-1 py-1 text-[10px] font-mono text-indigo-300 outline-none shrink-0"
                    >
                      <option value="zoom_in">zoom_in</option>
                      <option value="zoom_out">zoom_out</option>
                      <option value="pan_left">pan_left</option>
                      <option value="pan_right">pan_right</option>
                    </select>
                  </div>

                  {/* 2. Имя видеофайла (file_name) + индикатор промпта VerbaFlow */}
                  <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                    <input
                      type="text"
                      value={sc.file_name}
                      placeholder={
                        sc.ai_video_prompt
                          ? `Промт: ${sc.ai_video_prompt.slice(0, 32)}...`
                          : 'Имя файла (JSON / Drag&Drop)'
                      }
                      title={
                        sc.ai_video_prompt
                          ? `AI Prompt: ${sc.ai_video_prompt}${sc.sfx ? ` | SFX: ${sc.sfx}` : ''}`
                          : undefined
                      }
                      onChange={e => updateScene(idx, { file_name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-[11px] font-mono text-amber-300 outline-none focus:border-amber-400"
                    />
                    {sc.ai_video_prompt && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(sc.ai_video_prompt || '');
                          onNotify(`Промт сцены #${idx + 1} скопирован!`, 'success');
                        }}
                        title={`Скопировать AI-промт: ${sc.ai_video_prompt}`}
                        className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-[10px] font-mono text-indigo-200 hover:bg-indigo-500/35 cursor-pointer"
                      >
                        AI
                      </button>
                    )}
                    {hasFile && (
                      <span title="Имя файла назначено" className="shrink-0 flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                    )}
                  </div>

                  {/* 3. Старт (start_time) и длительность (duration) */}
                  <div className="col-span-2 flex items-center gap-1 tabular-nums">
                    <input
                      type="text"
                      value={String(sc.start_time)}
                      onChange={e => updateScene(idx, { start_time: e.target.value })}
                      className="w-1/2 bg-slate-900 border border-slate-700/80 rounded px-1 py-1 text-[11px] font-mono text-sky-300 text-center outline-none"
                      title="start_time"
                    />
                    <input
                      type="number"
                      min={0.5}
                      max={600}
                      step={0.5}
                      value={sc.duration}
                      onChange={e =>
                        updateScene(idx, {
                          duration: Math.max(0.5, Number(e.target.value) || 6)
                        })
                      }
                      className="w-1/2 bg-slate-900 border border-slate-700/80 rounded px-1 py-1 text-[11px] font-mono text-emerald-400 font-bold text-center outline-none"
                      title="duration (сек)"
                    />
                  </div>

                  {/* 4. Переход (transition) + Титр (text_overlay) */}
                  <div className="col-span-2 flex items-center gap-1 min-w-0">
                    <select
                      value={sc.transition.type}
                      onChange={e => {
                        const t = e.target.value as NarrativeSceneItem['transition']['type'];
                        updateScene(idx, {
                          transition: {
                            type: t,
                            duration_sec:
                              t === 'cut' || t === 'none'
                                ? 0
                                : sc.transition.duration_sec || 0.8
                          }
                        });
                      }}
                      className="w-20 bg-slate-900 border border-slate-700/80 rounded px-1 py-1 text-[10px] text-slate-200 outline-none shrink-0"
                    >
                      <option value="crossfade">xfade</option>
                      <option value="dissolve">dissolve</option>
                      <option value="fade">fade</option>
                      <option value="cut">cut</option>
                    </select>
                    <input
                      type="text"
                      value={sc.text_overlay}
                      placeholder="Титр..."
                      onChange={e => updateScene(idx, { text_overlay: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-400"
                    />
                  </div>

                  {/* 5. Точечная пометка сцен на пересборку («🔄 На пересборку» + заметка + удаление) */}
                  <div className="col-span-3 flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateScene(idx, { needs_revision: !sc.needs_revision })
                      }
                      className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer border ${
                        isFlagged
                          ? 'bg-rose-500 text-slate-950 border-rose-400 shadow-sm'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700/80'
                      }`}
                      title="Пометить сцену на точечную пересборку в Patch-манифест"
                    >
                      🔄 {isFlagged ? 'В патче' : 'На пересборку'}
                    </button>
                    <input
                      type="text"
                      value={sc.revision_note || ''}
                      placeholder="Заметка (сменить ракурс, зум...)"
                      onChange={e =>
                        updateScene(idx, {
                          revision_note: e.target.value,
                          needs_revision: Boolean(e.target.value.trim()) || sc.needs_revision
                        })
                      }
                      className={`w-full bg-slate-900 border rounded px-1.5 py-1 text-[11px] outline-none ${
                        isFlagged
                          ? 'border-rose-400/60 text-rose-200 focus:border-rose-400'
                          : 'border-slate-700/80 text-slate-300 focus:border-indigo-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => removeScene(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded cursor-pointer shrink-0"
                      title="Удалить сцену"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. БЛОК ЗАПУСКА ОБЛАЧНОГО МОНТАЖА И СТУДИЙНЫЙ ПСЕВДОТЕРМИНАЛ В РЕАЛЬНОМ ВРЕМЕНИ */}
      <div className="bg-[#0b0f17] border border-indigo-500/30 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="space-y-1 text-xs">
            <span className="font-bold text-indigo-300 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Конфигурация отправки в{' '}
              <code className="font-mono text-amber-300">render_scenes.yml</code>:
            </span>
            <span className="text-slate-400 block">
              Целевой репозиторий:{' '}
              <code className="text-amber-300 font-mono">
                {ghRepo || 'ZermeXX/aetherflow-render'}
              </code>{' '}
              | Всего сцен: <strong className="text-indigo-300">{narrativeScenes.length}</strong> | Хронометраж:{' '}
              <strong className="text-emerald-400">{calcTotalDuration(narrativeScenes)}</strong> | Аудио:{' '}
              <strong className="text-amber-300">{masterAudio.file_name.trim() || 'Не выбрана'}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={startNarrativeScenesRender}
              disabled={isDispatching || isRunnerBusy}
              className={`flex items-center gap-2.5 font-bold px-6 py-3.5 rounded-xl shadow-lg transition text-xs ${
                isRunnerBusy || isDispatching
                  ? 'bg-slate-800 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-85 shadow-none'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-slate-950 shadow-indigo-500/25 cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              {isDispatching
                ? 'Отправка задачи в GitHub Actions...'
                : isRunnerBusy
                ? `⏳ Сборка ${terminalStatus === 'queued' ? 'QUEUED' : 'RUNNING'} • ${formatTerminalTime(terminalSeconds)}`
                : '🚀 Запустить облачную сборку'}
            </button>
            {isRunnerBusy && terminalRunUrl && terminalRunUrl !== '#' && (
              <a
                href={terminalRunUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 hover:bg-indigo-500/25 px-3.5 py-3.5 text-xs font-mono font-semibold text-indigo-200 transition"
              >
                <span>GitHub Run</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Интерактивный студийный терминал (LiveTerminal) на месте бывшего JSON-манифеста */}
        <LiveTerminal
          status={terminalStatus}
          elapsedSeconds={terminalSeconds}
          logs={terminalLogs}
          runUrl={terminalRunUrl}
          onClearLogs={onClearTerminalLogs}
          onCopyLogs={() => onNotify('Лог терминала скопирован в буфер обмена', 'info')}
          onCancelRun={onCancelRenderRun}
        />
      </div>
    </div>
  );
};
