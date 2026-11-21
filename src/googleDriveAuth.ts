/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

let isSigningIn = false;
let silentRefreshInFlight: Promise<{ user: User; accessToken: string } | null> | null = null;
let cachedAccessToken: string | null = null;
let cachedExpiresAt = 0;

function createGoogleProvider(options?: { prompt?: '' | 'none' | 'select_account'; loginHint?: string }): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  SCOPES.forEach(scope => p.addScope(scope));
  const customParams: Record<string, string> = {};
  if (options?.prompt !== undefined) {
    customParams.prompt = options.prompt;
  }
  if (options?.loginHint) {
    customParams.login_hint = options.loginHint;
  }
  if (Object.keys(customParams).length > 0) {
    p.setCustomParameters(customParams);
  }
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

function persistGoogleAuthSession(user: User, accessToken: string, expiresAt: number): void {
  cachedAccessToken = accessToken;
  cachedExpiresAt = expiresAt;
  const profile: AetherGoogleProfile = {
    email: user.email || '',
    name: user.displayName || '',
    avatar: user.photoURL || '',
    uid: user.uid || ''
  };
  saveGoogleAuthPatch({
    access_token: accessToken,
    expires_at: expiresAt,
    profile
  });
}

/**
 * Синхронно восстанавливает сохранённую Google-сессию из localStorage ("aether_google_auth"),
 * если до истечения access_token осталось более 3 минут.
 */
export const getRestoredGoogleSession = (): {
  user: User;
  accessToken: string;
  expiresAt: number;
} | null => {
  const stored = loadGoogleAuthRecord();
  if (!isGoogleAuthTokenValid(stored, GOOGLE_TOKEN_REFRESH_MARGIN_MS)) {
    return null;
  }
  cachedAccessToken = stored.access_token;
  cachedExpiresAt = stored.expires_at;
  const activeUser =
    auth.currentUser ||
    (stored.profile
      ? profileToRestoredUser(stored.profile)
      : profileToRestoredUser({ email: '', name: 'Google Drive', avatar: '' }));
  return {
    user: activeUser,
    accessToken: stored.access_token,
    expiresAt: stored.expires_at
  };
};

/**
 * Тихое обновление OAuth access_token (prompt: "none" / "" с login_hint).
 */
export const googleDriveSilentRefresh = async (
  loginHint?: string
): Promise<{ user: User; accessToken: string } | null> => {
  if (silentRefreshInFlight) {
    return silentRefreshInFlight;
  }

  const stored = loadGoogleAuthRecord();
  const resolvedHint = (loginHint || auth.currentUser?.email || stored.profile?.email || '').trim();
  if (!resolvedHint && !auth.currentUser) {
    return null;
  }

  const runSilent = async (): Promise<{ user: User; accessToken: string } | null> => {
    try {
      isSigningIn = true;
      // 1) Пробуем тихое обновление через prompt: "none" с login_hint
      const silentProvider = createGoogleProvider({
        prompt: 'none',
        loginHint: resolvedHint || undefined
      });
      const result = await signInWithPopup(auth, silentProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        return null;
      }
      const expiresAt = extractExpiresAtMs(result);
      persistGoogleAuthSession(result.user, credential.accessToken, expiresAt);
      return { user: result.user, accessToken: credential.accessToken };
    } catch {
      // 2) Fallback на prompt: "" с login_hint (если браузер/OAuth отклонил prompt=none)
      try {
        const emptyPromptProvider = createGoogleProvider({
          prompt: '',
          loginHint: resolvedHint || undefined
        });
        const result = await signInWithPopup(auth, emptyPromptProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) {
          return null;
        }
        const expiresAt = extractExpiresAtMs(result);
        persistGoogleAuthSession(result.user, credential.accessToken, expiresAt);
        return { user: result.user, accessToken: credential.accessToken };
      } catch {
        // Браузер может заблокировать popup без клика или потребовать интерактивный вход — не ломаем UI
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

  // 1) Мгновенное восстановление из localStorage ("aether_google_auth"), если до истечения > 3 мин
  const restored = getRestoredGoogleSession();
  if (restored) {
    if (onAuthSuccess) onAuthSuccess(restored.user, restored.accessToken);
  } else {
    const stored = loadGoogleAuthRecord();
    if (stored.profile?.email || stored.access_token) {
      didAttemptSilentOnBoot = true;
      void googleDriveSilentRefresh(stored.profile?.email).then(refreshed => {
        if (refreshed) {
          if (onAuthSuccess) onAuthSuccess(refreshed.user, refreshed.accessToken);
        }
      });
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    const stored = loadGoogleAuthRecord();
    const hasFreshStoredToken = isGoogleAuthTokenValid(stored, GOOGLE_TOKEN_REFRESH_MARGIN_MS);

    if (hasFreshStoredToken) {
      cachedAccessToken = stored.access_token;
      cachedExpiresAt = stored.expires_at;
      const effectiveUser =
        user ||
        (stored.profile
          ? profileToRestoredUser(stored.profile)
          : profileToRestoredUser({ email: '', name: 'Google Drive', avatar: '' }));
      if (user) {
        // Актуализируем профиль (email/имя/аватар) из Firebase User
        persistGoogleAuthSession(user, stored.access_token, stored.expires_at);
      }
      if (onAuthSuccess) onAuthSuccess(effectiveUser, stored.access_token);
      return;
    }

    if (user) {
      if (cachedAccessToken && cachedExpiresAt - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        return;
      }
      if (!isSigningIn && !didAttemptSilentOnBoot) {
        didAttemptSilentOnBoot = true;
        const refreshed = await googleDriveSilentRefresh(user.email || stored.profile?.email);
        if (refreshed) {
          if (onAuthSuccess) onAuthSuccess(refreshed.user, refreshed.accessToken);
          return;
        }
      }
      if (!isSigningIn) {
        cachedAccessToken = null;
        cachedExpiresAt = 0;
        if (onAuthFailure) onAuthFailure();
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      cachedExpiresAt = 0;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleDriveSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const stored = loadGoogleAuthRecord();
    const loginHint = (auth.currentUser?.email || stored.profile?.email || '').trim();
    const interactiveProvider = createGoogleProvider({
      ...(loginHint ? { loginHint } : {})
    });
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
  if (cachedAccessToken && cachedExpiresAt > Date.now() + 10_000) {
    return cachedAccessToken;
  }
  const stored = loadGoogleAuthRecord();
  if (isGoogleAuthTokenValid(stored, 10_000)) {
    cachedAccessToken = stored.access_token;
    cachedExpiresAt = stored.expires_at;
    return stored.access_token;
  }
  return null;
};

export const isDriveTokenFresh = (): boolean => {
  if (cachedAccessToken && cachedExpiresAt - Date.now() > GOOGLE_TOKEN_REFRESH_MARGIN_MS) {
    return true;
  }
  const stored = loadGoogleAuthRecord();
  return isGoogleAuthTokenValid(stored, GOOGLE_TOKEN_REFRESH_MARGIN_MS);
};

export const googleDriveLogout = async () => {
  try {
    await auth.signOut();
  } catch {
    // ignore signOut errors when session was restored purely from localStorage
  }
  cachedAccessToken = null;
  cachedExpiresAt = 0;
  clearGoogleSessionOnly();
};

export interface DriveResumableUploadResult {
  id: string;
  name: string;
  mimeType?: string;
}

/**
 * Прямая загрузка файла строго в существующую целевую папку Google Drive (parents: [targetFolderId])
 * по протоколу Google Drive API v3 Resumable Upload (без создания новых папок).
 */
export const resumableUploadToGoogleDrive = async (
  file: File,
  targetFolderId: string,
  accessToken: string,
  onProgress?: (percent: number, loaded: number, total: number) => void
): Promise<DriveResumableUploadResult> => {
  const cleanFolderId = targetFolderId.trim();
  if (!cleanFolderId) {
    throw new Error('Укажите целевую папку Google Drive (GDRIVE_FOLDER_ID / target_folder_id)');
  }

  const contentType = file.type || 'application/octet-stream';

  // Шаг 1: Инициализация сессии Resumable Upload строго в указанную папку parents: [cleanFolderId]
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(file.size)
      },
      body: JSON.stringify({
        name: file.name,
        parents: [cleanFolderId]
      })
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '');
    throw new Error(
      `Ошибка инициализации Resumable Upload (${initRes.status}): ${errText || initRes.statusText}`
    );
  }

  const sessionUri = initRes.headers.get('Location');
  if (!sessionUri) {
    throw new Error('Google Drive API не вернул Location URI для Resumable Upload');
  }

  // Шаг 2: Потоковая передача байтов файла через PUT на полученный sessionUri с отслеживанием прогресса
  return new Promise<DriveResumableUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUri, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(pct, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as DriveResumableUploadResult;
          if (onProgress) onProgress(100, file.size, file.size);
          resolve({
            id: parsed.id || '',
            name: parsed.name || file.name,
            mimeType: parsed.mimeType
          });
        } catch {
          if (onProgress) onProgress(100, file.size, file.size);
          resolve({ id: '', name: file.name });
        }
      } else {
        reject(
          new Error(
            `Ошибка выгрузки файла «${file.name}» в Google Drive (${xhr.status}): ${
              xhr.responseText || xhr.statusText
            }`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Сетевой сбой при Resumable-загрузке файла «${file.name}» в Google Drive`));
    };

    xhr.send(file);
  });
};
