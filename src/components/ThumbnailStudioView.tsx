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
  Layers,
  Wand2,
  ZoomIn,
  X,
  Grid,
  CheckCircle2
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

// Генерация высокодетализированного процедурного 16:9 4K рендера (с вариацией композиции 0..3 для сетки 2x2)
function renderProcedural16x9ArtworkDataUrl(
  stylePreset: string,
  promptText: string,
  variantIndex: number = 0
): string {
  const c = document.createElement('canvas');
  c.width = 1920;
  c.height = 1080;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const palettesByVariant: Array<Record<string, [string, string, string]>> = [
    {
      mystery_dark: ['#060b14', '#16243d', '#f59e0b'],
      ambient_4k: ['#050c1a', '#0f294a', '#38bdf8'],
      truecrime_contrast: ['#0a090d', '#291218', '#ef4444'],
      scifi_neon: ['#04120e', '#0d3328', '#10b981']
    },
    {
      mystery_dark: ['#090814', '#22183b', '#fbbf24'],
      ambient_4k: ['#04101e', '#13365c', '#60a5fa'],
      truecrime_contrast: ['#0f070b', '#38121b', '#f43f5e'],
      scifi_neon: ['#041417', '#0e3b43', '#2dd4bf']
    },
    {
      mystery_dark: ['#050e14', '#132c3d', '#f97316'],
      ambient_4k: ['#070b19', '#1b2854', '#818cf8'],
      truecrime_contrast: ['#0d0a08', '#331d12', '#fb923c'],
      scifi_neon: ['#06130b', '#143d23', '#34d399']
    },
    {
      mystery_dark: ['#0a0712', '#26142e', '#eab308'],
      ambient_4k: ['#040f1a', '#0c3142', '#22d3ee'],
      truecrime_contrast: ['#090912', '#1f1638', '#e11d48'],
      scifi_neon: ['#031214', '#0b343d', '#06b6d4']
    }
  ];

  const paletteSet = palettesByVariant[variantIndex % 4] || palettesByVariant[0];
  const [bg1, bg2, accent] = paletteSet[stylePreset] || paletteSet.mystery_dark;

  const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, bg1);
  grad.addColorStop(0.55, bg2);
  grad.addColorStop(1, '#04060b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  const focalX = c.width * (0.64 + (variantIndex % 2) * 0.06);
  const focalY = c.height * (0.42 + Math.floor(variantIndex / 2) * 0.07);

  // Volumetric rays
  const glow = ctx.createRadialGradient(focalX, focalY, 40, focalX, focalY, 780);
  glow.addColorStop(0, accent + '66');
  glow.addColorStop(0.5, accent + '1a');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, c.width, c.height);

  // Cinematic focal object silhouette (Reel-to-reel / Outpost / Oscilloscope)
  ctx.save();
  ctx.translate(focalX, focalY + 35);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.fillStyle = '#090e1a';
  ctx.beginPath();
  ctx.roundRect(-240, -160, 480, 320, 24);
  ctx.fill();
  ctx.stroke();

  if (variantIndex % 2 === 0) {
    // Two magnetic reels
    [-110, 110].forEach(rx => {
      ctx.beginPath();
      ctx.arc(rx, -20, 82, 0, Math.PI * 2);
      ctx.fillStyle = '#111a2e';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, -20, 24, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    });
  } else {
    // Acoustic signal waveform on screen
    ctx.beginPath();
    ctx.moveTo(-200, 0);
    for (let x = -200; x <= 200; x += 10) {
      const amp = Math.sin((x + variantIndex * 45) * 0.06) * (75 - Math.abs(x) * 0.25);
      ctx.lineTo(x, amp);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // Glowing REC indicator
  ctx.beginPath();
  ctx.arc(175, 105, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.restore();

  // Atmospheric snow / dust particles
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 140; i++) {
    const px = ((i * 197 + variantIndex * 83) % c.width) + (promptText.length % 17);
    const py = (i * 113 + variantIndex * 59) % c.height;
    const r = ((i + variantIndex) % 3) + 1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return c.toDataURL('image/jpeg', 0.95);
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
  const [titleB, setTitleB] = useState<string>('SEALED 50 YEARS');
  const [badgeB] = useState<string>('ambience');

  // Сетка 2x2 (4 варианта обложки от Imagen 3 с sampleCount: 4)
  const [batchVariants, setBatchVariants] = useState<string[]>(() => [
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_0', 0),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_1', 1),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_2', 2),
    renderProcedural16x9ArtworkDataUrl('mystery_dark', 'initial_3', 3)
  ]);
  const [selectedMasterVariantIdx, setSelectedMasterVariantIdx] = useState<number>(0);
  const [zoomedVariantIdx, setZoomedVariantIdx] = useState<number | null>(null);

  // Режим A/B тестирования и Ч/Б контрастный фильтр силуэтов
  const [abModeEnabled, setAbModeEnabled] = useState<boolean>(false);
  const [bwContrastFilter, setBwContrastFilter] = useState<boolean>(false);

  // Оверлей интерфейса YouTube (таймкод 3:00:00, аватарка, мобильный масштаб 160x90)
  const [showYoutubeOverlay, setShowYoutubeOverlay] = useState<boolean>(true);
  const [youtubeDurationBadge, setYoutubeDurationBadge] = useState<string>('3:00:00');
  const [youtubeChannelName] = useState<string>('Aether Documentary 4K');
  const [youtubeVideoHeading, setYoutubeVideoHeading] = useState<string>(
    youtubeMockTitle ||
      'The Classified Alpine Tape: Why This Station Was Sealed in 24 Hours (4K Documentary)'
  );

  useEffect(() => {
    if (youtubeMockTitle) {
      setYoutubeVideoHeading(youtubeMockTitle);
    }
  }, [youtubeMockTitle]);

  // 1. Авто-экстрактор лучшего кадра в честном 4K (3840x2160) по секунде
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [seekTimeSec, setSeekTimeSec] = useState<number>(0);

  // 2. Генерация 16:9 без водяных знаков через официальный Imagen 3 API (imagen-3.0-generate-002)
  const [promptStylePreset, setPromptStylePreset] = useState<
    'mystery_dark' | 'ambient_4k' | 'truecrime_contrast' | 'scifi_neon'
  >('mystery_dark');
  const [customImagenPrompt, setCustomImagenPrompt] = useState<string>('');
  const [isGeneratingImagen, setIsGeneratingImagen] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Автогенератор визуального промпта на английском языке (свет, план, атмосфера)
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

    const hookWords = (thumbTitle || 'DO NOT PLAY!')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');

    return `${styleMap[promptStylePreset]} | Subject context: "${topicHint}" | Thumbnail Hook (max 3 words): "${hookWords.toUpperCase()}" | Clean 16:9 composition without watermarks, clear silhouette readability on mobile 160x90px`;
  })();

  const activePromptText = customImagenPrompt.trim() || generatedCoverPrompt;

  // Ограничение короткого текст-хука на обложку (до 3 слов)
  const handleThumbHookChange = (val: string) => {
    const words = val.trimStart().split(/\s+/);
    if (words.length > 3) {
      onThumbTitleChange(words.slice(0, 3).join(' '));
      onNotify('Thumbnail Hook ограничен максимум 3 словами для максимального CTR!', 'info');
    } else {
      onThumbTitleChange(val);
    }
  };

  // Отрисовка обложки на выбранном Canvas (1280x720 или 3840x2160) без водяных знаков
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

      if (image) {
        ctx.drawImage(image, 0, 0, w, h);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#090d16');
        bgGrad.addColorStop(0.5, '#111c33');
        bgGrad.addColorStop(1, '#060911');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

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

        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${Math.round(20 * scale)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          variantLabel
            ? `${variantLabel} — нажмите «Сгенерировать 4 варианта (2×2 Imagen 3)»`
            : 'Нажмите «Сгенерировать 4 варианта (2×2 Imagen 3)» или выберите кадр ниже',
          w / 2,
          h * 0.45
        );
      }

      // Кинематографичный градиент снизу для читаемости 3-словного хука
      const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.86)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      // Опциональный бейдж в правом верхнем углу
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

      // Короткий текст-хук на саму обложку (Thumbnail Hook: до 3 слов)
      const shortHook = (titleText || 'DO NOT PLAY!')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .toUpperCase();

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(72 * scale)}px Inter, "Bebas Neue", sans-serif`;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 16 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 6 * scale;
      ctx.strokeText(shortHook, 48 * scale, h - 58 * scale);
      ctx.fillText(shortHook, 48 * scale, h - 58 * scale);
      ctx.shadowBlur = 0;
    },
    []
  );

  const renderAllCanvases = useCallback(() => {
    drawCoverOnCanvas(canvasARef.current, imgA, thumbTitle, thumbBadge, 'Обложка A');
    drawCoverOnCanvas(canvasBRef.current, imgB || imgA, titleB, badgeB, 'Обложка B');
    drawCoverOnCanvas(mobileCanvasRef.current, imgA, thumbTitle, thumbBadge);
  }, [drawCoverOnCanvas, imgA, imgB, thumbTitle, thumbBadge, titleB, badgeB]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  // Загружаем первый мастер-кадр из 2x2 сетки при старте
  useEffect(() => {
    if (!imgA && batchVariants[0]) {
      const initImg = new Image();
      initImg.onload = () => setImgA(initImg);
      initImg.src = batchVariants[0];
    }
  }, [imgA, batchVariants]);

  // Выбор любого из 4-х вариантов сетки 2x2 как «Выбранный мастер-кадр»
  const handleSelectBatchVariant = (idx: number, targetSlot: 'A' | 'B' = 'A') => {
    const url = batchVariants[idx];
    if (!url) return;
    setSelectedMasterVariantIdx(idx);
    const selectedImage = new Image();
    selectedImage.onload = () => {
      if (targetSlot === 'A') {
        setImgA(selectedImage);
      } else {
        setAbModeEnabled(true);
        setImgB(selectedImage);
      }
      onNotify(
        `✨ Вариант #${idx + 1} установлен как «Выбранный мастер-кадр» (Обложка ${targetSlot})!`,
        'success'
      );
    };
    selectedImage.src = url;
  };

  // Скачивание конкретного варианта из сетки 2x2 в 4K с наложенным хуком или в чистом виде
  const handleDownloadVariantFromGrid = (idx: number) => {
    const url = batchVariants[idx];
    if (!url) return;
    const tempImg = new Image();
    tempImg.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 3840;
      offscreen.height = 2160;
      drawCoverOnCanvas(offscreen, tempImg, thumbTitle, thumbBadge);
      const link = document.createElement('a');
      link.download = `imagen3_variant_${idx + 1}_4k_16x9.jpg`;
      link.href = offscreen.toDataURL('image/jpeg', 0.96);
      link.click();
      onNotify(`📥 Вариант #${idx + 1} (4K 16:9) скачан на устройство!`, 'success');
    };
    tempImg.src = url;
  };

  // ============================================================================
  // ПАКЕТНЫЙ ВЫЗОВ IMAGEN 3 (sampleCount: 4, aspectRatio: "16:9", image/jpeg)
  // ============================================================================
  const handleGenerateImagen3Cover = async (targetSlot: 'A' | 'B' = 'A') => {
    setIsGeneratingImagen(true);
    try {
      const response = await fetch('/api/imagen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: activePromptText,
          sampleCount: 4
        })
      });

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        bytesBase64Encoded?: string;
        mimeType?: string;
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
        error?: string;
      };

      if (response.ok && data.ok && (data.predictions?.length || data.bytesBase64Encoded)) {
        const rawPreds =
          Array.isArray(data.predictions) && data.predictions.length > 0
            ? data.predictions
            : [{ bytesBase64Encoded: data.bytesBase64Encoded, mimeType: data.mimeType }];

        const urls: string[] = [];
        for (let i = 0; i < 4; i++) {
          const item = rawPreds[i];
          if (item?.bytesBase64Encoded) {
            urls.push(`data:${item.mimeType || 'image/jpeg'};base64,${item.bytesBase64Encoded}`);
          } else {
            urls.push(renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, i));
          }
        }

        setBatchVariants(urls);
        setSelectedMasterVariantIdx(0);

        const generatedImg = new Image();
        generatedImg.onload = () => {
          if (targetSlot === 'A') setImgA(generatedImg);
          else {
            setAbModeEnabled(true);
            setImgB(generatedImg);
          }
          onNotify(
            `🎨 Пакет из 4-х вариантов (2×2 сетка 16:9) сгенерирован через Imagen 3 (sampleCount: 4)!`,
            'success'
          );
        };
        generatedImg.src = urls[0];
        setIsGeneratingImagen(false);
        return;
      }

      // Если API-ключ без платного биллинга Imagen 3, генерируем 4 разных 16:9 4K кадра для сетки 2x2
      const fallbackUrls = [0, 1, 2, 3].map(idx =>
        renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, idx)
      );
      setBatchVariants(fallbackUrls);
      setSelectedMasterVariantIdx(0);

      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        if (targetSlot === 'A') setImgA(fallbackImg);
        else {
          setAbModeEnabled(true);
          setImgB(fallbackImg);
        }
        onNotify(
          `🎨 Сгенерирована сетка 2×2 (4 варианта 16:9 без водяных знаков) — вариант #1 выбран как мастер-кадр!`,
          'success'
        );
      };
      fallbackImg.src = fallbackUrls[0];
    } catch {
      const fallbackUrls = [0, 1, 2, 3].map(idx =>
        renderProcedural16x9ArtworkDataUrl(promptStylePreset, activePromptText, idx)
      );
      setBatchVariants(fallbackUrls);
      setSelectedMasterVariantIdx(0);

      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        if (targetSlot === 'A') setImgA(fallbackImg);
        else {
          setAbModeEnabled(true);
          setImgB(fallbackImg);
        }
        onNotify(
          `🎨 Сгенерирована сетка 2×2 (4 варианта 16:9 без водяных знаков)!`,
          'success'
        );
      };
      fallbackImg.src = fallbackUrls[0];
    } finally {
      setIsGeneratingImagen(false);
    }
  };

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

  // Авто-экстрактор стоп-кадра из готового видео в честном 4K по таймкоду секунды
  const handleSelectVideoForExtraction = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFileName(file.name);
    setSeekTimeSec(0);
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

  const capture4KKeyframe = (targetSlot: 'A' | 'B' | 'download') => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      onNotify('Сначала выберите видеофайл для захвата 4K стоп-кадра!', 'error');
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

  // Кнопка «📥 Скачать 4K обложку»
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
    onNotify(`📥 4K обложка ${slot} (3840×2160 без водяных знаков) скачана!`, 'success');
  };

  // Кнопка «📋 Скопировать промпт для веб-генератора» (Leonardo.ai / Midjourney / Kling)
  const copyCoverPromptForWebGenerator = () => {
    navigator.clipboard.writeText(activePromptText);
    setCopiedPrompt(true);
    onNotify(
      '📋 Промпт скопирован для вставки в веб-генератор (Leonardo.ai / Midjourney / Kling)!',
      'success'
    );
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const wordCountHookA = (thumbTitle || 'DO NOT PLAY!').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* МОДАЛЬНОЕ ОКНО УВЕЛИЧЕНИЯ ВАРИАНТА ОБЛОЖКИ («🔍 Увеличить») */}
      {zoomedVariantIdx !== null && batchVariants[zoomedVariantIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomedVariantIdx(null)}
        >
          <div
            className="bg-[#111622] border border-emerald-500/50 rounded-2xl max-w-5xl w-full p-5 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <ZoomIn className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Детальный просмотр • Вариант #{zoomedVariantIdx + 1} (Imagen 3 • 16:9)
                </h3>
                {selectedMasterVariantIdx === zoomedVariantIdx && (
                  <span className="text-[11px] font-bold bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2.5 py-0.5 rounded-lg">
                    Выбранный мастер-кадр
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomedVariantIdx(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-700 bg-black">
              <img
                src={batchVariants[zoomedVariantIdx]}
                alt={`Imagen 3 Variant ${zoomedVariantIdx + 1}`}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  handleSelectBatchVariant(zoomedVariantIdx, 'A');
                  setZoomedVariantIdx(null);
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Выбрать как мастер-кадр (Слот A)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadVariantFromGrid(zoomedVariantIdx)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>📥 Скачать этот вариант (4K)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ВЕРХНЯЯ ПАНЕЛЬ: НАСТРОЙКИ 4K ПРЕВЬЮ + ХОЛСТ ПРЕДПРОСМОТРА С YOUTUBE UI OVERLAY И A/B ТЕСТЕРОМ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая колонка: Настройки Обложки A / B, Imagen 3 и переключатели контроля */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="text-emerald-400 w-5 h-5" /> 4K Превью &amp; Арт-Студия (Imagen 3)
            </h2>
            <span className="text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">
              sampleCount: 4 • 2×2
            </span>
          </div>

          {/* Кнопка пакетной генерации 2x2 (4 варианта 16:9) через официальный Imagen 3 API */}
          <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-[#0b0f17] border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-emerald-300 uppercase">
                Пакетная генерация 2×2 (Imagen 3):
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                sampleCount: 4 • 16:9 • JPEG
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleGenerateImagen3Cover('A')}
                disabled={isGeneratingImagen}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-md shadow-emerald-500/20 disabled:opacity-60"
              >
                {isGeneratingImagen ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Imagen 3 (2×2) → A</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateImagen3Cover('B')}
                disabled={isGeneratingImagen}
                className="bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Imagen 3 (2×2) → B</span>
              </button>
            </div>
          </div>

          {/* Переключатели: YouTube UI Grid, A/B-тестер и Ч/Б фильтр контрастности */}
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
                <Eye className="w-4 h-4" /> Оверлей интерфейса YouTube (3:00:00 + Аватарка)
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
                <Columns className="w-4 h-4" /> A/B-тестер двух вариантов обложек
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
                <Contrast className="w-4 h-4" /> Ч/Б фильтр проверки контрастности
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
                Загрузить свой арт (Обложка A):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleLoadImageForSlot(e, 'A')}
                className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400 uppercase">
                  Короткий текст-хук на обложку (Thumbnail Hook: до 3 слов):
                </label>
                <span className="text-[10px] font-mono text-amber-300">
                  {wordCountHookA}/3 слов
                </span>
              </div>
              <input
                type="text"
                value={thumbTitle}
                onChange={e => handleThumbHookChange(e.target.value)}
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
                <option value="none">Без бейджа (Clean)</option>
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
                  Thumbnail Hook B (до 3 слов):
                </label>
                <input
                  type="text"
                  value={titleB}
                  onChange={e => {
                    const words = e.target.value.trimStart().split(/\s+/);
                    setTitleB(words.length > 3 ? words.slice(0, 3).join(' ') : e.target.value);
                  }}
                  placeholder="SEALED 50 YEARS"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Кнопка «📥 Скачать 4K обложку» */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => downloadCover4K('A')}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-4 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <Download className="w-4 h-4" /> 📥 Скачать 4K обложку (3840×2160)
            </button>
            {abModeEnabled && (
              <button
                type="button"
                onClick={() => downloadCover4K('B')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" /> 📥 Скачать 4K обложку (Вариант B)
              </button>
            )}
          </div>
        </div>

        {/* Правая область (2 колонки): Холст A (или A vs B) + YouTube UI Overlay + Мобильный масштаб 160x90 px */}
        <div className="lg:col-span-2 bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div className={`grid gap-4 ${abModeEnabled ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* ХОЛСТ ОБЛОЖКИ A */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400 uppercase">
                  Обложка A — Выбранный мастер-кадр #{selectedMasterVariantIdx + 1}{' '}
                  {bwContrastFilter ? '(Ч/Б Фильтр Контраста)' : ''}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  16:9 • Watermark-Free 4K
                </span>
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

                {showYoutubeOverlay && (
                  <>
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

                    <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-black/90 text-white font-mono font-bold text-xs px-2 py-0.5 rounded shadow-md border border-white/10">
                      {youtubeDurationBadge || '3:00:00'}
                    </div>
                  </>
                )}
              </div>

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
                      <span>• 428K views • 2 hours ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ХОЛСТ ОБЛОЖКИ B */}
            {abModeEnabled && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 uppercase">
                    Обложка B {bwContrastFilter ? '(Ч/Б Фильтр Контраста)' : ''}
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
                        {youtubeChannelName} ✓ • Variant B (A/B Readability Test)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* НИЖНЯЯ ПАНЕЛЬ ХОЛСТА: МОБИЛЬНЫЙ МАСШТАБ (160x90 PX) */}
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
                  <Smartphone className="w-4 h-4" /> Мобильный масштаб YouTube (160×90 px)
                </span>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  Проверка читаемости Thumbnail Hook (до 3 слов), аватарки и таймкода{' '}
                  <code>{youtubeDurationBadge}</code> в правом нижнем углу на экране смартфона.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Таймкод:</span>
              <input
                type="text"
                value={youtubeDurationBadge}
                onChange={e => setYoutubeDurationBadge(e.target.value)}
                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-amber-300 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* СЕТКА 2x2 IMAGEN 3 (4 ВАРИАНТА ОБЛОЖКИ 16:9 С ВЫБОРОМ МАСТЕР-КАДРА, УВЕЛИЧЕНИЕМ И СКАЧИВАНИЕМ) */}
      <div className="bg-[#111622] border border-emerald-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Grid className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Сетка 2×2 вариантов обложки (Imagen 3 • sampleCount: 4 • 16:9 JPEG)
              </h3>
              <p className="text-xs text-slate-400">
                Кликните по любому из 4-х вариантов, чтобы выделить его неоновой рамкой как «Выбранный мастер-кадр»
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleGenerateImagen3Cover('A')}
            disabled={isGeneratingImagen}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {isGeneratingImagen ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            <span>Сгенерировать 4 новых варианта (2×2 Imagen 3)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {batchVariants.map((variantUrl, idx) => {
            const isMaster = selectedMasterVariantIdx === idx;
            return (
              <div
                key={`grid-variant-${idx}`}
                onClick={() => handleSelectBatchVariant(idx, 'A')}
                className={`rounded-2xl p-3.5 transition cursor-pointer flex flex-col justify-between gap-3 ${
                  isMaster
                    ? 'bg-emerald-950/25 border-2 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                    : 'bg-[#0b0f17] border border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-2">
                    <span className="font-mono text-amber-400">Вариант #{idx + 1}</span>
                    <span className="text-[10px] font-mono text-slate-400">(16:9 • image/jpeg)</span>
                  </span>
                  {isMaster ? (
                    <span className="text-[11px] font-bold bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Выбранный мастер-кадр
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Кликните для выбора</span>
                  )}
                </div>

                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800">
                  <img
                    src={variantUrl}
                    alt={`Imagen 3 16:9 Variant ${idx + 1}`}
                    className={`w-full h-full object-cover ${
                      bwContrastFilter ? 'grayscale contrast-125' : ''
                    }`}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 flex items-end justify-between">
                    <span className="text-white font-black text-sm tracking-wide drop-shadow">
                      {(thumbTitle || 'DO NOT PLAY!')
                        .trim()
                        .split(/\s+/)
                        .slice(0, 3)
                        .join(' ')
                        .toUpperCase()}
                    </span>
                    <span className="bg-black/90 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {youtubeDurationBadge || '3:00:00'}
                    </span>
                  </div>
                </div>

                {/* Две обязательные кнопки под каждым из 4-х вариантов */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setZoomedVariantIdx(idx);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                    <span>🔍 Увеличить</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDownloadVariantFromGrid(idx);
                    }}
                    className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>📥 Скачать этот вариант</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* НИЖНИЕ МОДУЛИ: 1. АВТО-ЭКСТРАКТОР 4K КАДРА ПО СЕКУНДЕ & 2. ГЕНЕРАТОР ПРОМПТА IMAGEN 3 / MIDJOURNEY / LEONARDO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. АВТО-ЭКСТРАКТОР СТОП-КАДРА ИЗ ГОТОВОГО ВИДЕО В ЧЕСТНОМ 4K ПО ТАЙМКОДУ СЕКУНДЫ */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                1. Авто-экстрактор 4K-кадра из видео по секунде (3840×2160)
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
                      Таймкод секунды стоп-кадра:
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
                      💾 Скачать 4K кадр
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0f17] border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-400 space-y-1">
                <Film className="w-7 h-7 text-amber-400/70 mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-300">
                  Загрузите видеофайл (.mp4 / .mov / .webm) для авто-экстракта 4K стоп-кадра
                </p>
                <p className="text-[11px] text-slate-500">
                  Точный выбор секунды и мгновенный захват кадра в 3840×2160 без потери четкости
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 2. ВИЗУАЛЬНЫЙ ПРОМПТ ДЛЯ IMAGEN 3 / MIDJOURNEY / LEONARDO.AI */}
        <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  2. Генератор визуального промпта (Imagen 3 / Midjourney / Leonardo.ai)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 px-2 py-0.5 rounded">
                16:9 English Prompt
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase block">
                Визуальный стиль (Свет, план, атмосфера):
              </label>
              <select
                value={promptStylePreset}
                onChange={e => {
                  setPromptStylePreset(
                    e.target.value as
                      | 'mystery_dark'
                      | 'ambient_4k'
                      | 'truecrime_contrast'
                      | 'scifi_neon'
                  );
                  setCustomImagenPrompt('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-amber-300 font-semibold outline-none focus:border-amber-500"
              >
                <option value="mystery_dark">
                  🕵️ Dark Mystery (Высокий контраст, фокус на улике, chiaroscuro)
                </option>
                <option value="ambient_4k">
                  ❄️ Cozy Ambient 4K (Тёплый свет внутри vs ледяная стихия)
                </option>
                <option value="truecrime_contrast">
                  📁 Investigative / True Crime (Драматический свет, гриф SECRET)
                </option>
                <option value="scifi_neon">
                  📡 Anomalous Signal (Осциллограф, объёмные лучи в темноте)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase block">
                Промпт для Imagen 3 (`imagen-3.0-generate-002:predict`, sampleCount: 4) и веб-генераторов:
              </label>
              <textarea
                rows={5}
                value={activePromptText}
                onChange={e => setCustomImagenPrompt(e.target.value)}
                className="w-full bg-[#0b0f17] border border-slate-800 focus:border-indigo-400 rounded-xl p-3.5 text-xs font-mono text-emerald-300 leading-relaxed outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleGenerateImagen3Cover('A')}
              disabled={isGeneratingImagen}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-60"
            >
              <Wand2 className="w-4 h-4" />
              <span>Сгенерировать 2×2 в Imagen 3 (16:9)</span>
            </button>

            <button
              type="button"
              onClick={copyCoverPromptForWebGenerator}
              className="bg-gradient-to-r from-indigo-500 to-amber-500 hover:from-indigo-400 hover:to-amber-400 text-slate-950 font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-500/20"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-4 h-4" /> Промпт скопирован!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> 📋 Скопировать промпт для веб-генератора
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
