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

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

let isSigningIn = false;
// Кэшируем OAuth access token строго в оперативной памяти (in-memory)
let cachedAccessToken: string | null = null;

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
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
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Не удалось получить OAuth-токен доступа к Google Drive');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const googleDriveLogout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
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
