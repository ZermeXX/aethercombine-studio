/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FolderUp,
  LogOut,
  Trash2,
  Play
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  googleDriveSignIn,
  googleDriveLogout,
  getDriveAccessToken,
  resumableUploadToGoogleDrive
} from '../googleDriveAuth';

export interface DriveUploadQueueItem {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  driveFileId?: string;
  errorMessage?: string;
}

interface GoogleDriveDirectUploaderProps {
  targetFolderId: string;
  onTargetFolderIdChange: (newFolderId: string) => void;
  driveUser: User | null;
  driveToken: string | null;
  onAuthChange: (user: User | null, token: string | null) => void;
  onFilesSelected: (files: File[]) => void;
  onNotify: (message: string, type: 'info' | 'error' | 'success') => void;
  accentColor?: 'indigo' | 'amber';
  title?: string;
  subtitle?: string;
}

export const GoogleDriveDirectUploader: React.FC<GoogleDriveDirectUploaderProps> = ({
  targetFolderId,
  onTargetFolderIdChange,
  driveUser,
  driveToken,
  onAuthChange,
  onFilesSelected,
  onNotify,
  accentColor = 'indigo',
  title = 'Прямая загрузка исходников в текущую папку Google Drive (Resumable Upload)',
  subtitle = 'Перетащите исходные видеоклипы сюда или выберите файлы — точные имена автоматически подставятся в свободные слоты таймлайна'
}) => {
  const [queue, setQueue] = useState<DriveUploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const DEFAULT_DRIVE_FOLDER_ID = '1OuuxKa85KAR-zz9TFXv6Ccg99fZ6JpuK';

  const handleLogin = async (): Promise<string | null> => {
    setIsSigningIn(true);
    try {
      const res = await googleDriveSignIn();
      if (res) {
        onAuthChange(res.user, res.accessToken);
        onNotify(`Подключен аккаунт Google Drive: ${res.user.email || res.user.displayName}`, 'success');
        return res.accessToken;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify('Ошибка авторизации Google Drive: ' + msg, 'error');
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await googleDriveLogout();
    onAuthChange(null, null);
    onNotify('Сессия Google Drive завершена', 'info');
  };

  const uploadBatchItems = async (itemsToUpload: DriveUploadQueueItem[], explicitToken?: string | null) => {
    if (!itemsToUpload.length) return;

    const cleanFolder = targetFolderId.trim() || DEFAULT_DRIVE_FOLDER_ID;
    if (!targetFolderId.trim()) {
      onTargetFolderIdChange(DEFAULT_DRIVE_FOLDER_ID);
    }

    let activeToken = explicitToken || driveToken || getDriveAccessToken();
    if (!activeToken) {
      activeToken = await handleLogin();
      if (!activeToken) return;
    }

    setIsUploadingBatch(true);
    let successCount = 0;

    for (const item of itemsToUpload) {
      setQueue(prev =>
        prev.map(q =>
          q.id === item.id ? { ...q, status: 'uploading', progress: 1, errorMessage: undefined } : q
        )
      );

      try {
        const result = await resumableUploadToGoogleDrive(
          item.file,
          cleanFolder,
          activeToken,
          percent => {
            setQueue(prev =>
              prev.map(q => (q.id === item.id ? { ...q, progress: percent } : q))
            );
          }
        );

        successCount += 1;
        setQueue(prev =>
          prev.map(q =>
            q.id === item.id
              ? { ...q, status: 'done', progress: 100, driveFileId: result.id }
              : q
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setQueue(prev =>
          prev.map(q =>
            q.id === item.id ? { ...q, status: 'error', errorMessage: msg } : q
          )
        );
        onNotify(`Ошибка загрузки «${item.file.name}»: ${msg}`, 'error');
      }
    }

    setIsUploadingBatch(false);
    if (successCount > 0) {
      onNotify(
        `✅ В папку Google Drive (${cleanFolder}) физически выгружено файлов: ${successCount} из ${itemsToUpload.length}!`,
        'success'
      );
    }
  };

  const addFilesToQueue = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    // а) Заполняем слоты таймлайна реальными именами файлов
    onFilesSelected(incomingFiles);

    // б) Формируем очередь и сразу запускаем физическую выгрузку в указанную папку Google Drive с прогресс-барами (0-100%)
    const newItems: DriveUploadQueueItem[] = incomingFiles.map(file => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      progress: 0,
      status: 'queued'
    }));

    setQueue(prev => {
      const incomingNames = new Set(incomingFiles.map(f => f.name));
      const filteredPrev = prev.filter(item => !incomingNames.has(item.file.name));
      return [...filteredPrev, ...newItems];
    });

    void uploadBatchItems(newItems);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    addFilesToQueue(files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files: File[] = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    addFilesToQueue(files);
  };

  const uploadAllQueuedToDrive = async () => {
    const pendingItems = queue.filter(item => item.status !== 'done');
    if (pendingItems.length === 0) {
      onNotify('Все файлы в списке уже выгружены в Google Drive!', 'info');
      return;
    }
    await uploadBatchItems(pendingItems);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const completedCount = queue.filter(q => q.status === 'done').length;
  const overallProgress =
    queue.length > 0
      ? Math.round(queue.reduce((acc, q) => acc + q.progress, 0) / queue.length)
      : 0;

  const isIndigo = accentColor === 'indigo';

  return (
    <div
      className={`bg-[#0b0f17] border rounded-2xl p-4 space-y-4 ${
        isIndigo ? 'border-indigo-500/35' : 'border-amber-500/35'
      }`}
    >
      {/* Верхняя строка: заголовок, поле текущей папки Google Drive и кнопка Google Auth */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isIndigo
                ? 'bg-indigo-500/15 border border-indigo-400/40 text-indigo-400'
                : 'bg-amber-500/15 border border-amber-400/40 text-amber-400'
            }`}
          >
            <CloudUpload className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              {title}
              <span className="text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded">
                Resumable API v3
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Авторизация Google Drive (Official Sign in with Google button style) */}
        <div className="flex flex-wrap items-center gap-2">
          {driveUser && driveToken ? (
            <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-medium truncate max-w-[180px]">
                {driveUser.email || driveUser.displayName || 'Google Drive подключен'}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-slate-400 hover:text-rose-400 ml-1 cursor-pointer"
                title="Выйти из Google Drive"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              disabled={isSigningIn}
              className="gsi-material-button flex items-center gap-2.5 bg-white hover:bg-slate-100 text-slate-900 font-semibold px-3.5 py-2 rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-60"
            >
              <div className="w-4 h-4 shrink-0">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-full h-full block"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </div>
              <span>{isSigningIn ? 'Подключение...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Поле целевой папки Google Drive (без создания новых папок) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-slate-900/70 border border-slate-800 rounded-xl p-3">
        <div className="md:col-span-1">
          <label className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" /> Текущая папка Google Drive (target_folder_id):
          </label>
          <span className="text-[10px] text-slate-400 block">
            Загрузка идет строго в эту папку (без создания новых подпапок)
          </span>
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <input
            type="text"
            value={targetFolderId}
            onChange={e => onTargetFolderIdChange(e.target.value)}
            placeholder="Вставьте ID целевой папки Google Drive (GDRIVE_FOLDER_ID)..."
            className="w-full bg-[#090d16] border border-slate-700 focus:border-emerald-400 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 outline-none"
          />
        </div>
      </div>

      {/* Зона Drag-and-Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_25px_rgba(52,211,153,0.2)]'
            : isIndigo
            ? 'border-slate-700 hover:border-indigo-400/60 bg-[#090d16]/70 hover:bg-slate-900/60'
            : 'border-slate-700 hover:border-amber-400/60 bg-[#090d16]/70 hover:bg-slate-900/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mp4,.mov,.mkv,.webm,.mp3,.wav"
          className="hidden"
          onChange={handleFileInput}
        />
        <FolderUp
          className={`w-9 h-9 mx-auto mb-2 ${
            isIndigo
              ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.6)]'
              : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
          }`}
        />
        <p className="text-sm font-bold text-slate-100">
          Перетащите исходные видеоклипы сюда или выберите файлы
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Имена файлов автоматически подставляются в свободные слоты таймлайна • Прямая выгрузка в{' '}
          <code className="text-emerald-400 font-mono">
            {targetFolderId.trim() || 'target_folder_id'}
          </code>
        </p>
      </div>

      {/* Список файлов и прогресс-бар Resumable-загрузки */}
      {queue.length > 0 && (
        <div className="space-y-3 bg-slate-900/75 border border-slate-800 rounded-xl p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">
                Файлы к выгрузке в Google Drive ({completedCount}/{queue.length} готово)
              </span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                Общий прогресс: {overallProgress}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={uploadAllQueuedToDrive}
                disabled={isUploadingBatch}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 shadow-md shadow-emerald-500/15"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isUploadingBatch
                  ? 'Выгрузка в Google Drive...'
                  : 'Загрузить все в текущую папку Google Drive'}
              </button>
              <button
                type="button"
                onClick={() => setQueue([])}
                disabled={isUploadingBatch}
                className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 cursor-pointer disabled:opacity-50"
                title="Очистить список"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Общий прогресс-бар */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-emerald-400 transition-all duration-200"
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          {/* Индивидуальный список файлов с прогресс-барами */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll pr-1">
            {queue.map(item => (
              <div
                key={item.id}
                className="bg-[#090d16] border border-slate-800 rounded-lg px-3 py-2 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.status === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : item.status === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="font-mono text-slate-200 truncate">{item.file.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      ({formatBytes(item.file.size)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        item.status === 'done'
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : item.status === 'error'
                          ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                          : item.status === 'uploading'
                          ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {item.status === 'done'
                        ? '✓ В Google Drive (100%)'
                        : item.status === 'error'
                        ? 'Ошибка'
                        : item.status === 'uploading'
                        ? `Загрузка ${item.progress}%`
                        : 'Готов к выгрузке'}
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      item.status === 'done'
                        ? 'bg-emerald-400'
                        : item.status === 'error'
                        ? 'bg-rose-500'
                        : 'bg-amber-400'
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>

                {item.errorMessage && (
                  <p className="text-[10px] text-rose-400 font-mono">{item.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
