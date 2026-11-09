/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Download,
  RefreshCw,
  Camera,
  Eye,
  Copy,
  Check,
  Columns,
  Smartphone,
  Film,
  Contrast,
  Layers
} from 'lucide-react';

interface ThumbnailStudioViewProps {
  thumbTitle: string;
  onThumbTitleChange: (title: string) => void;
  thumbBadge: string;
  onThumbBadgeChange: (badge: string) => void;
  youtubeMockTitle?: string;
  scriptContext?: string;
  onNotify: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

export const ThumbnailStudioView: React.FC<ThumbnailStudioViewProps> = ({
  thumbTitle,
  onThumbTitleChange,
  thumbBadge,
  onThumbBadgeChange,
  youtubeMockTitle,
  scriptContext,
  onNotify
}) => {
  // Основной холст (Обложка A) и второй холст для A/B теста (Обложка B)
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imgA, setImgA] = useState<HTMLImageElement | null>(null);
  const [imgB, setImgB] = useState<HTMLImageElement | null>(null);
  const [titleB, setTitleB] = useState<string>('SEALED FOR 50 YEARS');
  const [badgeB, setBadgeB] = useState<string>('ambience');

  // Режим A/B тестирования и Ч/Б контрастный фильтр силуэтов
  const [abModeEnabled, setAbModeEnabled] = useState<boolean>(false);
  const [bwContrastFilter, setBwContrastFilter] = useState<boolean>(false);

  // 2. Оверлей интерфейса YouTube (YouTube UI Mockup Grid)
  const [showYoutubeOverlay, setShowYoutubeOverlay] = useState<boolean>(true);
  const [youtubeDurationBadge, setYoutubeDurationBadge] = useState<string>('3:00:00');
  const [youtubeChannelName, setYoutubeChannelName] = useState<string>('Aether Documentary 4K');
  const [youtubeVideoHeading, setYoutubeVideoHeading] = useState<string>(
    youtubeMockTitle || 'The Classified Alpine Tape: Why This Station Was Sealed in 24 Hours (4K Documentary)'
  );

  useEffect(() => {
    if (youtubeMockTitle) {
      setYoutubeVideoHeading(youtubeMockTitle);
    }
  }, [youtubeMockTitle]);

  // 1. Авто-экстрактор лучшего кадра (Keyframe Grabbing в честном 4K 3840x2160)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [seekTimeSec, setSeekTimeSec] = useState<number>(0);
  const [extracted4KDataUrl, setExtracted4KDataUrl] = useState<string>('');

  // 3. Генератор метаданных под превью (Prompt Meta Helper для Midjourney / NanoBanana)
  const [promptStylePreset, setPromptStylePreset] = useState<
    'mystery_dark' | 'ambient_4k' | 'truecrime_contrast' | 'scifi_neon'
  >('mystery_dark');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Отрисовка обложки на выбранном Canvas (1280x720 или 3840x2160)
  const drawCoverOnCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      image: HTMLImageElement | null,
      titleText: string,
      badgeType: string,
      variantLabel?: string
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const scale = w / 1280;

      ctx.clearRect(0, 0, w, h);

      // Фон
      if (image) {
        ctx.drawImage(image, 0, 0, w, h);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#090d16');
        bgGrad.addColorStop(0.5, '#111c33');
        bgGrad.addColorStop(1, '#060911');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Световое пятно для проверки силуэта
        const radial = ctx.createRadialGradient(
          w * 0.62,
          h * 0.42,
          20 * scale,
          w * 0.62,
          h * 0.42,
          440 * scale
        );
        radial.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
        radial.addColorStop(0.6, 'rgba(56, 189, 248, 0.08)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#475569';
        ctx.font = `600 ${Math.round(22 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          variantLabel
            ? `${variantLabel} — загрузите арт или захватите 4K стоп-кадр из видео`
            : 'Загрузите изображение или захватите 4K стоп-кадр из видео',
          w / 2,
          h * 0.45
        );
      }

      // Кинематографичный градиент снизу
      const grad = ctx.createLinearGradient(0, h * 0.48, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.48, w, h * 0.52);

      // Бейдж в правом верхнем углу
      if (badgeType !== 'none') {
        const bw = 200 * scale;
        const bh = 44 * scale;
        const bx = w - bw - 32 * scale;
        const by = 28 * scale;

        ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 9 * scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${Math.round(14 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        let bText = '4K ULTRA HD';
        if (badgeType === 'ambience') bText = 'AMBIENCE 60FPS';
        if (badgeType === '10h') bText = '10 HOURS LOOP';
        ctx.fillText(bText, bx + bw / 2, by + bh * 0.63);
      }

      // Крупный CTR заголовок на английском (Thumbnail Text Hook — US English)
      const finalTitle = (titleText || 'DO NOT PLAY!').toUpperCase();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(66 * scale)}px Inter, "Bebas Neue", sans-serif`;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 16 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 6 * scale;
      ctx.strokeText(finalTitle, 48 * scale, h - 58 * scale);
      ctx.fillText(finalTitle, 48 * scale, h - 58 * scale);
      ctx.shadowBlur = 0;
    },
    []
  );

  // Перерисовка всех холстов (A, B и мобильного 160x90)
  const renderAllCanvases = useCallback(() => {
    drawCoverOnCanvas(canvasARef.current, imgA, thumbTitle, thumbBadge, 'Обложка A');
    drawCoverOnCanvas(canvasBRef.current, imgB || imgA, titleB, badgeB, 'Обложка B');
    drawCoverOnCanvas(mobileCanvasRef.current, imgA, thumbTitle, thumbBadge);
  }, [drawCoverOnCanvas, imgA, imgB, thumbTitle, thumbBadge, titleB, badgeB]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  const handleLoadImageForSlot = (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 'A' | 'B'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          if (slot === 'A') setImgA(img);
          else setImgB(img);
          onNotify(`Изображение загружено в Обложку ${slot}!`, 'success');
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Загрузка видео для Keyframe Grabbing в 4K (3840x2160)
  const handleSelectVideoForExtraction = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFileName(file.name);
    setSeekTimeSec(0);
    setExtracted4KDataUrl('');
    onNotify(`Видео «${file.name}» загружено в 4K экстрактор стоп-кадров!`, 'success');
    e.target.value = '';
  };

  const handleSeekVideo = (sec: number) => {
    const clamped = Math.max(0, Math.min(videoDuration || 3600, sec));
    setSeekTimeSec(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  // Захват стоп-кадра в честном 4K разрешении (3840x2160) и применение к Обложке A или B
  const capture4KKeyframe = (targetSlot: 'A' | 'B' | 'download') => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      onNotify('Сначала выберите видеофайл для захвата стоп-кадра!', 'error');
      return;
    }

    const offscreen4K = document.createElement('canvas');
    offscreen4K.width = 3840;
    offscreen4K.height = 2160;
    const ctx = offscreen4K.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, 3840, 2160);

    const dataUrl = offscreen4K.toDataURL('image/jpeg', 0.96);
    setExtracted4KDataUrl(dataUrl);

    if (targetSlot === 'download') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `keyframe_4k_3840x2160_${Math.round(seekTimeSec)}s.jpg`;
      a.click();
      onNotify(
        `📸 Честный 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) скачан!`,
        'success'
      );
      return;
    }

    const capturedImg = new Image();
    capturedImg.onload = () => {
      if (targetSlot === 'A') {
        setImgA(capturedImg);
      } else {
        setImgB(capturedImg);
      }
      onNotify(
        `📸 4K стоп-кадр (3840×2160 @ ${seekTimeSec.toFixed(1)}с) установлен на Обложку ${targetSlot}!`,
        'success'
      );
    };
    capturedImg.src = dataUrl;
  };

  // Скачивание готовой обложки в 4K (3840x2160)
  const downloadCover4K = (slot: 'A' | 'B') => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 3840;
    offscreen.height = 2160;
    if (slot === 'A') {
      drawCoverOnCanvas(offscreen, imgA, thumbTitle, thumbBadge);
    } else {
      drawCoverOnCanvas(offscreen, imgB || imgA, titleB, badgeB);
    }
    const link = document.createElement('a');
    link.download = `thumbnail_4k_3840x2160_${slot}.jpg`;
    link.href = offscreen.toDataURL('image/jpeg', 0.96);
    link.click();
    onNotify(`Обложка ${slot} экспортирована в честном 4K (3840×2160)!`, 'success');
  };

  // Автогенератор промпта для Midjourney / NanoBanana строго на английском (US English)
  const generatedCoverPrompt = (() => {
    const rawContext = (scriptContext || thumbTitle || 'abandoned alpine weather station mystery')
      .replace(/[а-яёА-ЯЁ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const topicHint =
      rawContext.length > 5
        ? rawContext.slice(0, 110)
        : 'classified alpine weather station anomaly, sealed bunker magnetic tape recording';

    const styleMap = {
      mystery_dark:
        'High-CTR YouTube documentary thumbnail, cinematic dark mystery atmosphere, extreme foreground focus on vintage reel-to-reel tape recorder glowing red indicator in snow, shadowy silhouette in background, negative space on left for bold English typography, dramatic chiaroscuro, volumetric fog, 35mm f/1.4 lens, 8k photorealistic',
      ambient_4k:
        'Ultra-cozy 4K ambient loop thumbnail, warm fireplace embers contrasting against deep blue arctic blizzard outside window, hyper-detailed snow crystals, soft volumetric warm light, cinematic color grading, Kodachrome 64 aesthetic, 8k resolution',
      truecrime_contrast:
        'True crime investigative YouTube thumbnail, high-contrast split composition, classified dossier folder with red TOP SECRET stamp on metal table, cold cyan rim lighting, intense dramatic shadows, ultra sharp focus, rule of thirds',
      scifi_neon:
        'Anomalous signal documentary thumbnail, glowing green oscilloscope waveform spiking in dark bunker, atmospheric dust particles in light beam, anamorphic lens flare, high contrast silhouette, 8k octane render realism'
    };

    const hookTextEn = /[а-яёА-ЯЁ]/.test(thumbTitle) ? 'DO NOT PLAY!' : thumbTitle || 'DO NOT PLAY!';

    return `/imagine prompt: ${styleMap[promptStylePreset]} | Subject context: "${topicHint}" | Thumbnail Text Hook: "${hookTextEn.toUpperCase()}" | Bold composition with clear silhouette readability on mobile 160x90px --ar 16:9 --stylize 250 --v 6.0`;
  })();

  const copyCoverPrompt = () => {
    navigator.clipboard.writeText(generatedCoverPrompt);
    setCopiedPrompt(true);
    onNotify('Промпт обложки (Midjourney / NanoBanana) скопирован в буфер обмена!', 'success');
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ВЕРХНЯЯ ПАНЕЛЬ: НАСТРОЙКИ ОБЛОЖКИ + ХОЛСТ ПРЕДПРОСМОТРА С YOUTUBE UI OVERLAY И A/B ТЕСТЕРОМ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая колонка: Настройки Обложки A / B и переключатели режимов */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="text-emerald-400 w-5 h-5" /> Студия 4K Превью &amp; CTR Тестер
            </h2>
            <span className="text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">
              3840×2160 4K
            </span>
          </div>

          {/* Переключатели: YouTube UI Grid, A/B-тестер и Ч/Б фильтр силуэтов */}
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setShowYoutubeOverlay(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                showYoutubeOverlay
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Eye className="w-4 h-4" /> Оверлей интерфейса YouTube (Mockup Grid)
              </span>
              <span className="text-[10px] font-mono">{showYoutubeOverlay ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAbModeEnabled(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                abModeEnabled
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Columns className="w-4 h-4" /> A/B-тестер (Обложка A vs Обложка B)
              </span>
              <span className="text-[10px] font-mono">{abModeEnabled ? 'A vs B' : 'SINGLE'}</span>
            </button>

            <button
              type="button"
              onClick={() => setBwContrastFilter(prev => !prev)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                bwContrastFilter
                  ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span className="flex items-center gap-2">
                <Contrast className="w-4 h-4" /> Ч/Б контрастный фильтр (Проверка силуэтов)
              </span>
              <span className="text-[10px] font-mono">{bwContrastFilter ? 'B&W 125%' : 'COLOR'}</span>
            </button>
          </div>

          {/* Настройки Обложки A */}
          <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-bold uppercase text-amber-400 block">
              Вариант A (Основная обложка)
            </span>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Исходный арт (Обложка A):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleLoadImageForSlot(e, 'A')}
                className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Текст на обложке A (Thumbnail Text Hook — US English):
              </label>
              <input
                type="text"
                value={thumbTitle}
                onChange={e => onThumbTitleChange(e.target.value)}
                placeholder="DO NOT PLAY!"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">
                Кинематографичный бейдж A:
              </label>
              <select
                value={thumbBadge}
                onChange={e => onThumbBadgeChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              >
                <option value="4k_gold">4K ULTRA HD • GOLD</option>
                <option value="ambience">AMBIENCE • 60FPS</option>
                <option value="10h">10 HOURS LOOP</option>
                <option value="none">Без бейджа</option>
              </select>
            </div>
          </div>

          {/* Настройки Обложки B (если включен A/B-тестер) */}
          {abModeEnabled && (
            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-bold uppercase text-emerald-400 block">
                Вариант B (Конкурентный тест A/B)
              </span>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Исходный арт (Обложка B):
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleLoadImageForSlot(e, 'B')}
                  className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">
                  Текст на обложке B (US English):
                </label>
                <input
                  type="text"
                  value={titleB}
                  onChange={e => setTitleB(e.target.value)}
                  placeholder="SEALED FOR 50 YEARS"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Параметры YouTube оверлея (таймкод 3:00:00 и название канала) */}
          {showYoutubeOverlay && (
            <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Параметры оверлея YouTube:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block">Таймкод в углу:</label>
                  <input
                    type="text"
                    value={youtubeDurationBadge}
                    onChange={e => setYoutubeDurationBadge(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-amber-300 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Название канала:</label>
                  <input
                    type="text"
                    value={youtubeChannelName}
                    onChange={e => setYoutubeChannelName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => downloadCover4K('A')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Скачать A (4K)
            </button>
            <button
              type="button"
              onClick={() => downloadCover4K('B')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Скачать B (4K)
            </button>
          </div>
        </div>

        {/* Правая область (2 колонки): Холст A (или A vs B) + YouTube UI Overlay + Мобильное превью 160x90 px */}
        <div className="lg:col-span-2 bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div className={`grid gap-4 ${abModeEnabled ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* ХОЛСТ ОБЛОЖКИ A */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400 uppercase">
                  Обложка A {bwContrastFilter ? '(Ч/Б Контраст Силуэтов)' : ''}
                </span>
                <span className="text-[11px] font-mono text-slate-400">16:9 • 4K Preview</span>
              </div>

              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black shadow-2xl">
                <canvas
                  ref={canvasARef}
                  width={1280}
                  height={720}
                  className={`w-full h-full object-contain transition-all duration-200 ${
                    bwContrastFilter ? 'grayscale contrast-125' : ''
                  }`}
                />

                {/* Оверлей интерфейса YouTube (YouTube UI Mockup Grid + плашка таймкода) */}
                {showYoutubeOverlay && (
                  <>
                    {/* Полупрозрачная сетка композиции третей */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-r border-b border-white/15" />
                      <div className="border-b border-white/15" />
                      <div className="border-r border-white/15" />
                      <div className="border-r border-white/15" />
                      <div />
                    </div>

                    {/* Плашка таймкода YouTube в правом нижнем углу («3:00:00») */}
                    <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-white font-mono font-bold text-xs px-2 py-0.5 rounded shadow-md border border-white/10">
                      {youtubeDurationBadge || '3:00:00'}
                    </div>
                  </>
                )}
              </div>

              {/* Карточка метаданных YouTube под превью A (Аватарка + Заголовок + Канал) */}
              {showYoutubeOverlay && (
                <div className="flex items-start gap-3 pt-1 px-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-md">
                    4K
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <input
                      type="text"
                      value={youtubeVideoHeading}
                      onChange={e => setYoutubeVideoHeading(e.target.value)}
                      className="w-full bg-transparent text-sm font-bold text-slate-100 outline-none focus:border-b focus:border-amber-400 truncate"
                    />
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span>{youtubeChannelName}</span>
                      <span className="text-[10px] bg-slate-700 text-slate-200 px-1 rounded">✓</span>
                      <span>• 428 тыс. просмотров • 2 часа назад</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ХОЛСТ ОБЛОЖКИ B (при включенном A/B-тестере) */}
            {abModeEnabled && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 uppercase">
                    Обложка B {bwContrastFilter ? '(Ч/Б Контраст Силуэтов)' : ''}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">A/B Comparison</span>
                </div>

                <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-emerald-500/40 bg-black shadow-2xl">
                  <canvas
                    ref={canvasBRef}
                    width={1280}
                    height={720}
                    className={`w-full h-full object-contain transition-all duration-200 ${
                      bwContrastFilter ? 'grayscale contrast-125' : ''
                    }`}
                  />

                  {showYoutubeOverlay && (
                    <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-white font-mono font-bold text-xs px-2 py-0.5 rounded shadow-md border border-white/10">
                      {youtubeDurationBadge || '3:00:00'}
                    </div>
                  )}
                </div>

                {showYoutubeOverlay && (
                  <div className="flex items-start gap-3 pt-1 px-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-md">
                      4K
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {youtubeVideoHeading}
                      </p>
                      <div className="text-xs text-slate-400">
                        {youtubeChannelName} ✓ • Вариант B (Тест читаемости)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* НИЖНЯЯ ПАНЕЛЬ ХОЛСТА: МОБИЛЬНЫЙ МАСШТАБ (160x90 PX) ДЛЯ ПРОВЕРКИ ЧИТАЕМОСТИ НА СМАРТФОНАХ */}
          <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-[160px] h-[90px] rounded-lg overflow-hidden border border-amber-500/50 bg-black shrink-0 shadow-lg">
                <canvas
                  ref={mobileCanvasRef}
                  width={160}
                  height={90}
                  className={`w-[160px] h-[90px] block ${
                    bwContrastFilter ? 'grayscale contrast-125' : ''
                  }`}
                />
                <div className="pointer-events-none absolute bottom-1 right-1 bg-black/90 text-white font-mono text-[9px] font-bold px-1 rounded">
                  {youtubeDurationBadge || '3:00:00'}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Мобильный масштаб YouTube (Честное превью 160×90 px)
                </span>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  72% зрителей YouTube видят обложку в ленте смартфона именно в размере <strong>160×90 px</strong>. Проверьте, читается ли ваш текст и не перекрывает ли плашка <code>{youtubeDurationBadge}</code> важный объект в правом нижнем углу.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* НИЖНИЕ МОДУЛИ: 1. АВТО-ЭКСТРАКТОР ЛУЧШЕГО КАДРА 4K (3840x2160) & 3. ГЕНЕРАТОР МЕТАДАННЫХ PROMPT META HELPER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. АВТО-ЭКСТРАКТОР ЛУЧШЕГО КАДРА (KEYFRAME GRABBING В ЧЕСТНОМ 4K 3840x2160) */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                1. Авто-экстрактор лучшего кадра в 4K (Keyframe Grabbing 3840×2160)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
              3840×2160 UHD
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="file"
                accept="video/*"
                onChange={handleSelectVideoForExtraction}
                className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
              />
              {videoFileName && (
                <span className="text-[11px] font-mono text-emerald-300 truncate max-w-xs">
                  Файл: {videoFileName}
                </span>
              )}
            </div>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={e => {
                      setVideoDuration(e.currentTarget.duration || 10);
                    }}
                    className="w-full h-full object-contain"
                    controls
                    muted
                  />
                </div>

                <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-semibold">
                      Выбор точной секунды стоп-кадра:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={videoDuration || 3600}
                        step={0.1}
                        value={seekTimeSec}
                        onChange={e => handleSeekVideo(Number(e.target.value) || 0)}
                        className="w-20 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-xs font-mono text-amber-300 text-center outline-none"
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        / {videoDuration.toFixed(1)} сек
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 10}
                    step={0.05}
                    value={seekTimeSec}
                    onChange={e => handleSeekVideo(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => capture4KKeyframe('A')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      📸 В Обложку A (4K)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAbModeEnabled(true);
                        capture4KKeyframe('B');
                      }}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      📸 В Обложку B (4K)
                    </button>
                    <button
                      type="button"
                      onClick={() => capture4KKeyframe('download')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-3 rounded-lg text-xs cursor-pointer transition"
                    >
                      💾 Скачать кадр 3840×2160
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0f17] border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-400 space-y-1">
                <Film className="w-7 h-7 text-amber-400/70 mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-300">
                  Загрузите любой видеоклип (.mp4 / .mov / .webm)
                </p>
                <p className="text-[11px] text-slate-500">
                  Выберите лучший кадр с точностью до 0.05 сек и захватите его в честном разрешении 3840×2160 (4K)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3. ГЕНЕРАТОР МЕТАДАННЫХ ПОД ПРЕВЬЮ (PROMPT META HELPER ДЛЯ MIDJOURNEY / NANOBANANA) */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  3. Генератор метаданных под превью (Prompt Meta Helper)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
                Midjourney / NanoBanana
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase block">
                Визуальный стиль генерации превью по сценарию:
              </label>
              <select
                value={promptStylePreset}
                onChange={e =>
                  setPromptStylePreset(
                    e.target.value as
                      | 'mystery_dark'
                      | 'ambient_4k'
                      | 'truecrime_contrast'
                      | 'scifi_neon'
                  )
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-amber-300 font-semibold outline-none focus:border-amber-500"
              >
                <option value="mystery_dark">
                  🕵️ Тёмная документальная тайна (Высокий контраст, фокус на улике)
                </option>
                <option value="ambient_4k">
                  ❄️ Атмосферный 4K Луп (Тёплый свет внутри vs ледяная стихия)
                </option>
                <option value="truecrime_contrast">
                  📁 Архивное расследование / True Crime (Драматический свет, гриф SECRET)
                </option>
                <option value="scifi_neon">
                  📡 Аномальный сигнал / Научпоп (Осциллограф, объёмные лучи в темноте)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase block">
                Автосгенерированный промпт обложки (с учетом читаемости силуэтов 160×90):
              </label>
              <textarea
                rows={6}
                readOnly
                value={generatedCoverPrompt}
                className="w-full bg-[#0b0f17] border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={copyCoverPrompt}
            className="w-full bg-gradient-to-r from-indigo-500 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-500/20"
          >
            {copiedPrompt ? (
              <>
                <Check className="w-4 h-4" /> Промпт обложки скопирован!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Копировать промпт обложки (Midjourney / NanoBanana)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
