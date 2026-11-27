/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, Reorder, useDragControls } from 'motion/react';
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
  ExternalLink,
  Eye,
  GripVertical
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { GoogleDriveDirectUploader } from './GoogleDriveDirectUploader';
import { AnimatedNumber, AnimatedDurationText } from './MotionMetrics';
import {
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
import {
  V21PipelineLocks,
  VOICEOVER_LEAD_IN_SEC,
  VOICEOVER_SENTENCE_PAD_SEC,
  computeContinuousSceneTimings,
  normalizeSceneSubtitlesMap,
  parseV21ManifestObject
} from '../utils/manifestV21';
import { serializeCompactDispatchJson } from '../utils/manifestDispatch';
import type { AetherCombineDraftSlice } from '../utils/aetherPersistence';

const normalizeV8Volume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : fallback;
const V8_TRANSITIONS = [
  { value: 'fade', label: 'Fade / затемнение' },
  { value: 'dip_to_black', label: 'Через чёрный' },
  { value: 'dip_to_white', label: 'Через белый' },
  { value: 'cut', label: 'Склейка' },
  { value: 'none', label: 'Без эффекта' }
] as const;
function normalizeV8Transition(value: unknown): typeof V8_TRANSITIONS[number]['value'] {
  const mode = String(value ?? 'fade').trim().toLowerCase();
  if (mode === 'cut' || mode === 'hard_cut') return 'cut';
  if (mode === 'none') return 'none';
  if (['fadeblack', 'fade_black', 'dip_to_black'].includes(mode)) return 'dip_to_black';
  if (['fadewhite', 'fade_white', 'dip_to_white'].includes(mode)) return 'dip_to_white';
  return 'fade';
}
function normalizeV8TransitionDuration(value: unknown, mode: string): number {
  if (mode === 'cut' || mode === 'none') return 0;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0.5;
}

export type CameraVectorType = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down' | 'static';
type CameraPolicy = 'native' | 'cinematic';
const normalizeCameraPolicy = (v: unknown): CameraPolicy | undefined => v === 'native' || v === 'cinematic' ? v : undefined;
type CTAConfig = { enabled: boolean; style: string; show_sec?: [number,number]; click_sec?: number; bell_sec?: number; sfx_enabled?: boolean; sfx_volume?: number };
const defaultCTA = (duration: number): CTAConfig => {
  const end = Math.min(8.2, Math.max(0.2,duration));
  const start = Math.min(1,end/5);
  return {enabled:true,style:'subscribe_bell',show_sec:[start,end],click_sec:start+(end-start)*0.35,bell_sec:start+(end-start)*0.65,sfx_enabled:true,sfx_volume:0.5};
};
const readCTA = (v: unknown): CTAConfig | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as CTAConfig : undefined;
type VideoDurationMode = 'hybrid' | 'native' | 'stretch' | 'freeze' | 'loop';
const normalizeDurationMode = (v: unknown): VideoDurationMode | undefined => ['hybrid','native','stretch','freeze','loop'].includes(String(v)) ? v as VideoDurationMode : undefined;
const normalizeExtension = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0,Math.min(2,v)) : 2;
const normalizeCameraZoom = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(1.5, Math.max(1, value)) : 1.12;

export type CinematicOverlayId =
  | 'ambient_particles'
  | 'cinematic_film_grain'
  | 'lower_thirds'
  | 'warm_glow';

export type LowerThirdStyleId = 'rossiya24' | 'ictv' | 'sky_news';

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
  video_file?: string;
  voiceover_file?: string;
  audio_file?: string;
  image_reference?: string;
  assets?: {
    video_file?: string;
    voiceover_file?: string;
    audio_file?: string;
    image_reference?: string;
    [key: string]: unknown;
  };
  start_time: string | number;
  duration: number;
  voiceover_duration_sec?: number;
  voice_start?: number;
  voice_end?: number;
  camera_movement?: CameraVectorType;
  camera_zoom?: number;
  camera_policy?: CameraPolicy;
  video_duration_mode?: VideoDurationMode;
  max_extension_sec?: number;
  allow_video_reuse?: boolean;
  visual_style?: string;
  needs_revision?: boolean;
  revision_note?: string;
  transition: {
    type:
      | 'crossfade'
      | 'dissolve'
      | 'fade'
      | 'dip_to_black'
      | 'dip_to_white'
      | 'fadeblack'
      | 'fadewhite'
      | 'wipeleft'
      | 'wiperight'
      | 'smoothleft'
      | 'smoothup'
      | 'cut'
      | 'none';
    duration_sec: number;
  };
  video_processing?: {
    transition_in?:
      | {
          type?: string;
          duration_sec?: number;
        }
      | string;
    transition_out?:
      | {
          type?: string;
          duration_sec?: number;
        }
      | string;
    camera_movement?: CameraVectorType;
  camera_zoom?: number;
  camera_policy?: CameraPolicy;
  video_duration_mode?: VideoDurationMode;
  max_extension_sec?: number;
  allow_video_reuse?: boolean;
    [key: string]: unknown;
  };
  audio_processing?: {
    video_ambient_mute?: boolean;
    video_ambient_gain_db?: number;
    sfx?: string;
    sfx_gain_db?: number;
    [key: string]: unknown;
  };
  cta_config?: CTAConfig;
  adaptive_audio?: boolean;
  audio_ducking?: boolean;
  source_audio_enabled?: boolean;
  source_audio_volume?: number;
  voiceover_volume?: number;
  ambient_volume?: number;
  ambient_audio?: string;
  text_overlay: string;
  ai_video_prompt?: string;
  prompt_ru?: string;
  sfx?: string;
  video_ambient_mute?: boolean;
  video_ambient_gain_db?: number;
  sfx_gain_db?: number;
  subtitles?: Record<string, string>;
  historical_date?: string;
  historical_location?: string;
}

export interface ExportedNarrativeSceneItem {
  scene_index: number;
  scene_id: string;
  title?: string;
  file_name: string;
  video_file: string;
  voiceover_file: string;
  audio_file: string;
  image_reference?: string;
  start_time: string | number;
  duration: number;
  voiceover_duration_sec?: number;
  voice_start?: number;
  voice_end?: number;
  camera_movement?: CameraVectorType;
  camera_zoom?: number;
  camera_policy?: CameraPolicy;
  video_duration_mode?: VideoDurationMode;
  max_extension_sec?: number;
  allow_video_reuse?: boolean;
  visual_style?: string;
  transition: string;
  transition_duration: number;
  mute_audio: boolean;
  ambient_gain_db: number;
  cta_config?: CTAConfig;
  adaptive_audio?: boolean;
  audio_ducking?: boolean;
  source_audio_enabled?: boolean;
  source_audio_volume?: number;
  voiceover_volume: number;
  ambient_volume: number;
  ambient_audio?: string;
  assets: {
    video_file: string;
    voiceover_file: string;
    audio_file: string;
    image_reference?: string;
    [key: string]: unknown;
  };
  video_processing: {
    transition_in: {
      type: string;
      duration_sec: number;
    };
    camera_movement?: CameraVectorType;
  camera_zoom?: number;
  camera_policy?: CameraPolicy;
  video_duration_mode?: VideoDurationMode;
  max_extension_sec?: number;
  allow_video_reuse?: boolean;
    [key: string]: unknown;
  };
  audio_processing: {
    video_ambient_mute: boolean;
    video_ambient_gain_db: number;
    sfx?: string;
    sfx_gain_db?: number;
    [key: string]: unknown;
  };
  subtitles: Record<string, string>;
  text_overlay: string;
  video_ambient_mute: boolean;
  video_ambient_gain_db: number;
  sfx_gain_db?: number;
  needs_revision?: boolean;
  revision_note?: string;
  ai_video_prompt?: string;
  prompt_ru?: string;
  sfx?: string;
  historical_date?: string;
  historical_location?: string;
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
  shorts_count: 2 | 3;
  aspect_ratio: '9:16';
  resolution: '1080x1920';
  crop_mode: 'center';
  hook_texts: string[];
  hook_text: string;
  hook_text_en: string;
  output_dir: './output/shorts/';
  upload_to_gdrive: boolean;
}

type BrandIdentityConfig = {
  enabled?: boolean;
  name: string;
  episode_label: string;
};
function normalizeBrandIdentity(value: unknown): BrandIdentityConfig {
  const c = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...(typeof c.enabled === 'boolean' ? { enabled: c.enabled } : {}),
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'HISTOVIVA',
    episode_label: typeof c.episode_label === 'string' ? c.episode_label.trim() : ''
  };
}
function resolveBrandIdentity(value: unknown, project: string): Required<BrandIdentityConfig> {
  const c = normalizeBrandIdentity(value);
  const match = /^histoviva_(EP\d+)_(.+)/i.exec(project);
  return { enabled: c.enabled ?? /^histoviva/i.test(project), name: c.name,
    episode_label: c.episode_label || (match ? match[1] + ' | ' + match[2].replace(/_/g, ' ') : project) };
}

type BroadcastConfig = {
  enabled: boolean;
  style: 'histoviva_broadcast_en';
  emblem_path: string;
  show_sec: [number, number];
  anim_sec: number;
  bar_bg_rgba: [number, number, number, number];
};
function normalizeBroadcastConfig(value: unknown): BroadcastConfig {
  const c = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const num = (v: unknown, fallback: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback;
  const show = Array.isArray(c.show_sec) ? c.show_sec : [];
  const start = num(show[0], 0.5, 3600);
  const end = Math.max(start + 0.05, num(show[1], 5.5, 3600));
  const rgba = Array.isArray(c.bar_bg_rgba) ? c.bar_bg_rgba : [];
  return { enabled: c.enabled !== false, style: 'histoviva_broadcast_en',
    emblem_path: typeof c.emblem_path === 'string' && c.emblem_path.trim() ? c.emblem_path.trim() : 'aether_art_150x150_A.png',
    show_sec: [start, end], anim_sec: Math.min((end-start)/2, num(c.anim_sec, 0.55, 10)),
    bar_bg_rgba: [Math.round(num(rgba[0],10,255)), Math.round(num(rgba[1],14,255)), Math.round(num(rgba[2],18,255)), Math.round(num(rgba[3],214,255))] };
}

export interface NarrativeExportSettings {
  resolution: '4k' | '1080p' | '720p';
  aspect_ratio: '16:9' | '9:16';
  video_codec: 'libx265' | 'libx264';
  profile?: 'high' | 'main';
  pix_fmt?: 'yuv420p';
  cfr?: boolean;
  preset?: 'veryfast' | 'ultrafast' | 'medium';
  draft_mode?: boolean;
  bitrate_mbps: number;
  bitrate_cap?: 'on' | 'off';
  crf: number;
  fps: 24 | 30 | 60;
  audio_bitrate_kbps: 320 | 256 | 192;
  preview_duration_sec?: number;
  lower_third_config?: BroadcastConfig;
  brand_identity?: BrandIdentityConfig;
  subtitles?: SubtitlesFlexibleConfig;
}

const V8_EXPORT_PROFILES = {
  Draft: { resolution: '720p', preset: 'ultrafast', crf: 26, bitrate_mbps: 6, audio_bitrate_kbps: 192, draft_mode: true },
  Standard: { resolution: '1080p', preset: 'veryfast', crf: 20, bitrate_mbps: 12, audio_bitrate_kbps: 256, draft_mode: false },
  Cinema: { resolution: '4k', preset: 'veryfast', crf: 18, bitrate_mbps: 35, audio_bitrate_kbps: 320, draft_mode: false },
  Master: { resolution: '4k', preset: 'medium', crf: 16, bitrate_mbps: 45, audio_bitrate_kbps: 320, draft_mode: false }
} as const;
function normalizeV8Export(settings: NarrativeExportSettings): NarrativeExportSettings {
  return { ...settings, video_codec: 'libx264', aspect_ratio: '16:9', profile: 'high', pix_fmt: 'yuv420p', cfr: true,
    preset: settings.preset === 'medium' || settings.preset === 'ultrafast' ? settings.preset : 'veryfast',
    bitrate_cap: settings.bitrate_cap === 'off' ? 'off' : 'on',
    bitrate_mbps: Number.isFinite(settings.bitrate_mbps) ? Math.min(120, Math.max(4, settings.bitrate_mbps)) : 35,
    crf: Number.isFinite(settings.crf) ? Math.min(28, Math.max(14, Math.round(settings.crf))) : 18,
    preview_duration_sec: Number.isFinite(settings.preview_duration_sec) ? Math.max(0, settings.preview_duration_sec ?? 0) : 0 };
}

type ManifestIssue = { severity: 'error' | 'warning'; message: string };
export function validateManifestV8(input: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const add = (severity: ManifestIssue['severity'], message: string) => issues.push({severity,message});
  const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const valid = (v: unknown, min: number, max = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const m = obj(input);
  if (typeof m.project_name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,159}$/.test(m.project_name)) add('error','Некорректное имя проекта (латиница, цифры, пробел, _, -, точка).');
  const timeline = Array.isArray(m.timeline) ? m.timeline : Array.isArray(m.scenes) ? m.scenes : [];
  if (!timeline.length) add('error','Нет сцен.');
  if (m.total_scenes !== undefined && m.total_scenes !== timeline.length) add('error','Количество сцен не совпадает.');
  const ids = new Set<string>();
  let total = 0;
  timeline.forEach((raw,i) => {
    const sc = obj(raw), a = obj(sc.assets), label = 'Сцена '+(i+1)+': ';
    const id = typeof sc.scene_id === 'string' ? sc.scene_id.trim() : '';
    if (!id || ids.has(id)) add('error',label+'пустой или повторяющийся scene_id.');
    ids.add(id);
    const d = sc.duration_sec ?? sc.duration;
    if (!valid(d,0.001)) add('error',label+'некорректная длительность.'); else total += d;
    if (![sc.file_name,sc.video_file,a.video_file,a.image_reference].some(v=>typeof v==='string'&&v.trim())) add('error',label+'нет визуального файла.');
    if (![sc.voiceover_file,sc.audio_file,a.voiceover_file].some(v=>typeof v==='string'&&v.trim())) add('warning',label+'нет файла диктора.');
    if (sc.camera_movement !== undefined && !['zoom_in','zoom_out','pan_left','pan_right','pan_up','pan_down','static'].includes(String(sc.camera_movement))) add('error',label+'неизвестный режим камеры.');
    if (sc.video_duration_mode !== undefined && !normalizeDurationMode(sc.video_duration_mode)) add('error',label+'неизвестный режим длительности.');
    if (sc.max_extension_sec !== undefined && !valid(sc.max_extension_sec,0,2)) add('error',label+'продление вне 0–2 секунд.');
    if (sc.allow_video_reuse !== undefined && typeof sc.allow_video_reuse !== 'boolean') add('error',label+'allow_video_reuse должен быть boolean.');
    if (sc.camera_policy !== undefined && !normalizeCameraPolicy(sc.camera_policy)) add('error',label+'неизвестная политика камеры.');
    if (sc.camera_zoom !== undefined && !valid(sc.camera_zoom,1,1.5)) add('error',label+'масштаб камеры вне 1–1.5.');
    if (sc.transition !== undefined && !['fade','dip_to_black','dip_to_white','cut','none'].includes(String(sc.transition))) add('error',label+'неизвестный переход.');
    if (sc.transition_duration !== undefined && !valid(sc.transition_duration,0)) add('error',label+'некорректная длительность перехода.');
    else if (valid(d,0.001) && valid(sc.transition_duration,0) && sc.transition_duration>d) add('warning',label+'переход длиннее сцены.');
    if (sc.cta_config !== undefined) {
      const c = obj(sc.cta_config);
      if (typeof c.enabled !== 'boolean') add('error',label+'CTA enabled должен быть boolean.');
      if (c.enabled === true && c.style === 'subscribe_bell') {
        const t = c.show_sec;
        if (!Array.isArray(t) || t.length !== 2 || !valid(t[0],0) || !valid(t[1],0) || !valid(c.click_sec,0) || !valid(c.bell_sec,0) || !(t[0]<c.click_sec && c.click_sec<c.bell_sec && c.bell_sec<t[1])) add('error',label+'CTA: требуется start < click < bell < end.');
        else if (valid(d,0.001) && t[1]>d) add('warning',label+'CTA выходит за плановую длительность; проверьте исходное видео.');
        if (c.sfx_enabled !== undefined && typeof c.sfx_enabled !== 'boolean') add('error',label+'CTA sfx_enabled должен быть boolean.');
        if (c.sfx_volume !== undefined && !valid(c.sfx_volume,0,1)) add('error',label+'CTA SFX вне 0–1.');
      }
    }
    for (const key of ['adaptive_audio','audio_ducking']) if (sc[key] !== undefined && typeof sc[key] !== 'boolean') add('error',label+key+' должен быть boolean.');
    if (sc.source_audio_enabled !== undefined && typeof sc.source_audio_enabled !== 'boolean') add('error',label+'source_audio_enabled должен быть boolean.');
    for (const key of ['voiceover_volume','ambient_volume','source_audio_volume']) if (sc[key] !== undefined && !valid(sc[key],0,4)) add('error',label+key+' вне 0–4.');
    if (sc.voice_start !== undefined && !valid(sc.voice_start,0)) add('error',label+'некорректный voice_start.');
    if (valid(sc.voice_end,0) && valid(sc.voice_start,0) && sc.voice_end<sc.voice_start) add('error',label+'voice_end раньше voice_start.');
  });
  if (m.total_duration_sec !== undefined && (!valid(m.total_duration_sec,0.001) || Math.abs(m.total_duration_sec-total)>0.25)) add('warning','Общая длительность отличается от суммы сцен.');
  const e = obj(m.export_settings);
  if (!['720p','1080p','4k'].includes(String(e.resolution))) add('error','Неподдерживаемое разрешение.');
  if (e.video_codec !== 'libx264' || e.aspect_ratio !== '16:9') add('error','Render V8 требует H.264 и 16:9.');
  if (![24,30,60].includes(Number(e.fps)) || !valid(e.crf,14,28)) add('error','Некорректные FPS или CRF.');
  if (!['ultrafast','veryfast','medium'].includes(String(e.preset))) add('error','Некорректный preset.');
  if (!valid(e.bitrate_mbps,4,120) || ![192,256,320].includes(Number(e.audio_bitrate_kbps))) add('error','Некорректный битрейт.');
  if (!valid(e.preview_duration_sec,0)) add('error','Некорректная длительность превью.');
  const lt = obj(e.lower_third_config), brand = obj(e.brand_identity);
  if (lt.enabled === true) {
    const show = lt.show_sec;
    if (!Array.isArray(show) || !valid(show[0],0) || !valid(show[1],0) || show[1]<=show[0] || !valid(lt.anim_sec,0,(show[1]-show[0])/2)) add('error','Некорректное время Broadcast.');
  }
  if (brand.enabled === true && (typeof brand.name !== 'string' || !brand.name.trim())) add('error','Нет названия бренда.');
  if ((lt.enabled === true || brand.enabled === true) && (typeof lt.emblem_path !== 'string' || !lt.emblem_path.trim())) add('warning','Не указан файл эмблемы.');
  const locks = obj(m.anti_desync_locks);
  if (locks.voiceover_sentence_pad_sec !== undefined && !valid(locks.voiceover_sentence_pad_sec,0,5)) add('error','Некорректная пауза диктора.');
  return issues;
}

export interface NarrativeMontageManifest {
  schema_version: '3.0';
  manifest_version?: '2.1' | '2.2-FINAL' | '3.0';
  project_type: 'narrative_scenes_montage';
  project_name: string;
  video_title?: string;
  chapters_youtube?: string;
  manifest_name?: string;
  rhythm_profile?: string;
  rhythm_map?: Record<string, unknown> | string;
  overlays: CinematicOverlayId[];
  lower_third_style?: LowerThirdStyleId;
  studio_ui_presets?: {
    tab_1_montage?: {
      lower_third_style?: LowerThirdStyleId;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  total_scenes: number;
  total_duration_sec: number;
  cloud_export: {
    target_folder_id: string;
  };
  gdrive_folder_id: string;
  ambient_audio: AmbientAudioConfig;
  master_audio: MasterAudioConfig;
  export_settings: NarrativeExportSettings;
  anti_desync_locks?: {
    hard_frame_lock: boolean;
    apad_atrim_padding: boolean;
    never_stretch_voiceover: boolean;
    continuous_voice_master: boolean;
    zero_speech_overlap: boolean;
    decoupled_video_xfade_only: boolean;
    dynamic_xfade_transitions: boolean;
    acrossfade_offset_compensation: boolean;
    auto_mute_flagged_video_clips: boolean;
    voiceover_lead_in_sec: number;
    voiceover_sentence_pad_sec: number;
    loudnorm: {
      enabled: boolean;
      integrated_lufs: number;
      true_peak_dbtp: number;
    };
  };
  subtitles: SubtitlesFlexibleConfig;
  subtitles_export?: {
    enabled: boolean;
    burn_in_video: boolean;
    export_separate_srt_files: boolean;
    strict_scene_duration_lock: boolean;
    languages: string[];
  };
  subtitles_burn_in?: BurnInSrtConfig;
  shorts_config?: ShortsAutoSliceConfig;
  shorts_factory?: {
    enabled: boolean;
    shorts_count: 2 | 3;
    hook_texts: string[];
    hook_text: string;
  };
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
  scenes: ExportedNarrativeSceneItem[];
  timeline: ExportedNarrativeSceneItem[];
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
  externalV21Manifest?: { raw: Record<string, unknown>; fileName: string; nonce: number } | null;
  onConsumeExternalV21Manifest?: () => void;
  onImportFullManifest?: (raw: Record<string, unknown>, fileName: string) => void;
  onV21LocksChange?: (locks: V21PipelineLocks, renderSpecsSummary: string) => void;
  externalSceneSubtitleEdit?: { sceneIndex: number; lang: string; text: string; nonce: number } | null;
  onConsumeExternalSceneSubtitleEdit?: () => void;
  youtubeSeo?: YoutubeSeoManifestBlock;
  chaptersYoutubeText?: string;
  subtitlesExportConfig?: {
    strictSceneDurationLock: boolean;
    burnInVideo: boolean;
    exportSeparateSrtFiles: boolean;
    languages: string[];
  };
  telegramBotToken?: string;
  telegramChatId?: string;
  onOpenConfigModal: () => void;
  onStartRenderStatus: (
    title: string,
    desc: string,
    repo: string,
    customDispatchTime?: number,
    meta?: { workflow?: string; branch?: string; projectName?: string }
  ) => void;
  onCancelRenderRun: () => void;
  onNotify: (
    message: string,
    type?: 'info' | 'error' | 'success',
    action?: { label: string; onClick: () => void }
  ) => void;
  encodeManifestBase64: (manifestObj: unknown) => string;
  terminalStatus: TerminalRunnerState;
  terminalSeconds: number;
  terminalLogs: TerminalLogEntry[];
  terminalRunUrl?: string;
  onClearTerminalLogs: () => void;
  initialCombineDraft?: AetherCombineDraftSlice | null;
  onCombineDraftChange?: (slice: AetherCombineDraftSlice) => void;
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

const formatMmSsTenths = (sec: number): string => {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(1).padStart(4, '0');
  return `${String(mins).padStart(2, '0')}:${secs}`;
};

// Параметры виртуализации компактной строчной сетки (для 100–200+ сцен без перегрузки DOM)
const ROW_HEIGHT = 92;
const VIEWPORT_HEIGHT = 552;
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
    id: 'lower_thirds',
    label: '📍 Исторические титры дат и локаций (Lower Thirds)',
    badge: 'lower_thirds',
    desc: 'Документальные плашки с печатным трекингом для дат и архивных мест'
  },
  {
    id: 'warm_glow',
    label: '🕯️ Мягкое пульсирующее свечение (Warm Glow)',
    badge: 'warm_glow',
    desc: 'Тёплое анаморфное свечение свечей и ламп (Halation & Bloom)'
  }
];

const LOWER_THIRD_STYLE_PRESETS: Array<{
  id: LowerThirdStyleId;
  label: string;
  desc: string;
}> = [
  {
    id: 'rossiya24',
    label: 'Россия 24',
    desc: 'Красный тег даты слева + синяя плашка локации справа'
  },
  {
    id: 'ictv',
    label: 'Факти ICTV',
    desc: 'Оранжевый верхний тег даты + тёмно-синяя плашка локации'
  },
  {
    id: 'sky_news',
    label: 'Sky News',
    desc: 'Матовая стеклянная плашка с красным квадратным акцентом слева'
  }
];

const sceneStableKeyMap = new WeakMap<NarrativeSceneItem, string>();
let sceneRowSeq = 1;

const getSceneRowKey = (scene: NarrativeSceneItem): string => {
  let key = sceneStableKeyMap.get(scene);
  if (!key) {
    key = `scene_row_${sceneRowSeq++}`;
    sceneStableKeyMap.set(scene, key);
  }
  return key;
};

const transferSceneKey = (
  fromScene: NarrativeSceneItem,
  toScene: NarrativeSceneItem
): NarrativeSceneItem => {
  const key = getSceneRowKey(fromScene);
  sceneStableKeyMap.set(toScene, key);
  return toScene;
};

interface DraggableSceneRowProps {
  rowKey: string;
  sc: NarrativeSceneItem;
  idx: number;
  fps: number;
  voiceStartSec: number;
  voiceEndSec: number;
  zeroSpeechOverlap: boolean;
  canDrag: boolean;
  updateScene: (idx: number, patch: Partial<NarrativeSceneItem>) => void;
  removeScene: (idx: number) => void;
  onCopyPrompt: (idx: number, prompt: string) => void;
  onDragEndNotify: () => void;
}

const DraggableSceneRow: React.FC<DraggableSceneRowProps> = ({
  rowKey,
  sc,
  idx,
  fps,
  voiceStartSec,
  voiceEndSec,
  zeroSpeechOverlap,
  canDrag,
  updateScene,
  removeScene,
  onCopyPrompt,
  onDragEndNotify
}) => {
  const dragControls = useDragControls();
  const hasFile = Boolean(sc.file_name.trim());
  const isFlagged = Boolean(sc.needs_revision);
  const frameCount = Math.max(1, Math.round((Number(sc.duration) || 6) * fps));
  const isMuted = Boolean(sc.video_ambient_mute);
  const hasSfx = Boolean(sc.sfx || sc.sfx_gain_db !== undefined);
  const sfxDbLabel = typeof sc.sfx_gain_db === 'number' ? sc.sfx_gain_db.toFixed(1) : '-6.0';
  const voiceSpanLabel = `${formatMmSsTenths(voiceStartSec)} → ${formatMmSsTenths(voiceEndSec)}`;

  const rowClassName = `px-3 py-2 flex flex-col justify-center gap-1.5 border-b border-[rgba(255,255,255,0.08)] text-xs transition-colors ${
    isFlagged
      ? 'bg-rose-950/25 hover:bg-rose-950/35 border-l-2 border-l-rose-500'
      : hasFile
      ? 'bg-indigo-950/15 hover:bg-indigo-950/30'
      : 'bg-[#0b0f19]/90 hover:bg-[#111827]/90'
  }`;

  const rowCells = (
    <>
      <div className="grid grid-cols-12 gap-2 items-center w-full">
      {/* 1. Drag Handle (⋮⋮), индекс, scene_id и вектор камеры */}
      <div className="col-span-2 flex items-center gap-1 min-w-0">
        <button
          type="button"
          onPointerDown={e => {
            if (!canDrag) return;
            e.preventDefault();
            dragControls.start(e);
          }}
          disabled={!canDrag}
          title={
            canDrag
              ? 'Потяните ⋮⋮, чтобы изменить порядок сцены на таймлайне'
              : 'Очистите поиск, чтобы перетаскивать сцены'
          }
          aria-label={`Перетащить сцену #${idx + 1}`}
          className={`shrink-0 p-1 rounded transition touch-none ${
            canDrag
              ? 'text-slate-400 hover:text-amber-300 hover:bg-white/[0.06] cursor-grab active:cursor-grabbing'
              : 'text-slate-700 cursor-not-allowed'
          }`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

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
          disabled={sc.camera_policy === 'native'}
          title="Вектор движения камеры (camera_movement); применяется только в Cinematic"
          className="bg-slate-900 border border-indigo-500/40 rounded px-1 py-1 text-[10px] font-mono text-indigo-300 outline-none shrink-0"
        >
          <option value="zoom_in">zoom_in</option>
          <option value="zoom_out">zoom_out</option>
          <option value="pan_left">pan_left</option>
          <option value="pan_right">pan_right</option>
          <option value="pan_up">pan_up</option>
          <option value="pan_down">pan_down</option>
          <option value="static">static</option>
        </select>
      </div>

      <div className="col-span-3 flex items-center gap-2 text-[10px] text-slate-300">
        <label>Камера <select aria-label="Политика камеры" value={sc.camera_policy ?? 'auto'} onChange={e=>updateScene(idx,{camera_policy:normalizeCameraPolicy(e.target.value)})} className="bg-slate-900 border border-slate-700 rounded">
          <option value="auto">Auto (video: Native, image: Cinematic)</option>
          <option value="native">Native — оригинал</option>
          <option value="cinematic">Cinematic — движение Studio</option>
        </select></label>
        <label>Масштаб камеры</label>
        <input aria-label="Масштаб камеры" type="range" min={100} max={150} step={1}
          disabled={sc.camera_policy === 'native' || sc.camera_movement === 'static'}
          value={Math.round(normalizeCameraZoom(sc.camera_zoom) * 100)}
          onChange={e => updateScene(idx, { camera_zoom: Number(e.target.value) / 100 })}
          className="flex-1 min-w-0" />
        <span>{Math.round(normalizeCameraZoom(sc.camera_zoom) * 100)}%</span>
      </div>
      <div className="col-span-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
        <label>Синхронизация <select aria-label="Режим длительности" value={sc.video_duration_mode ?? 'auto'} onChange={e=>updateScene(idx,{video_duration_mode:normalizeDurationMode(e.target.value)})} className="bg-slate-900 border border-slate-700 rounded">
          <option value="auto">Auto (renderer)</option><option value="hybrid">Hybrid</option><option value="native">Native</option><option value="freeze">Freeze</option><option value="stretch">Stretch</option><option value="loop">Loop</option>
        </select></label>
        <label>Макс. продление, с <input type="number" min={0} max={2} step={0.1} value={normalizeExtension(sc.max_extension_sec)} disabled={!!sc.video_duration_mode && sc.video_duration_mode !== 'hybrid'} onChange={e=>updateScene(idx,{max_extension_sec:normalizeExtension(Number(e.target.value))})} className="w-16 bg-slate-900 border border-slate-700 rounded"/></label>
        <label><input type="checkbox" checked={sc.allow_video_reuse === true} onChange={e=>updateScene(idx,{allow_video_reuse:e.target.checked})}/> Разрешить повтор файла</label>
        <label title="Автоматическая коррекция громкости отдельных дорожек"><input type="checkbox" checked={sc.adaptive_audio !== false} onChange={e=>updateScene(idx,{adaptive_audio:e.target.checked})}/> Adaptive Audio</label>
        <label title="Приглушение фоновых дорожек во время речи"><input type="checkbox" checked={sc.audio_ducking !== false} onChange={e=>updateScene(idx,{audio_ducking:e.target.checked})}/> Smart Ducking</label>
        <label><input type="checkbox" checked={sc.source_audio_enabled !== false} onChange={e=>updateScene(idx,{source_audio_enabled:e.target.checked})}/> Оригинальный звук видео</label>
        <label>Окружение MP4 <input aria-label="Громкость оригинального окружения" type="number" min={0} max={4} step={0.05} disabled={sc.source_audio_enabled === false}
          value={normalizeV8Volume(sc.source_audio_volume,1)} onChange={e=>updateScene(idx,{source_audio_volume:normalizeV8Volume(Number(e.target.value),1)})} className="w-16 bg-slate-900 border border-slate-700 rounded"/></label>
        <label>Диктор <input aria-label="Громкость диктора" type="number" min={0} max={4} step={0.05}
          value={normalizeV8Volume(sc.voiceover_volume, 1)}
          onChange={e => updateScene(idx, { voiceover_volume: normalizeV8Volume(Number(e.target.value), 1) })}
          className="w-16 bg-slate-900 border border-slate-700 rounded px-1" /></label>
        <label>Эмбиент <input aria-label="Громкость эмбиента" type="number" min={0} max={4} step={0.05}
          value={normalizeV8Volume(sc.ambient_volume, 0.35)}
          onChange={e => updateScene(idx, { ambient_volume: normalizeV8Volume(Number(e.target.value), 0.35) })}
          className="w-16 bg-slate-900 border border-slate-700 rounded px-1" /></label>
        <input aria-label="Файл эмбиента сцены" placeholder="ambient.wav (GDrive)"
          value={sc.ambient_audio || ''} onChange={e => updateScene(idx, { ambient_audio: e.target.value })}
          className="flex-1 min-w-[100px] bg-slate-900 border border-slate-700 rounded px-1" />
      </div>
      <div className="col-span-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
        <label><input type="checkbox" checked={sc.cta_config?.enabled === true && sc.cta_config.style === 'subscribe_bell'} onChange={e=>updateScene(idx,{cta_config:e.target.checked ? {...defaultCTA(sc.duration),...sc.cta_config,enabled:true,style:'subscribe_bell'} : {...(sc.cta_config ?? defaultCTA(sc.duration)),enabled:false}})}/> Subscribe & Bell</label>
        {sc.cta_config?.enabled && sc.cta_config.style === 'subscribe_bell' && <>
          {(['start','click','bell','end'] as const).map(key=>{
            const c = {...defaultCTA(sc.duration),...sc.cta_config};
            const interval = c.show_sec ?? defaultCTA(sc.duration).show_sec!;
            const value = key==='start'?interval[0]:key==='end'?interval[1]:key==='click'?c.click_sec:c.bell_sec;
            return <label key={key}>{key} (с) <input aria-label={'CTA '+key} type="number" min={0} step={0.05} value={value ?? 0} onChange={e=>{
              const n=Number(e.target.value);
              updateScene(idx,{cta_config:{...c,...(key==='start'?{show_sec:[n,interval[1]] as [number,number]}:key==='end'?{show_sec:[interval[0],n] as [number,number]}:key==='click'?{click_sec:n}:{bell_sec:n})}});
            }} className="w-16 bg-slate-900 border border-slate-700 rounded"/></label>;
          })}
          <label><input type="checkbox" checked={sc.cta_config.sfx_enabled !== false} onChange={e=>updateScene(idx,{cta_config:{...defaultCTA(sc.duration),...sc.cta_config,sfx_enabled:e.target.checked}})}/> CTA SFX</label>
          <label>SFX <input type="number" aria-label="CTA SFX volume" min={0} max={1} step={0.05} disabled={sc.cta_config.sfx_enabled===false} value={sc.cta_config.sfx_volume ?? 0.5} onChange={e=>updateScene(idx,{cta_config:{...defaultCTA(sc.duration),...sc.cta_config,sfx_volume:Math.max(0,Math.min(1,Number(e.target.value)))}})} className="w-16 bg-slate-900 border border-slate-700 rounded"/></label>
        </>}
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
            onClick={() => onCopyPrompt(idx, sc.ai_video_prompt || '')}
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

      {/* 3. Голосовой интервал (voice_start -> voice_end), длительность (duration), frames и Zero Speech Overlap */}
      <div className="col-span-2 flex flex-col justify-center gap-0.5 tabular-nums min-w-0">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={String(sc.start_time)}
            onChange={e => updateScene(idx, { start_time: e.target.value })}
            className="w-[38%] bg-slate-900 border border-slate-700/80 rounded px-1 py-0.5 text-[10px] font-mono text-sky-300 text-center outline-none"
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
            className="w-[34%] bg-slate-900 border border-slate-700/80 rounded px-1 py-0.5 text-[10px] font-mono text-emerald-400 font-bold text-center outline-none"
            title="duration (сек)"
          />
          <span
            title={`Точный кадр-лок @ ${fps} fps (${sc.duration}s × ${fps} = ${frameCount}f)`}
            className="w-[28%] text-center bg-indigo-500/15 border border-indigo-400/35 text-indigo-200 rounded px-1 py-0.5 text-[9px] font-mono font-bold truncate"
          >
            {frameCount}f
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 text-[9px] font-mono leading-none">
          <span
            className="text-cyan-300/90 truncate"
            title={`Continuous voice_start → voice_end: ${voiceSpanLabel}`}
          >
            🎙 {voiceSpanLabel}
          </span>
          {zeroSpeechOverlap && (
            <span
              className="shrink-0 px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-semibold"
              title="Voiceover concatenated sequentially with 350ms pause and zero overlap"
            >
              Zero Speech Overlap
            </span>
          )}
        </div>
      </div>

      {/* 4. Динамический переход FFmpeg (xfade) + Статус Mute / SFX + Титр */}
      <div className="col-span-2 flex items-center gap-1 min-w-0">
        <select
          value={normalizeV8Transition(sc.transition.type)}
          onChange={e => {
            const t = e.target.value as NarrativeSceneItem['transition']['type'];
            updateScene(idx, {
              transition: {
                type: t,
                duration_sec:
                  t === 'cut' || t === 'none'
                    ? 0
                    : sc.transition.duration_sec || 0.6
              }
            });
          }}
          title={`V8: переход после сцены (${sc.transition.duration_sec}s)`}
          className="w-[74px] bg-slate-900 border border-cyan-500/40 rounded px-1 py-1 text-[9.5px] font-mono text-cyan-200 outline-none shrink-0"
        >
          {V8_TRANSITIONS.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-slate-900">
              {opt.label}
            </option>
          ))}
        </select>
        <input type="number" min={0} step={0.1}
          aria-label="Длительность перехода после сцены, сек."
          title="Длительность перехода после сцены, сек."
          disabled={['cut', 'none'].includes(sc.transition.type)}
          value={normalizeV8TransitionDuration(sc.transition.duration_sec, sc.transition.type)}
          onChange={e => updateScene(idx, { transition: { type: normalizeV8Transition(sc.transition.type), duration_sec: normalizeV8TransitionDuration(Number(e.target.value), sc.transition.type) } })}
          className="w-14 bg-slate-900 border border-cyan-500/40 rounded px-1 py-1 text-[10px] text-cyan-200" />
        <button
          type="button"
          onClick={() => updateScene(idx, { video_ambient_mute: !isMuted })}
          title={
            isMuted
              ? 'Клип заглушен (video_ambient_mute: true). Нажмите для включения нативного звука.'
              : hasSfx
              ? `SFX активен (${sfxDbLabel} dB). Нажмите чтобы заглушить нативный звук клипа.`
              : 'Нажмите чтобы принудительно заглушить звук видеоклипа (video_ambient_mute)'
          }
          className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border cursor-pointer transition ${
            isMuted
              ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
              : hasSfx
              ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-300'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {isMuted ? 'MUTE' : hasSfx ? `SFX ${sfxDbLabel}` : 'AUD'}
        </button>
        <input
          type="text"
          value={sc.text_overlay}
          placeholder="Титр..."
          onChange={e => updateScene(idx, { text_overlay: e.target.value })}
          className="w-full min-w-0 bg-slate-900 border border-slate-700/80 rounded px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-400"
        />
      </div>

      {/* 5. Точечная пометка сцен на пересборку («🔄 На пересборку» + заметка + удаление) */}
      <div className="col-span-3 flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={() => updateScene(idx, { needs_revision: !sc.needs_revision })}
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

      {/* Компактная строка документальных титров дат и локаций (Lower Thirds) */}
      <div className="grid grid-cols-12 gap-2 items-center w-full pl-6">
        <label className="col-span-6 flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-amber-300/85 shrink-0">
            Дата / Эпоха:
          </span>
          <input
            type="text"
            value={sc.historical_date || ''}
            placeholder="Напр.: 575 г. до н. э. или XI век н. э."
            onChange={e => updateScene(idx, { historical_date: e.target.value })}
            className="w-full min-w-0 bg-[#111827]/85 border border-[rgba(255,255,255,0.08)] rounded px-2 py-0.5 text-[11px] text-amber-200 placeholder:text-slate-600 outline-none focus:border-amber-400/60"
          />
        </label>
        <label className="col-span-6 flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-cyan-300/85 shrink-0">
            Локация / Место:
          </span>
          <input
            type="text"
            value={sc.historical_location || ''}
            placeholder="Напр.: Вавилон, Месопотамия"
            onChange={e => updateScene(idx, { historical_location: e.target.value })}
            className="w-full min-w-0 bg-[#111827]/85 border border-[rgba(255,255,255,0.08)] rounded px-2 py-0.5 text-[11px] text-cyan-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/60"
          />
        </label>
      </div>
    </>
  );

  if (!canDrag) {
    return (
      <div style={{ height: `${ROW_HEIGHT}px` }} className={rowClassName}>
        {rowCells}
      </div>
    );
  }

  return (
    <Reorder.Item
      value={rowKey}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      transition={{ type: 'spring', stiffness: 440, damping: 32 }}
      whileDrag={{
        scale: 1.01,
        zIndex: 30,
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.72)',
        backgroundColor: 'rgba(30, 41, 59, 0.96)'
      }}
      onDragEnd={onDragEndNotify}
      as="div"
      style={{ height: `${ROW_HEIGHT}px` }}
      className={`${rowClassName} select-none`}
    >
      {rowCells}
    </Reorder.Item>
  );
};

export const MontageCombineView: React.FC<MontageCombineViewProps> = ({
  ghToken,
  ghRepo,
  ghBranch,
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
  externalV21Manifest,
  onConsumeExternalV21Manifest,
  onImportFullManifest,
  onV21LocksChange,
  externalSceneSubtitleEdit,
  onConsumeExternalSceneSubtitleEdit,
  youtubeSeo,
  chaptersYoutubeText,
  subtitlesExportConfig,
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
  onClearTerminalLogs,
  initialCombineDraft,
  onCombineDraftChange
}) => {
  // Редактируемое имя проекта (по умолчанию: "Narrative Movie 4K")
  const [projectName, setProjectName] = useState<string>(
    () =>
      (typeof initialCombineDraft?.project_name === 'string' &&
      initialCombineDraft.project_name.trim()
        ? initialCombineDraft.project_name
        : externalProjectName) || 'Narrative Movie 4K'
  );

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
  >(() =>
    initialCombineDraft?.rhythm_profile === 'ambient_meditative' ||
    initialCombineDraft?.rhythm_profile === 'custom_dna' ||
    initialCombineDraft?.rhythm_profile === 'historical_storytelling'
      ? initialCombineDraft.rhythm_profile
      : 'historical_storytelling'
  );
  const [isDnaModalOpen, setIsDnaModalOpen] = useState<boolean>(false);
  const [dnaReferenceInput, setDnaReferenceInput] = useState<string>(() =>
    typeof initialCombineDraft?.dna_reference_input === 'string'
      ? initialCombineDraft.dna_reference_input
      : 'Быстрый монтаж каждые 3 сек, резкие наезды, мрачный нуар'
  );
  const [lastAppliedDnaSummary, setLastAppliedDnaSummary] = useState<string>(() =>
    typeof initialCombineDraft?.last_applied_dna_summary === 'string'
      ? initialCombineDraft.last_applied_dna_summary
      : 'Historical Storytelling • 2.5–8 сек • Живопись / Графический роман'
  );
  const [importedRhythmMap, setImportedRhythmMap] = useState<
    Record<string, unknown> | string | null
  >(null);

  // Мультивыбор кинематографичных оверлеев (записываются в массив overlays внутри manifest.json)
  const [selectedOverlays, setSelectedOverlays] = useState<CinematicOverlayId[]>(() =>
    Array.isArray(initialCombineDraft?.selected_overlays)
      ? (initialCombineDraft.selected_overlays as CinematicOverlayId[])
      : ['ambient_particles', 'cinematic_film_grain']
  );
  const [lowerThirdStyle, setLowerThirdStyle] = useState<LowerThirdStyleId>(() =>
    typeof initialCombineDraft?.lower_third_style === 'string' &&
    initialCombineDraft.lower_third_style.trim()
      ? (initialCombineDraft.lower_third_style as LowerThirdStyleId)
      : 'rossiya24'
  );

  const toggleOverlayPreset = (overlayId: CinematicOverlayId) => {
    setSelectedOverlays(prev =>
      prev.includes(overlayId) ? prev.filter(item => item !== overlayId) : [...prev, overlayId]
    );
  };

  // Динамический массив сцен любой длины (80, 120, 160, 200+ сцен без лимитов и без тестовых заглушек)
  const [narrativeScenes, setNarrativeScenes] = useState<NarrativeSceneItem[]>(() => {
    if (
      Array.isArray(initialCombineDraft?.narrative_scenes) &&
      initialCombineDraft.narrative_scenes.length > 0
    ) {
      return initialCombineDraft.narrative_scenes as NarrativeSceneItem[];
    }
    return Array.from({ length: 12 }, (_, idx) => ({
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
    }));
  });

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
      setSelectedOverlays(['cinematic_film_grain', 'lower_thirds']);
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
      const hasHistoricalTitles = externalScenes.some(sc =>
        Boolean(sc.historical_date?.trim() || sc.historical_location?.trim())
      );
      if (hasHistoricalTitles) {
        setSelectedOverlays(prev =>
          prev.includes('lower_thirds') ? prev : [...prev, 'lower_thirds']
        );
      }
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
  const [ambientAudio, setAmbientAudio] = useState<AmbientAudioConfig>(() => ({
    file_name: '',
    loop_full_duration: true,
    volume: 0.45,
    ...((initialCombineDraft?.ambient_audio as Partial<AmbientAudioConfig>) || {})
  }));

  // б) Мастер-аудиодорожка (озвучка / саундтрек) с полями таймкода старта и громкости
  const [masterAudio, setMasterAudio] = useState<MasterAudioConfig>(() => ({
    file_name: '',
    start_timecode: '00:00:00',
    volume: 1.0,
    fade_in_sec: 1.0,
    fade_out_sec: 2.0,
    ...((initialCombineDraft?.master_audio as Partial<MasterAudioConfig>) || {})
  }));
  // Матрица рассинхрона (Audio-to-Video Drift Guard): длительность мастер-аудиодорожки в секундах
  const [masterAudioDurationSec, setMasterAudioDurationSec] = useState<number>(() =>
    typeof initialCombineDraft?.master_audio_duration_sec === 'number' &&
    Number.isFinite(initialCombineDraft.master_audio_duration_sec)
      ? initialCombineDraft.master_audio_duration_sec
      : 64
  );
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
  const [burnInSrtEnabled, setBurnInSrtEnabled] = useState<boolean>(() =>
    typeof initialCombineDraft?.burn_in_srt_enabled === 'boolean'
      ? initialCombineDraft.burn_in_srt_enabled
      : false
  );
  const [uploadSrtToDriveEnabled, setUploadSrtToDriveEnabled] = useState<boolean>(() =>
    typeof initialCombineDraft?.upload_srt_to_drive_enabled === 'boolean'
      ? initialCombineDraft.upload_srt_to_drive_enabled
      : true
  );
  const [subtitleLanguage, setSubtitleLanguage] = useState<SubtitleTargetLanguage>(() =>
    typeof initialCombineDraft?.subtitle_language === 'string' &&
    initialCombineDraft.subtitle_language.trim()
      ? (initialCombineDraft.subtitle_language as SubtitleTargetLanguage)
      : 'en-US'
  );
  const [srtFilename, setSrtFilename] = useState<string>(() =>
    typeof initialCombineDraft?.srt_filename === 'string'
      ? initialCombineDraft.srt_filename
      : 'subtitles_en.srt'
  );
  const [srtTextContent, setSrtTextContent] = useState<string>(() =>
    typeof initialCombineDraft?.srt_text_content === 'string'
      ? initialCombineDraft.srt_text_content
      : ''
  );
  const srtFileInputRef = useRef<HTMLInputElement | null>(null);

  // Авто-нарезка вирусных Shorts (9:16, 1080x1920, центрированный кроп + 2–3 индивидуальных хука)
  const DEFAULT_SHORTS_HOOKS: [string, string, string] = [
    'WAIT FOR THE 14TH SECOND...',
    'NOBODY COULD EXPLAIN THIS...',
    'THE TRUTH WAS BURIED HERE...'
  ];
  const [shortsAutoSliceEnabled, setShortsAutoSliceEnabled] = useState<boolean>(() =>
    typeof initialCombineDraft?.shorts_auto_slice_enabled === 'boolean'
      ? initialCombineDraft.shorts_auto_slice_enabled
      : false
  );
  const [shortsSliceCount, setShortsSliceCount] = useState<2 | 3>(() =>
    initialCombineDraft?.shorts_slice_count === 2 ? 2 : 3
  );
  const [shortsHookTexts, setShortsHookTexts] = useState<[string, string, string]>(() =>
    Array.isArray(initialCombineDraft?.shorts_hook_texts) &&
    initialCombineDraft.shorts_hook_texts.length === 3
      ? ([...initialCombineDraft.shorts_hook_texts] as [string, string, string])
      : DEFAULT_SHORTS_HOOKS
  );

  // Параметры кодирования для N-сцен (по умолчанию H.264 libx264 High profile CRF 18 yuv420p 24fps CFR)
  const [exportSettings, setExportSettings] = useState<NarrativeExportSettings>(() => ({
    resolution: '4k',
    aspect_ratio: '16:9',
    video_codec: 'libx264',
    profile: 'high',
    pix_fmt: 'yuv420p',
    cfr: true,
    preset: 'veryfast',
    draft_mode: false,
    bitrate_mbps: 35,
    crf: 18,
    fps: 24,
    audio_bitrate_kbps: 320,
    preview_duration_sec: 0,
    ...((initialCombineDraft?.export_settings as Partial<NarrativeExportSettings>) || {})
  }));

  // Авто-блокировки непрерывного голоса, декупленного FFmpeg xfade и аудио-нормализации v2.2-FINAL
  const [v21Locks, setV21Locks] = useState<V21PipelineLocks>(() => ({
    hardFrameLock: true,
    apadAtrimLock: true,
    continuousVoiceMaster: true,
    zeroSpeechOverlap: true,
    dynamicXfadeTransitions: true,
    decoupledVideoXfadeOnly: true,
    autoMuteFlaggedClips: true,
    youtubeLoudnorm: true,
    integratedLufs: -14.0,
    truePeakDbtp: -1.0,
    voiceoverLeadInSec: VOICEOVER_LEAD_IN_SEC,
    voiceoverSentencePadSec: VOICEOVER_SENTENCE_PAD_SEC,
    ...((initialCombineDraft?.v21_locks as Partial<V21PipelineLocks>) || {})
  }));

  // Передача актуального среза сцен (включая даты/локации), оверлеев и настроек рендера для автосохранения "aether_workspace_draft"
  useEffect(() => {
    onCombineDraftChange?.({
      project_name: projectName,
      rhythm_profile: rhythmProfile,
      dna_reference_input: dnaReferenceInput,
      last_applied_dna_summary: lastAppliedDnaSummary,
      selected_overlays: selectedOverlays,
      lower_third_style: lowerThirdStyle,
      narrative_scenes: narrativeScenes,
      ambient_audio: ambientAudio as unknown as Record<string, unknown>,
      master_audio: masterAudio as unknown as Record<string, unknown>,
      master_audio_duration_sec: masterAudioDurationSec,
      burn_in_srt_enabled: burnInSrtEnabled,
      upload_srt_to_drive_enabled: uploadSrtToDriveEnabled,
      subtitle_language: subtitleLanguage,
      srt_filename: srtFilename,
      srt_text_content: srtTextContent,
      shorts_auto_slice_enabled: shortsAutoSliceEnabled,
      shorts_slice_count: shortsSliceCount,
      shorts_hook_texts: shortsHookTexts,
      export_settings: exportSettings as unknown as Record<string, unknown>,
      v21_locks: v21Locks as unknown as Record<string, unknown>
    });
  }, [
    onCombineDraftChange,
    projectName,
    rhythmProfile,
    dnaReferenceInput,
    lastAppliedDnaSummary,
    selectedOverlays,
    lowerThirdStyle,
    narrativeScenes,
    ambientAudio,
    masterAudio,
    masterAudioDurationSec,
    burnInSrtEnabled,
    uploadSrtToDriveEnabled,
    subtitleLanguage,
    srtFilename,
    srtTextContent,
    shortsAutoSliceEnabled,
    shortsSliceCount,
    shortsHookTexts,
    exportSettings,
    v21Locks
  ]);

  const [importedScenarioName, setImportedScenarioName] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const scenarioJsonInputRef = useRef<HTMLInputElement | null>(null);
  const masterAudioInputRef = useRef<HTMLInputElement | null>(null);

  // Пересчет start_time по непрерывной голосовой шкале (без Speech Overlap)
  const recalculateStartTimes = (
    list: NarrativeSceneItem[],
    renumberSequentialIds = false
  ): NarrativeSceneItem[] => {
    const timings = computeContinuousSceneTimings(list);
    return list.map((item, idx) => {
      const t = timings[idx];
      const startStr = formatTimecode(t ? t.segStart : 0);
      const shouldRenumberId =
        renumberSequentialIds &&
        (!item.scene_id.trim() || /^(?:scene|sc)_?\d+$/i.test(item.scene_id.trim()));
      const nextItem: NarrativeSceneItem = {
        ...item,
        scene_index: idx + 1,
        ...(shouldRenumberId
          ? { scene_id: `scene_${String(idx + 1).padStart(3, '0')}` }
          : {}),
        start_time: startStr,
        ...(t ? { voice_start: t.voiceStart, voice_end: t.voiceEnd } : {})
      };
      return transferSceneKey(item, nextItem);
    });
  };

  // Расчет полного хронометража всех сцен по непрерывной голосовой шкале (zero speech overlap)
  const calcTotalDurationSec = (scenesList: NarrativeSceneItem[]): number => {
    const timings = computeContinuousSceneTimings(scenesList);
    return timings.length > 0 ? timings[timings.length - 1].segEnd : 0;
  };

  const continuousSceneTimings = useMemo(
    () => computeContinuousSceneTimings(narrativeScenes),
    [narrativeScenes]
  );

  const totalNarrativeDurationSec = useMemo(
    () =>
      continuousSceneTimings.length > 0
        ? continuousSceneTimings[continuousSceneTimings.length - 1].segEnd
        : 0,
    [continuousSceneTimings]
  );

  const getSceneVoiceoverFileName = (sc: NarrativeSceneItem): string =>
    (
      sc.voiceover_file ||
      sc.audio_file ||
      sc.assets?.voiceover_file ||
      sc.assets?.audio_file ||
      ''
    ).trim();

  // Авто-расчёт длительности аудио по посегментным озвучкам (с учётом паузы 0.35с между фразами)
  const perSceneVoiceStats = useMemo(() => {
    const padSec = v21Locks.voiceoverSentencePadSec ?? VOICEOVER_SENTENCE_PAD_SEC;
    const leadInSec = v21Locks.voiceoverLeadInSec || VOICEOVER_LEAD_IN_SEC;
    let voiceScenesCount = 0;
    let totalSec = 0;

    narrativeScenes.forEach((sc, idx) => {
      if (!getSceneVoiceoverFileName(sc)) return;
      voiceScenesCount += 1;

      if (typeof sc.voiceover_duration_sec === 'number' && sc.voiceover_duration_sec > 0) {
        const lead = idx === 0 ? leadInSec : 0;
        totalSec += lead + sc.voiceover_duration_sec + padSec;
      } else if (
        typeof sc.voice_start === 'number' &&
        typeof sc.voice_end === 'number' &&
        sc.voice_end > sc.voice_start
      ) {
        const lead =
          idx === 0 && sc.voice_start > 0 ? Math.min(leadInSec, sc.voice_start) : 0;
        totalSec += lead + (sc.voice_end - sc.voice_start) + padSec;
      } else {
        const timing = continuousSceneTimings[idx];
        totalSec += timing
          ? Math.max(0, timing.segEnd - timing.segStart)
          : Math.max(0.5, Number(sc.duration) || 6);
      }
    });

    return {
      voiceScenesCount,
      hasPerSceneVoiceovers: voiceScenesCount > 0,
      totalVoiceDurationSec: Math.round(totalSec * 10) / 10
    };
  }, [
    narrativeScenes,
    continuousSceneTimings,
    v21Locks.voiceoverLeadInSec,
    v21Locks.voiceoverSentencePadSec
  ]);

  const isPerSceneVoiceMode =
    !masterAudio.file_name.trim() && perSceneVoiceStats.hasPerSceneVoiceovers;

  const effectiveMasterAudioDurationSec =
    isPerSceneVoiceMode && perSceneVoiceStats.totalVoiceDurationSec > 0
      ? perSceneVoiceStats.totalVoiceDurationSec
      : masterAudioDurationSec;

  useEffect(() => {
    if (isPerSceneVoiceMode && perSceneVoiceStats.totalVoiceDurationSec > 0) {
      setMasterAudioDurationSec(perSceneVoiceStats.totalVoiceDurationSec);
    }
  }, [isPerSceneVoiceMode, perSceneVoiceStats.totalVoiceDurationSec]);

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

  // Универсальный динамический парсер JSON-сценария любого размера (поддержка v2.1 timeline[] и N-сцен)
  const applyNarrativeScenarioJson = (
    raw: Record<string, unknown>,
    fileNameLabel: string,
    emitToApp = true
  ) => {
    const timelineSub =
      raw.timeline && typeof raw.timeline === 'object' && !Array.isArray(raw.timeline)
        ? (raw.timeline as Record<string, unknown>)
        : undefined;

    const rawScenesArray =
      Array.isArray(raw.timeline) && raw.timeline.length > 0
        ? raw.timeline
        : Array.isArray(raw.scenes) && raw.scenes.length > 0
        ? raw.scenes
        : Array.isArray(raw.timeline)
        ? raw.timeline
        : Array.isArray(raw.scenes)
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

    if (typeof raw.project_name === 'string' && raw.project_name.trim()) {
      handleProjectNameUpdate(raw.project_name.trim());
    }

    if (rawScenesArray && rawScenesArray.length > 0) {
      let runningSec = 0;
      const parsedScenes: NarrativeSceneItem[] = rawScenesArray
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((sc, idx) => {
          const baseContent =
            sc.base_content && typeof sc.base_content === 'object'
              ? (sc.base_content as Record<string, unknown>)
              : undefined;
          const scAssets =
            sc.assets && typeof sc.assets === 'object'
              ? (sc.assets as Record<string, unknown>)
              : undefined;
          const scVideoProc =
            sc.video_processing && typeof sc.video_processing === 'object'
              ? (sc.video_processing as Record<string, unknown>)
              : undefined;
          const scAudioProc =
            sc.audio_processing && typeof sc.audio_processing === 'object'
              ? (sc.audio_processing as Record<string, unknown>)
              : undefined;

          // Умный парсинг схемы 2.2-FINAL (assets.video_file || video_file || file_name)
          const rawFileName = String(
            scAssets?.video_file ||
              sc.video_file ||
              sc.file_name ||
              baseContent?.file_name ||
              sc.filename ||
              sc.asset_name ||
              sc.clip_name ||
              ''
          ).trim();

          // Озвучка сцены (assets.voiceover_file || assets.audio_file || voiceover_file || audio_file)
          const rawVoiceoverFile = String(
            scAssets?.voiceover_file ||
              scAssets?.audio_file ||
              sc.voiceover_file ||
              sc.audio_file ||
              ''
          ).trim();

          // Референс-кадр сцены (assets.image_reference || image_reference)
          const rawImageReference = String(
            scAssets?.image_reference || sc.image_reference || ''
          ).trim();

          const rawStart = sc.start_time ?? sc.start_sec ?? sc.timecode;
          const startSec = parseTimecodeToSec(rawStart, runningSec);

          const rawEndSec = typeof sc.end_sec === 'number' ? sc.end_sec : undefined;
          const rawDuration = Number(
            sc.duration_sec ??
              sc.duration ??
              sc.slot_duration_sec ??
              (rawEndSec !== undefined ? rawEndSec - startSec : 6)
          );
          const duration = !isNaN(rawDuration) && rawDuration > 0 ? rawDuration : 6;
          runningSec = startSec + duration;

          // Переход сцены (приоритет: video_processing.transition_in -> transition -> slot_transition_out)
          const rawTrans =
            sc.transition ?? sc.slot_transition_out ?? scVideoProc?.transition_in;
          let transType: NarrativeSceneItem['transition']['type'] = 'fade';
          let transDur =
            typeof sc.transition_duration === 'number'
              ? Math.max(0, sc.transition_duration)
              : 0.6;
          if (typeof rawTrans === 'string') {
            transType = normalizeV8Transition(rawTrans);
            if (transType === 'cut' || transType === 'none') {
              transDur = 0;
            }
          } else if (rawTrans && typeof rawTrans === 'object') {
            const tObj = rawTrans as Record<string, unknown>;
            transType = normalizeV8Transition(tObj.type || tObj.effect || 'fade');
            if (typeof tObj.duration_sec === 'number') {
              transDur = Math.max(0, tObj.duration_sec);
            } else if (typeof tObj.duration === 'number') {
              transDur = Math.max(0, tObj.duration);
            }
            if (transType === 'cut' || transType === 'none') {
              transDur = 0;
            }
          }

          const rawCam = String(scVideoProc?.camera_movement ?? sc.camera_movement ?? '').trim();
          const cameraMovement: CameraVectorType | undefined =
            rawCam === 'zoom_in' ||
            rawCam === 'zoom_out' ||
            rawCam === 'pan_left' ||
            rawCam === 'pan_right' || rawCam === 'pan_up' || rawCam === 'pan_down' || rawCam === 'static'
              ? rawCam
              : rawCam === 'none' ? 'static' : undefined;

          const subtitlesMap = normalizeSceneSubtitlesMap(sc.subtitles);
          const rawSubTextField =
            sc.subtitles &&
            typeof sc.subtitles === 'object' &&
            !Array.isArray(sc.subtitles) &&
            typeof (sc.subtitles as Record<string, unknown>).text === 'string'
              ? String((sc.subtitles as Record<string, unknown>).text)
              : undefined;
          const overlayText = String(
            sc.text_overlay ??
              subtitlesMap?.EN ??
              subtitlesMap?.RU ??
              rawSubTextField ??
              sc.subtitle ??
              sc.caption ??
              sc.act_title ??
              sc.title ??
              ''
          );

          const rawSceneTitle = String(sc.title ?? sc.act_title ?? '').trim();
          const rawMute =
            typeof scAudioProc?.video_ambient_mute === 'boolean'
              ? scAudioProc.video_ambient_mute
              : typeof sc.video_ambient_mute === 'boolean'
              ? sc.video_ambient_mute
              : typeof sc.mute_audio === 'boolean'
              ? sc.mute_audio
              : typeof sc.audio_mute === 'boolean'
              ? sc.audio_mute
              : typeof sc.mute === 'boolean'
              ? sc.mute
              : undefined;

          const rawAmbientGainDb =
            typeof scAudioProc?.video_ambient_gain_db === 'number'
              ? scAudioProc.video_ambient_gain_db
              : typeof sc.video_ambient_gain_db === 'number'
              ? sc.video_ambient_gain_db
              : typeof sc.ambient_gain_db === 'number'
              ? sc.ambient_gain_db
              : undefined;

          const rawSfxStr =
            typeof scAudioProc?.sfx === 'string' && scAudioProc.sfx.trim()
              ? scAudioProc.sfx.trim()
              : typeof sc.sfx === 'string' && sc.sfx.trim()
              ? sc.sfx.trim()
              : typeof sc.sfx_file === 'string' && sc.sfx_file.trim()
              ? sc.sfx_file.trim()
              : '';
          const rawSfxGain =
            typeof scAudioProc?.sfx_gain_db === 'number'
              ? scAudioProc.sfx_gain_db
              : typeof sc.sfx_gain_db === 'number'
              ? sc.sfx_gain_db
              : typeof sc.sfx_volume_db === 'number'
              ? sc.sfx_volume_db
              : rawSfxStr
              ? -6.0
              : undefined;

          const sceneIdNorm = String(
            sc.scene_id || sc.slot_id || sc.id || `scene_${String(idx + 1).padStart(2, '0')}`
          );

          const rawHistDate = String(sc.historical_date || '').trim();
          const rawHistLocation = String(sc.historical_location || '').trim();

          return {
            scene_index: idx + 1,
            scene_id: sceneIdNorm,
            ...(rawSceneTitle ? { title: rawSceneTitle } : {}),
            file_name: rawFileName,
            video_file: rawFileName,
            ...(rawVoiceoverFile
              ? { voiceover_file: rawVoiceoverFile, audio_file: rawVoiceoverFile }
              : {}),
            ...(rawImageReference ? { image_reference: rawImageReference } : {}),
            assets: {
              ...(scAssets || {}),
              video_file: rawFileName,
              ...(rawVoiceoverFile
                ? { voiceover_file: rawVoiceoverFile, audio_file: rawVoiceoverFile }
                : {}),
              ...(rawImageReference ? { image_reference: rawImageReference } : {})
            },
            start_time:
              typeof sc.start_time === 'string' && sc.start_time.trim()
                ? sc.start_time.trim()
                : formatTimecode(startSec),
            duration,
            ...(typeof sc.voiceover_duration_sec === 'number'
              ? { voiceover_duration_sec: sc.voiceover_duration_sec }
              : {}),
            ...(typeof sc.voice_start === 'number' ? { voice_start: sc.voice_start } : {}),
            ...(typeof sc.voice_end === 'number' ? { voice_end: sc.voice_end } : {}),
            ...(cameraMovement ? { camera_movement: cameraMovement } : {}),
            camera_zoom: normalizeCameraZoom(sc.camera_zoom ?? scVideoProc?.camera_zoom),
            camera_policy: normalizeCameraPolicy(sc.camera_policy ?? scVideoProc?.camera_policy),
            video_duration_mode: normalizeDurationMode(sc.video_duration_mode),
            max_extension_sec: normalizeExtension(sc.max_extension_sec),
            allow_video_reuse: sc.allow_video_reuse === true,
            cta_config: readCTA(sc.cta_config),
            adaptive_audio: sc.adaptive_audio !== false,
            audio_ducking: sc.audio_ducking !== false,
            source_audio_enabled: sc.source_audio_enabled !== false,
            source_audio_volume: normalizeV8Volume(sc.source_audio_volume,1),
            voiceover_volume: normalizeV8Volume(sc.voiceover_volume, typeof scAudioProc?.voiceover_gain_db === 'number' ? normalizeV8Volume(Math.pow(10, scAudioProc.voiceover_gain_db / 20), 1) : 1),
            ambient_volume: normalizeV8Volume(sc.ambient_volume ?? (typeof sc.ambient_audio === 'object' && sc.ambient_audio ? (sc.ambient_audio as Record<string, unknown>).volume : undefined), 0.35),
            ambient_audio: typeof sc.ambient_audio === 'string' ? sc.ambient_audio : typeof sc.ambient_audio === 'object' && sc.ambient_audio ? String((sc.ambient_audio as Record<string, unknown>).file_name || '') : '',
            ...(typeof sc.visual_style === 'string' && sc.visual_style.trim()
              ? { visual_style: sc.visual_style.trim() }
              : {}),
            transition: {
              type: transType,
              duration_sec: normalizeV8TransitionDuration(transDur, transType)
            },
            ...(scVideoProc
              ? { video_processing: scVideoProc as NarrativeSceneItem['video_processing'] }
              : {}),
            ...(scAudioProc
              ? { audio_processing: scAudioProc as NarrativeSceneItem['audio_processing'] }
              : {}),
            text_overlay: overlayText,
            ...(typeof sc.ai_video_prompt === 'string' && sc.ai_video_prompt.trim()
              ? { ai_video_prompt: sc.ai_video_prompt.trim() }
              : {}),
            ...(typeof sc.prompt_ru === 'string' && sc.prompt_ru.trim()
              ? { prompt_ru: sc.prompt_ru.trim() }
              : {}),
            ...(rawSfxStr ? { sfx: rawSfxStr } : {}),
            ...(rawMute !== undefined ? { video_ambient_mute: rawMute } : {}),
            ...(rawAmbientGainDb !== undefined
              ? { video_ambient_gain_db: rawAmbientGainDb }
              : {}),
            ...(rawSfxGain !== undefined ? { sfx_gain_db: rawSfxGain } : {}),
            ...(subtitlesMap ? { subtitles: subtitlesMap } : {}),
            ...(rawHistDate ? { historical_date: rawHistDate } : {}),
            ...(rawHistLocation ? { historical_location: rawHistLocation } : {})
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

      if (
        parsedScenes.some(sc =>
          Boolean(sc.historical_date?.trim() || sc.historical_location?.trim())
        )
      ) {
        setSelectedOverlays(prev =>
          prev.includes('lower_thirds') ? prev : [...prev, 'lower_thirds']
        );
      }
    }

    // Парсинг rhythm_map / rhythm_profile / overlays (2.2-FINAL)
    const studioPresets =
      raw.studio_ui_presets && typeof raw.studio_ui_presets === 'object'
        ? (raw.studio_ui_presets as Record<string, unknown>)
        : undefined;
    const tab1Presets =
      studioPresets?.tab_1_montage && typeof studioPresets.tab_1_montage === 'object'
        ? (studioPresets.tab_1_montage as Record<string, unknown>)
        : undefined;
    const rawRhythmMap = raw.rhythm_map ?? tab1Presets?.rhythm_map;
    const validOverlaySet = new Set<CinematicOverlayId>([
      'ambient_particles',
      'cinematic_film_grain',
      'lower_thirds',
      'warm_glow'
    ]);
    const normalizeOverlayArray = (arr: unknown[]): CinematicOverlayId[] => {
      const result: CinematicOverlayId[] = [];
      for (const item of arr) {
        if (typeof item !== 'string') continue;
        const normalizedId =
          item === 'historical_lower_thirds' ? 'lower_thirds' : item;
        if (
          validOverlaySet.has(normalizedId as CinematicOverlayId) &&
          !result.includes(normalizedId as CinematicOverlayId)
        ) {
          result.push(normalizedId as CinematicOverlayId);
        }
      }
      return result;
    };

    if (typeof rawRhythmMap === 'string' && rawRhythmMap.trim()) {
      const rmStr = rawRhythmMap.trim();
      setImportedRhythmMap(rmStr);
      setLastAppliedDnaSummary(rmStr);
      const lowerRm = rmStr.toLowerCase();
      if (lowerRm.includes('ambient') || lowerRm.includes('meditat')) {
        setRhythmProfile('ambient_meditative');
      } else if (lowerRm.includes('hist') || lowerRm.includes('doc')) {
        setRhythmProfile('historical_storytelling');
      } else {
        setRhythmProfile('custom_dna');
      }
    } else if (rawRhythmMap && typeof rawRhythmMap === 'object' && !Array.isArray(rawRhythmMap)) {
      const rmObj = rawRhythmMap as Record<string, unknown>;
      setImportedRhythmMap(rmObj);
      const rawProf = String(
        rmObj.profile || rmObj.mode || rmObj.preset || raw.rhythm_profile || ''
      ).toLowerCase();
      if (rawProf.includes('ambient') || rawProf.includes('meditat')) {
        setRhythmProfile('ambient_meditative');
      } else if (rawProf.includes('hist') || rawProf.includes('doc')) {
        setRhythmProfile('historical_storytelling');
      } else if (rawProf) {
        setRhythmProfile('custom_dna');
      }
      const rmSummary = String(
        rmObj.summary ||
          rmObj.description ||
          rmObj.label ||
          rmObj.dna_summary ||
          rmObj.pacing_summary ||
          ''
      ).trim();
      if (rmSummary) {
        setLastAppliedDnaSummary(rmSummary);
      } else {
        const summaryParts = [
          rmObj.profile || rmObj.tempo || rmObj.pace,
          rmObj.avg_scene_sec ? `~${rmObj.avg_scene_sec} сек` : '',
          rmObj.style
        ]
          .map(v => String(v || '').trim())
          .filter(Boolean);
        if (summaryParts.length > 0) {
          setLastAppliedDnaSummary(summaryParts.join(' • '));
        }
      }
      if (Array.isArray(rmObj.overlays)) {
        const filtered = normalizeOverlayArray(rmObj.overlays);
        if (filtered.length > 0) {
          setSelectedOverlays(filtered);
        }
      }
    } else if (typeof raw.rhythm_profile === 'string' && raw.rhythm_profile.trim()) {
      const rp = raw.rhythm_profile.trim();
      if (rp === 'historical_storytelling' || rp === 'ambient_meditative' || rp === 'custom_dna') {
        setRhythmProfile(rp);
      }
    }

    if (Array.isArray(raw.overlays)) {
      const filtered = normalizeOverlayArray(raw.overlays);
      if (filtered.length > 0) {
        setSelectedOverlays(filtered);
      }
    }

    const parsedLowerThirdsDetected =
      Array.isArray(rawScenesArray) &&
      rawScenesArray.some(
        s =>
          Boolean(
            s &&
              typeof s === 'object' &&
              (String((s as Record<string, unknown>).historical_date || '').trim() ||
                String((s as Record<string, unknown>).historical_location || '').trim())
          )
      );
    if (parsedLowerThirdsDetected) {
      setSelectedOverlays(prev =>
        prev.includes('lower_thirds') ? prev : [...prev, 'lower_thirds']
      );
    }

    const rawTab1Root =
      raw.tab_1_montage && typeof raw.tab_1_montage === 'object'
        ? (raw.tab_1_montage as Record<string, unknown>)
        : undefined;
    const rawLowerThirdStyleVal = String(
      raw.lower_third_style ??
        tab1Presets?.lower_third_style ??
        rawTab1Root?.lower_third_style ??
        ''
    ).trim();
    if (
      rawLowerThirdStyleVal === 'rossiya24' ||
      rawLowerThirdStyleVal === 'ictv' ||
      rawLowerThirdStyleVal === 'sky_news'
    ) {
      setLowerThirdStyle(rawLowerThirdStyleVal);
    }

    // Парсинг v2.1 / 2.2-FINAL пресетов для Таб 1
    const parsedV21 = parseV21ManifestObject(raw);
    if (parsedV21.isV21Manifest) {
      setExportSettings(prev => ({
        ...prev,
        resolution:
          parsedV21.tab1Export.resolution === '720p' ? '720p' : parsedV21.tab1Export.resolution,
        video_codec: parsedV21.tab1Export.videoCodec,
        profile: parsedV21.tab1Export.profile,
        pix_fmt: parsedV21.tab1Export.pixFmt,
        crf: parsedV21.tab1Export.crf,
        fps: parsedV21.tab1Export.fps,
        cfr: parsedV21.tab1Export.cfr,
        draft_mode: parsedV21.tab1Export.resolution === '720p',
        preset: parsedV21.tab1Export.videoCodec === 'libx264' ? 'veryfast' : 'medium'
      }));
      setV21Locks(parsedV21.tab1Locks);
      if (parsedV21.tab3Verbaflow.burnInVideo === false) {
        setBurnInSrtEnabled(false);
        setUploadSrtToDriveEnabled(true);
      }
    }

    // Маппинг ambient_audio
    if (raw.ambient_audio && typeof raw.ambient_audio === 'object') {
      const aa = raw.ambient_audio as Record<string, unknown>;
      const aaName = String(aa.file_name || aa.filename || aa.asset_name || aa.audio_file || '').trim();
      setAmbientAudio(prev => ({
        file_name: aaName || prev.file_name,
        loop_full_duration:
          typeof aa.loop_full_duration === 'boolean'
            ? aa.loop_full_duration
            : prev.loop_full_duration,
        volume: typeof aa.volume === 'number' ? aa.volume : prev.volume
      }));
    }

    // Маппинг master_audio
    if (raw.master_audio && typeof raw.master_audio === 'object') {
      const ma = raw.master_audio as Record<string, unknown>;
      const audioName = String(
        ma.file_name || ma.filename || ma.asset_name || ma.voiceover_file || ma.audio_file || ''
      ).trim();
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
      if (!audioName) {
        setMasterAudioFile(null);
      } else if (typeof ma.duration_sec === 'number' && ma.duration_sec > 0) {
        setMasterAudioDurationSec(ma.duration_sec);
      }
    } else if (typeof raw.audio_filename === 'string' || typeof raw.master_audio === 'string') {
      const audioName = String(raw.master_audio || raw.audio_filename || '').trim();
      setMasterAudio(prev => ({ ...prev, file_name: audioName }));
      if (!audioName) {
        setMasterAudioFile(null);
      }
    } else if (
      rawScenesArray &&
      rawScenesArray.some(item => {
        if (!item || typeof item !== 'object') return false;
        const sc = item as Record<string, unknown>;
        const assets =
          sc.assets && typeof sc.assets === 'object'
            ? (sc.assets as Record<string, unknown>)
            : undefined;
        return Boolean(
          String(
            assets?.voiceover_file ||
              assets?.audio_file ||
              sc.voiceover_file ||
              sc.audio_file ||
              ''
          ).trim()
        );
      })
    ) {
      setMasterAudio(prev => ({ ...prev, file_name: '' }));
      setMasterAudioFile(null);
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

    // Маппинг export_settings (сохраняем profile High, pix_fmt yuv420p, cfr true и 720p)
    const exp =
      raw.export_settings && typeof raw.export_settings === 'object'
        ? (raw.export_settings as Record<string, unknown>)
        : undefined;
    if (exp || raw.resolution || raw.fps || raw.crf) {
      setExportSettings(prev => {
        const rawRes = String(exp?.resolution ?? raw.resolution ?? prev.resolution).toLowerCase();
        const resolution: '4k' | '1080p' | '720p' =
          rawRes.includes('720') || rawRes.includes('1280')
            ? '720p'
            : rawRes.includes('1080') || rawRes.includes('1920')
            ? '1080p'
            : '4k';

        const rawAspect = String(exp?.aspect_ratio ?? raw.aspect_ratio ?? prev.aspect_ratio);
        const aspect_ratio: '16:9' | '9:16' = rawAspect === '9:16' ? '9:16' : '16:9';

        const rawCodec = String(exp?.video_codec ?? raw.video_codec ?? prev.video_codec);
        const video_codec: 'libx265' | 'libx264' = rawCodec.includes('265')
          ? 'libx265'
          : 'libx264';

        const rawProfile = String(exp?.profile ?? raw.profile ?? prev.profile ?? 'high').toLowerCase();
        const profile: 'high' | 'main' = rawProfile === 'main' ? 'main' : 'high';

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
          profile,
          pix_fmt: 'yuv420p',
          cfr: typeof exp?.cfr === 'boolean' ? exp.cfr : prev.cfr ?? true,
          fps,
          crf,
          bitrate_mbps,
          bitrate_cap: exp?.bitrate_cap === 'off' ? 'off' : 'on',
          preset: exp?.preset === 'medium' || exp?.preset === 'ultrafast' ? exp.preset : 'veryfast',
          draft_mode: typeof exp?.draft_mode === 'boolean' ? exp.draft_mode : resolution === '720p',
          lower_third_config: normalizeBroadcastConfig(exp?.lower_third_config ?? prev.lower_third_config),
          brand_identity: normalizeBrandIdentity(exp?.brand_identity ?? (exp?.lower_third_config as Record<string, unknown> | undefined)?.brand_identity),
          preview_duration_sec: typeof exp?.preview_duration_sec === 'number' && Number.isFinite(exp.preview_duration_sec) && exp.preview_duration_sec >= 0 ? exp.preview_duration_sec : 0,
          audio_bitrate_kbps: exp?.audio_bitrate_kbps === 192 || exp?.audio_bitrate_kbps === 256 || exp?.audio_bitrate_kbps === 320 ? exp.audio_bitrate_kbps : prev.audio_bitrate_kbps
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

    // Маппинг shorts_config / shorts_factory / tab_1_montage
    const rawShortsObj =
      (raw.shorts_factory && typeof raw.shorts_factory === 'object'
        ? (raw.shorts_factory as Record<string, unknown>)
        : undefined) ||
      (raw.shorts_config && typeof raw.shorts_config === 'object'
        ? (raw.shorts_config as Record<string, unknown>)
        : undefined);
    if (rawShortsObj) {
      if (typeof rawShortsObj.enabled === 'boolean') {
        setShortsAutoSliceEnabled(rawShortsObj.enabled);
      }
      const rawCount = Number(rawShortsObj.shorts_count ?? rawShortsObj.count);
      if (rawCount === 2 || rawCount === 3) {
        setShortsSliceCount(rawCount);
      }
      const importedHooks = Array.isArray(rawShortsObj.hook_texts)
        ? rawShortsObj.hook_texts.map(item => String(item ?? '').trim())
        : [];
      const fallbackSingleHook = String(
        rawShortsObj.hook_text || rawShortsObj.hook_text_en || ''
      ).trim();
      if (importedHooks.length > 0 || fallbackSingleHook) {
        setShortsHookTexts(prev => [
          importedHooks[0] || fallbackSingleHook || prev[0],
          importedHooks[1] || prev[1],
          importedHooks[2] || prev[2]
        ]);
      }
    }

    setImportedScenarioName(fileNameLabel);
    if (emitToApp) {
      onImportFullManifest?.(raw, fileNameLabel);
    }
    onNotify(
      `JSON-манифест «${fileNameLabel}» загружен (${
        rawScenesArray ? `${rawScenesArray.length} сцен` : 'конфиг'
      }) — настроены Монтаж, Луп, VerbaFlow, SEO и Превью!`,
      'success'
    );
  };

  // Синхронизация импорта манифеста v2.1 из Tab 2 / App.tsx без повторной эмиссии вверх
  useEffect(() => {
    if (!externalV21Manifest) return;
    applyNarrativeScenarioJson(externalV21Manifest.raw, externalV21Manifest.fileName, false);
    onConsumeExternalV21Manifest?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalV21Manifest?.nonce]);

  // Синхронизация редактирования мультиязычных субтитров сцены из VerbaFlow (Tab 3)
  useEffect(() => {
    if (!externalSceneSubtitleEdit) return;
    const { sceneIndex, lang, text } = externalSceneSubtitleEdit;
    setNarrativeScenes(prev =>
      prev.map((sc, idx) =>
        idx === sceneIndex
          ? {
              ...sc,
              subtitles: {
                ...(sc.subtitles || {}),
                [lang]: text
              }
            }
          : sc
      )
    );
    onConsumeExternalSceneSubtitleEdit?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSceneSubtitleEdit?.nonce]);

  // Уведомление App.tsx об актуальных спецификациях рендера для RELEASE_CARD.md (Tab 4)
  useEffect(() => {
    if (!onV21LocksChange) return;
    const resLabel =
      exportSettings.resolution === '4k'
        ? '3840x2160'
        : exportSettings.resolution === '1080p'
        ? '1920x1080'
        : '1280x720';
    const profileLabel = exportSettings.profile === 'main' ? 'Main' : 'High';
    const pixFmtLabel = exportSettings.pix_fmt || 'yuv420p';
    const cfrLabel = exportSettings.cfr !== false ? 'CFR' : 'VFR';
    const loudnormLabel = v21Locks.youtubeLoudnorm
      ? `${v21Locks.integratedLufs.toFixed(1)} LUFS / ${v21Locks.truePeakDbtp.toFixed(1)} dBTP`
      : 'Bypassed';
    const summary = `${exportSettings.video_codec} / ${profileLabel} / CRF ${exportSettings.crf} / ${pixFmtLabel} / ${resLabel} / ${exportSettings.fps}fps ${cfrLabel} / ${loudnormLabel}`;
    onV21LocksChange(v21Locks, summary);
  }, [v21Locks, exportSettings, onV21LocksChange]);

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

  const didReorderRef = useRef<boolean>(false);

  const sceneKeys = useMemo(() => narrativeScenes.map(getSceneRowKey), [narrativeScenes]);

  const handleReorderScenesByKeys = (nextKeys: string[]) => {
    didReorderRef.current = true;
    setNarrativeScenes(prev => {
      const keyToScene = new Map<string, NarrativeSceneItem>();
      prev.forEach(sc => keyToScene.set(getSceneRowKey(sc), sc));
      const reordered = nextKeys
        .map(k => keyToScene.get(k))
        .filter((sc): sc is NarrativeSceneItem => Boolean(sc));
      if (reordered.length !== prev.length) return prev;
      return recalculateStartTimes(reordered, true);
    });
  };

  const handleSceneDragEndNotify = () => {
    if (!didReorderRef.current) return;
    didReorderRef.current = false;
    onNotify('🔄 Порядок сцен обновлён — таймкоды глав пересчитаны', 'info');
  };

  const updateScene = (idx: number, patch: Partial<NarrativeSceneItem>) => {
    setNarrativeScenes(prev => {
      const updated = prev.map((sc, i) =>
        i === idx ? transferSceneKey(sc, { ...sc, ...patch }) : sc
      );
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

  // Авто-синхронизация длительности всех сцен по непрерывной голосовой шкале (без Speech Overlap)
  const syncScenesDurationToMasterAudio = () => {
    const targetAudioDuration = effectiveMasterAudioDurationSec;
    if (narrativeScenes.length === 0 || targetAudioDuration <= 0) return;
    const perScene = Math.max(
      1,
      Math.round((targetAudioDuration / narrativeScenes.length) * 10) / 10
    );

    setNarrativeScenes(prev =>
      recalculateStartTimes(
        prev.map(sc => ({
          ...sc,
          duration: perScene
        }))
      )
    );
    onNotify(
      `Длительность ${narrativeScenes.length} сцен синхронизирована по непрерывной голосовой шкале (${targetAudioDuration} сек)!`,
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

  // Построение полного текста .SRT таймкодов по непрерывным голосовым границам [voiceStart, voiceEnd]
  const buildSrtStringFromScenes = (targetLang: SubtitleTargetLanguage = subtitleLanguage): string => {
    const timings = computeContinuousSceneTimings(narrativeScenes);
    const blocks: string[] = [];
    const scriptLines = transferredScript
      ? transferredScript
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('===') && !l.startsWith('['))
      : [];

    narrativeScenes.forEach((sc, idx) => {
      const t = timings[idx];
      const start = t ? t.voiceStart : 0;
      const end = t ? Math.max(start + 0.4, t.voiceEnd) : start + 4;

      const rawCandidate = sc.text_overlay.trim() || scriptLines[idx] || '';
      const localizedLine = translateSubtitleLine(rawCandidate, idx + 1, targetLang);

      blocks.push(
        `${idx + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${localizedLine}`
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
    () => Math.round((totalNarrativeDurationSec - effectiveMasterAudioDurationSec) * 10) / 10,
    [totalNarrativeDurationSec, effectiveMasterAudioDurationSec]
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

  const formatScenesReadyLabel = (count: number): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return `Манифест готов: ${count} сцена проверена`;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `Манифест готов: ${count} сцены проверены`;
    }
    return `Манифест готов: ${count} сцен проверены`;
  };

  const buildExportedSceneObject = (
    sc: NarrativeSceneItem,
    idx: number
  ): ExportedNarrativeSceneItem => {
    const resolvedVideoFile =
      (sc.file_name || sc.video_file || sc.assets?.video_file || '').trim() ||
      `scene_${String(idx + 1).padStart(3, '0')}_vid.mp4`;
    const resolvedVoiceoverFile = (
      sc.voiceover_file ||
      sc.audio_file ||
      sc.assets?.voiceover_file ||
      sc.assets?.audio_file ||
      ''
    ).trim();
    const resolvedImageRef = (sc.image_reference || sc.assets?.image_reference || '').trim();
    const resolvedTransType = normalizeV8Transition(sc.transition?.type);
    const resolvedTransDur = normalizeV8TransitionDuration(sc.transition?.duration_sec, resolvedTransType);
    const resolvedMute =
      typeof sc.video_ambient_mute === 'boolean'
        ? sc.video_ambient_mute
        : Boolean(sc.audio_processing?.video_ambient_mute);
    const sceneIdStr = sc.scene_id.trim() || `SCENE_${String(idx + 1).padStart(3, '0')}`;
    const isScene33 = sceneIdStr.toLowerCase().includes('scene_33');
    const resolvedAmbientGainDb =
      resolvedMute
        ? -96.0
        : typeof sc.video_ambient_gain_db === 'number' && sc.video_ambient_gain_db !== 0
        ? sc.video_ambient_gain_db
        : typeof sc.audio_processing?.video_ambient_gain_db === 'number' &&
          sc.audio_processing.video_ambient_gain_db !== 0
        ? sc.audio_processing.video_ambient_gain_db
        : isScene33
        ? -6.0
        : -22.0;
    const resolvedCamera =
      sc.camera_movement || CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length];
    const resolvedSubtitles: Record<string, string> =
      sc.subtitles || (sc.text_overlay && sc.text_overlay.trim() ? { EN: sc.text_overlay.trim() } : {});
    const timing = continuousSceneTimings[idx];

    return {
      scene_index: idx + 1,
      scene_id: sceneIdStr,
      title: toEnglishSceneTitle(sc, idx),
      file_name: resolvedVideoFile,
      video_file: resolvedVideoFile,
      voiceover_file: resolvedVoiceoverFile,
      audio_file: resolvedVoiceoverFile,
      ...(resolvedImageRef ? { image_reference: resolvedImageRef } : {}),
      start_time: sc.start_time,
      duration: Number(sc.duration) || 6,
      ...(timing
        ? {
            voice_start: timing.voiceStart,
            voice_end: timing.voiceEnd
          }
        : {}),
      camera_movement: resolvedCamera,
      camera_zoom: normalizeCameraZoom(sc.camera_zoom),
      ...(sc.camera_policy ? {camera_policy:sc.camera_policy} : {}),
      ...(sc.video_duration_mode ? {video_duration_mode:sc.video_duration_mode} : {}),
      max_extension_sec: normalizeExtension(sc.max_extension_sec),
      allow_video_reuse: sc.allow_video_reuse === true,
      ...(sc.visual_style ? { visual_style: sc.visual_style } : {}),
      transition: resolvedTransType,
      transition_duration: resolvedTransDur,
      mute_audio: resolvedMute,
      ambient_gain_db: resolvedAmbientGainDb,
      ...(sc.cta_config ? {cta_config:sc.cta_config} : {}),
      adaptive_audio: sc.adaptive_audio !== false,
      audio_ducking: sc.audio_ducking !== false,
      source_audio_enabled: sc.source_audio_enabled !== false,
      source_audio_volume: normalizeV8Volume(sc.source_audio_volume,1),
      voiceover_volume: normalizeV8Volume(sc.voiceover_volume, 1),
      ambient_volume: normalizeV8Volume(sc.ambient_volume, 0.35),
      ...(sc.ambient_audio?.trim() ? { ambient_audio: sc.ambient_audio.trim() } : {}),
      assets: {
        ...(sc.assets || {}),
        video_file: resolvedVideoFile,
        voiceover_file: resolvedVoiceoverFile,
        audio_file: resolvedVoiceoverFile,
        ...(resolvedImageRef ? { image_reference: resolvedImageRef } : {})
      },
      video_processing: {
        ...(sc.video_processing || {}),
        transition_in: {
          type: resolvedTransType,
          duration_sec: resolvedTransDur
        },
        camera_movement: resolvedCamera,
        camera_zoom: normalizeCameraZoom(sc.camera_zoom)
      },
      audio_processing: {
        ...(sc.audio_processing || {}),
        video_ambient_mute: resolvedMute,
        video_ambient_gain_db: resolvedAmbientGainDb,
        ...(sc.sfx ? { sfx: sc.sfx } : {}),
        ...(sc.sfx_gain_db !== undefined ? { sfx_gain_db: sc.sfx_gain_db } : {})
      },
      subtitles: resolvedSubtitles,
      text_overlay: sc.text_overlay?.trim() || [sc.historical_location, sc.historical_date].filter(Boolean).join('\n'),
      video_ambient_mute: resolvedMute,
      video_ambient_gain_db: resolvedAmbientGainDb,
      ...(sc.sfx_gain_db !== undefined ? { sfx_gain_db: sc.sfx_gain_db } : {}),
      ...(sc.needs_revision ? { needs_revision: true } : {}),
      ...(sc.revision_note && sc.revision_note.trim()
        ? { revision_note: sc.revision_note.trim() }
        : {}),
      ...(sc.ai_video_prompt ? { ai_video_prompt: sc.ai_video_prompt } : {}),
      ...(sc.prompt_ru ? { prompt_ru: sc.prompt_ru } : {}),
      ...(sc.sfx ? { sfx: sc.sfx } : {}),
      ...(sc.historical_date && sc.historical_date.trim()
        ? { historical_date: sc.historical_date.trim() }
        : {}),
      ...(sc.historical_location && sc.historical_location.trim()
        ? { historical_location: sc.historical_location.trim() }
        : {})
    };
  };

  const buildNormalizedManifestForScenes = (
    scenesInput: NarrativeSceneItem[]
  ): NarrativeMontageManifest => {
    const exportedScenes = scenesInput.map((sc, idx) => buildExportedSceneObject(sc, idx));
    const computedDuration = Math.round(calcTotalDurationSec(scenesInput) * 10) / 10;
    const computedDriftDiff =
      Math.round((computedDuration - effectiveMasterAudioDurationSec) * 10) / 10;
    const rhythmMapPayload =
      typeof importedRhythmMap === 'string'
        ? importedRhythmMap
        : {
            ...(importedRhythmMap || {}),
            profile: rhythmProfile,
            summary: lastAppliedDnaSummary,
            overlays: selectedOverlays
          };

    return {
      schema_version: '3.0',
      manifest_version: '2.2-FINAL',
      project_type: 'narrative_scenes_montage',
      project_name: projectName.trim() || 'Narrative Movie 4K',
      ...(youtubeSeo?.title ? { video_title: youtubeSeo.title } : {}),
      ...(chaptersYoutubeText?.trim() ? { chapters_youtube: chaptersYoutubeText.trim() } : {}),
      manifest_name: importedScenarioName || projectName.trim() || 'Narrative Movie 4K',
      rhythm_profile: rhythmProfile,
      rhythm_map: rhythmMapPayload,
      overlays: selectedOverlays,
      lower_third_style: lowerThirdStyle,
      studio_ui_presets: {
        tab_1_montage: {
          lower_third_style: lowerThirdStyle
        }
      },
      total_scenes: exportedScenes.length,
      total_duration_sec: computedDuration,
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
        duration_sec: effectiveMasterAudioDurationSec
      },
      export_settings: {
        ...normalizeV8Export(exportSettings),
        lower_third_config: normalizeBroadcastConfig(exportSettings.lower_third_config),
        brand_identity: resolveBrandIdentity(exportSettings.brand_identity, projectName.trim() || 'Narrative Movie 4K'),
        subtitles: subtitlesConfigObject
      },
      anti_desync_locks: {
        hard_frame_lock: v21Locks.hardFrameLock,
        apad_atrim_padding: v21Locks.apadAtrimLock,
        never_stretch_voiceover: v21Locks.hardFrameLock,
        continuous_voice_master: v21Locks.continuousVoiceMaster,
        zero_speech_overlap: v21Locks.zeroSpeechOverlap,
        decoupled_video_xfade_only: v21Locks.decoupledVideoXfadeOnly,
        dynamic_xfade_transitions: v21Locks.dynamicXfadeTransitions,
        acrossfade_offset_compensation: false,
        auto_mute_flagged_video_clips: v21Locks.autoMuteFlaggedClips,
        voiceover_lead_in_sec: v21Locks.voiceoverLeadInSec,
        voiceover_sentence_pad_sec: v21Locks.voiceoverSentencePadSec,
        loudnorm: {
          enabled: v21Locks.youtubeLoudnorm,
          integrated_lufs: v21Locks.integratedLufs,
          true_peak_dbtp: v21Locks.truePeakDbtp
        }
      },
      subtitles: subtitlesConfigObject,
      ...(subtitlesExportConfig
        ? {
            subtitles_export: {
              enabled:
                subtitlesExportConfig.exportSeparateSrtFiles ||
                subtitlesExportConfig.burnInVideo ||
                subtitlesConfigObject.enabled,
              burn_in_video: subtitlesExportConfig.burnInVideo,
              export_separate_srt_files: subtitlesExportConfig.exportSeparateSrtFiles,
              strict_scene_duration_lock: subtitlesExportConfig.strictSceneDurationLock,
              languages: subtitlesExportConfig.languages
            }
          }
        : {}),
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
      shorts_config: (() => {
        const activeHookTexts = shortsHookTexts
          .slice(0, shortsSliceCount)
          .map((txt, i) => txt.trim() || DEFAULT_SHORTS_HOOKS[i]);
        const primaryHook = activeHookTexts[0] || DEFAULT_SHORTS_HOOKS[0];
        return {
          enabled: shortsAutoSliceEnabled,
          count: shortsSliceCount,
          shorts_count: shortsSliceCount,
          aspect_ratio: '9:16',
          resolution: '1080x1920',
          crop_mode: 'center',
          hook_texts: activeHookTexts,
          hook_text: primaryHook,
          hook_text_en: primaryHook,
          output_dir: './output/shorts/',
          upload_to_gdrive: true
        };
      })(),
      shorts_factory: (() => {
        const activeHookTexts = shortsHookTexts
          .slice(0, shortsSliceCount)
          .map((txt, i) => txt.trim() || DEFAULT_SHORTS_HOOKS[i]);
        return {
          enabled: shortsAutoSliceEnabled,
          shorts_count: shortsSliceCount,
          hook_texts: activeHookTexts,
          hook_text: activeHookTexts[0] || DEFAULT_SHORTS_HOOKS[0]
        };
      })(),
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
        video_duration_sec: computedDuration,
        audio_duration_sec: effectiveMasterAudioDurationSec,
        diff_sec: computedDriftDiff,
        within_tolerance: Math.abs(computedDriftDiff) <= 2
      },
      ...(youtubeSeo ? { youtube_seo: youtubeSeo } : {}),
      scenes: exportedScenes,
      timeline: exportedScenes
    };
  };

  // Проверка и авто-нормализация пустых file_name (подстановка scene_001_vid.mp4) перед экспортом/отправкой
  const prepareValidatedManifestForOutput = (): NarrativeMontageManifest => {
    let filledAny = false;
    const normalizedStateScenes = narrativeScenes.map((sc, idx) => {
      const fallbackName = `scene_${String(idx + 1).padStart(3, '0')}_vid.mp4`;
      const existingName = (
        sc.file_name ||
        sc.video_file ||
        sc.assets?.video_file ||
        ''
      ).trim();
      if (existingName && sc.file_name.trim() === existingName) {
        return sc;
      }
      filledAny = true;
      const finalName = existingName || fallbackName;
      return transferSceneKey(sc, {
        ...sc,
        file_name: finalName,
        video_file: finalName,
        assets: {
          ...(sc.assets || {}),
          video_file: finalName
        }
      });
    });

    if (filledAny) {
      setNarrativeScenes(normalizedStateScenes);
    }

    onNotify(formatScenesReadyLabel(normalizedStateScenes.length), 'success');
    return buildNormalizedManifestForScenes(normalizedStateScenes);
  };

  // Полный JSON-манифест для N-сцен (схема 2.2-FINAL с одновременными scenes[] и timeline[])
  const narrativeManifest: NarrativeMontageManifest = useMemo(
    () => buildNormalizedManifestForScenes(narrativeScenes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectName,
      importedScenarioName,
      rhythmProfile,
      lastAppliedDnaSummary,
      importedRhythmMap,
      selectedOverlays,
      lowerThirdStyle,
      narrativeScenes,
      totalNarrativeDurationSec,
      gdriveFolderId,
      ambientAudio,
      masterAudio,
      effectiveMasterAudioDurationSec,
      exportSettings,
      v21Locks,
      subtitlesConfigObject,
      subtitlesExportConfig,
      chaptersYoutubeText,
      burnInSrtEnabled,
      uploadSrtToDriveEnabled,
      subtitleLanguage,
      burnInFfmpegFilter,
      shortsAutoSliceEnabled,
      shortsSliceCount,
      shortsHookTexts,
      shortsExportConfig,
      telegramBotToken,
      telegramChatId,
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

    const patchScenes = flaggedRevisionScenes.map((sc, idx) =>
      buildExportedSceneObject(sc, Math.max(0, (sc.scene_index || idx + 1) - 1))
    );
    const patchManifest = {
      schema_version: '3.0-patch',
      manifest_version: '2.2-FINAL',
      patch_mode: true,
      project_name: projectName.trim() || 'Narrative Movie 4K',
      rhythm_profile: rhythmProfile,
      overlays: selectedOverlays,
      lower_third_style: lowerThirdStyle,
      total_project_scenes: narrativeScenes.length,
      total_patch_scenes: flaggedRevisionScenes.length,
      generated_at: new Date().toISOString(),
      cloud_export: {
        target_folder_id: gdriveFolderId.trim()
      },
      scenes: patchScenes,
      timeline: patchScenes
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

  const downloadFullManifestJson = (manifestToExport: NarrativeMontageManifest) => {
    const jsonString = JSON.stringify(manifestToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = importedScenarioName
      ? importedScenarioName.replace(/\.json$/i, '') + '_export.json'
      : `scenes_manifest_${manifestToExport.total_scenes}scenes_${exportSettings.resolution}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportScenarioJson = () => {
    const manifestToExport = prepareValidatedManifestForOutput();
    downloadFullManifestJson(manifestToExport);
  };

  // Компактная облегчённая структура для GitHub workflow_dispatch (только timeline[], без дублей и справочных полей)
  const buildCompactDispatchManifest = (fullManifest: NarrativeMontageManifest) => {
    const resMap: Record<string, string> = {
      '4k': '3840x2160',
      '1080p': '1920x1080',
      '720p': '1280x720'
    };
    const effectiveExport = normalizeV8Export(exportSettings);
    const presetVal = effectiveExport.preset;

    const compactTimeline = fullManifest.timeline.map((sc, idx) => {
      const cleanedSubtitles: Record<string, string> = {};
      if (sc.subtitles && typeof sc.subtitles === 'object') {
        Object.entries(sc.subtitles).forEach(([lang, line]) => {
          if (typeof line === 'string' && line.trim()) {
            cleanedSubtitles[lang] = line.trim();
          }
        });
      }

      const compactAssets: Record<string, string> = {
        video_file: sc.assets.video_file
      };
      if (sc.assets.voiceover_file) {
        compactAssets.voiceover_file = sc.assets.voiceover_file;
      }
      if (sc.assets.image_reference) {
        compactAssets.image_reference = sc.assets.image_reference;
      }

      const compactVideoProc: Record<string, unknown> = {
        transition_in: sc.video_processing.transition_in,
        camera_movement: sc.video_processing.camera_movement,
        camera_zoom: sc.camera_zoom
      };
      if (sc.video_processing.transition_out) {
        compactVideoProc.transition_out = sc.video_processing.transition_out;
      }

      const compactAudioProc: Record<string, unknown> = {
        video_ambient_mute: sc.audio_processing.video_ambient_mute,
        video_ambient_gain_db: sc.audio_processing.video_ambient_gain_db
      };
      if (sc.audio_processing.voiceover_gain_db !== undefined) {
        compactAudioProc.voiceover_gain_db = sc.audio_processing.voiceover_gain_db;
      }
      if (sc.audio_processing.sfx) {
        compactAudioProc.sfx = sc.audio_processing.sfx;
      }
      if (sc.audio_processing.sfx_gain_db !== undefined) {
        compactAudioProc.sfx_gain_db = sc.audio_processing.sfx_gain_db;
      }

      return {
        order: idx + 1,
        scene_id: sc.scene_id,
        chapter: sc.title,
        duration_sec: sc.duration,
        camera_movement: sc.camera_movement,
        camera_zoom: normalizeCameraZoom(sc.camera_zoom),
        ...(sc.camera_policy ? {camera_policy:sc.camera_policy} : {}),
      ...(sc.video_duration_mode ? {video_duration_mode:sc.video_duration_mode} : {}),
        max_extension_sec: normalizeExtension(sc.max_extension_sec),
        allow_video_reuse: sc.allow_video_reuse === true,
        transition: normalizeV8Transition(typeof sc.transition === 'object' && sc.transition !== null ? (sc.transition as {type?: string}).type : sc.transition),
        transition_duration: sc.transition_duration,
        ...(sc.cta_config ? {cta_config:sc.cta_config} : {}),
        adaptive_audio: sc.adaptive_audio !== false,
        audio_ducking: sc.audio_ducking !== false,
        source_audio_enabled: sc.source_audio_enabled !== false,
        source_audio_volume: normalizeV8Volume(sc.source_audio_volume,1),
        voiceover_volume: sc.voiceover_volume,
        ambient_volume: sc.ambient_volume,
        ...(sc.ambient_audio ? { ambient_audio: sc.ambient_audio } : {}),
        text_overlay: sc.text_overlay,
        ...(sc.voice_start !== undefined ? { voice_start: sc.voice_start } : {}),
        ...(sc.voice_end !== undefined ? { voice_end: sc.voice_end } : {}),
        ...(sc.historical_date ? { historical_date: sc.historical_date } : {}),
        ...(sc.historical_location ? { historical_location: sc.historical_location } : {}),
        assets: compactAssets,
        video_processing: compactVideoProc,
        audio_processing: compactAudioProc,
        subtitles: cleanedSubtitles
      };
    });

    const compactExpSettings: Record<string, unknown> = {
      resolution: exportSettings.resolution,
      aspect_ratio: effectiveExport.aspect_ratio,
      video_codec: effectiveExport.video_codec,
      profile: effectiveExport.profile,
      pix_fmt: effectiveExport.pix_fmt,
      cfr: effectiveExport.cfr,
      preset: presetVal,
      draft_mode: Boolean(exportSettings.draft_mode),
      crf: effectiveExport.crf,
      fps: effectiveExport.fps,
      audio_bitrate_kbps: exportSettings.audio_bitrate_kbps,
      bitrate_mbps: effectiveExport.bitrate_mbps,
      bitrate_cap: effectiveExport.bitrate_cap,
      preview_duration_sec: effectiveExport.preview_duration_sec,
      lower_third_config: normalizeBroadcastConfig(exportSettings.lower_third_config),
      brand_identity: resolveBrandIdentity(exportSettings.brand_identity, projectName.trim() || 'Narrative Movie 4K')
    };

    const compactSubtitles: Record<string, unknown> = {
      enabled: subtitlesConfigObject.enabled,
      burn_in: burnInSrtEnabled,
      upload_srt: uploadSrtToDriveEnabled,
      language: subtitlesConfigObject.language,
      target_language: subtitleLanguage,
      srt_filename: subtitlesConfigObject.srt_filename || 'subtitles.srt',
      ...(subtitlesConfigObject.enabled && srtTextContent.trim()
        ? { srt_content: srtTextContent.trim() }
        : {})
    };

    return {
      manifest_version: '2.2-FINAL',
      project_type: 'narrative_scenes_montage',
      project_name: fullManifest.project_name,
      gdrive_folder_id: fullManifest.gdrive_folder_id,
      rhythm_profile: fullManifest.rhythm_profile,
      overlays: fullManifest.overlays,
      lower_third_style: lowerThirdStyle,
      studio_ui_presets: {
        tab_1_montage: {
          lower_third_style: lowerThirdStyle
        }
      },
      total_scenes: compactTimeline.length,
      total_duration_sec: fullManifest.total_duration_sec,
      render_settings: {
        resolution: resMap[exportSettings.resolution] || '3840x2160',
        video_codec: effectiveExport.video_codec,
        fps: effectiveExport.fps,
        crf: effectiveExport.crf,
        preset: presetVal,
        audio_bitrate: `${exportSettings.audio_bitrate_kbps}k`,
        loudness_normalization: {
          enabled: v21Locks.youtubeLoudnorm,
          target_lufs: v21Locks.integratedLufs,
          true_peak_db: v21Locks.truePeakDbtp
        }
      },
      export_settings: compactExpSettings,
      anti_desync_locks: fullManifest.anti_desync_locks,
      ...(ambientAudio.file_name.trim() ? { ambient_audio: fullManifest.ambient_audio } : {}),
      ...(masterAudio.file_name.trim() ? { master_audio: fullManifest.master_audio } : {}),
      subtitles: compactSubtitles,
      ...(fullManifest.subtitles_export ? { subtitles_export: fullManifest.subtitles_export } : {}),
      ...(shortsAutoSliceEnabled
        ? {
            shorts_config: fullManifest.shorts_config,
            shorts_factory: fullManifest.shorts_factory
          }
        : {}),
      ...(fullManifest.telegram_notifications
        ? { telegram_notifications: fullManifest.telegram_notifications }
        : {}),
      timeline: compactTimeline
    };
  };

  // Экспорт автономной интерактивной раскадровки (storyboard.html) без внешних зависимостей
  const handleExportInteractiveStoryboardHtml = () => {
    const escHtml = (str: string): string =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeProjectTitle = projectName.trim() || 'Narrative Movie 4K';
    const releaseTitle = youtubeSeo?.title?.trim() || safeProjectTitle;
    const totalDurStr = calcTotalDuration(narrativeScenes);

    const cameraLabelMap: Record<CameraVectorType, { label: string; arrow: string; color: string }> = {
      zoom_in: { label: 'ZOOM IN • Наезд', arrow: '⊕', color: '#FACC15' },
      zoom_out: { label: 'ZOOM OUT • Отъезд', arrow: '⊖', color: '#38BDF8' },
      pan_left: { label: 'PAN LEFT • Панорама ◄', arrow: '◄', color: '#34D399' },
      pan_right: { label: 'PAN RIGHT • Панорама ►', arrow: '►', color: '#A78BFA' },
      pan_up: { label: 'PAN UP • Вверх', arrow: '↑', color: '#2DD4BF' },
      pan_down: { label: 'PAN DOWN • Вниз', arrow: '↓', color: '#FB923C' },
      static: { label: 'STATIC • Статичный кадр', arrow: '•', color: '#94A3B8' }
    };

    const sceneTimingMeta: Array<{
      sc: NarrativeSceneItem;
      idx: number;
      startSec: number;
      endSec: number;
      startFmt: string;
      endFmt: string;
    }> = [];

    const storyboardTimings = computeContinuousSceneTimings(narrativeScenes);
    narrativeScenes.forEach((sc, idx) => {
      const t = storyboardTimings[idx];
      const startSec = t ? t.segStart : 0;
      const endSec = t ? t.segEnd : startSec + 6;
      sceneTimingMeta.push({
        sc,
        idx,
        startSec,
        endSec,
        startFmt: formatTimecode(startSec),
        endFmt: formatTimecode(endSec)
      });
    });

    const totalScenes = narrativeScenes.length;
    const chapterCount = Math.min(8, Math.max(2, Math.ceil(totalScenes / 3)));
    const chapterStep = Math.max(1, Math.floor(totalScenes / chapterCount));
    const chaptersNav: Array<{ timecode: string; title: string; anchorId: string }> = [];
    sceneTimingMeta.forEach((item, idx) => {
      if (idx === 0 || idx % chapterStep === 0) {
        chaptersNav.push({
          timecode: item.startFmt,
          title: toEnglishSceneTitle(item.sc, chaptersNav.length),
          anchorId: `scene-${idx + 1}`
        });
      }
    });

    const buildInlineScenePreviewSvg = (
      sc: NarrativeSceneItem,
      idx: number,
      camInfo: { label: string; arrow: string; color: string },
      startFmt: string
    ): string => {
      const huePalette = [
        ['#0f172a', '#1e1b4b', '#0e7490'],
        ['#111827', '#1e293b', '#b45309'],
        ['#090d16', '#1e1b4b', '#4338ca'],
        ['#0b1320', '#164e63', '#0f766e']
      ][idx % 4];
      const promptShort = escHtml(
        (sc.prompt_ru || sc.ai_video_prompt || sc.text_overlay || sc.file_name || 'Cinematic Frame').slice(0, 74)
      );
      const styleLabel = escHtml((sc.visual_style || 'Historical Storytelling').slice(0, 32));
      const camVec = sc.camera_movement || 'zoom_in';

      const reticleSvg =
        camVec === 'zoom_in'
          ? `<rect x="78" y="34" width="164" height="92" rx="6" fill="none" stroke="${camInfo.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.8"/><path d="M125 80 L195 80 M160 56 L160 104" stroke="${camInfo.color}" stroke-width="1.5" opacity="0.6"/>`
          : camVec === 'zoom_out'
          ? `<rect x="34" y="18" width="252" height="144" rx="8" fill="none" stroke="${camInfo.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.75"/><rect x="108" y="54" width="104" height="72" rx="4" fill="none" stroke="${camInfo.color}" stroke-width="1.5" opacity="0.5"/>`
          : camVec === 'pan_left'
          ? `<path d="M230 90 L90 90 M112 72 L90 90 L112 108" fill="none" stroke="${camInfo.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`
          : `<path d="M90 90 L230 90 M208 72 L230 90 L208 108" fill="none" stroke="${camInfo.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;

      return `<svg viewBox="0 0 320 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scene ${idx + 1}">
        <defs>
          <linearGradient id="sg-${idx}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${huePalette[0]}"/>
            <stop offset="55%" stop-color="${huePalette[1]}"/>
            <stop offset="100%" stop-color="${huePalette[2]}" stop-opacity="0.65"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#sg-${idx})"/>
        <circle cx="268" cy="36" r="46" fill="${camInfo.color}" fill-opacity="0.10"/>
        ${reticleSvg}
        <rect x="10" y="10" width="66" height="22" rx="6" fill="rgba(9,13,22,0.85)" stroke="${camInfo.color}" stroke-width="1.2"/>
        <text x="43" y="25" text-anchor="middle" fill="#F8FAFC" font-family="ui-monospace,monospace" font-size="11" font-weight="700">#${String(idx + 1).padStart(3, '0')}</text>
        <rect x="236" y="10" width="74" height="22" rx="6" fill="rgba(9,13,22,0.85)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
        <text x="273" y="25" text-anchor="middle" fill="#FDE047" font-family="ui-monospace,monospace" font-size="11" font-weight="700">${escHtml(startFmt)}</text>
        <rect x="10" y="140" width="300" height="30" rx="6" fill="rgba(8,12,20,0.82)"/>
        <text x="18" y="159" fill="#E2E8F0" font-family="system-ui,sans-serif" font-size="10.5" font-weight="600">${promptShort}</text>
        <text x="14" y="132" fill="${camInfo.color}" font-family="ui-monospace,monospace" font-size="9.5" font-weight="700">${styleLabel}</text>
      </svg>`;
    };

    const sceneCardsHtml = sceneTimingMeta
      .map(({ sc, idx, startFmt, endFmt }) => {
        const cam = sc.camera_movement || CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length];
        const camInfo = cameraLabelMap[cam] || cameraLabelMap.zoom_in;
        const dur = Math.max(0.5, Number(sc.duration) || 6);
        const searchIndex = [
          `#${idx + 1}`,
          sc.scene_id,
          sc.file_name,
          sc.text_overlay,
          sc.ai_video_prompt || '',
          sc.prompt_ru || '',
          cam
        ]
          .join(' ')
          .toLowerCase();

        return `<article id="scene-${idx + 1}" class="scene-card${
          sc.needs_revision ? ' is-revision' : ''
        }" data-search="${escHtml(searchIndex)}" data-has-file="${
          sc.file_name.trim() ? '1' : '0'
        }" data-revision="${sc.needs_revision ? '1' : '0'}" data-has-text="${
          sc.text_overlay.trim() ? '1' : '0'
        }">
          <div class="scene-thumb">
            ${buildInlineScenePreviewSvg(sc, idx, camInfo, startFmt)}
          </div>
          <div class="scene-body">
            <div class="scene-top">
              <div class="scene-badges">
                <span class="badge badge-idx">#${idx + 1} • ${escHtml(sc.scene_id)}</span>
                <span class="badge badge-time">${escHtml(startFmt)} → ${escHtml(endFmt)} (${dur}s)</span>
                <span class="badge badge-cam" style="border-color:${camInfo.color}66;color:${camInfo.color}">${camInfo.arrow} ${camInfo.label}</span>
                <span class="badge badge-trans">${escHtml(sc.transition.type)} ${sc.transition.duration_sec}s</span>
              </div>
              <label class="approve-toggle">
                <input type="checkbox" data-scene-check="${idx + 1}" />
                <span>Проверено</span>
              </label>
            </div>
            <div class="scene-file">
              <span class="lbl">Файл клипа:</span>
              <code>${escHtml(sc.file_name.trim() || 'Не привязан (ожидает медиа)')}</code>
            </div>
            ${
              sc.text_overlay.trim()
                ? `<div class="scene-voice">
                     <span class="lbl">🎙️ Озвучка / Титр:</span>
                     <p>${escHtml(sc.text_overlay)}</p>
                   </div>`
                : ''
            }
            ${
              sc.ai_video_prompt
                ? `<div class="scene-prompt">
                     <span class="lbl">🎬 AI Video Prompt:</span>
                     <p>${escHtml(sc.ai_video_prompt)}</p>
                   </div>`
                : ''
            }
            ${
              sc.sfx
                ? `<div class="scene-meta-line"><span class="lbl">🔊 SFX:</span> ${escHtml(sc.sfx)}</div>`
                : ''
            }
            ${
              sc.needs_revision
                ? `<div class="scene-revision">🔄 На пересборку: ${escHtml(
                    sc.revision_note?.trim() || 'Требует проверки перед рендером'
                  )}</div>`
                : ''
            }
          </div>
        </article>`;
      })
      .join('\n');

    const htmlDocument = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(releaseTitle)} — Интерактивная раскадровка (${narrativeScenes.length} сцен)</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080c14;
      --card: #111827;
      --card-deep: #090d16;
      --border: rgba(255,255,255,0.1);
      --gold: #FACC15;
      --gold-soft: #FDE047;
      --cyan: #22D3EE;
      --emerald: #34D399;
      --rose: #FB7185;
      --text: #F8FAFC;
      --muted: #94A3B8;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      padding: 0;
      background: radial-gradient(circle at 15% 0%, #1e1b4b 0%, var(--bg) 48%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.5;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 16px; }
    .hero {
      background: rgba(17, 24, 39, 0.88);
      border: 1px solid rgba(250, 204, 21, 0.35);
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.55);
    }
    .hero-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-soft); }
    h1 { margin: 4px 0 8px; font-size: clamp(20px, 4vw, 28px); line-height: 1.2; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; font-family: ui-monospace, monospace; font-size: 12px; }
    .stat-pill { background: var(--card-deep); border: 1px solid var(--border); border-radius: 10px; padding: 5px 10px; color: #E2E8F0; }
    .stat-pill strong { color: var(--gold-soft); }
    .chapters-box { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
    .chapters-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--cyan); margin-bottom: 8px; }
    .chapters-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .ch-link {
      display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
      background: var(--card-deep); border: 1px solid rgba(34,211,238,0.3); color: #E2E8F0;
      padding: 5px 10px; border-radius: 9px; font-size: 12px; transition: 0.15s;
    }
    .ch-link:hover { border-color: var(--cyan); color: #fff; }
    .ch-link b { color: var(--gold-soft); font-family: ui-monospace, monospace; }
    .toolbar {
      position: sticky; top: 8px; z-index: 20;
      background: rgba(9, 13, 22, 0.92); backdrop-filter: blur(12px);
      border: 1px solid var(--border); border-radius: 14px; padding: 12px;
      margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    }
    .search-input {
      flex: 1 1 220px; background: var(--card); border: 1px solid var(--border);
      color: var(--text); border-radius: 10px; padding: 9px 12px; font-size: 13px; outline: none;
    }
    .search-input:focus { border-color: var(--cyan); }
    .filter-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .f-btn {
      background: var(--card); border: 1px solid var(--border); color: var(--muted);
      border-radius: 9px; padding: 7px 11px; font-size: 12px; font-weight: 700; cursor: pointer;
    }
    .f-btn.active { background: rgba(250,204,21,0.16); border-color: var(--gold); color: var(--gold-soft); }
    .progress-tag { font-family: ui-monospace, monospace; font-size: 12px; color: var(--emerald); margin-left: auto; }
    .scenes-grid { display: flex; flex-direction: column; gap: 12px; }
    .scene-card {
      display: grid; grid-template-columns: 280px 1fr; gap: 14px;
      background: rgba(17, 24, 39, 0.86); border: 1px solid var(--border);
      border-radius: 16px; padding: 12px; transition: border-color 0.2s;
    }
    .scene-card.is-revision { border-color: rgba(251,113,133,0.6); background: rgba(76, 5, 25, 0.22); }
    .scene-card.is-checked { border-color: rgba(52,211,153,0.55); }
    .scene-thumb { aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: #090d16; }
    .scene-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .scene-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .scene-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700;
      padding: 3px 8px; border-radius: 7px; border: 1px solid var(--border); background: var(--card-deep);
    }
    .badge-idx { color: #C7D2FE; border-color: rgba(129,140,248,0.45); }
    .badge-time { color: var(--emerald); border-color: rgba(52,211,153,0.35); }
    .badge-trans { color: var(--muted); }
    .approve-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--emerald); cursor: pointer; }
    .scene-file { font-size: 12px; color: var(--muted); word-break: break-all; }
    .scene-file code { color: #FCD34D; font-family: ui-monospace, monospace; }
    .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-right: 6px; }
    .scene-voice { background: var(--card-deep); border-left: 3px solid var(--gold); border-radius: 8px; padding: 8px 10px; }
    .scene-voice p, .scene-prompt p { margin: 4px 0 0; font-size: 13.5px; color: #F1F5F9; white-space: pre-wrap; }
    .scene-prompt { background: rgba(15,23,42,0.7); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
    .scene-prompt p { font-size: 12.5px; color: #CBD5E1; }
    .scene-meta-line { font-size: 12px; color: #CBD5E1; }
    .scene-revision { background: rgba(244,63,94,0.16); border: 1px solid rgba(244,63,94,0.45); color: #FECDD3; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
    .script-details { margin-top: 12px; background: var(--card-deep); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .script-details summary { cursor: pointer; font-size: 12px; font-weight: 700; color: var(--gold-soft); }
    .script-details pre { margin: 8px 0 0; white-space: pre-wrap; font-family: inherit; font-size: 13px; color: #E2E8F0; max-height: 260px; overflow-y: auto; }
    @media (max-width: 760px) {
      .scene-card { grid-template-columns: 1fr; }
      .wrap { padding: 10px; }
      .progress-tag { margin-left: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">AETHER COMBINE • OFFLINE STORYBOARD</div>
          <h1>${escHtml(releaseTitle)}</h1>
        </div>
        <div class="stats">
          <span class="stat-pill">Сцен: <strong>${narrativeScenes.length}</strong></span>
          <span class="stat-pill">Длительность: <strong>${escHtml(totalDurStr)}</strong></span>
          <span class="stat-pill">Ритм: <strong>${escHtml(rhythmProfile)}</strong></span>
          <span class="stat-pill">Рендер: <strong>${escHtml(exportSettings.resolution.toUpperCase())} • ${exportSettings.fps}fps</strong></span>
        </div>
      </div>

      ${
        chaptersNav.length > 0
          ? `<div class="chapters-box">
               <div class="chapters-title">⏱️ Навигация по главам и таймкодам</div>
               <div class="chapters-list">
                 ${chaptersNav
                   .map(
                     ch =>
                       `<a class="ch-link" href="#${ch.anchorId}"><b>${escHtml(
                         ch.timecode
                       )}</b><span>${escHtml(ch.title)}</span></a>`
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }

      ${
        transferredScript.trim()
          ? `<details class="script-details">
               <summary>📜 Полный текст сценария (из VerbaFlow)</summary>
               <pre>${escHtml(transferredScript.trim())}</pre>
             </details>`
          : ''
      }
    </header>

    <div class="toolbar">
      <input id="sbSearch" class="search-input" type="search" placeholder="Поиск по номеру, тексту, промпту, вектору камеры..." />
      <div class="filter-row">
        <button class="f-btn active" data-filter="all" type="button">Все (${narrativeScenes.length})</button>
        <button class="f-btn" data-filter="text" type="button">С текстом</button>
        <button class="f-btn" data-filter="file" type="button">С файлом</button>
        <button class="f-btn" data-filter="revision" type="button">Пересборка</button>
      </div>
      <span id="sbProgress" class="progress-tag">Проверено: 0/${narrativeScenes.length}</span>
    </div>

    <main id="sbList" class="scenes-grid">
      ${sceneCardsHtml}
    </main>
  </div>

  <script>
    (function () {
      var cards = Array.prototype.slice.call(document.querySelectorAll('.scene-card'));
      var searchEl = document.getElementById('sbSearch');
      var btns = Array.prototype.slice.call(document.querySelectorAll('.f-btn'));
      var progressEl = document.getElementById('sbProgress');
      var activeFilter = 'all';
      var storageKey = 'aether_sb_' + ${JSON.stringify(safeProjectTitle.slice(0, 40))};
      var checkedMap = {};
      try { checkedMap = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (e) {}

      function updateProgress() {
        var count = 0;
        cards.forEach(function (card) {
          var cb = card.querySelector('input[type="checkbox"]');
          if (cb && cb.checked) count++;
        });
        if (progressEl) progressEl.textContent = 'Проверено: ' + count + '/' + cards.length;
      }

      cards.forEach(function (card) {
        var cb = card.querySelector('input[type="checkbox"]');
        if (!cb) return;
        var key = cb.getAttribute('data-scene-check');
        if (key && checkedMap[key]) {
          cb.checked = true;
          card.classList.add('is-checked');
        }
        cb.addEventListener('change', function () {
          card.classList.toggle('is-checked', cb.checked);
          if (key) {
            checkedMap[key] = cb.checked;
            try { localStorage.setItem(storageKey, JSON.stringify(checkedMap)); } catch (e) {}
          }
          updateProgress();
        });
      });

      function applyFilters() {
        var q = (searchEl ? searchEl.value : '').trim().toLowerCase();
        cards.forEach(function (card) {
          var hay = card.getAttribute('data-search') || '';
          var matchSearch = !q || hay.indexOf(q) !== -1;
          var matchFilter =
            activeFilter === 'all' ||
            (activeFilter === 'file' && card.getAttribute('data-has-file') === '1') ||
            (activeFilter === 'revision' && card.getAttribute('data-revision') === '1') ||
            (activeFilter === 'text' && card.getAttribute('data-has-text') === '1');
          card.style.display = matchSearch && matchFilter ? '' : 'none';
        });
      }

      if (searchEl) searchEl.addEventListener('input', applyFilters);
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          btns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          activeFilter = btn.getAttribute('data-filter') || 'all';
          applyFilters();
        });
      });
      updateProgress();
    })();
  </script>
</body>
</html>`;

    const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = safeProjectTitle
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'project';
    a.download = `storyboard_${slug}_${narrativeScenes.length}scenes.html`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(
      `👁️ Интерактивная раскадровка (.html, ${narrativeScenes.length} сцен) скачана — работает 100% оффлайн с любого телефона!`,
      'success'
    );
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

    const fullManifestToDispatch = prepareValidatedManifestForOutput();
    const compactManifest = buildCompactDispatchManifest(fullManifestToDispatch);
    const issues = validateManifestV8(compactManifest);
    const errors = issues.filter(issue => issue.severity === 'error');
    const warnings = issues.filter(issue => issue.severity === 'warning');
    if (errors.length) {
      onNotify('Manifest V8: '+errors.length+' ошибок. '+errors.slice(0,4).map(issue=>issue.message).join(' '), 'error');
      return;
    }
    if (warnings.length) onNotify('Manifest V8: '+warnings.length+' предупреждений. '+warnings.slice(0,3).map(issue=>issue.message).join(' '), 'info');
    const serialized = serializeCompactDispatchJson(compactManifest);

    if (serialized.exceedsLimit) {
      onNotify(
        'Манифест слишком большой для API — скачайте manifest.json и закиньте его в папку Google Drive',
        'error',
        {
          label: 'Скачать manifest.json',
          onClick: () => downloadFullManifestJson(fullManifestToDispatch)
        }
      );
      return;
    }

    const dispatchTime = new Date().getTime();

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
              manifest_payload: serialized.payload
            }
          })
        }
      );

      if (response.status === 204) {
        onStartRenderStatus(
          'Сборка успешно запущена в GitHub Actions!',
          `Workflow: render_scenes.yml (${fullManifestToDispatch.total_scenes} сцен • ${calcTotalDuration(narrativeScenes)} • ${serialized.finalLength} симв.) | Папка GDrive: ${gdriveFolderId || 'не указана'}`,
          'ZermeXX/aetherflow-render',
          dispatchTime,
          {
            workflow: 'render_scenes.yml',
            branch: (ghBranch || 'main').trim(),
            projectName: fullManifestToDispatch.project_name
          }
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
          scene.text_overlay.toLowerCase().includes(q) ||
          (scene.historical_date || '').toLowerCase().includes(q) ||
          (scene.historical_location || '').toLowerCase().includes(q)
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

  const handlePasteScenarioJson = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
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
        e.stopPropagation();
        applyNarrativeScenarioJson({ scenes: parsed }, 'clipboard_manifest.json');
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        (Array.isArray((parsed as Record<string, unknown>).timeline) ||
          Array.isArray((parsed as Record<string, unknown>).scenes) ||
          (parsed as Record<string, unknown>).manifest_version ||
          (parsed as Record<string, unknown>).project_name)
      ) {
        e.preventDefault();
        e.stopPropagation();
        applyNarrativeScenarioJson(parsed as Record<string, unknown>, 'clipboard_manifest.json');
      }
    } catch {
      // Игнорируем обычный текст в буфере обмена
    }
  };

  return (
    <div
      onPaste={handlePasteScenarioJson}
      className="bg-[#111622] border border-slate-800 rounded-2xl p-3.5 sm:p-6 space-y-5 sm:space-y-6"
    >
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
              className="bg-slate-900 border border-slate-700 focus:border-indigo-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-indigo-200 outline-none w-full sm:w-56"
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
            className="min-h-[40px] bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-500/20"
          >
            <FolderUp className="w-4 h-4" /> Загрузить JSON-сценарий (N-Сцен / 100–200+)
          </button>

          <button
            type="button"
            onClick={handleExportScenarioJson}
            className="min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" /> Экспорт JSON
          </button>

          <button
            type="button"
            onClick={handleExportInteractiveStoryboardHtml}
            className="min-h-[40px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Скачать автономный однофайловый HTML для вычитки сценария, камер и сцен с телефона перед 4K-рендером"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-300" /> 👁️ Скачать интерактивную раскадровку (.html)
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

            <label className="flex items-center gap-2 text-xs text-slate-300">
              Пауза после диктора (сек.)
              <input type="number" min={0} max={5} step={0.05}
                value={v21Locks.voiceoverSentencePadSec}
                onChange={e => setV21Locks(prev => ({ ...prev, voiceoverSentencePadSec: Math.min(5, Math.max(0, Number(e.target.value) || 0)) }))}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
            </label>
            {/* б) Мастер-аудиодорожка (озвучка / саундтрек) с полями таймкода старта и громкости */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <label className="text-[11px] font-bold text-amber-300 block">
                б) Мастер-аудиодорожка (озвучка / саундтрек):
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={masterAudio.file_name}
                  onChange={e => {
                    const nextName = e.target.value;
                    if (!nextName.trim()) {
                      setMasterAudioFile(null);
                    }
                    setMasterAudio(prev => ({ ...prev, file_name: nextName }));
                  }}
                  placeholder="Напр.: master_voiceover.wav или выберите локальный файл →"
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-2 text-xs font-mono text-amber-300 outline-none"
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
                  className="min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
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
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Длительность превью (0 = весь фильм)</label>
              <input type="number" min={0} step={1} value={exportSettings.preview_duration_sec ?? 0}
                onChange={e => setExportSettings(prev => ({ ...prev, preview_duration_sec: Math.max(0, Number(e.target.value) || 0) }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100" />
            </div>
            {(() => {
              const cfg = normalizeBroadcastConfig(exportSettings.lower_third_config);
              const patch = (next: Partial<BroadcastConfig>) => setExportSettings(prev => ({ ...prev, lower_third_config: normalizeBroadcastConfig({ ...normalizeBroadcastConfig(prev.lower_third_config), ...next }) }));
              const sample = narrativeScenes.find(sc => sc.text_overlay?.trim() || sc.historical_location || sc.historical_date);
              const lines = (sample?.text_overlay?.trim() || [sample?.historical_location, sample?.historical_date].filter(Boolean).join('\n') || 'UPANO VALLEY\n500 BC – 600 AD').split('\n');
              return <div className="border border-amber-500/30 rounded-lg p-3 space-y-2 text-xs text-slate-200">
                <div className="flex items-center justify-between"><strong>HISTOVIVA Broadcast V8</strong>
                  <label><input type="checkbox" checked={cfg.enabled} onChange={e => patch({enabled:e.target.checked})}/> Включить</label></div>
                <div className="aspect-video bg-slate-800 flex items-end p-[5%]">
                  {cfg.enabled && <div className="w-full flex border border-amber-500 text-white" style={{backgroundColor:'rgba('+cfg.bar_bg_rgba.slice(0,3).join(',')+','+cfg.bar_bg_rgba[3]/255+')'}}>
                    <div className="bg-gradient-to-br from-red-800 to-red-950 w-[12%] flex items-center justify-center text-amber-300 font-serif text-lg">H</div>
                    <div className="flex-1 px-2 py-1 border-l border-amber-500"><div className="font-bold uppercase truncate">{lines[0]}</div><div className="text-amber-200 text-[10px] truncate">{lines[1] || ''}</div></div>
                  </div>}
                </div>
                <div className="text-[10px] text-slate-400">Схематичный предпросмотр; эмблема H — условный знак.</div>
                <label className="block">Файл эмблемы <input className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" value={cfg.emblem_path} onChange={e=>patch({emblem_path:e.target.value})}/></label>
                <div className="grid grid-cols-3 gap-2">
                  <label>Начало, сек.<input className="w-full bg-slate-950 rounded" type="number" min={0} step={0.1} value={cfg.show_sec[0]} onChange={e=>patch({show_sec:[Number(e.target.value),cfg.show_sec[1]]})}/></label>
                  <label>Конец, сек.<input className="w-full bg-slate-950 rounded" type="number" min={0} step={0.1} value={cfg.show_sec[1]} onChange={e=>patch({show_sec:[cfg.show_sec[0],Number(e.target.value)]})}/></label>
                  <label>Анимация, сек.<input className="w-full bg-slate-950 rounded" type="number" min={0} step={0.05} value={cfg.anim_sec} onChange={e=>patch({anim_sec:Number(e.target.value)})}/></label>
                </div>
                <label className="flex items-center gap-2">Фон <input type="color" value={'#'+cfg.bar_bg_rgba.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')} onChange={e=>patch({bar_bg_rgba:[parseInt(e.target.value.slice(1,3),16),parseInt(e.target.value.slice(3,5),16),parseInt(e.target.value.slice(5,7),16),cfg.bar_bg_rgba[3]]})}/></label>
                <label className="flex items-center gap-2">Непрозрачность фона <input type="range" min={0} max={255} value={cfg.bar_bg_rgba[3]} onChange={e=>patch({bar_bg_rgba:[cfg.bar_bg_rgba[0],cfg.bar_bg_rgba[1],cfg.bar_bg_rgba[2],Number(e.target.value)]})}/>{Math.round(cfg.bar_bg_rgba[3]/255*100)}%</label>
              </div>;
            })()}
            {(() => {
              const cfg = normalizeBrandIdentity(exportSettings.brand_identity);
              const resolved = resolveBrandIdentity(cfg, projectName.trim() || 'Narrative Movie 4K');
              const patch = (next: Partial<BrandIdentityConfig>) => setExportSettings(prev => ({ ...prev, brand_identity: { ...normalizeBrandIdentity(prev.brand_identity), ...next } }));
              return <div className="border border-amber-500/30 rounded-lg p-3 space-y-2 text-xs text-slate-200">
                <strong>HISTOVIVA Brand Identity V8</strong>
                <div className="aspect-video bg-slate-800 flex justify-end items-start p-[3%]">
                  {resolved.enabled && <div className="w-[34%] flex items-center gap-2 rounded border border-white/40 bg-slate-700/60 p-2">
                    <div className="text-amber-300 font-serif text-xl shrink-0">H</div>
                    <div className="min-w-0"><div className="font-bold uppercase truncate">{resolved.name}</div><div className="text-[9px] uppercase truncate">{resolved.episode_label}</div></div>
                  </div>}
                </div>
                <label className="block">Режим брендинга
                  <select className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" value={cfg.enabled === undefined ? 'auto' : cfg.enabled ? 'on' : 'off'} onChange={e=>patch({enabled:e.target.value === 'auto' ? undefined : e.target.value === 'on'})}>
                    <option value="auto">Авто — проекты HISTOVIVA</option><option value="on">Включён</option><option value="off">Выключен</option>
                  </select>
                </label>
                <label className="block">Название канала<input className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" value={cfg.name} onChange={e=>patch({name:e.target.value})}/></label>
                <label className="block">Номер и название эпизода<input className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1" value={cfg.episode_label} placeholder={resolveBrandIdentity({...cfg,episode_label:''},projectName).episode_label} onChange={e=>patch({episode_label:e.target.value})}/></label>
                <div className="text-[10px] text-slate-400">Пустое название эпизода — авто из имени проекта. Эмблема общая с Broadcast V8: {normalizeBroadcastConfig(exportSettings.lower_third_config).emblem_path}. H в предпросмотре — условный знак. Брендинг независим от нижней плашки.</div>
              </div>;
            })()}
            <div className="border border-indigo-500/40 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-indigo-200">Export Profiles V8 · H.264 / 16:9</div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(V8_EXPORT_PROFILES) as (keyof typeof V8_EXPORT_PROFILES)[]).map(key => <button key={key} type="button" className="bg-slate-800 rounded p-2 text-xs text-slate-100" onClick={()=>setExportSettings(prev=>normalizeV8Export({...prev,...V8_EXPORT_PROFILES[key],bitrate_cap:'on',preview_duration_sec:0}))}>{key} · {V8_EXPORT_PROFILES[key].resolution} · CRF {V8_EXPORT_PROFILES[key].crf}</button>)}
              </div>
              <label className="block text-xs text-slate-300">Preset <select className="bg-slate-900 rounded p-1" value={normalizeV8Export(exportSettings).preset} onChange={e=>setExportSettings(prev=>normalizeV8Export({...prev,preset:e.target.value as NarrativeExportSettings['preset']}))}><option value="ultrafast">ultrafast</option><option value="veryfast">veryfast</option><option value="medium">medium</option></select></label>
              <label className="text-xs text-slate-300"><input type="checkbox" checked={exportSettings.bitrate_cap !== 'off'} onChange={e=>setExportSettings(prev=>({...prev,bitrate_cap:e.target.checked?'on':'off'}))}/> Ограничение битрейта (пиковый лимит ≈ 130% указанного)</label>
              <div className="text-[10px] text-slate-400">Master: H.264, YUV420P, CFR. Preview: 1280×720. Audio: AAC stereo 48 kHz. H.265 и вертикальный Master не поддерживаются текущим Render V8.</div>
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
                      preset: res === '720p' ? 'ultrafast' : 'veryfast',
                      video_codec: 'libx264'
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
                  value="16:9"
                  disabled
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                >
                  <option value="16:9">16:9 Горизонтальный</option>
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
                <option value={24}>24 fps (Cinema CFR)</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            {/* Авто-блокировки непрерывного голоса, декупленного FFmpeg xfade и LUFS v2.2-FINAL */}
            <div className="bg-[#080c14]/90 border border-white/[0.08] rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-cyan-300">
                  v2.2-FINAL Pipeline Locks • Continuous Voice &amp; Decoupled FFmpeg xfade
                </span>
                <span className="text-[10px] font-mono text-white/55">
                  {exportSettings.video_codec} • {(exportSettings.profile || 'high').toUpperCase()} • CRF {exportSettings.crf} • {exportSettings.pix_fmt || 'yuv420p'} • {exportSettings.fps}fps CFR
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                <label className="flex items-center gap-2 bg-[#111827]/85 border border-white/[0.08] rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      v21Locks.continuousVoiceMaster &&
                      v21Locks.zeroSpeechOverlap &&
                      v21Locks.hardFrameLock
                    }
                    onChange={e =>
                      setV21Locks(prev => ({
                        ...prev,
                        hardFrameLock: e.target.checked,
                        apadAtrimLock: e.target.checked,
                        continuousVoiceMaster: e.target.checked,
                        zeroSpeechOverlap: e.target.checked
                      }))
                    }
                    className="accent-cyan-400 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-slate-200 leading-tight">
                    Continuous Voice Master (Zero Overlap) •{' '}
                    <code className="text-cyan-300">200ms adelay + 350ms apad</code>
                  </span>
                </label>

                <label className="flex items-center gap-2 bg-[#111827]/85 border border-white/[0.08] rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={v21Locks.dynamicXfadeTransitions && v21Locks.decoupledVideoXfadeOnly}
                    onChange={e =>
                      setV21Locks(prev => ({
                        ...prev,
                        dynamicXfadeTransitions: e.target.checked,
                        decoupledVideoXfadeOnly: e.target.checked
                      }))
                    }
                    className="accent-indigo-400 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-slate-200 leading-tight">
                    Dynamic <code className="text-indigo-300">xfade</code> Transitions (Video-Only • Decoupled in 350ms Pause)
                  </span>
                </label>

                <label className="flex items-center gap-2 bg-[#111827]/85 border border-white/[0.08] rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={v21Locks.autoMuteFlaggedClips}
                    onChange={e =>
                      setV21Locks(prev => ({
                        ...prev,
                        autoMuteFlaggedClips: e.target.checked
                      }))
                    }
                    className="accent-rose-400 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-slate-200 leading-tight">
                    Auto-Mute Flagged Clips (<code className="text-rose-300">-96 dB</code> mute / <code className="text-amber-300">-22 dB</code> amb / <code className="text-emerald-300">-6 dB</code> SFX)
                  </span>
                </label>

                <label className="flex items-center gap-2 bg-[#111827]/85 border border-white/[0.08] rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={v21Locks.youtubeLoudnorm}
                    onChange={e =>
                      setV21Locks(prev => ({
                        ...prev,
                        youtubeLoudnorm: e.target.checked
                      }))
                    }
                    className="accent-emerald-400 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-slate-200 leading-tight">
                    -14.0 LUFS Normalization (<code className="text-emerald-300">{v21Locks.integratedLufs.toFixed(1)} LUFS • {v21Locks.truePeakDbtp.toFixed(1)} dBTP</code>)
                  </span>
                </label>
              </div>
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
              <div className="flex flex-wrap items-center gap-1.5">
                {isPerSceneVoiceMode && (
                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
                    Авто-синхронизация по {perSceneVoiceStats.voiceScenesCount} сценам (Zero Overlap)
                  </span>
                )}
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
                  {isPerSceneVoiceMode
                    ? 'Сумма посегментного аудио (сек):'
                    : 'Длительность мастер-аудио (сек):'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={36000}
                  step={0.1}
                  value={effectiveMasterAudioDurationSec}
                  readOnly={isPerSceneVoiceMode}
                  onChange={e => {
                    if (isPerSceneVoiceMode) return;
                    setMasterAudioDurationSec(Math.max(1, Number(e.target.value) || 60));
                  }}
                  className={`w-full bg-slate-950 border rounded-lg px-2 py-1 text-xs font-mono font-bold outline-none ${
                    isPerSceneVoiceMode
                      ? 'border-emerald-500/40 text-emerald-300'
                      : 'border-slate-700 text-amber-300'
                  }`}
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
                {isPerSceneVoiceMode
                  ? `Посегментный режим: сумма ${perSceneVoiceStats.voiceScenesCount} сцен с паузами +${(
                      v21Locks.voiceoverSentencePadSec || VOICEOVER_SENTENCE_PAD_SEC
                    ).toFixed(2)}с = ${effectiveMasterAudioDurationSec} сек.`
                  : 'Автоматический контроль длины 100–150+ сцен против хронометража дикторской озвучки.'}
              </span>
              <button
                type="button"
                onClick={syncScenesDurationToMasterAudio}
                className="min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-semibold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Подогнать сцены под аудио ({effectiveMasterAudioDurationSec}с)
              </button>
            </div>
          </div>

          {/* 2. АВТО-НАРЕЗКА SHORTS (9:16 • 1080x1920 • ./output/shorts/) */}
          <div className="bg-[#0b0f19]/90 backdrop-blur-md border border-[rgba(255,255,255,0.08)] rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  ✨ Авто-нарезка Shorts (9:16 • 1080×1920 • Центрированный кроп)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-400/30 text-amber-300 px-2 py-0.5 rounded">
                ./output/shorts/ → Google Drive
              </span>
            </div>

            <label className="flex items-center gap-2.5 bg-[#111827]/85 border border-[rgba(255,255,255,0.08)] hover:border-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-amber-200 cursor-pointer select-none transition">
              <input
                type="checkbox"
                checked={shortsAutoSliceEnabled}
                onChange={e => setShortsAutoSliceEnabled(e.target.checked)}
                className="accent-amber-500 w-4 h-4 shrink-0"
              />
              <span>Сгенерировать 2–3 вирусных Shorts (9:16) из лучших сцен</span>
            </label>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Количество Shorts:
                </label>
                <select
                  value={shortsSliceCount}
                  onChange={e => setShortsSliceCount(Number(e.target.value) as 2 | 3)}
                  className="w-full sm:w-64 bg-[#111827] border border-[rgba(255,255,255,0.08)] focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                >
                  <option value={2}>2 вирусных клипа (9:16)</option>
                  <option value={3}>3 вирусных клипа (9:16)</option>
                </select>
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      idx: 0,
                      label: 'ХУК #1 (SHORT 01 — НАЧАЛО / ИНТРИГА):',
                      placeholder: 'WAIT FOR THE 14TH SECOND...'
                    },
                    {
                      idx: 1,
                      label: 'ХУК #2 (SHORT 02 — КУЛЬМИНАЦИЯ):',
                      placeholder: 'NOBODY COULD EXPLAIN THIS...'
                    },
                    {
                      idx: 2,
                      label: 'ХУК #3 (SHORT 03 — РАЗГАДКА / ФИНАЛ):',
                      placeholder: 'THE TRUTH WAS BURIED HERE...'
                    }
                  ] as const
                )
                  .slice(0, shortsSliceCount)
                  .map(hookMeta => (
                    <div key={hookMeta.idx}>
                      <label className="text-[10px] text-slate-400 uppercase block mb-1">
                        {hookMeta.label}
                      </label>
                      <input
                        type="text"
                        value={shortsHookTexts[hookMeta.idx]}
                        onChange={e => {
                          const nextVal = e.target.value;
                          setShortsHookTexts(prev => {
                            const updated: [string, string, string] = [prev[0], prev[1], prev[2]];
                            updated[hookMeta.idx] = nextVal;
                            return updated;
                          });
                        }}
                        placeholder={hookMeta.placeholder}
                        className="w-full bg-[#111827] border border-[rgba(255,255,255,0.08)] focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none"
                      />
                    </div>
                  ))}
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-[#0b0f19] border border-[rgba(255,255,255,0.08)] rounded-lg px-2.5 py-1.5">
              FFmpeg: <code className="text-amber-300">crop=ih*9/16:ih,scale=1080:1920</code> + {shortsSliceCount} индивидуальных хук-титра → сохранение в <code className="text-emerald-300">./output/shorts/</code> и выгрузка в Google Drive.
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
              className="min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
            >
              📎 Прикрепить .srt / текстовый скрипт
            </button>
            <button
              type="button"
              onClick={generateSrtFromScenes}
              className="min-h-[40px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
            >
              ⚡ Перевести и сгенерировать .SRT ({getShortSubtitleLangCode(subtitleLanguage)})
            </button>
            <button
              type="button"
              onClick={handleDownloadSrtFile}
              className="min-h-[40px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
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

          <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 space-y-2 text-[11px] font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">
                Активный профиль: <strong className="text-emerald-400">{lastAppliedDnaSummary}</strong>
              </span>
              <span className="text-indigo-300 tabular-nums">
                Сцен: <AnimatedNumber value={narrativeScenes.length} /> • Хронометраж:{' '}
                <AnimatedDurationText totalSeconds={totalNarrativeDurationSec} />
              </span>
            </div>

            {/* Живая визуальная полоса Ритм-карты (плавно анимируется при перетаскивании сцен) */}
            {narrativeScenes.length > 0 && (
              <div
                className="flex items-center gap-0.5 h-3 w-full rounded-md bg-[#090D16] p-0.5 overflow-hidden border border-white/[0.06]"
                title="Визуальная Ритм-карта последовательности сцен и векторов камеры"
              >
                {narrativeScenes.slice(0, 80).map((sc, idx) => {
                  const dur = Math.max(0.5, Number(sc.duration) || 6);
                  const cam = sc.camera_movement || CAMERA_VECTORS_ORDER[idx % CAMERA_VECTORS_ORDER.length];
                  const colorClass =
                    cam === 'zoom_in'
                      ? 'bg-amber-400/80'
                      : cam === 'zoom_out'
                      ? 'bg-sky-400/80'
                      : cam === 'pan_left'
                      ? 'bg-emerald-400/80'
                      : 'bg-indigo-400/80';
                  return (
                    <motion.div
                      key={getSceneRowKey(sc)}
                      layout
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      style={{ flexGrow: dur }}
                      className={`h-full rounded-[2px] min-w-[2px] ${colorClass}`}
                      title={`#${idx + 1} ${sc.scene_id} (${sc.start_time}) • ${dur}с • ${cam}`}
                    />
                  );
                })}
              </div>
            )}
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
              const isLowerThirds = layer.id === 'lower_thirds';
              return (
                <div
                  key={layer.id}
                  className={`w-full rounded-xl border transition-all overflow-hidden ${
                    active
                      ? 'bg-amber-500/15 border-amber-400/70 text-slate-100 shadow-sm'
                      : 'bg-[#111827]/80 border-[rgba(255,255,255,0.08)] text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleOverlayPreset(layer.id)}
                    className="w-full p-2.5 text-left flex items-start justify-between gap-2 cursor-pointer"
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

                  {isLowerThirds && active && (
                    <div className="px-2.5 pb-2.5 pt-2 border-t border-[rgba(255,255,255,0.08)] bg-[#0b0f19]/80 backdrop-blur-md space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
                          Стиль новостной плашки (Lower Third):
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-[#111827] border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded">
                          {lowerThirdStyle}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {LOWER_THIRD_STYLE_PRESETS.map(styleOpt => {
                          const isSelected = lowerThirdStyle === styleOpt.id;
                          return (
                            <button
                              key={styleOpt.id}
                              type="button"
                              onClick={() => setLowerThirdStyle(styleOpt.id)}
                              title={styleOpt.desc}
                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer space-y-1.5 ${
                                isSelected
                                  ? 'bg-[#111827] border-amber-400/80 text-slate-100 shadow-sm shadow-amber-500/10'
                                  : 'bg-[#0b0f19]/90 border-[rgba(255,255,255,0.08)] text-slate-400 hover:border-white/20 hover:text-slate-200'
                              }`}
                            >
                              {/* Мини-превью стиля плашки */}
                              <div className="h-5 flex items-center">
                                {styleOpt.id === 'rossiya24' && (
                                  <div className="inline-flex items-stretch h-3.5 rounded-sm overflow-hidden border border-white/15 w-full">
                                    <span className="bg-red-600 w-[34%] flex items-center justify-center text-[7px] font-bold text-white tracking-tight">
                                      575 BC
                                    </span>
                                    <span className="bg-blue-700 flex-1 flex items-center px-1 text-[7px] font-semibold text-white truncate">
                                      BABYLON
                                    </span>
                                  </div>
                                )}
                                {styleOpt.id === 'ictv' && (
                                  <div className="inline-flex flex-col w-full rounded-sm overflow-hidden border border-white/15">
                                    <span className="bg-orange-500 h-1.5 w-[55%] block" />
                                    <span className="bg-[#0d1f4b] h-2.5 w-full flex items-center px-1 text-[7px] font-semibold text-white truncate">
                                      575 BC • BABYLON
                                    </span>
                                  </div>
                                )}
                                {styleOpt.id === 'sky_news' && (
                                  <div className="inline-flex items-stretch h-3.5 rounded-sm overflow-hidden bg-white/10 backdrop-blur-md border border-white/25 w-full">
                                    <span className="bg-red-600 w-3.5 shrink-0 block" />
                                    <span className="flex-1 flex items-center px-1.5 text-[7px] font-semibold text-slate-100 truncate">
                                      575 BC • BABYLON
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-slate-100 leading-tight">
                                  {styleOpt.label}
                                </span>
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                )}
                              </div>
                              <p className="text-[9.5px] leading-snug text-slate-400">
                                {styleOpt.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
                Всего сцен:{' '}
                <strong className="text-indigo-300">
                  <AnimatedNumber value={narrativeScenes.length} />
                </strong>
                <span className="text-slate-500 text-[10px] ml-1">
                  (заполнено: <AnimatedNumber value={filledScenesCount} />)
                </span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Расчетный хронометраж:{' '}
                <strong className="text-amber-300">
                  <AnimatedDurationText totalSeconds={totalNarrativeDurationSec} />
                </strong>{' '}
                <span className="text-slate-400 text-[10px]">
                  ({(totalNarrativeDurationSec / 60).toFixed(1)} мин /{' '}
                  <AnimatedNumber value={Math.round(totalNarrativeDurationSec)} /> сек)
                </span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                На пересборку:{' '}
                <strong className={flaggedRevisionScenes.length > 0 ? 'text-rose-400' : 'text-slate-400'}>
                  <AnimatedNumber value={flaggedRevisionScenes.length} />
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
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
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
              className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 80 сцен (~8 минут)"
            >
              80 сцен (~8м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(120)}
              className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 120 сцен (~12 минут)"
            >
              120 сцен (~12м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(160)}
              className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 160 сцен (~16 минут)"
            >
              160 сцен (~16м)
            </button>
            <button
              type="button"
              onClick={() => generateNScenesTemplate(200)}
              className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition cursor-pointer"
              title="Сгенерировать каркас на 200 сцен"
            >
              200 сцен
            </button>

            <div className="min-h-[40px] flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
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
                className="min-h-[32px] px-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                Задать N
              </button>
            </div>

            <button
              type="button"
              onClick={addScene}
              className="min-h-[40px] bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> +1 сцена
            </button>

            <button
              type="button"
              onClick={() =>
                setNarrativeScenes(prev => prev.map(s => ({ ...s, file_name: '' })))
              }
              className="min-h-[40px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-300 px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
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
            {!searchQuery.trim() && narrativeScenes.length <= 220 ? (
              <span>⋮⋮ Потяните сцену за ручку для смены порядка ({totalRows} сцен)</span>
            ) : (
              <span>
                Отображаются строки: {totalRows > 0 ? startRowIdx + 1 : 0}–{endRowIdx} из {totalRows} (Виртуализация DOM активна)
              </span>
            )}
          </span>
        </div>

        {/* Горизонтальный контейнер для узких экранов (< 960px) чтобы строки 12-колонной таблицы не сжимались */}
        <div className="overflow-x-auto custom-scroll border border-slate-800 rounded-xl bg-[#090d16]">
          <div className="min-w-[960px]">
            {/* Шапка колонок компактной строчной таблицы */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <div className="col-span-2">⋮⋮ № / ID / Камера</div>
              <div className="col-span-3">Видеофайл (file_name)</div>
              <div className="col-span-2 text-center">Voice Bounds &amp; Длит.</div>
              <div className="col-span-2">Переход (Video) / Титр</div>
              <div className="col-span-3">🔄 На пересборку &amp; Заметка</div>
            </div>

            {/* Таймлайн сцен с Drag-to-Reorder (Motion Reorder.Group) или виртуализацией при поиске / >220 сцен */}
            <div
              ref={scrollContainerRef}
              onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
              style={{ height: `${VIEWPORT_HEIGHT}px` }}
              className="overflow-y-auto custom-scroll bg-[#090d16]"
            >
              {!searchQuery.trim() && narrativeScenes.length <= 220 ? (
                <Reorder.Group
                  axis="y"
                  values={sceneKeys}
                  onReorder={handleReorderScenesByKeys}
                  as="div"
                  className="divide-y divide-slate-800/70"
                >
                  {narrativeScenes.map((sc, idx) => {
                    const rowKey = getSceneRowKey(sc);
                    const t = continuousSceneTimings[idx];
                    return (
                      <DraggableSceneRow
                        key={rowKey}
                        rowKey={rowKey}
                        sc={sc}
                        idx={idx}
                        fps={exportSettings.fps}
                        voiceStartSec={t ? t.voiceStart : 0}
                        voiceEndSec={t ? t.voiceEnd : Number(sc.duration) || 6}
                        zeroSpeechOverlap={
                          v21Locks.continuousVoiceMaster && v21Locks.zeroSpeechOverlap
                        }
                        canDrag={true}
                        updateScene={updateScene}
                        removeScene={removeScene}
                        onCopyPrompt={(sceneIdx, prompt) => {
                          navigator.clipboard.writeText(prompt);
                          onNotify(`📋 Промпт сцены #${sceneIdx + 1} скопирован в буфер`, 'success');
                        }}
                        onDragEndNotify={handleSceneDragEndNotify}
                      />
                    );
                  })}
                </Reorder.Group>
              ) : (
                <div style={{ paddingTop: `${topSpacerHeight}px`, paddingBottom: `${bottomSpacerHeight}px` }}>
                  {visibleSlice.map(({ scene: sc, originalIndex: idx }) => {
                    const rowKey = getSceneRowKey(sc);
                    const t = continuousSceneTimings[idx];
                    return (
                      <DraggableSceneRow
                        key={rowKey}
                        rowKey={rowKey}
                        sc={sc}
                        idx={idx}
                        fps={exportSettings.fps}
                        voiceStartSec={t ? t.voiceStart : 0}
                        voiceEndSec={t ? t.voiceEnd : Number(sc.duration) || 6}
                        zeroSpeechOverlap={
                          v21Locks.continuousVoiceMaster && v21Locks.zeroSpeechOverlap
                        }
                        canDrag={false}
                        updateScene={updateScene}
                        removeScene={removeScene}
                        onCopyPrompt={(sceneIdx, prompt) => {
                          navigator.clipboard.writeText(prompt);
                          onNotify(`📋 Промпт сцены #${sceneIdx + 1} скопирован в буфер`, 'success');
                        }}
                        onDragEndNotify={handleSceneDragEndNotify}
                      />
                    );
                  })}
                </div>
              )}
            </div>
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
              onClick={handleExportInteractiveStoryboardHtml}
              className="min-h-[44px] flex items-center gap-2 bg-[#111827] hover:bg-slate-800 border border-cyan-400/45 text-cyan-200 font-bold px-4 py-3 rounded-xl transition text-xs cursor-pointer"
            >
              <Eye className="w-4 h-4 text-cyan-300" />
              <span>👁️ Раскадровка (.html)</span>
            </button>

            <button
              type="button"
              onClick={startNarrativeScenesRender}
              disabled={isDispatching || isRunnerBusy}
              className={`min-h-[44px] flex items-center gap-2.5 font-bold px-6 py-3 rounded-xl shadow-lg transition text-xs ${
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
                className="min-h-[44px] flex items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 hover:bg-indigo-500/25 px-3.5 py-3 text-xs font-mono font-semibold text-indigo-200 transition"
              >
                <span>GitHub Run</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
