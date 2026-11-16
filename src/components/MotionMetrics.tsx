/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, CircleDashed } from 'lucide-react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  durationMs?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  durationMs = 420
}) => {
  const prefersReducedMotion = useReducedMotion();
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = useState<number>(safeTarget);
  const currentRef = useRef<number>(safeTarget);

  useEffect(() => {
    if (prefersReducedMotion || durationMs <= 0) {
      currentRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    const from = currentRef.current;
    const delta = safeTarget - from;
    if (Math.abs(delta) < 0.0001) {
      currentRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    let rafId = 0;
    const startTs = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTs;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out for crisp tactile deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + delta * eased;
      currentRef.current = next;
      setDisplayValue(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = safeTarget;
        setDisplayValue(safeTarget);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [safeTarget, durationMs, prefersReducedMotion]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : String(Math.round(displayValue));

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

interface AnimatedDurationTextProps {
  totalSeconds: number;
  alwaysIncludeHours?: boolean;
  className?: string;
  durationMs?: number;
}

export const formatAnimatedSeconds = (
  totalSeconds: number,
  alwaysIncludeHours = false
): string => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0 || alwaysIncludeHours) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const AnimatedDurationText: React.FC<AnimatedDurationTextProps> = ({
  totalSeconds,
  alwaysIncludeHours = false,
  className = '',
  durationMs = 450
}) => {
  const prefersReducedMotion = useReducedMotion();
  const safeTarget = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const [displaySec, setDisplaySec] = useState<number>(safeTarget);
  const currentRef = useRef<number>(safeTarget);

  useEffect(() => {
    if (prefersReducedMotion || durationMs <= 0) {
      currentRef.current = safeTarget;
      setDisplaySec(safeTarget);
      return;
    }

    const from = currentRef.current;
    const delta = safeTarget - from;
    if (Math.abs(delta) < 0.05) {
      currentRef.current = safeTarget;
      setDisplaySec(safeTarget);
      return;
    }

    let rafId = 0;
    const startTs = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTs;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + delta * eased;
      currentRef.current = next;
      setDisplaySec(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = safeTarget;
        setDisplaySec(safeTarget);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [safeTarget, durationMs, prefersReducedMotion]);

  return (
    <span className={`tabular-nums ${className}`}>
      {formatAnimatedSeconds(displaySec, alwaysIncludeHours)}
    </span>
  );
};

interface MetadataReadinessRingProps {
  titleValid: boolean;
  descriptionValid: boolean;
  chaptersValid: boolean;
  tagsValid: boolean;
  chaptersCount: number;
  tagsCount: number;
}

export const MetadataReadinessRing: React.FC<MetadataReadinessRingProps> = ({
  titleValid,
  descriptionValid,
  chaptersValid,
  tagsValid,
  chaptersCount,
  tagsCount
}) => {
  const prefersReducedMotion = useReducedMotion();

  const items = [
    { key: 'title', label: 'Title ≤60', ok: titleValid },
    { key: 'desc', label: 'Description', ok: descriptionValid },
    { key: 'chapters', label: `Chapters (${chaptersCount})`, ok: chaptersValid },
    { key: 'tags', label: `Tags (${tagsCount})`, ok: tagsValid }
  ];

  const completedCount = items.filter(i => i.ok).length;
  const readinessPct = Math.round((completedCount / items.length) * 100);

  const size = 58;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (readinessPct / 100) * circumference;

  const accentStroke =
    readinessPct === 100
      ? '#34d399'
      : readinessPct >= 75
      ? '#38bdf8'
      : '#fbbf24';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#090D16]/85 border border-white/[0.08] px-3.5 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={strokeWidth}
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={accentStroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 160, damping: 24 }
              }
            />
          </svg>
          <span
            className={`absolute text-xs font-mono font-extrabold tabular-nums ${
              readinessPct === 100
                ? 'text-emerald-300'
                : readinessPct >= 75
                ? 'text-sky-300'
                : 'text-amber-300'
            }`}
          >
            <AnimatedNumber value={readinessPct} suffix="%" />
          </span>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] font-bold text-slate-100">
            Готовность метаданных (RELEASE_CARD + Chapters)
          </div>
          <div className="text-[10.5px] font-mono text-slate-400 tabular-nums">
            Заполнено секций: <strong className="text-slate-200">{completedCount}/4</strong>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {items.map(item => (
          <span
            key={item.key}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono font-semibold tabular-nums ${
              item.ok
                ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                : 'bg-amber-500/10 border-amber-400/30 text-amber-300'
            }`}
          >
            {item.ok ? (
              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
            ) : (
              <CircleDashed className="w-3 h-3 shrink-0 text-amber-400" />
            )}
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
