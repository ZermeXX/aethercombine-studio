import {useEffect,useState} from 'react';
import type {ProjectStorage} from '../utils/projectStorage';
import type {ProjectScope} from '../utils/workspaceProjectContext';
import type {ProjectPayload} from '../utils/projectPayload';
import type {TimelineSlot,AudioMasteringConfig} from '../App';
import {collectAssetNames,attachMigrationAsset} from '../utils/migrationAssets';

type Production=NonNullable<ProjectPayload['production']>;
const defaultMaster:AudioMasteringConfig={loudnorm_enabled:true,integrated_lufs:-14,true_peak_dbtp:-1.5,lra:11,e3_soft_attack_compressor:true,e3_max_peak_over_bed_db:3};
export function ScopedTimelinePanel({production,onChange}:{production:Production;onChange:(next:Production)=>void}){
 const slots=production.timeline_slots??[],audio=production.audio_mastering??defaultMaster;
 function patch(i:number,change:Partial<TimelineSlot>){onChange({...production,timeline_slots:slots.map((s,n)=>n===i?{...s,...change}:s)});}
 function add(){const id=crypto.randomUUID();onChange({...production,timeline_slots:[...slots,{slot_index:slots.length+1,slot_id:id,title:'New slot',asset_id:'',file_name:'',source_clip_duration_sec:8,internal_loop_crossfade_sec:1,slot_duration_sec:60,inserts:[],slot_transition_out:{type:'none',duration_sec:0}}]});}
 return <section aria-label="Scoped timeline and mastering" className="space-y-3">
 <h3>Timeline &amp; Audio Mastering · Scoped preview</h3>
 <button type="button" onClick={add}>Add timeline slot</button>
 {slots.map((s,i)=><fieldset key={s.slot_id} className="border p-2"><legend>Slot {i+1}</legend>
 <label>Title<input aria-label={'Slot title '+(i+1)} value={s.title} onChange={e=>patch(i,{title:e.target.value})}/></label>
 <label>Media filename<input aria-label={'Slot filename '+(i+1)} value={s.file_name} onChange={e=>patch(i,{file_name:e.target.value})}/></label>
 <label>Duration (sec)<input aria-label={'Slot duration '+(i+1)} type="number" min="0" value={s.slot_duration_sec} onChange={e=>patch(i,{slot_duration_sec:Number(e.target.value)})}/></label>
 <p>Inserts: {s.inserts.length}</p></fieldset>)}
 <label><input type="checkbox" checked={audio.loudnorm_enabled} onChange={e=>onChange({...production,audio_mastering:{...audio,loudnorm_enabled:e.target.checked}})}/> Loudnorm enabled</label>
 {(['integrated_lufs','true_peak_dbtp','lra','e3_max_peak_over_bed_db'] as const).map(k=><label key={k}>{k}<input aria-label={k} type="number" step="0.1" value={audio[k]} onChange={e=>onChange({...production,audio_mastering:{...audio,[k]:Number(e.target.value)}})}/></label>)}
 <label><input type="checkbox" checked={audio.e3_soft_attack_compressor} onChange={e=>onChange({...production,audio_mastering:{...audio,e3_soft_attack_compressor:e.target.checked}})}/> Soft attack compressor</label>
 </section>;
}
export function ScopedAssetPanel({storage,scope,payload,busy,saveBeforeAttach,onBusy}:{storage:ProjectStorage;scope:ProjectScope;payload:ProjectPayload;busy:boolean;saveBeforeAttach:()=>Promise<void>;onBusy:(v:boolean)=>void}){
 const [rows,setRows]=useState<{assetId:string;name:string;size:number}[]>([]);
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const names=collectAssetNames(payload);
 useEffect(()=>{let live=true;setLoading(true);storage.listAssets(scope.workspaceId,scope.projectId).then(v=>{if(live)setRows(v);},()=>{if(live)setMessage('Asset list unavailable');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[storage,scope.workspaceId,scope.projectId]);
 async function attach(file:File){
  onBusy(true);setMessage('');
  try{await saveBeforeAttach();await attachMigrationAsset(storage,scope.workspaceId,scope.projectId,file.name,file);setRows(await storage.listAssets(scope.workspaceId,scope.projectId));setMessage('Asset attached and verified');}catch{setMessage('Attachment rejected or storage unavailable');}finally{onBusy(false);}
 }
 return <section aria-label="Project assets"><h3>Local project assets</h3><p>Only files referenced by the saved project may be attached. No upload to Google Drive.</p>
 {loading?<p>Loading assets…</p>:names.map(n=><p key={n}>{n}: {rows.some(r=>r.name===n)?'Attached (local)':'Not attached locally'}</p>)}
 <label>Attach referenced file<input aria-label="Attach referenced file" type="file" disabled={busy||loading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void attach(file);}}/></label>
 <p role="status">{message}</p></section>;
}
