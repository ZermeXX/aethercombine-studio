/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TerminalLogEntry } from '../components/StudioTerminal';

export const AETHER_GOOGLE_AUTH_STORAGE_KEY = 'aether_google_auth';
export const AETHER_WORKSPACE_DRAFT_STORAGE_KEY = 'aether_workspace_draft';
export const AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY = 'aether_active_render_job';

/** Minimum remaining validity window (3 minutes) before attempting silent token refresh. */
export const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 3 * 60 * 1000;

export interface AetherGoogleProfile {
  email: string;
  name: string;
  avatar: string;
  uid?: string;
}

export interface AetherGoogleAuthRecord {
  access_token: string;
  expires_at: number;
  profile: AetherGoogleProfile | null;
  github_token: string;
  repo: string;
  branch: string;
  drive_folder_id: string;
  updated_at?: number;
}

export interface AetherActiveRenderJob {
  status: 'running' | 'success' | 'failure';
  repo: string;
  workflow: string;
  branch: string;
  started_at: number;
  run_id: number | null;
  project_name: string;
  logs: TerminalLogEntry[];
  title?: string;
  desc?: string;
  step_label?: string;
  run_url?: string;
}

export interface AetherCombineDraftSlice {
  project_name?: string;
  rhythm_profile?: 'historical_storytelling' | 'ambient_meditative' | 'custom_dna';
  dna_reference_input?: string;
  last_applied_dna_summary?: string;
  selected_overlays?: string[];
  lower_third_style?: string;
  narrative_scenes?: unknown[];
  ambient_audio?: Record<string, unknown>;
  master_audio?: Record<string, unknown>;
  master_audio_duration_sec?: number;
  burn_in_srt_enabled?: boolean;
  upload_srt_to_drive_enabled?: boolean;
  subtitle_language?: string;
  srt_filename?: string;
  srt_text_content?: string;
  shorts_auto_slice_enabled?: boolean;
  shorts_slice_count?: 2 | 3;
  shorts_hook_texts?: [string, string, string];
  export_settings?: Record<string, unknown>;
  v21_locks?: Record<string, unknown>;
}

export interface AetherWorkspaceDraft {
  version: number;
  updated_at: number;
  project: {
    name: string;
    active_format_preset: 'histoviva_doc' | 'ambient_loop_3h';
    thumb_title: string;
    thumb_badge: string;
    seo_script_text: string;
    verbaflow_chapters_txt: string;
    ambient_loop_enabled: boolean;
    end_screen_safe_zone: string;
    manifest_duration_badge: string;
  };
  verbaflow: {
    source_text: string;
  };
  combine?: AetherCombineDraftSlice;
  render_settings: {
    timeline_slots: unknown[];
    video_codec: 'libx265' | 'libx264';
    video_crf: number;
    video_fps: 24 | 30 | 60;
    audio_bitrate_kbps: 320 | 256 | 192;
    act_crossfade_sec: number;
    internal_loop_crossfade_sec: number;
    final_black_screen_enabled: boolean;
    final_black_screen_sec: number;
    audio_mastering: Record<string, unknown>;
    continuous_bed: Record<string, unknown>;
    loop_master_audio: Record<string, unknown>;
    seamless_asymmetry: Record<string, unknown>;
    loop_hours: number;
    loop_resolution: '720p' | '1080p' | '2k' | '4k';
    loop_draft_mode: boolean;
    bitrate_preset: 'standard' | 'cinema' | 'eco';
    seamless_transition_mode: 'crossfade' | 'pingpong';
    seamless_stitch_enabled: boolean;
    crossfade_duration: number;
    audio_crossfade_duration: number;
    audio_crossfade_enabled: boolean;
    use_embedded_audio: boolean;
    expected_video_filename: string;
    expected_audio_filename: string;
    loop_burn_in_subtitles: boolean;
    loop_upload_srt_to_drive: boolean;
    loop_subtitle_language: 'en' | 'ru' | 'es' | 'de' | 'fr' | 'original';
    loop_srt_custom_content: string;
    shorts_factory_enabled: boolean;
    strict_scene_duration_lock: boolean;
    sidecar_burn_in_video: boolean;
    export_separate_srt_files: boolean;
    selected_subtitle_languages: string[];
    render_specs_summary: string;
    export_output_chapters_enabled: boolean;
    export_release_card_md_enabled: boolean;
  };
}

const DEFAULT_GOOGLE_AUTH_RECORD: AetherGoogleAuthRecord = {
  access_token: '',
  expires_at: 0,
  profile: null,
  github_token: '',
  repo: 'ZermeXX/aetherflow-render',
  branch: 'main',
  drive_folder_id: '1OuuxKa85KAR-zz9TFXv6Ccg99fZ6JpuK'
};

export function loadGoogleAuthRecord(): AetherGoogleAuthRecord {
  try {
    const raw = localStorage.getItem(AETHER_GOOGLE_AUTH_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_GOOGLE_AUTH_RECORD,
        github_token: localStorage.getItem('ac_gh_token') || '',
        repo: localStorage.getItem('ac_gh_repo') || DEFAULT_GOOGLE_AUTH_RECORD.repo,
        branch: localStorage.getItem('ac_gh_branch') || DEFAULT_GOOGLE_AUTH_RECORD.branch,
        drive_folder_id:
          localStorage.getItem('ac_gdrive_folder_id') || DEFAULT_GOOGLE_AUTH_RECORD.drive_folder_id
      };
    }
    const parsed = JSON.parse(raw) as Partial<AetherGoogleAuthRecord> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_GOOGLE_AUTH_RECORD };
    }
    const profile: AetherGoogleProfile | null =
      parsed.profile && typeof parsed.profile === 'object'
        ? {
            email: typeof parsed.profile.email === 'string' ? parsed.profile.email : '',
            name: typeof parsed.profile.name === 'string' ? parsed.profile.name : '',
            avatar: typeof parsed.profile.avatar === 'string' ? parsed.profile.avatar : '',
            ...(typeof parsed.profile.uid === 'string' ? { uid: parsed.profile.uid } : {})
          }
        : null;

    return {
      access_token: typeof parsed.access_token === 'string' ? parsed.access_token : '',
      expires_at:
        typeof parsed.expires_at === 'number' && Number.isFinite(parsed.expires_at)
          ? parsed.expires_at
          : 0,
      profile,
      github_token:
        typeof parsed.github_token === 'string'
          ? parsed.github_token
          : localStorage.getItem('ac_gh_token') || '',
      repo:
        typeof parsed.repo === 'string' && parsed.repo.trim()
          ? parsed.repo
          : localStorage.getItem('ac_gh_repo') || DEFAULT_GOOGLE_AUTH_RECORD.repo,
      branch:
        typeof parsed.branch === 'string' && parsed.branch.trim()
          ? parsed.branch
          : localStorage.getItem('ac_gh_branch') || DEFAULT_GOOGLE_AUTH_RECORD.branch,
      drive_folder_id:
        typeof parsed.drive_folder_id === 'string'
          ? parsed.drive_folder_id
          : localStorage.getItem('ac_gdrive_folder_id') ||
            DEFAULT_GOOGLE_AUTH_RECORD.drive_folder_id,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : undefined
    };
  } catch {
    return { ...DEFAULT_GOOGLE_AUTH_RECORD };
  }
}

export function saveGoogleAuthPatch(
  patch: Partial<AetherGoogleAuthRecord>
): AetherGoogleAuthRecord {
  const current = loadGoogleAuthRecord();
  const next: AetherGoogleAuthRecord = {
    ...current,
    ...patch,
    updated_at: Date.now()
  };
  try {
    localStorage.setItem(AETHER_GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function clearGoogleSessionOnly(): AetherGoogleAuthRecord {
  return saveGoogleAuthPatch({
    access_token: '',
    expires_at: 0,
    profile: null
  });
}

export function isGoogleAuthTokenValid(
  record: Pick<AetherGoogleAuthRecord, 'access_token' | 'expires_at'>,
  marginMs: number = GOOGLE_TOKEN_REFRESH_MARGIN_MS
): boolean {
  if (!record.access_token || typeof record.access_token !== 'string') return false;
  if (!Number.isFinite(record.expires_at) || record.expires_at <= 0) return false;
  return record.expires_at - Date.now() > marginMs;
}

export function loadWorkspaceDraft(): AetherWorkspaceDraft | null {
  try {
    const raw = localStorage.getItem(AETHER_WORKSPACE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AetherWorkspaceDraft> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AetherWorkspaceDraft;
  } catch {
    return null;
  }
}

export function saveWorkspaceDraft(draft: AetherWorkspaceDraft): void {
  try {
    localStorage.setItem(AETHER_WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage quota errors
  }
}

export function clearWorkspaceDraft(): void {
  try {
    localStorage.removeItem(AETHER_WORKSPACE_DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

const MAX_PERSISTED_RENDER_LOGS = 500;

export function loadActiveRenderJob(): AetherActiveRenderJob | null {
  try {
    const raw = localStorage.getItem(AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AetherActiveRenderJob> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const status =
      parsed.status === 'running' || parsed.status === 'success' || parsed.status === 'failure'
        ? parsed.status
        : null;
    if (!status) return null;

    const logs: TerminalLogEntry[] = Array.isArray(parsed.logs)
      ? parsed.logs
          .filter(
            (entry): entry is TerminalLogEntry =>
              Boolean(entry) &&
              typeof entry === 'object' &&
              typeof (entry as TerminalLogEntry).text === 'string'
          )
          .map((entry, idx) => ({
            id: typeof entry.id === 'string' && entry.id ? entry.id : `restored-${idx}`,
            text: entry.text,
            level:
              entry.level === 'info' ||
              entry.level === 'step' ||
              entry.level === 'success' ||
              entry.level === 'error' ||
              entry.level === 'raw'
                ? entry.level
                : 'info'
          }))
      : [];

    return {
      status,
      repo:
        typeof parsed.repo === 'string' && parsed.repo.trim()
          ? parsed.repo.trim()
          : 'ZermeXX/aetherflow-render',
      workflow:
        typeof parsed.workflow === 'string' && parsed.workflow.trim()
          ? parsed.workflow.trim()
          : 'render_scenes.yml',
      branch:
        typeof parsed.branch === 'string' && parsed.branch.trim() ? parsed.branch.trim() : 'main',
      started_at:
        typeof parsed.started_at === 'number' && Number.isFinite(parsed.started_at)
          ? parsed.started_at
          : Date.now(),
      run_id:
        typeof parsed.run_id === 'number' && Number.isFinite(parsed.run_id)
          ? parsed.run_id
          : null,
      project_name:
        typeof parsed.project_name === 'string' ? parsed.project_name : 'Aether Combine Project',
      logs,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      desc: typeof parsed.desc === 'string' ? parsed.desc : undefined,
      step_label: typeof parsed.step_label === 'string' ? parsed.step_label : undefined,
      run_url: typeof parsed.run_url === 'string' ? parsed.run_url : undefined
    };
  } catch {
    return null;
  }
}

export function saveActiveRenderJob(job: AetherActiveRenderJob): void {
  try {
    const trimmedLogs =
      job.logs.length > MAX_PERSISTED_RENDER_LOGS
        ? job.logs.slice(job.logs.length - MAX_PERSISTED_RENDER_LOGS)
        : job.logs;
    localStorage.setItem(
      AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY,
      JSON.stringify({
        ...job,
        logs: trimmedLogs
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function clearActiveRenderJob(): void {
  try {
    localStorage.removeItem(AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
