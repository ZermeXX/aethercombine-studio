/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AetherGoogleProfile,
  GOOGLE_TOKEN_REFRESH_MARGIN_MS,
  clearGoogleSessionOnly,
  isGoogleAuthTokenValid,
  loadGoogleAuthRecord,
  saveGoogleAuthPatch
} from './utils/aetherPersistence';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/** P0: access_token живёт только в памяти вкладки + sessionStorage, никогда в localStorage. */
const SESSION_TOKEN_KEY = 'aether_gdrive_session_token';
const LEGACY_PURGE_KEY = 'aether_gdrive_token_purged_v1';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

let isSigningIn = false;
let silentRefreshInFlight: Promise<{ user: User; accessToken: string } | null> | null = null;
let cachedAccessToken: string | null = null;
let cachedExpiresAt = 0;

type SessionTokenRecord = { access_token: string; expires_at: number };
type PersistPatch = Parameters<typeof saveGoogleAuthPatch>[0];

/* ------------------------------------------------------------------ */
/* Маскирование секретов для терминала / копирования логов             */
/* ------------------------------------------------------------------ */
export const maskSecret = (value: string, keep: number = 4): string => {
  const v = String(value || '');
  if (v.length <= keep * 2) return '••••';
  return `${v.slice(0, keep)}••••${v.slice(-keep)}`;
};

export const sanitizeLogText = (text: string): string => {
  let out = String(text || '');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ••••');
  out = out.replace(/\bya29\.[A-Za-z0-9._-]+/g, 'ya29.••••');
  out = out.replace(/\bAIza[0-9A-Za-z_-]{20,}/g, 'AIza••••');
  out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, 'gh•_••••');
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_••••');
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-••••');
  out = out.replace(/([?&](?:upload_id|access_token|token|key)=)[^&\s"']+/gi, '$1••••');
  out = out.replace(/("?(?:private_key|client_secret|bot_token|api_token|access_token|refresh_token)"?\s*[:=]\s*")[^"]+(")/gi, '$1••••$2');
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '•••• PRIVATE KEY REMOVED ••••');
  return out;
};

/* ------------------------------------------------------------------ */
/* Session-scoped хранилище токена                                     */
/* ------------------------------------------------------------------ */
const readSessionToken = (): SessionTokenRecord | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionTokenRecord;
    if (!parsed?.access_token || !Number.isFinite(parsed.expires_at)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSessionToken = (record: SessionTokenRecord | null): void => {
  try {
    if (record) sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(record));
    else sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // sessionStorage может быть недоступен (private mode) — остаёмся в памяти
  }
};

/** Однократная миграция: вынимаем токен из localStorage и стираем его там. */
const purgeLegacyLocalStorageToken = (): SessionTokenRecord | null => {
  let migrated: SessionTokenRecord | null = null;
  try {
    const stored = loadGoogleAuthRecord();
    if (stored?.access_token && isGoogleAuthTokenValid(stored, GOOGLE_TOKEN_REFRESH_MARGIN_MS)) {
      migrated = { access_token: stored.access_token, expires_at: stored.expires_at };
      if (!readSessionToken()) writeSessionToken(migrated);
    }
    if (!sessionStorage.getItem(LEGACY_PURGE_KEY)) {
      saveGoogleAuthPatch({ access_token: '', expires_at: 0 } as PersistPatch);
      sessionStorage.setItem(LEGACY_PURGE_KEY, '1');
    }
  } catch {
    // ignore
  }
  return migrated;
};

const legacyMigrated = purgeLegacyLocalStorageToken();

function createGoogleProvider(options?: {
  prompt?: '' | 'none' | 'select_account';
  loginHint?: string;
}): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  SCOPES.forEach(scope => p.addScope(scope));
  const customParams: Record<string, string> = {};
  if (options?.prompt !== undefined) customParams.prompt = options.prompt;
  if (options?.loginHint) customParams.login_hint = options.loginHint;
  if (Object.keys(customParams).length > 0) p.setCustomParameters(customParams);
  return p;
}

function profileToRestoredUser(profile: AetherGoogleProfile): User {
  return {
    uid: profile.uid || profile.email || 'restored-google-user',
    email: profile.email || null,
    displayName: profile.name || null,
    photoURL: profile.avatar || null
  } as User;
}

function extractExpiresAtMs(result: unknown): number {
  const tokenResp = (
    result as { _tokenResponse?: { oauthExpireIn?: string | number; expiresIn?: string | number } }
  )?._tokenResponse;
  const rawSec = Number(tokenResp?.oauthExpireIn ?? tokenResp?.expiresIn);
  const expiresInSec = Number.isFinite(rawSec) && rawSec > 60 ? rawSec : 3600;
  return Date.now() + expiresInSec * 1000;
}

/** Профиль — в localStorage (не секрет), токен — только в sessionStorage. */
function persistGoogleAuthSession(user: User, accessToken: string, expiresAt: number): void {
  cachedAccessToken = accessToken;
  cachedExpiresAt = expiresAt;
  writeSessionToken({ access_token: accessToken, expires_at: expiresAt });
  const profile: AetherGoogleProfile = {
    email: user.email || '',
    name: user.displayName || '',
    avatar: user.photoURL || '',
    uid: user.uid || ''
  };
  try {
    saveGoogleAuthPatch({ profile, access_token: '', expires_at: 0 } as PersistPatch);
  } catch {
    // ignore persistence errors
  }
}

const hasUserActivation = (): boolean => {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  return Boolean(nav.userActivation?.hasBeenActive);
};

/** Восстановление сессии текущей вкладки (без чтения токена из localStorage). */
export const getRestoredGoogleSession = (): {
  user: User;
  accessToken: string;
  expiresAt: number;
} | null => {
  const session = readSessionToken() || legacyMigrated;
  if (!session || session.expires_at - Date.now() <= GOOGLE_TOKEN_REFRESH_MARGIN_MS) return null;
  cachedAccessToken = session.access_token;
  cachedExpiresAt = session.expires_at;
  const stored = loadGoogleAuthRecord();
  const activeUser =
    auth.currentUser ||
    (stored.profile
      ? profileToRestoredUser(stored.profile)
      : profileToRestoredUser({ email: '', name: 'Google Drive', avatar: '' }));
  return { user: activeUser, accessToken: session.access_token, expiresAt: session.expires_at };
};

export const googleDriveSilentRefresh = async (
  loginHint?: string
): Promise<{ user: User; accessToken: string } | null> => {
  if (silentRefreshInFlight) return silentRefreshInFlight;
  const stored = loadGoogleAuthRecord();
  const resolvedHint = (loginHint || auth.currentUser?.email || stored.profile?.email || '').trim();
  if (!resolvedHint && !auth.currentUser) return null;

  const runSilent = async (): Promise<{ user: User; accessToken: string } | null> => {
    try {
      isSigningIn = true;
      const silentProvider = createGoogleProvider({
        prompt: 'none',
        loginHint: resolvedHint || undefined
      });
      const result = await signInWithPopup(auth, silentProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) return null;
      const expiresAt = extractExpiresAtMs(result);
      persistGoogleAuthSession(result.user, credential.accessToken, expiresAt);
      return { user: result.user, accessToken: credential.accessToken };
    } catch {
      // Интерактивный фолбэк допустим только после жеста пользователя (иначе popup-blocker)
      if (!hasUserActivation()) return null;
      try {
        const emptyPromptProvider = createGoogleProvider({
          prompt: '',
          loginHint: resolvedHint || undefined
        });
        const result = await signInWithPopup(auth, emptyPromptProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) return null;
        const expiresAt = extractExpiresAtMs(result);
        persistGoogleAuthSession(result.user, credential.accessToken, expiresAt);
        return { user: result.user, accessToken: credential.accessToken };
      } catch {
        return null;
      }
    } finally {
      isSigningIn = false;
      silentRefreshInFlight = null;
    }
  };

  silentRefreshInFlight = runSilent();
  return silentRefreshInFlight;
};

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  let didAttemptSilentOnBoot = false;
  const restored = getRestoredGoogleSession();
  if (restored) {
    onAuthSuccess?.(restored.user, restored.accessToken);
  } else {
    const stored = loadGoogleAuthRecord();
    if (stored.profile?.email) {
      didAttemptSilentOnBoot = true;
      void googleDriveSilentRefresh(stored.profile.email).then(refreshed => {
        if (refreshed) onAuthSuccess?.(refreshed.user, refreshed.accessToken);
      });
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    const session = readSessionToken();
    const hasFreshSessionToken =
      !!session && session.expires_at - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS;

    if (hasFreshSessionToken && session) {
      cachedAccessToken = session.access_token;
      cachedExpiresAt = session.expires_at;
      const stored = loadGoogleAuthRecord();
      const effectiveUser =
        user ||
        (stored.profile
          ? profileToRestoredUser(stored.profile)
          : profileToRestoredUser({ email: '', name: 'Google Drive', avatar: '' }));
      if (user) persistGoogleAuthSession(user, session.access_token, session.expires_at);
      onAuthSuccess?.(effectiveUser, session.access_token);
      return;
    }

    if (user) {
      if (cachedAccessToken && cachedExpiresAt - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS) {
        onAuthSuccess?.(user, cachedAccessToken);
        return;
      }
      if (!isSigningIn && !didAttemptSilentOnBoot) {
        didAttemptSilentOnBoot = true;
        const stored = loadGoogleAuthRecord();
        const refreshed = await googleDriveSilentRefresh(user.email || stored.profile?.email);
        if (refreshed) {
          onAuthSuccess?.(refreshed.user, refreshed.accessToken);
          return;
        }
      }
      if (!isSigningIn) {
        cachedAccessToken = null;
        cachedExpiresAt = 0;
        writeSessionToken(null);
        onAuthFailure?.();
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      cachedExpiresAt = 0;
      writeSessionToken(null);
      onAuthFailure?.();
    }
  });
};

export const googleDriveSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const stored = loadGoogleAuthRecord();
    const loginHint = (auth.currentUser?.email || stored.profile?.email || '').trim();
    const interactiveProvider = createGoogleProvider({ ...(loginHint ? { loginHint } : {}) });
    const result = await signInWithPopup(auth, interactiveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Не удалось получить OAuth-токен доступа к Google Drive');
    }
    const expiresAt = extractExpiresAtMs(result);
    persistGoogleAuthSession(result.user, credential.accessToken, expiresAt);
    return { user: result.user, accessToken: credential.accessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  if (cachedAccessToken && cachedExpiresAt > Date.now() + 10_000) return cachedAccessToken;
  const session = readSessionToken();
  if (session && session.expires_at > Date.now() + 10_000) {
    cachedAccessToken = session.access_token;
    cachedExpiresAt = session.expires_at;
    return session.access_token;
  }
  return null;
};

export const isDriveTokenFresh = (): boolean => {
  if (cachedAccessToken && cachedExpiresAt - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS) return true;
  const session = readSessionToken();
  return !!session && session.expires_at - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS;
};

export const googleDriveLogout = async () => {
  try {
    await auth.signOut();
  } catch {
    // ignore
  }
  cachedAccessToken = null;
  cachedExpiresAt = 0;
  writeSessionToken(null);
  try {
    saveGoogleAuthPatch({ access_token: '', expires_at: 0 } as PersistPatch);
    clearGoogleSessionOnly();
  } catch {
    // ignore
  }
};

/* ------------------------------------------------------------------ */
/* Resumable Upload v3: чанки 8 МБ, докачка после обрыва, ретраи        */
/* ------------------------------------------------------------------ */
export interface DriveResumableUploadResult {
  id: string;
  name: string;
  mimeType?: string;
}

export class DriveUploadAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveUploadAuthError';
  }
}

const CHUNK_SIZE = 8 * 1024 * 1024; // кратно 256 КиБ — требование Drive API
const MAX_CHUNK_ATTEMPTS = 5;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        reject(new DOMException('Upload aborted', 'AbortError'));
      },
      { once: true }
    );
  });

type ChunkResponse = { status: number; range: string | null; text: string };

const xhrPut = (
  url: string,
  body: Blob | null,
  headers: Record<string, string>,
  onChunkProgress?: (loadedInChunk: number) => void,
  signal?: AbortSignal
): Promise<ChunkResponse> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) onChunkProgress?.(ev.loaded);
    };
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        range: xhr.getResponseHeader('Range'),
        text: xhr.responseText || ''
      });
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });

/** Спрашиваем у Drive, сколько байт уже принято (после сетевого обрыва). */
const queryConfirmedOffset = async (
  sessionUri: string,
  total: number,
  signal?: AbortSignal
): Promise<number> => {
  try {
    const res = await xhrPut(
      sessionUri,
      null,
      { 'Content-Length': '0', 'Content-Range': `bytes */${total}` },
      undefined,
      signal
    );
    if (res.status === 200 || res.status === 201) return total;
    if (res.status === 308 && res.range) {
      const m = /bytes=0-(\d+)/.exec(res.range);
      return m ? Number(m[1]) + 1 : 0;
    }
    return 0;
  } catch {
    return 0;
  }
};

export const resumableUploadToGoogleDrive = async (
  file: File,
  targetFolderId: string,
  accessToken: string,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  options?: { signal?: AbortSignal; chunkSizeBytes?: number }
): Promise<DriveResumableUploadResult> => {
  const cleanFolderId = targetFolderId.trim();
  if (!cleanFolderId) {
    throw new Error('Укажите целевую папку Google Drive (GDRIVE_FOLDER_ID / target_folder_id)');
  }
  if (!accessToken) throw new DriveUploadAuthError('Нет access_token — требуется вход в Google.');

  const signal = options?.signal;
  const chunkSize = Math.max(CHUNK_SIZE, options?.chunkSizeBytes || CHUNK_SIZE);
  const contentType = file.type || 'application/octet-stream';
  const total = file.size;

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(total)
      },
      body: JSON.stringify({ name: file.name, parents: [cleanFolderId] }),
      signal
    }
  );

  if (initRes.status === 401 || initRes.status === 403) {
    throw new DriveUploadAuthError(
      `Google Drive отклонил токен (${initRes.status}) — обновите вход и повторите загрузку.`
    );
  }
  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '');
    throw new Error(
      `Ошибка инициализации Resumable Upload (${initRes.status}): ${sanitizeLogText(errText || initRes.statusText)}`
    );
  }
  const sessionUri = initRes.headers.get('Location');
  if (!sessionUri) throw new Error('Google Drive API не вернул Location URI для Resumable Upload');

  let offset = 0;
  let attempt = 0;
  let finalMeta: DriveResumableUploadResult = { id: '', name: file.name };

  while (offset < total) {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
    const end = Math.min(offset + chunkSize, total);
    const blob = file.slice(offset, end);
    const isLast = end === total;
    const rangeHeader = `bytes ${offset}-${end - 1}/${total}`;

    try {
      const res = await xhrPut(
        sessionUri,
        blob,
        { 'Content-Type': contentType, 'Content-Range': rangeHeader },
        loadedInChunk => {
          const confirmed = Math.min(total, offset + loadedInChunk);
          onProgress?.(Math.min(99, Math.round((confirmed / total) * 100)), confirmed, total);
        },
        signal
      );

      if (res.status === 200 || res.status === 201) {
        try {
          const parsed = JSON.parse(res.text || '{}') as DriveResumableUploadResult;
          finalMeta = {
            id: parsed.id || '',
            name: parsed.name || file.name,
            mimeType: parsed.mimeType
          };
        } catch {
          finalMeta = { id: '', name: file.name };
        }
        offset = total;
        break;
      }

      if (res.status === 308) {
        const m = res.range ? /bytes=0-(\d+)/.exec(res.range) : null;
        offset = m ? Number(m[1]) + 1 : end;
        attempt = 0;
        onProgress?.(Math.min(99, Math.round((offset / total) * 100)), offset, total);
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        throw new DriveUploadAuthError(
          'Токен Google Drive истёк во время загрузки — обновите вход (загрузка докачается с текущего места).'
        );
      }

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient ${res.status}`);
      }

      throw new Error(
        `Ошибка выгрузки «${file.name}» (${res.status}): ${sanitizeLogText(res.text).slice(0, 300)}`
      );
    } catch (err) {
      if (err instanceof DriveUploadAuthError) throw err;
      if ((err as DOMException)?.name === 'AbortError') throw err;
      attempt += 1;
      if (attempt > MAX_CHUNK_ATTEMPTS) {
        throw new Error(
          `Не удалось догрузить «${file.name}» после ${MAX_CHUNK_ATTEMPTS} попыток (сбой сети или Drive API).`
        );
      }
      await sleep(Math.min(16000, 1000 * 2 ** (attempt - 1)) + Math.random() * 400, signal);
      offset = await queryConfirmedOffset(sessionUri, total, signal);
      onProgress?.(Math.min(99, Math.round((offset / total) * 100)), offset, total);
    }
  }

  if (isLast !== undefined && offset >= total) {
    onProgress?.(100, total, total);
  }
  return finalMeta;
};
