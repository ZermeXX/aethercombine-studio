/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
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
  Sparkles
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  GoogleDriveDirectUploader
} from './GoogleDriveDirectUploader';
import {
  googleDriveSignIn,
  getDriveAccessToken,
  resumableUploadToGoogleDrive
} from '../googleDriveAuth';

export interface NarrativeSceneItem {
  scene_index: number;
  scene_id: string;
  file_name: string;
  start_time: string | number;
  duration: number;
  transition: {
    type: 'crossfade' | 'dissolve' | 'fade' | 'cut' | 'none';
    duration_sec: number;
  };
  text_overlay: string;
}

export interface MasterAudioConfig {
  file_name: string;
  volume: number;
  fade_in_sec: number;
  fade_out_sec: number;
}

export interface NarrativeExportSettings {
  resolution: '4k' | '1080p';
  aspect_ratio: '16:9' | '9:16';
  video_codec: 'libx265' | 'libx264';
  bitrate_mbps: number;
  crf: number;
  fps: 24 | 30 | 60;
  audio_bitrate_kbps: 320 | 256 | 192;
}

export interface NarrativeMontageManifest {
  schema_version: '3.0';
  project_type: 'narrative_scenes_montage';
  manifest_name?: string;
  total_scenes: number;
  total_duration_sec: number;
  cloud_export: {
    target_folder_id: string;
  };
  gdrive_folder_id: string;
  master_audio: MasterAudioConfig;
  export_settings: NarrativeExportSettings;
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
  transferredScript: string;
  onClearTransferredScript: () => void;
  onOpenConfigModal: () => void;
  onStartRenderStatus: (title: string, desc: string, repo: string) => void;
  onNotify: (message: string, type: 'info' | 'error' | 'success') => void;
  encodeManifestBase64: (manifestObj: unknown) => string;
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

export const MontageCombineView: React.FC<MontageCombineViewProps> = ({
  ghToken,
  ghRepo,
  ghBranch,
  gdriveFolderId,
  onGdriveFolderIdChange,
  driveUser,
  driveToken,
  onDriveAuthChange,
  transferredScript,
  onClearTransferredScript,
  onOpenConfigModal,
  onStartRenderStatus,
  onNotify,
  encodeManifestBase64
}) => {
  // Список сцен повествовательного видео (без захардкоженных имен-заглушек)
  const [narrativeScenes, setNarrativeScenes] = useState<NarrativeSceneItem[]>(() =>
    Array.from({ length: 6 }, (_, idx) => ({
      scene_index: idx + 1,
      scene_id: `SCENE_${String(idx + 1).padStart(2, '0')}`,
      file_name: '',
      start_time: formatTimecode(idx * 6),
      duration: 6,
      transition: {
        type: 'crossfade',
        duration_sec: 0.8
      },
      text_overlay: ''
    }))
  );

  // Общая мастер-аудиодорожка (.mp3 / .wav)
  const [masterAudio, setMasterAudio] = useState<MasterAudioConfig>({
    file_name: '',
    volume: 1.0,
    fade_in_sec: 1.0,
    fade_out_sec: 2.0
  });
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

  // Параметры кодирования для 60+ сцен
  const [exportSettings, setExportSettings] = useState<NarrativeExportSettings>({
    resolution: '4k',
    aspect_ratio: '16:9',
    video_codec: 'libx265',
    bitrate_mbps: 35,
    crf: 18,
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
      const dur = Math.max(1, Number(item.duration) || 6);
      cursorSec += dur;
      return {
        ...item,
        scene_index: idx + 1,
        start_time: startStr
      };
    });
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

        // 2. Если файлов больше, чем свободных слотов — создаем новые сцены с реальными именами файлов
        while (fileQueueIdx < videoOrImageFiles.length) {
          const newIdx = next.length + 1;
          next.push({
            scene_index: newIdx,
            scene_id: `SCENE_${String(newIdx).padStart(2, '0')}`,
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

  // Универсальный динамический парсер JSON-сценария (60+ сцен)
  const applyNarrativeScenarioJson = (raw: Record<string, unknown>, fileNameLabel: string) => {
    const rawScenesArray = Array.isArray(raw.scenes)
      ? raw.scenes
      : Array.isArray(raw.timeline_slots)
      ? raw.timeline_slots
      : Array.isArray(raw.slots)
      ? raw.slots
      : Array.isArray(raw.items)
      ? raw.items
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

          return {
            scene_index: idx + 1,
            scene_id: String(
              sc.scene_id || sc.slot_id || sc.id || `SCENE_${String(idx + 1).padStart(2, '0')}`
            ),
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
            text_overlay: overlayText
          };
        });

      if (parsedScenes.length > 0) {
        setNarrativeScenes(parsedScenes);
      }
    }

    // Маппинг master_audio
    if (raw.master_audio && typeof raw.master_audio === 'object') {
      const ma = raw.master_audio as Record<string, unknown>;
      const audioName = String(ma.file_name || ma.filename || ma.asset_name || '').trim();
      setMasterAudio(prev => ({
        file_name: audioName,
        volume: typeof ma.volume === 'number' ? ma.volume : prev.volume,
        fade_in_sec: typeof ma.fade_in_sec === 'number' ? ma.fade_in_sec : prev.fade_in_sec,
        fade_out_sec: typeof ma.fade_out_sec === 'number' ? ma.fade_out_sec : prev.fade_out_sec
      }));
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
          scene_id: `SCENE_${String(nextNum).padStart(2, '0')}`,
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

  const generate60ScenesTemplate = () => {
    setNarrativeScenes(prev => {
      const generated: NarrativeSceneItem[] = Array.from({ length: 60 }, (_, idx) => {
        const existing = prev[idx];
        return {
          scene_index: idx + 1,
          scene_id: existing?.scene_id || `SCENE_${String(idx + 1).padStart(2, '0')}`,
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
    onNotify('Сформирована сетка таймлайна на 60 сцен (с сохранением введенных имен файлов)', 'info');
  };

  const removeScene = (idx: number) => {
    setNarrativeScenes(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((_, i) => i !== idx);
      return recalculateStartTimes(filtered);
    });
  };

  const handleSelectMasterAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMasterAudioFile(file);
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

  const totalNarrativeDurationSec = useMemo(
    () =>
      narrativeScenes.reduce((acc, sc, idx) => {
        const isLast = idx === narrativeScenes.length - 1;
        const overlap =
          !isLast && sc.transition.type !== 'cut' && sc.transition.type !== 'none'
            ? Math.max(0, Number(sc.transition.duration_sec) || 0)
            : 0;
        return acc + Math.max(1, Number(sc.duration) || 0) - overlap;
      }, 0),
    [narrativeScenes]
  );

  // Текущий итоговый JSON-манифест для 60+ сцен
  const narrativeManifest: NarrativeMontageManifest = useMemo(
    () => ({
      schema_version: '3.0',
      project_type: 'narrative_scenes_montage',
      manifest_name: importedScenarioName || undefined,
      total_scenes: narrativeScenes.length,
      total_duration_sec: Math.round(totalNarrativeDurationSec * 10) / 10,
      cloud_export: {
        target_folder_id: gdriveFolderId.trim()
      },
      gdrive_folder_id: gdriveFolderId.trim(),
      master_audio: {
        file_name: masterAudio.file_name.trim(),
        volume: masterAudio.volume,
        fade_in_sec: masterAudio.fade_in_sec,
        fade_out_sec: masterAudio.fade_out_sec
      },
      export_settings: exportSettings,
      scenes: narrativeScenes.map((sc, idx) => ({
        scene_index: idx + 1,
        scene_id: sc.scene_id.trim() || `SCENE_${String(idx + 1).padStart(2, '0')}`,
        file_name: sc.file_name.trim(),
        start_time: sc.start_time,
        duration: Number(sc.duration) || 6,
        transition: sc.transition,
        text_overlay: sc.text_overlay
      }))
    }),
    [
      importedScenarioName,
      narrativeScenes,
      totalNarrativeDurationSec,
      gdriveFolderId,
      masterAudio,
      exportSettings
    ]
  );

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
    onNotify('JSON-манифест сцен экспортирован!', 'success');
  };

  // Запуск облачного монтажа 60+ сцен: POST workflow_dispatch на render_scenes.yml
  const startNarrativeScenesRender = async () => {
    if (!ghToken) {
      onNotify('Настройте GitHub Personal Access Token (PAT) в параметрах раннера!', 'error');
      onOpenConfigModal();
      return;
    }

    const targetRepo = (ghRepo || 'ZermeXX/aetherflow-render').trim();
    const encodedPayload = encodeManifestBase64(narrativeManifest);

    setIsDispatching(true);
    try {
      onStartRenderStatus(
        `Облачный монтаж сцен запущен (${narrativeScenes.length} сцен • ${exportSettings.resolution.toUpperCase()} • ${exportSettings.video_codec} ${exportSettings.fps}fps)`,
        `Workflow: render_scenes.yml | Мастер-аудио: ${
          masterAudio.file_name || 'без внешнего аудио'
        } | Папка GDrive: ${gdriveFolderId || 'не указана'}`,
        targetRepo
      );

      const res = await fetch(
        `https://api.github.com/repos/${targetRepo}/actions/workflows/render_scenes.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: ghBranch || 'main',
            inputs: {
              manifest_payload: encodedPayload
            }
          })
        }
      );

      if (res.ok) {
        onNotify(
          `🚀 Запущен workflow render_scenes.yml в ${targetRepo} (${narrativeScenes.length} сцен)!`,
          'success'
        );
      } else {
        const errBody = await res.text().catch(() => '');
        onNotify(
          `Ошибка вызова render_scenes.yml (${res.status}): ${errBody || res.statusText}`,
          'error'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify('Сетевой сбой при запуске render_scenes.yml: ' + msg, 'error');
    } finally {
      setIsDispatching(false);
    }
  };

  const filledScenesCount = narrativeScenes.filter(s => Boolean(s.file_name.trim())).length;

  return (
    <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Шапка вкладки «Комбайн монтажа (60+ сцен)» */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
            <Clapperboard className="text-indigo-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            <span>Комбайн монтажа (60+ сцен) — Повествовательный таймлайн &amp; Мастер-Аудио</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Прямая Resumable-выгрузка исходников в текущую папку Google Drive • Динамический парсер JSON-сценариев • Отправка в{' '}
            <code className="text-indigo-300 font-mono">render_scenes.yml</code>
          </p>
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
            <FolderUp className="w-4 h-4" /> Загрузить JSON-сценарий (60+ сцен)
          </button>

          <button
            type="button"
            onClick={handleExportScenarioJson}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" /> Экспорт JSON
          </button>

          <button
            type="button"
            onClick={generate60ScenesTemplate}
            className="bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer"
          >
            Сетка 60 сцен
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
        subtitle="Перетащите исходные видеоклипы сюда или выберите файлы — они загружаются напрямую в target_folder_id (Resumable Upload), а их точные имена автоматически заполняют свободные сцены таймлайна"
      />

      {/* 2. БЛОК ВЫБОРА / ЗАГРУЗКИ ОБЩЕЙ МАСТЕР-АУДИОДОРОЖКИ (.MP3 / .WAV) И ПАРАМЕТРОВ КОДИРОВАНИЯ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Левая карточка: Общая мастер-аудиодорожка (.mp3 или .wav) */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                2. Общая мастер-аудиодорожка (.mp3 / .wav)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
              master_audio
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Имя файла мастер-фонограммы в папке Google Drive:
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={masterAudio.file_name}
                  onChange={e =>
                    setMasterAudio(prev => ({ ...prev, file_name: e.target.value }))
                  }
                  placeholder="Напр.: master_voiceover_full.wav или выберите локальный файл →"
                  className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 outline-none"
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
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  🎵 Выбрать .mp3 / .wav
                </button>
              </div>
            </div>

            {masterAudioFile && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300 font-mono truncate">
                    Локальный файл: <strong className="text-amber-300">{masterAudioFile.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleUploadMasterAudioToDrive}
                    disabled={masterAudioUploadProgress.uploading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    {masterAudioUploadProgress.uploading
                      ? `Загрузка ${masterAudioUploadProgress.progress}%...`
                      : masterAudioUploadProgress.uploaded
                      ? '✓ Выгружено в GDrive'
                      : 'Загрузить фонограмму в Google Drive'}
                  </button>
                </div>

                {(masterAudioUploadProgress.uploading || masterAudioUploadProgress.uploaded) && (
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-150"
                      style={{ width: `${masterAudioUploadProgress.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Громкость (Volume):
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Fade-In (сек):
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Fade-Out (сек):
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-400 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Правая карточка: Параметры кодирования для сцен (4K/1080p, битрейт, CRF, FPS) */}
        <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                3. Параметры кодирования сцен (export_settings)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
              {exportSettings.resolution.toUpperCase()} • {exportSettings.video_codec} • {exportSettings.fps}fps
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Разрешение:
              </label>
              <select
                value={exportSettings.resolution}
                onChange={e =>
                  setExportSettings(prev => ({
                    ...prev,
                    resolution: e.target.value as '4k' | '1080p'
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="4k">4K Ultra HD (3840×2160)</option>
                <option value="1080p">1080p Full HD (1920×1080)</option>
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
                Видеокодек:
              </label>
              <select
                value={exportSettings.video_codec}
                onChange={e =>
                  setExportSettings(prev => ({
                    ...prev,
                    video_codec: e.target.value as 'libx265' | 'libx264'
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-indigo-300 outline-none focus:border-indigo-400"
              >
                <option value="libx265">H.265 (libx265)</option>
                <option value="libx264">H.264 (libx264)</option>
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
                    crf: Math.max(14, Math.min(28, Number(e.target.value) || 18))
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none"
              />
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

      {/* 4. ТАЙМЛАЙН СЦЕН (SCENES: 60+ СЦЕН) */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-indigo-400" />
              <span>
                Таймлайн повествовательного монтажа (<code className="text-indigo-300">scenes: [{narrativeScenes.length}]</code>)
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Заполнено имен файлов: <strong className="text-emerald-400">{filledScenesCount}</strong> из{' '}
              <strong>{narrativeScenes.length}</strong> • Общий хронометраж:{' '}
              <strong className="text-amber-400">
                {formatTimecode(totalNarrativeDurationSec)} ({totalNarrativeDurationSec.toFixed(1)} сек)
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addScene}
              className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Добавить сцену (#{narrativeScenes.length + 1})
            </button>
            <button
              type="button"
              onClick={() =>
                setNarrativeScenes(prev =>
                  prev.map(s => ({ ...s, file_name: '' }))
                )
              }
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-300 px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
            >
              Очистить имена файлов
            </button>
          </div>
        </div>

        {/* Таблица / Сетка сцен таймлайна */}
        <div className="space-y-2.5 max-h-[520px] overflow-y-auto custom-scroll pr-1">
          {narrativeScenes.map((sc, idx) => {
            const hasFile = Boolean(sc.file_name.trim());
            return (
              <div
                key={sc.scene_id + '-' + idx}
                className={`bg-[#111622] border rounded-xl p-3 transition ${
                  hasFile
                    ? 'border-indigo-500/35 hover:border-indigo-400/60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs">
                  {/* Индекс и scene_id */}
                  <div className="sm:col-span-2 flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 px-2 py-1 rounded shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={sc.scene_id}
                      onChange={e => updateScene(idx, { scene_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-indigo-400"
                      title="ID сцены (scene_id)"
                    />
                  </div>

                  {/* Имя видеофайла (file_name) */}
                  <div className="sm:col-span-4">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={sc.file_name}
                        placeholder="Имя видеофайла (из JSON или Drag & Drop)"
                        onChange={e => updateScene(idx, { file_name: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none focus:border-amber-400"
                      />
                      {hasFile && (
                        <span title="Имя файла назначено" className="shrink-0 flex items-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Таймкод старта (start_time) и длительность (duration) */}
                  <div className="sm:col-span-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={String(sc.start_time)}
                      onChange={e => updateScene(idx, { start_time: e.target.value })}
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-mono text-sky-300 text-center outline-none"
                      title="Таймкод старта (start_time)"
                    />
                    <input
                      type="number"
                      min={1}
                      max={600}
                      step={0.5}
                      value={sc.duration}
                      onChange={e =>
                        updateScene(idx, {
                          duration: Math.max(0.5, Number(e.target.value) || 6)
                        })
                      }
                      className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-mono text-emerald-400 font-bold text-center outline-none"
                      title="Длительность сцены (сек)"
                    />
                  </div>

                  {/* Переход (transition) */}
                  <div className="sm:col-span-2 flex items-center gap-1">
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
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-200 outline-none"
                    >
                      <option value="crossfade">crossfade</option>
                      <option value="dissolve">dissolve</option>
                      <option value="fade">fade</option>
                      <option value="cut">cut (жесткий)</option>
                    </select>
                    {sc.transition.type !== 'cut' && sc.transition.type !== 'none' && (
                      <input
                        type="number"
                        min={0.2}
                        max={10}
                        step={0.1}
                        value={sc.transition.duration_sec}
                        onChange={e =>
                          updateScene(idx, {
                            transition: {
                              ...sc.transition,
                              duration_sec: Math.max(0.2, Number(e.target.value) || 0.8)
                            }
                          })
                        }
                        className="w-12 bg-slate-900 border border-slate-700 rounded-lg px-1 py-1.5 text-[11px] font-mono text-amber-300 text-center outline-none"
                        title="Длительность перехода (сек)"
                      />
                    )}
                  </div>

                  {/* Текстовый титр / оверлей (text_overlay) и удаление */}
                  <div className="sm:col-span-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={sc.text_overlay}
                      placeholder="Титр / text_overlay..."
                      onChange={e => updateScene(idx, { text_overlay: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-indigo-400"
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
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. ПРЕДПРОСМОТР ИТОГОВОГО JSON-МАНИФЕСТА СЦЕН И КНОПКА ЗАПУСКА RENDER_SCENES.YML */}
      <div className="bg-[#0b0f17] border border-indigo-500/30 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-indigo-300 uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Итоговый манифест для workflow{' '}
            <code className="font-mono text-amber-300">render_scenes.yml</code> (Base64):
          </span>
          <span className="font-mono text-emerald-400">
            Сцен: {narrativeScenes.length} • Мастер-аудио: {masterAudio.file_name || 'нет'} • Папка GDrive:{' '}
            {gdriveFolderId || 'не задана'}
          </span>
        </div>

        <pre className="text-[10px] font-mono text-indigo-200/90 bg-slate-950/80 border border-slate-800 rounded-xl p-3 max-h-36 overflow-x-auto custom-scroll">
          {JSON.stringify(narrativeManifest, null, 2)}
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <div className="space-y-0.5 text-xs">
            <span className="text-slate-400 block">
              Целевой репозиторий:{' '}
              <code className="text-amber-300 font-mono">
                {ghRepo || 'ZermeXX/aetherflow-render'}
              </code>{' '}
              → <code className="text-indigo-300 font-mono">render_scenes.yml</code>
            </span>
            <span className="text-[11px] text-slate-500 block font-mono">
              inputs: &#123; manifest_payload: &quot;{encodeManifestBase64(narrativeManifest).slice(0, 36)}...&quot; &#125;
            </span>
          </div>

          <button
            type="button"
            onClick={startNarrativeScenesRender}
            disabled={isDispatching}
            className="flex items-center gap-2.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-slate-950 font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition cursor-pointer disabled:opacity-60 text-xs"
          >
            <Play className="w-4 h-4 fill-current" />
            {isDispatching
              ? 'Отправка задачи в GitHub Actions...'
              : '🚀 Запустить облачный монтаж 60+ сцен'}
          </button>
        </div>
      </div>
    </div>
  );
};
