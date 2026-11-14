/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Trash2, Check, Terminal, ExternalLink } from 'lucide-react';

export type TerminalRunnerState = 'idle' | 'queued' | 'running' | 'success' | 'failed';

export interface TerminalLogEntry {
  id: string;
  text: string;
  level: 'info' | 'step' | 'success' | 'error' | 'raw';
}

interface StudioTerminalProps {
  status: TerminalRunnerState;
  elapsedSeconds: number;
  logs: TerminalLogEntry[];
  runUrl?: string;
  onClearLogs: () => void;
  onCopyLogs?: () => void;
  onCancelRun?: () => void;
}

export const formatTerminalTime = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const StudioTerminal: React.FC<StudioTerminalProps> = ({
  status,
  elapsedSeconds,
  logs,
  runUrl,
  onClearLogs,
  onCopyLogs,
  onCancelRun
}) => {
  const [copied, setCopied] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isActive = status === 'running' || status === 'queued';

  // Автоматическая прокрутка к последней строке (auto-scroll down)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    const fullText = logs.map(l => l.text).join('\n');
    navigator.clipboard.writeText(fullText || '');
    setCopied(true);
    if (onCopyLogs) onCopyLogs();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#080c14] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Верхняя панель окна терминала */}
      <div className="bg-[#0b101b] border-b border-[#1e293b] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Terminal className="w-4 h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
          <span className="text-xs font-bold tracking-wider uppercase text-slate-100 font-mono">
            💻 ТЕРМИНАЛ ОБЛАЧНОГО РАННЕРА
          </span>

          {/* Индикатор состояния: ● IDLE / ● QUEUED / ● RUNNING / ● SUCCESS / ● FAILED */}
          {status === 'idle' && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-slate-400">
              ● IDLE
            </span>
          )}
          {status === 'queued' && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/50 text-sky-300 animate-pulse shadow-[0_0_12px_rgba(56,189,248,0.3)]">
              ● QUEUED
            </span>
          )}
          {status === 'running' && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-300 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.3)]">
              ● RUNNING
            </span>
          )}
          {status === 'success' && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
              ● SUCCESS
            </span>
          )}
          {status === 'failed' && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              ● FAILED
            </span>
          )}

          {/* Кнопка отмены сборки в шапке рядом с бейджем статуса (активна при RUNNING или QUEUED) */}
          {onCancelRun && (
            <button
              type="button"
              onClick={onCancelRun}
              disabled={!isActive}
              className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1 ${
                isActive
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/50 text-rose-300 cursor-pointer shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                  : 'bg-slate-900/60 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
              }`}
              title="Отправить запрос на отмену текущего запуска GitHub Actions"
            >
              <span>⏹ Отменить сборку</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Таймер активной сборки (ММ:СС) */}
          <span className="text-xs font-mono font-bold text-amber-300 bg-[#080c14] border border-[#1e293b] px-2.5 py-1 rounded-lg">
            {formatTerminalTime(elapsedSeconds)}
          </span>

          {runUrl && runUrl !== '#' && (
            <a
              href={runUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-indigo-300 hover:text-amber-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
            >
              GitHub Run <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Кнопка "📋 Копировать лог" */}
          <button
            type="button"
            onClick={handleCopy}
            className="bg-slate-900 hover:bg-slate-800 border border-[#1e293b] text-slate-200 hover:text-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>📋 Копировать лог</span>
          </button>

          {/* Кнопка "🗑 Очистить" */}
          <button
            type="button"
            onClick={onClearLogs}
            className="bg-slate-900 hover:bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-rose-400 px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>🗑 Очистить</span>
          </button>
        </div>
      </div>

      {/* Консольное окно фиксированной высоты (270px) с автоскроллом */}
      <div
        ref={scrollContainerRef}
        className="h-[270px] overflow-y-auto custom-scroll p-4 font-mono text-[12.5px] leading-relaxed space-y-1 bg-[#080c14] selection:bg-amber-500/30"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-slate-500 text-xs space-y-1">
            <span>Консоль облачного раннера готова к работе (● IDLE).</span>
            <span className="text-[11px] text-slate-600">
              Нажмите «🚀 Запустить облачную сборку», чтобы начать трансляцию шагов GitHub Actions и FFmpeg в реальном времени.
            </span>
          </div>
        ) : (
          logs.map(entry => {
            let colorClass = 'text-slate-300';
            if (entry.level === 'step') colorClass = 'text-amber-300 font-medium';
            else if (entry.level === 'success') colorClass = 'text-emerald-400 font-semibold';
            else if (entry.level === 'error') colorClass = 'text-rose-400 font-semibold';
            else if (entry.level === 'raw') colorClass = 'text-slate-400 text-[11.5px]';

            return (
              <div key={entry.id} className={`${colorClass} whitespace-pre-wrap break-words`}>
                {entry.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const LiveTerminal = StudioTerminal;

