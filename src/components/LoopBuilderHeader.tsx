import {Repeat} from 'lucide-react';
export interface LoopBuilderHeaderProps {
 loopProjectName:string;
 setLoopProjectName?:(value:string)=>void;
 videoCodec:string;videoCrf:number;videoFps:number;audioBitrateKbps:number;
 actCrossfadeSec:number;internalLoopCrossfadeSec:number;slotCount:number;totalInsertsCount:number;durationLabel:string;
}
/** Shared native Loop Builder header. No storage, credentials or dispatch dependencies. */
export function LoopBuilderHeader({loopProjectName,setLoopProjectName,videoCodec,videoCrf,videoFps,audioBitrateKbps,actCrossfadeSec,internalLoopCrossfadeSec,slotCount,totalInsertsCount,durationLabel}:LoopBuilderHeaderProps){
 return (<div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div className="space-y-2 flex-1 min-w-0 sm:min-w-[260px]">
                <h2 className="text-base sm:text-lg font-bold text-[#f8fafc] flex items-center gap-2">
                  <Repeat className="text-amber-400 w-5 h-5 shrink-0" />
                  <span>Многочасовой Луп (N-Слотов) — Конструктор 4K</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Project Name:
                  </label>
                  <input
                    type="text"
                    value={loopProjectName}
                    onChange={e => setLoopProjectName?.(e.target.value)}
                    readOnly={!setLoopProjectName}
                    aria-label="Loop project name"
                    placeholder="Ambient Loop 4K"
                    className="min-h-[40px] bg-[#080c14]/90 border border-white/[0.12] focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs font-semibold text-[#f8fafc] w-full sm:w-80 outline-none"
                  />
                </div>
                <p className="text-xs text-white/55">
                  Экспорт{' '}
                  <code className="font-mono text-amber-300">
                    {videoCodec} (CRF {videoCrf})
                  </code>{' '}
                  {videoFps} fps • AAC {audioBitrateKbps} kbps • Стыки актов {actCrossfadeSec}с •
                  Петли 10с (шов {internalLoopCrossfadeSec.toFixed(1)}с)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-white/75">
                <span className="text-cyan-300">
                  {videoCodec === 'libx265' ? 'H.265' : 'H.264'} • CRF {videoCrf} • {videoFps}fps
                </span>
                <span className="text-white/25">•</span>
                <span className="text-emerald-300 font-semibold">
                  Актов: {slotCount} • Вставок: {totalInsertsCount} •{' '}
                  {durationLabel}
                </span>
              </div>
            </div>);
}
