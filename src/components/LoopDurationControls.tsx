export interface LoopDurationControlsProps {loopHours:number;durationSummary:string;onPreset:(hours:number)=>void;onExact:(value:string)=>void;}
/** Shared original duration controls; callers own synchronization policy. */
export function LoopDurationControls({loopHours,durationSummary,onPreset,onExact}:LoopDurationControlsProps){
 return (<div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase">
                  3. Быстрая синхронизация длительности проекта по слотам (от 3 до 10 часов)
                </label>
                <span className="text-xs text-amber-400 font-mono">
                  {durationSummary}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                {[
                  { hours: 3, label: '3 Часа (3:00:00)' },
                  { hours: 5, label: '5 Часов' },
                  { hours: 8, label: '8 Часов' },
                  { hours: 10, label: '10 Часов' }
                ].map(item => (
                  <button
                    key={item.hours}
                    aria-label={`Loop preset ${item.hours} hours`}
                    type="button"
                    onClick={() =>
                      onPreset(item.hours)
                    }
                    className={`loop-h-btn py-3.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      loopHours === item.hours
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/10'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/60'
                    }`}
                  >
                    [ {item.label} ]
                  </button>
                ))}
                <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Точно (3–10ч):</span>
                  <input
                    aria-label="Exact loop hours"
                    type="number"
                    min={3}
                    max={10}
                    step={1}
                    value={loopHours}
                    onChange={e => onExact(e.target.value)}
                    className="w-16 bg-[#0b0f17] border border-amber-500/40 rounded-lg px-2 py-1 text-center text-xs font-bold text-amber-400 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>);
}
