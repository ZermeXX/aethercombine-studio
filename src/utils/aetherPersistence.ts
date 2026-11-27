/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import type { TerminalLogEntry } from '../components/StudioTerminal';
import { sanitizeLogText } from './logSanitizer';

export const AETHER_GOOGLE_AUTH_STORAGE_KEY = 'aether_google_auth';
export const AETHER_WORKSPACE_DRAFT_STORAGE_KEY = 'aether_workspace_draft';
export const AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY = 'aether_active_render_job';

const GOOGLE_TOKEN_SESSION_KEY = 'aether_google_token_session';
const GITHUB_TOKEN_SESSION_KEY = 'aether_github_token_session';
const TELEGRAM_SESSION_KEY = 'aether_telegram_session';
const SECRETS_PURGED_FLAG = 'aether_secrets_purged_v1';

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

export interface TelegramSession {
  bot_token: string;
  chat_id: string;
}

interface SessionSecrets {
  access_token: string;
  expires_at: number;
  github_token: string;
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

const DEFAULT_PUBLIC = {
  repo: 'ZermeXX/aetherflow-render',
  branch: 'main',
  drive_folder_id: '1OuuxKa85KAR-zz9TFXv6Ccg99fZ6JpuK'
};

/* ---------------- storage helpers ---------------- */
const readJson = <T>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (storage: Storage, key: string, value: unknown): void => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — остаёмся в памяти вкладки */
  }
};

const removeKey = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const readSessionSecrets = (): SessionSecrets => {
  const g = readJson<{ access_token?: string; expires_at?: number }>(
    sessionStorage,
    GOOGLE_TOKEN_SESSION_KEY
  );
  const gh = readJson<{ github_token?: string }>(sessionStorage, GITHUB_TOKEN_SESSION_KEY);
  return {
    access_token: typeof g?.access_token === 'string' ? g.access_token : '',
    expires_at: Number.isFinite(g?.expires_at) ? Number(g?.expires_at) : 0,
    github_token: typeof gh?.github_token === 'string' ? gh.github_token : ''
  };
};

const writeSessionSecrets = (patch: Partial<SessionSecrets>): void => {
  if (patch.access_token !== undefined || patch.expires_at !== undefined) {
    const cur = readSessionSecrets();
    const next = {
      access_token: patch.access_token ?? cur.access_token,
      expires_at: patch.expires_at ?? cur.expires_at
    };
    if (next.access_token) writeJson(sessionStorage, GOOGLE_TOKEN_SESSION_KEY, next);
    else removeKey(sessionStorage, GOOGLE_TOKEN_SESSION_KEY);
  }
  if (patch.github_token !== undefined) {
    if (patch.github_token) {
      writeJson(sessionStorage, GITHUB_TOKEN_SESSION_KEY, { github_token: patch.github_token });
    } else {
      removeKey(sessionStorage, GITHUB_TOKEN_SESSION_KEY);
    }
  }
};

/** Однократная миграция: секреты уезжают в sessionStorage и стираются из localStorage. */
const migrateLegacySecrets = (): void => {
  try {
    if (sessionStorage.getItem(SECRETS_PURGED_FLAG)) return;

    const legacy = readJson<Partial<AetherGoogleAuthRecord>>(
      localStorage,
      AETHER_GOOGLE_AUTH_STORAGE_KEY
    );
    const legacyGh = localStorage.getItem('ac_gh_token') || '';
    const cur = readSessionSecrets();

    const expected = {
      access_token: cur.access_token || legacy?.access_token || '',
      expires_at: cur.expires_at || Number(legacy?.expires_at) || 0,
      github_token: cur.github_token || legacy?.github_token || legacyGh || ''
    };
    writeSessionSecrets(expected);
    const verified = readSessionSecrets();
    if (verified.access_token !== expected.access_token || verified.expires_at !== expected.expires_at || verified.github_token !== expected.github_token) return;

    const tgBot = localStorage.getItem('ac_tg_bot_token') || '';
    const tgChat = localStorage.getItem('ac_tg_chat_id') || '';
    if (tgBot || tgChat) {
      const existing = readJson<TelegramSession>(sessionStorage, TELEGRAM_SESSION_KEY);
      const next = { bot_token: existing?.bot_token || tgBot, chat_id: existing?.chat_id || tgChat };
      writeJson(sessionStorage, TELEGRAM_SESSION_KEY, next);
      const verified = readJson<TelegramSession>(sessionStorage, TELEGRAM_SESSION_KEY);
      if (verified?.bot_token !== next.bot_token || verified?.chat_id !== next.chat_id) return;
    }

    if (legacy) {
      writeJson(localStorage, AETHER_GOOGLE_AUTH_STORAGE_KEY, {
        profile: legacy.profile ?? null,
        repo: legacy.repo || DEFAULT_PUBLIC.repo,
        branch: legacy.branch || DEFAULT_PUBLIC.branch,
        drive_folder_id: legacy.drive_folder_id || DEFAULT_PUBLIC.drive_folder_id,
        updated_at: Date.now()
      });
    }

    removeKey(localStorage, 'ac_gh_token');
    removeKey(localStorage, 'ac_tg_bot_token');
    removeKey(localStorage, 'ac_tg_chat_id');
    // Preserve unsupported legacy service-account credentials until explicit migration or removal.
    if (['ac_gh_token','ac_tg_bot_token','ac_tg_chat_id'].some(k => localStorage.getItem(k) !== null)) return;
    const remaining = readJson<Partial<AetherGoogleAuthRecord>>(localStorage, AETHER_GOOGLE_AUTH_STORAGE_KEY);
    if (remaining?.access_token || remaining?.github_token) return;
    sessionStorage.setItem(SECRETS_PURGED_FLAG, '1');
  } catch {
    /* ignore */
  }
};

migrateLegacySecrets();

/* ---------------- public auth record ---------------- */
const sanitizeProfile = (raw: unknown): AetherGoogleProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  return {
    email: typeof p.email === 'string' ? p.email : '',
    name: typeof p.name === 'string' ? p.name : '',
    avatar: typeof p.avatar === 'string' ? p.avatar : '',
    ...(typeof p.uid === 'string' ? { uid: p.uid } : {})
  };
};

const loadPublicRecord = () => {
  const parsed = readJson<Partial<AetherGoogleAuthRecord>>(
    localStorage,
    AETHER_GOOGLE_AUTH_STORAGE_KEY
  );
  return {
    profile: sanitizeProfile(parsed?.profile),
    repo:
      typeof parsed?.repo === 'string' && parsed.repo.trim()
        ? parsed.repo
        : localStorage.getItem('ac_gh_repo') || DEFAULT_PUBLIC.repo,
    branch:
      typeof parsed?.branch === 'string' && parsed.branch.trim()
        ? parsed.branch
        : localStorage.getItem('ac_gh_branch') || DEFAULT_PUBLIC.branch,
    drive_folder_id:
      typeof parsed?.drive_folder_id === 'string' && parsed.drive_folder_id.trim()
        ? parsed.drive_folder_id
        : localStorage.getItem('ac_gdrive_folder_id') || DEFAULT_PUBLIC.drive_folder_id,
    updated_at: typeof parsed?.updated_at === 'number' ? parsed.updated_at : undefined
  };
};

export function loadGoogleAuthRecord(): AetherGoogleAuthRecord {
  const pub = loadPublicRecord();
  const secrets = readSessionSecrets();
  return {
    access_token: secrets.access_token,
    expires_at: secrets.expires_at,
    github_token: secrets.github_token,
    profile: pub.profile,
    repo: pub.repo,
    branch: pub.branch,
    drive_folder_id: pub.drive_folder_id,
    updated_at: pub.updated_at
  };
}

export function saveGoogleAuthPatch(
  patch: Partial<AetherGoogleAuthRecord>
): AetherGoogleAuthRecord {
  writeSessionSecrets({
    ...(patch.access_token !== undefined ? { access_token: patch.access_token } : {}),
    ...(patch.expires_at !== undefined ? { expires_at: patch.expires_at } : {}),
    ...(patch.github_token !== undefined ? { github_token: patch.github_token } : {})
  });

  const current = loadPublicRecord();
  writeJson(localStorage, AETHER_GOOGLE_AUTH_STORAGE_KEY, {
    profile: patch.profile !== undefined ? patch.profile : current.profile,
    repo: patch.repo !== undefined && patch.repo.trim() ? patch.repo : current.repo,
    branch: patch.branch !== undefined && patch.branch.trim() ? patch.branch : current.branch,
    drive_folder_id:
      patch.drive_folder_id !== undefined ? patch.drive_folder_id : current.drive_folder_id,
    updated_at: Date.now()
  });

  return loadGoogleAuthRecord();
}

export function clearGoogleSessionOnly(): AetherGoogleAuthRecord {
  writeSessionSecrets({ access_token: '', expires_at: 0 });
  return saveGoogleAuthPatch({ profile: null });
}

export function clearGithubSessionToken(): void {
  writeSessionSecrets({ github_token: '' });
}

export function isGoogleAuthTokenValid(
  record: Pick<AetherGoogleAuthRecord, 'access_token' | 'expires_at'>,
  marginMs: number = GOOGLE_TOKEN_REFRESH_MARGIN_MS
): boolean {
  if (!record.access_token || typeof record.access_token !== 'string') return false;
  if (!Number.isFinite(record.expires_at) || record.expires_at <= 0) return false;
  return record.expires_at - Date.now() > marginMs;
}

/* ---------------- Telegram (session only) ---------------- */
export function loadTelegramSession(): TelegramSession {
  const s = readJson<TelegramSession>(sessionStorage, TELEGRAM_SESSION_KEY);
  return {
    bot_token: typeof s?.bot_token === 'string' ? s.bot_token : '',
    chat_id: typeof s?.chat_id === 'string' ? s.chat_id : ''
  };
}

export function saveTelegramSession(patch: Partial<TelegramSession>): TelegramSession {
  const cur = loadTelegramSession();
  const next = {
    bot_token: patch.bot_token !== undefined ? patch.bot_token : cur.bot_token,
    chat_id: patch.chat_id !== undefined ? patch.chat_id : cur.chat_id
  };
  if (next.bot_token || next.chat_id) writeJson(sessionStorage, TELEGRAM_SESSION_KEY, next);
  else removeKey(sessionStorage, TELEGRAM_SESSION_KEY);
  return next;
}

export function clearTelegramSession(): void {
  removeKey(sessionStorage, TELEGRAM_SESSION_KEY);
}

/* ---------------- workspace draft ---------------- */
export function loadWorkspaceDraft(): AetherWorkspaceDraft | null {
  const parsed = readJson<AetherWorkspaceDraft>(localStorage, AETHER_WORKSPACE_DRAFT_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

export function saveWorkspaceDraft(draft: AetherWorkspaceDraft): void {
  writeJson(localStorage, AETHER_WORKSPACE_DRAFT_STORAGE_KEY, draft);
}

export function clearWorkspaceDraft(): void {
  removeKey(localStorage, AETHER_WORKSPACE_DRAFT_STORAGE_KEY);
}

/* ---------------- active render job (логи маскируются) ---------------- */
const MAX_PERSISTED_RENDER_LOGS = 500;

const normalizeLogs = (raw: unknown): TerminalLogEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is TerminalLogEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as TerminalLogEntry).text === 'string'
    )
    .map((entry, idx) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : `restored-${idx}`,
      text: sanitizeLogText(entry.text),
      level:
        entry.level === 'info' ||
        entry.level === 'step' ||
        entry.level === 'success' ||
        entry.level === 'error' ||
        entry.level === 'raw'
          ? entry.level
          : 'info'
    }));
};

export function loadActiveRenderJob(): AetherActiveRenderJob | null {
  const parsed = readJson<Partial<AetherActiveRenderJob>>(
    localStorage,
    AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY
  );
  if (!parsed || typeof parsed !== 'object') return null;
  const status =
    parsed.status === 'running' || parsed.status === 'success' || parsed.status === 'failure'
      ? parsed.status
      : null;
  if (!status) return null;
  return {
    status,
    repo:
      typeof parsed.repo === 'string' && parsed.repo.trim()
        ? parsed.repo.trim()
        : DEFAULT_PUBLIC.repo,
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
      typeof parsed.run_id === 'number' && Number.isFinite(parsed.run_id) ? parsed.run_id : null,
    project_name:
      typeof parsed.project_name === 'string' ? parsed.project_name : 'Aether Combine Project',
    logs: normalizeLogs(parsed.logs),
    title: typeof parsed.title === 'string' ? sanitizeLogText(parsed.title) : undefined,
    desc: typeof parsed.desc === 'string' ? sanitizeLogText(parsed.desc) : undefined,
    step_label:
      typeof parsed.step_label === 'string' ? sanitizeLogText(parsed.step_label) : undefined,
    run_url: typeof parsed.run_url === 'string' ? parsed.run_url : undefined
  };
}

export function saveActiveRenderJob(job: AetherActiveRenderJob): void {
  const trimmedLogs =
    job.logs.length > MAX_PERSISTED_RENDER_LOGS
      ? job.logs.slice(job.logs.length - MAX_PERSISTED_RENDER_LOGS)
      : job.logs;
  writeJson(localStorage, AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY, {
    ...job,
    title: job.title ? sanitizeLogText(job.title) : job.title,
    desc: job.desc ? sanitizeLogText(job.desc) : job.desc,
    step_label: job.step_label ? sanitizeLogText(job.step_label) : job.step_label,
    logs: trimmedLogs.map(l => ({ ...l, text: sanitizeLogText(l.text) }))
  });
}

export function clearActiveRenderJob(): void {
  removeKey(localStorage, AETHER_ACTIVE_RENDER_JOB_STORAGE_KEY);
}
