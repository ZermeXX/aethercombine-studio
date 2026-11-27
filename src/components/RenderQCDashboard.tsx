import React, { useState } from 'react';

type RecordData = Record<string, unknown>;
const obj = (v: unknown): RecordData => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordData : {};
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fmt = (v: unknown, digits=2) => num(v) ? v.toFixed(digits) : '—';
const str = (v: unknown) => typeof v === 'string' ? v : '—';
const rows = (v: unknown) => Array.isArray(v) ? v.map(obj) : [];
export function parseRenderQC(raw: unknown): RecordData {
  const r=obj(raw);
  if (!num(r.duration_sec) || r.duration_sec<=0 || !num(r.scenes) || r.scenes<1 || !Number.isInteger(r.scenes) || typeof r.resolution!=='string' || !num(r.fps) || r.fps<=0) throw new Error('Некорректный qc_report.json');
  return r;
}
export function qcChecks(r: RecordData) {
  const checks: {label:string; status:string}[]=[];
  const add=(label:string,known:boolean,pass:boolean)=>checks.push({label,status:known?(pass?'PASS':'REVIEW'):'UNKNOWN'});
  const ef=r.expected_video_frames, af=r.actual_video_frames, delta=r.av_delta_ms, tol=r.av_tolerance_ms, l=r.integrated_lufs, target=r.target_lufs, peak=r.true_peak_dbtp, tp=r.target_true_peak_dbtp;
  add('Количество кадров',num(ef)&&num(af),ef===af);
  add('A/V Sync',num(delta)&&num(tol)&&tol>=0,num(delta)&&num(tol)&&Math.abs(delta)<=tol);
  add('Loudness (±0.5 LU)',num(l)&&num(target),num(l)&&num(target)&&Math.abs(l-target)<=0.5);
  add('True Peak (+0.2 dB tolerance)',num(peak)&&num(tp),num(peak)&&num(tp)&&peak<=tp+0.2);
  return checks;
}
export default function RenderQCDashboard() {
  const [report,setReport]=useState<RecordData|null>(null);
  const [error,setError]=useState('');
  const [filename,setFilename]=useState('');
  const [onlyWarnings,setOnlyWarnings]=useState(false);
  const load=async(file:File|undefined)=>{
    if(!file)return;
    setReport(null);setError('');setFilename(file.name);
    try { if(file.size>10*1024*1024)throw new Error('QC JSON превышает 10 MB'); setReport(parseRenderQC(JSON.parse(await file.text()))); }
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const scenes=rows(report?.scene_audio_qc);
  const warnings=scenes.filter(s=>Array.isArray(s.warnings)&&s.warnings.length>0);
  const checks=report?qcChecks(report):[];
  return <section className="bg-[#0b0f17] border border-cyan-500/30 rounded-2xl p-4 space-y-3 text-xs text-slate-200">
    <h3 className="font-bold text-cyan-300 text-sm">Enhanced QC Dashboard V8.1</h3>
    <p className="text-slate-400">Загрузите qc_report.json из результата GitHub Actions или Google Drive. Данные обрабатываются локально.</p>
    <input aria-label="Загрузить QC JSON" type="file" accept=".json,application/json" onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/>
    {error&&<p role="alert" className="text-red-400">{error}</p>}
    {report&&<>
      <div className="flex justify-between"><span>{filename} · {str(report.render_mode)}</span><button type="button" onClick={()=>{setReport(null);setFilename('');}} className="text-cyan-300">Очистить</button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ['Длительность',fmt(report.duration_sec,3)+' s'],['Разрешение',str(report.resolution)],['FPS',fmt(report.fps,0)],['Сцены',fmt(report.scenes,0)],
          ['LUFS',fmt(report.integrated_lufs)],['True Peak dBTP',fmt(report.true_peak_dbtp)],['LRA LU',fmt(report.loudness_range_lu)],['A/V delta ms',fmt(report.av_delta_ms,3)],
          ['Кадры факт / план',fmt(report.actual_video_frames,0)+' / '+fmt(report.expected_video_frames,0)],['Размер MB',fmt(report.file_size_mb)],['Loudnorm',str(report.loudnorm_mode)],['Encode speed',fmt(report.encode_speed_x)+'×'],
          ['Видео s',fmt(report.video_duration_sec,3)],['Аудио s',fmt(report.audio_duration_sec,3)],['A/V допуск ms',fmt(report.av_tolerance_ms,3)],['Bitrate cap Mbps',fmt(report.bitrate_cap_mbps)]
        ].map(([label,value])=><div key={label} className="rounded bg-slate-900 p-2"><div className="text-slate-400">{label}</div><strong>{value}</strong></div>)}
      </div>
      <div className="flex flex-wrap gap-3">{checks.map(c=><span key={c.label} className={c.status==='PASS'?'text-emerald-400':c.status==='REVIEW'?'text-amber-300':'text-slate-400'}>{c.label}: {c.status}</span>)}</div>
      <p className="text-slate-400">Технические индикаторы не заменяют просмотр и прослушивание фильма.</p>
      <div className="flex flex-wrap gap-3"><strong>Scene Audio QC: {scenes.length} · предупреждения: {warnings.length}</strong><label><input type="checkbox" checked={onlyWarnings} onChange={e=>setOnlyWarnings(e.target.checked)}/> Только предупреждения</label></div>
      <p className="text-slate-400">{str(report.audio_qc_note)}</p>
      {!scenes.length&&<p>Детализация сцен отсутствует в отчёте.</p>}
      <div className="max-h-96 overflow-auto space-y-2">{(onlyWarnings?warnings:scenes).map((s,i)=><details key={i} className="bg-slate-900 rounded p-2">
        <summary className="cursor-pointer">Scene {fmt(s.scene_index,0)} · {str(s.scene_id)} · Mix {fmt(s.mixed_segment_lufs)} LUFS · Adaptive {s.adaptive_audio===true?'ON':s.adaptive_audio===false?'OFF':'—'} · Ducking {s.audio_ducking===true?'ON':s.audio_ducking===false?'OFF':'—'}</summary>
        <div className="overflow-x-auto"><table className="w-full text-left mt-2"><thead><tr>{['Track','Enabled','Input LUFS','Target','Gain','Pre-duck LUFS'].map(x=><th key={x} className="p-1">{x}</th>)}</tr></thead><tbody>{Object.entries(obj(s.tracks)).map(([name,t])=>{const a=obj(t);return <tr key={name}>{[name,a.enabled===true?'ON':a.enabled===false?'OFF':'—',fmt(a.input_lufs),fmt(a.target_lufs),fmt(a.applied_gain),fmt(a.estimated_pre_duck_lufs)].map((v,j)=><td key={j} className="p-1">{v}</td>)}</tr>;})}</tbody></table></div>
        <p>CTA SFX: {obj(s.cta).enabled===true?'ON':obj(s.cta).enabled===false?'OFF':'—'} · click {fmt(obj(s.cta).click_sec)} s · bell {fmt(obj(s.cta).bell_sec)} s · gain {fmt(obj(s.cta).sfx_volume)}</p>
        {Array.isArray(s.warnings)&&s.warnings.map((w,j)=><p key={j} className="text-amber-300">{str(w)}</p>)}
      </details>)}</div>
    </>}
  </section>;
}
