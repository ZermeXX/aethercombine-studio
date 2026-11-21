/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal as TerminalIcon,
  Copy,
  Check,
  Trash2,
  Download,
  ExternalLink,
  Octagon,
  ArrowDown,
  Search,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  CircleDot,
  Filter
} from 'lucide-react';
import { sanitizeLogText } from '../utils/logSanitizer';

export type TerminalLogLevel = 'info' | 'step' | 'success' | 'error' | 'raw';

export interface TerminalLogEntry {
  id: string;
  text: string;
  level: TerminalLogLevel;
}

export type TerminalRunnerState = 'idle' | 'queued' | 'running' | 'success' | 'failed';

/** MM:SS до часа, H:MM:SS после — префиксы логов больше не превращаются в «180:00». */
export const formatTerminalTime = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

interface LiveTerminalProps {
  status: TerminalRunnerState;
  elapsedSeconds: number;
  logs: TerminalLogEntry[];
  runUrl?: string;
  onClearLogs?: () => void;
  onCopyLogs?: () => void;
  onCancelRun?: () => void;
}

const MAX_RENDERED_LINES = 900;

const LEVEL_META: Record<
  TerminalLogLevel,
  { label: string; text: string; gutter: string; bar: string; chip: string }
> = {
  info: {
    label: 'Инфо',
    text: 'text-slate-300',
    gutter: 'text-slate-600',
    bar: 'bg-slate-700/70',
    chip: 'bg-slate-700/40 border-slate-600/60 text-slate-300'
  },
  step: {
    label: 'Шаг',
    text: 'text-cyan-200',
    gutter: 'text-cyan-500/80',
    bar: 'bg-cyan-400/80',
    chip: 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
  },
  success: {
    label: 'Успех',
    text: 'text-emerald-200',
    gutter: 'text-emerald-500/80',
    bar: 'bg-emerald-400/85',
    chip: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
  },
  error: {
    label: 'Ошибка',
    text: 'text-rose-200',
    gutter: 'text-rose-500/85',
    bar: 'bg-rose-500/90',
    chip: 'bg-rose-500/15 border-rose-400/55 text-rose-200'
  },
  raw: {
    label: 'FFmpeg',
    text: 'text-slate-400',
    gutter: 'text-slate-700',
    bar: 'bg-slate-800',
    chip: 'bg-slate-800/70 border-slate-700 text-slate-400'
  }
};

const STATUS_META: Record<
  TerminalRunnerState,
  { label: string; dot: string; ring: string; text: string; border: string }
> = {
  idle: {
    label: 'IDLE',
    dot: 'bg-slate-500',
    ring: '',
    text: 'text-slate-400',
    border: 'border-slate-700/70'
  },
  queued: {
    label: 'QUEUED',
    dot: 'bg-amber-400',
    ring: 'bg-amber-400/60',
    text: 'text-amber-300',
    border: 'border-amber-400/45'
  },
  running: {
    label: 'RUNNING',
    dot: 'bg-amber-400',
    ring: 'bg-amber-400/70',
    text: 'text-amber-300',
    border: 'border-amber-400/55'
  },
  success: {
    label: 'SUCCESS',
    dot: 'bg-emerald-400',
    ring: '',
    text: 'text-emerald-300',
    border: 'border-emerald-400/55'
  },
  failed: {
    label: 'FAILED',
    dot: 'bg-rose-500',
    ring: '',
    text: 'text-rose-300',
    border: 'border-rose-500/60'
  }
};

type FilterKey = 'all' | 'step' | 'success' | 'error' | 'raw';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'step', label: 'Шаги' },
  { key: 'success', label: 'Успех' },
  { key: 'error', label: 'Ошибки' },
  { key: 'raw', label: 'FFmpeg' }
];

const LEVEL_PREFIX: Record<TerminalLogLevel, string> = {
  info: '·',
  step: '▸',
  success: '✓',
  error: '✕',
  raw: '│'
};

export const LiveTerminal: React.FC<LiveTerminalProps> = ({
  status,
  elapsedSeconds,
  logs,
  runUrl,
  onClearLogs,
  onCopyLogs,
  onCancelRun
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const isActive = status === 'running' || status === 'queued';
  const meta = STATUS_META[status] ?? STATUS_META.idle;

  /** Маскирование на уровне рендера — второй контур защиты поверх App/persistence. */
  const safeLogs = useMemo(
    () =>
      (Array.isArray(logs) ? logs : []).map(entry => ({
        id: entry.id,
        level: (LEVEL_META[entry.level] ? entry.level : 'info') as TerminalLogLevel,
        text: sanitizeLogText(entry.text ?? '')
      })),
    [logs]
  );

  const counts = useMemo(() => {
    const acc: Record<TerminalLogLevel, number> = {
      info: 0,
      step: 0,
      success: 0,
      error: 0,
      raw: 0
    };
    safeLogs.forEach(l => {
      acc[l.level] += 1;
    });
    return acc;
  }, [safeLogs]);

  const visibleLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return safeLogs.filter(entry => {
      if (filter !== 'all' && entry.level !== filter) return false;
      if (q && !entry.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [safeLogs, filter, query]);

  const truncated = visibleLogs.length > MAX_RENDERED_LINES;
  const renderedLogs = truncated
    ? visibleLogs.slice(visibleLogs.length - MAX_RENDERED_LINES)
    : visibleLogs;

  const scrollToTail = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (follow) scrollToTail();
  }, [renderedLogs.length, follow, scrollToTail]);

  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setFollow(prev => (prev === atBottom ? prev : atBottom));
  }, []);

  const plainText = useMemo(
    () => visibleLogs.map(l => l.text).join('\n'),
    [visibleLogs]
  );

  const handleCopy = useCallback(async () => {
    const payload = plainText || 'Лог пуст';
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* буфер недоступен */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    onCopyLogs?.();
  }, [plainText, onCopyLogs]);

  const handleDownload = useCallback(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([plainText || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetherflow-run-${stamp}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, [plainText]);

  const handleCancel = useCallback(() => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      window.setTimeout(() => setConfirmCancel(false), 4000);
      return;
    }
    setConfirmCancel(false);
    onCancelRun?.();
  }, [confirmCancel, onCancelRun]);

  useEffect(() => {
    if (!isActive) setConfirmCancel(false);
  }, [isActive]);

  const lastError = useMemo(() => {
    for (let i = safeLogs.length - 1; i >= 0; i -= 1) {
      if (safeLogs[i].level === 'error') return safeLogs[i].text;
    }
    return '';
  }, [safeLogs]);

  return (
    <section
      className={`aether-terminal relative overflow-hidden rounded-2xl border ${meta.border} bg-[#070B12]/95 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)]`}
      aria-label="Терминал облачного раннера"
    >
      <style>{`
        .aether-terminal .term-scroll {
          scrollbar-width: thin;
          scrollbar-color: #F59E0B #0B1220;
        }
        .aether-terminal .term-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .aether-terminal .term-scroll::-webkit-scrollbar-track {
          background: #0B1220;
          border-radius: 8px;
        }
        .aether-terminal .term-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #F59E0B, #FF7A2F);
          border-radius: 8px;
          border: 2px solid #0B1220;
        }
        .aether-terminal .term-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #FFC24D, #FF9450);
        }
        .aether-terminal .term-scroll::-webkit-scrollbar-corner {
          background: #0B1220;
        }
        @keyframes aetherTermSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
        }
        .aether-terminal .term-sweep {
          animation: aetherTermSweep 2.4s cubic-bezier(.4,0,.2,1) infinite;
        }
        @keyframes aetherTermBlink {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0.15; }
          100% { opacity: 1; }
        }
        .aether-terminal .term-caret {
          animation: aetherTermBlink 1.15s steps(1, end) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .aether-terminal .term-sweep,
          .aether-terminal .term-caret { animation: none !important; }
        }
      `}</style>

      <header className="relative flex flex-wrap items-center gap-2.5 border-b border-white/[0.07] bg-[#0A101C]/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            {isActive && (
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.ring}`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
          </span>
          <TerminalIcon className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <h3 className="truncate text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-200">
            Терминал облачного раннера
          </h3>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${meta.border} ${meta.text}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-white/[0.08] bg-[#070B12] px-2 py-1 font-mono text-[11px] tabular-nums text-amber-300">
            {formatTerminalTime(elapsedSeconds)}
          </span>
          <span className="hidden rounded-md border border-white/[0.08] bg-[#070B12] px-2 py-1 font-mono text-[10px] tabular-nums text-slate-400 sm:inline">
            {safeLogs.length} строк
          </span>
          {counts.error > 0 && (
            <span className="rounded-md border border-rose-400/50 bg-rose-500/15 px-2 py-1 font-mono text-[10px] font-bold tabular-nums text-rose-200">
              {counts.error} ошибок
            </span>
          )}
          <span
            className="flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300"
            title="Токены, ключи и signed-URL маскируются перед выводом и копированием"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Секреты скрыты
          </span>
        </div>

        {isActive && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
            <span className="term-sweep block h-px w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-[#080D16]/80 px-3 py-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        {FILTERS.map(item => {
          const active = filter === item.key;
          const count =
            item.key === 'all' ? safeLogs.length : counts[item.key as TerminalLogLevel];
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(item.key)}
              className={`min-h-[30px] rounded-lg border px-2.5 py-1 text-[10.5px] font-bold transition ${
                active
                  ? item.key === 'all'
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : LEVEL_META[item.key as TerminalLogLevel].chip
                  : 'border-white/[0.07] bg-[#0B1220] text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              {item.label}
              <span className="ml-1 font-mono tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}

        {showSearch ? (
          <div className="relative min-w-[150px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              autoFocus
              onChange={e => setQuery(e.target.value)}
              onBlur={() => !query && setShowSearch(false)}
              placeholder="Поиск по логу…"
              aria-label="Поиск по логу"
              className="min-h-[30px] w-full rounded-lg border border-white/[0.1] bg-[#0B1220] py-1 pl-7 pr-7 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-400/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setShowSearch(false);
                }}
                aria-label="Очистить поиск"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            aria-label="Открыть поиск по логу"
            className="min-h-[30px] rounded-lg border border-white/[0.07] bg-[#0B1220] px-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={follow}
            onClick={() => {
              setFollow(prev => !prev);
              if (!follow) scrollToTail();
            }}
            title="Автопрокрутка к последней строке"
            className={`min-h-[30px] rounded-lg border px-2.5 py-1 text-[10.5px] font-bold transition ${
              follow
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                : 'border-white/[0.07] bg-[#0B1220] text-slate-400 hover:text-slate-200'
            }`}
          >
            Авто-хвост
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={visibleLogs.length === 0}
            className="flex min-h-[30px] items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0B1220] px-2.5 py-1 text-[10.5px] font-bold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={visibleLogs.length === 0}
            aria-label="Скачать лог файлом"
            className="flex min-h-[30px] items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0B1220] px-2.5 py-1 text-[10.5px] font-bold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            .log
          </button>

          {onClearLogs && (
            <button
              type="button"
              onClick={onClearLogs}
              disabled={safeLogs.length === 0}
              aria-label="Очистить терминал"
              className="flex min-h-[30px] items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0B1220] px-2.5 py-1 text-[10.5px] font-bold text-slate-400 transition hover:border-rose-400/50 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Очистить
            </button>
          )}

          {onCancelRun && isActive && (
            <button
              type="button"
              onClick={handleCancel}
              className={`flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10.5px] font-bold transition ${
                confirmCancel
                  ? 'border-rose-400 bg-rose-500/25 text-rose-100'
                  : 'border-rose-500/45 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
              }`}
            >
              <Octagon className="h-3.5 w-3.5" />
              {confirmCancel ? 'Точно отменить?' : 'Отменить сборку'}
            </button>
          )}
        </div>
      </div>

      {status === 'failed' && lastError && (
        <div className="flex items-start gap-2 border-b border-rose-500/25 bg-rose-950/25 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
          <p className="min-w-0 flex-1 break-words font-mono text-[11px] leading-relaxed text-rose-200">
            {lastError}
          </p>
        </div>
      )}

      <div className="relative">
        <div
          ref={bodyRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Ход выполнения сборки"
          className="term-scroll h-[300px] overflow-y-auto overscroll-contain bg-[#070B12] px-1 py-2 sm:h-[340px]"
        >
          {renderedLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <TerminalIcon className="h-7 w-7 text-slate-700" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-400">
                {safeLogs.length === 0
                  ? 'Консоль готова к работе'
                  : 'Под текущий фильтр не попала ни одна строка'}
              </p>
              <p className="max-w-md text-[11px] leading-relaxed text-slate-600">
                {safeLogs.length === 0
                  ? 'Нажмите «🚀 Запустить облачную сборку» — шаги GitHub Actions и вывод FFmpeg появятся здесь в реальном времени.'
                  : 'Сбросьте фильтр или очистите поиск, чтобы увидеть остальные строки.'}
              </p>
              {safeLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                  }}
                  className="mt-1 min-h-[32px] rounded-lg border border-amber-400/45 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/20"
                >
                  Показать все строки
                </button>
              )}
            </div>
          ) : (
            <>
              {truncated && (
                <p className="px-3 py-1.5 font-mono text-[10px] text-slate-600">
                  … показаны последние {MAX_RENDERED_LINES} из {visibleLogs.length} строк —
                  полный лог доступен по кнопке «.log»
                </p>
              )}
              <ul className="space-y-px">
                {renderedLogs.map(entry => {
                  const lm = LEVEL_META[entry.level];
                  return (
                    <li
                      key={entry.id}
                      className={`group flex items-start gap-2 rounded px-2 py-[3px] transition-colors hover:bg-white/[0.035] ${
                        entry.level === 'error' ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-[3px] w-[3px] shrink-0 self-stretch rounded-full ${lm.bar}`}
                      />
                      <span
                        aria-hidden="true"
                        className={`w-3 shrink-0 select-none pt-[1px] text-center font-mono text-[11px] ${lm.gutter}`}
                      >
                        {LEVEL_PREFIX[entry.level]}
                      </span>
                      <span
                        className={`min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] ${lm.text}`}
                      >
                        {entry.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {isActive && (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="term-caret font-mono text-[12px] text-amber-400">▍</span>
                  <span className="font-mono text-[10.5px] text-slate-600">
                    {status === 'queued'
                      ? 'ожидание свободного раннера GitHub Actions…'
                      : 'выполняется шаг сборки…'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {!follow && visibleLogs.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFollow(true);
              scrollToTail();
            }}
            className="absolute bottom-3 right-4 flex min-h-[34px] items-center gap-1.5 rounded-full border border-amber-400/55 bg-[#0A101C]/95 px-3 py-1.5 text-[11px] font-bold text-amber-200 shadow-[0_10px_28px_rgba(0,0,0,0.7)] backdrop-blur transition hover:bg-amber-500/20"
          >
            <ArrowDown className="h-3.5 w-3.5" />К последним
          </button>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-[#0A101C]/90 px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
          {status === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : status === 'failed' ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
          ) : isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          ) : (
            <CircleDot className="h-3.5 w-3.5 text-slate-600" />
          )}
          {status === 'success'
            ? 'Мастер собран и выгружен на Google Drive'
            : status === 'failed'
              ? 'Сборка остановлена — детали в строках выше'
              : status === 'queued'
                ? 'Задача в очереди GitHub Actions'
                : status === 'running'
                  ? 'Опрос шагов каждые 5 секунд'
                  : 'Ожидание запуска сборки'}
        </span>

        {runUrl && (
          <a
            href={runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex min-h-[30px] items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10.5px] font-bold text-cyan-200 transition hover:bg-cyan-500/20"
          >
            Открыть Run в GitHub Actions
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </footer>
    </section>
  );
};

export default LiveTerminal;
