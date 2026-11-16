/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

export type AmbientShaderMode = 'live' | 'eco';

export const AMBIENT_SHADER_STORAGE_KEY = 'aether_ambient_shader_mode';

export function getInitialAmbientShaderMode(): AmbientShaderMode {
  if (typeof window === 'undefined') return 'live';
  try {
    const stored = window.localStorage.getItem(AMBIENT_SHADER_STORAGE_KEY);
    if (stored === 'live' || stored === 'eco') {
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'eco';
  }
  return 'live';
}

interface AmbientShaderBackdropProps {
  mode: AmbientShaderMode;
}

/**
 * Настраиваемый фоновый шейдер (вдохновлённый Scroll Shaders):
 * - Фиксированный фоновый слой (`pointer-events-none fixed inset-0 z-0`).
 * - В режиме «live»: плавно переливающийся глубокий градиент (#080c14, индиго #1e1b4b, бирюзовый #0e7490 на прозрачности 12–18%)
 *   и тонкая динамическая световая волна / перспективная сетка с лимитом 24 FPS (~41.6 мс/кадр) и реакцией на скролл.
 * - В режиме «eco»: цикл рендера полностью остановлен (0% нагрузки на GPU/CPU), остаётся чистый статичный графитовый фон #080c14.
 */
export const AmbientShaderBackdrop: React.FC<AmbientShaderBackdropProps> = ({ mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode === 'eco') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let rafId = 0;
    let lastFrameTime = 0;
    const frameIntervalMs = 1000 / 24; // Строгий лимит 24 FPS для минимальной нагрузки на GPU
    let scrollPhase = window.scrollY * 0.0025;
    let targetScrollPhase = scrollPhase;

    // Рендерим во внутреннем пониженном буфере (масштаб 0.45x) с аппаратным билинейным сглаживанием CSS
    const updateSize = () => {
      const scale = 0.45;
      canvas.width = Math.max(320, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(200, Math.round(window.innerHeight * scale));
    };

    const onScroll = () => {
      targetScrollPhase = window.scrollY * 0.0025;
    };

    updateSize();
    window.addEventListener('resize', updateSize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    const renderFrame = (timestamp: number) => {
      rafId = window.requestAnimationFrame(renderFrame);

      if (timestamp - lastFrameTime < frameIntervalMs) {
        return;
      }
      lastFrameTime = timestamp;

      // Плавная интерполяция скролл-фазы (Scroll Shader inertia)
      scrollPhase += (targetScrollPhase - scrollPhase) * 0.12;
      const t = timestamp * 0.00055 + scrollPhase;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Базовый глубокий графитовый фон #080c14
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, w, h);

      // 2. Переливающееся индиго-облако (#1e1b4b на прозрачности ~16%)
      const indigoX = w * (0.28 + Math.sin(t * 0.7) * 0.18);
      const indigoY = h * (0.34 + Math.cos(t * 0.55) * 0.16);
      const indigoRad = Math.max(w, h) * 0.62;
      const gradIndigo = ctx.createRadialGradient(
        indigoX,
        indigoY,
        indigoRad * 0.05,
        indigoX,
        indigoY,
        indigoRad
      );
      gradIndigo.addColorStop(0, 'rgba(30, 27, 75, 0.18)'); // #1e1b4b
      gradIndigo.addColorStop(0.55, 'rgba(30, 27, 75, 0.09)');
      gradIndigo.addColorStop(1, 'rgba(8, 12, 20, 0)');
      ctx.fillStyle = gradIndigo;
      ctx.fillRect(0, 0, w, h);

      // 3. Переливающийся бирюзовый акцент (#0e7490 на прозрачности ~14%)
      const cyanX = w * (0.74 + Math.cos(t * 0.62) * 0.17);
      const cyanY = h * (0.62 + Math.sin(t * 0.8) * 0.18);
      const cyanRad = Math.max(w, h) * 0.56;
      const gradCyan = ctx.createRadialGradient(
        cyanX,
        cyanY,
        cyanRad * 0.04,
        cyanX,
        cyanY,
        cyanRad
      );
      gradCyan.addColorStop(0, 'rgba(14, 116, 144, 0.15)'); // #0e7490
      gradCyan.addColorStop(0.5, 'rgba(14, 116, 144, 0.06)');
      gradCyan.addColorStop(1, 'rgba(8, 12, 20, 0)');
      ctx.fillStyle = gradCyan;
      ctx.fillRect(0, 0, w, h);

      // 4. Тонкая динамическая световая волна / шейдерная сетка (Scroll-reactive wave ribbons)
      ctx.save();
      ctx.lineWidth = 1;
      const waveCount = 7;
      for (let i = 0; i < waveCount; i++) {
        const norm = i / (waveCount - 1);
        const baseY = h * (0.18 + norm * 0.66);
        const alpha = 0.035 + Math.sin(norm * Math.PI) * 0.055;
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(14, 116, 144, ${alpha.toFixed(3)})`
            : `rgba(79, 70, 229, ${(alpha * 0.85).toFixed(3)})`;

        ctx.beginPath();
        const stepX = Math.max(12, Math.round(w / 36));
        for (let x = 0; x <= w + stepX; x += stepX) {
          const nx = x / w;
          const waveY =
            baseY +
            Math.sin(nx * 4.2 + t * 1.3 + i * 0.65) * (h * 0.045) +
            Math.cos(nx * 2.4 - t * 0.85 + i * 0.4) * (h * 0.025);
          if (x === 0) {
            ctx.moveTo(x, waveY);
          } else {
            ctx.lineTo(x, waveY);
          }
        }
        ctx.stroke();
      }

      // 5. Мягкие вертикальные меридианы сетки (тонкий архитектурный грид)
      const cols = 10;
      ctx.strokeStyle = 'rgba(14, 116, 144, 0.028)';
      for (let c = 1; c < cols; c++) {
        const cx = (w / cols) * c + Math.sin(t * 0.5 + c) * 4;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
      }
      ctx.restore();
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [mode]);

  if (mode === 'eco') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[#080c14]"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#080c14]"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-95"
      />
      {/* Дополнительная микро-виньетка по краям для глубокого контраста карточек */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, transparent 45%, rgba(8, 12, 20, 0.68) 100%)'
        }}
      />
    </div>
  );
};
