import {dispatchStrictPreflight,findStrictPreflightRun,verifyStrictPreflightJobs} from '../utils/strictPreflightDispatch';
import {prepareLoopPreflight} from '../utils/loopProductionPreflight';
import {adaptLoopTimeline,buildScopedLoopManifest} from '../utils/loopRendererAdapter';
import {validateSlotInserts} from '../utils/validateSlotInserts';
import {useEffect,useState} from 'react';
import type {ProjectStorage} from '../utils/projectStorage';
import type {ProjectScope} from '../utils/workspaceProjectContext';
import type {ProjectPayload} from '../utils/projectPayload';
import type {TimelineSlot,AudioMasteringConfig,SlotInsertItem} from '../App';
import {collectAssetNames,attachMigrationAsset} from '../utils/migrationAssets';

type Production=NonNullable<ProjectPayload['production']>;
const defaultMaster:AudioMasteringConfig={loudnorm_enabled:true,integrated_lufs:-14,true_peak_dbtp:-1.5,lra:11,e3_soft_attack_compressor:true,e3_max_peak_over_bed_db:3};
export function ScopedTimelinePanel({production,onChange}:{production:Production;onChange:(next:Production)=>void}){
 const slots=production.timeline_slots??[],audio=production.audio_mastering??defaultMaster;
 const [insertError,setInsertError]=useState('');
 const [preview,setPreview]=useState('');
 const [folderId,setFolderId]=useState('');
 const [exportError,setExportError]=useState('');
 function downloadManifest(){try{const manifest=buildScopedLoopManifest(production,folderId.trim());const url=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='loop_manifest.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportError('');}catch(e){setExportError(e instanceof Error?e.message:'Export rejected');}}
 function patch(i:number,change:Partial<TimelineSlot>){try{const next={...slots[i],...change};validateSlotInserts(next);onChange({...production,timeline_slots:slots.map((s,n)=>n===i?next:s)});setInsertError('');}catch{setInsertError('Invalid insert timing or slot duration. Previous values retained.');}}
 function editInsert(i:number,j:number,change:Partial<SlotInsertItem>){patch(i,{inserts:slots[i].inserts.map((v,n)=>n===j?{...v,...change}:v)});}
 function addInsert(i:number){const s=slots[i];patch(i,{inserts:[...s.inserts,{insert_id:crypto.randomUUID(),asset_id:'',file_name:'',trigger_at_sec:0,duration_sec:Math.min(5,s.slot_duration_sec),transition_in:{type:'fade',duration_sec:0},transition_out:{type:'none',duration_sec:0}}]});}
 function add(){const id=crypto.randomUUID();onChange({...production,timeline_slots:[...slots,{slot_index:slots.length+1,slot_id:id,title:'New slot',asset_id:'',file_name:'',source_clip_duration_sec:8,internal_loop_crossfade_sec:1,slot_duration_sec:60,inserts:[],slot_transition_out:{type:'none',duration_sec:0}}]});}
 return <section aria-label="Scoped timeline and mastering" className="space-y-3">
 <h3>Timeline &amp; Audio Mastering · Scoped preview</h3>
 <button type="button" onClick={()=>{try{setPreview(JSON.stringify({timeline_slots:adaptLoopTimeline(slots)},null,2));}catch(e){setPreview(e instanceof Error?e.message:'Invalid timeline');}}}>Inspect renderer timeline contract</button>
 {preview&&<pre aria-label="Renderer timeline preview" className="whitespace-pre-wrap break-all">{preview}</pre>}
 <label>Export Drive folder ID<input aria-label="Export Drive folder ID" value={folderId} onChange={e=>setFolderId(e.target.value)}/></label>
 <p>Local JSON export only. Runner uses fixed -16 LUFS mastering. No dispatch or upload.</p>
 <button type="button" onClick={downloadManifest}>Download loop manifest JSON</button>
 {exportError&&<p role="alert">{exportError}</p>}
 <button type="button" onClick={add}>Add timeline slot</button>
 {slots.map((s,i)=><fieldset key={s.slot_id} className="border p-2"><legend>Slot {i+1}</legend>
 <label>Title<input aria-label={'Slot title '+(i+1)} value={s.title} onChange={e=>patch(i,{title:e.target.value})}/></label>
 <label>Media filename<input aria-label={'Slot filename '+(i+1)} value={s.file_name} onChange={e=>patch(i,{file_name:e.target.value})}/></label>
 <label>Duration (sec)<input aria-label={'Slot duration '+(i+1)} type="number" min="0" value={s.slot_duration_sec} onChange={e=>patch(i,{slot_duration_sec:Number(e.target.value)})}/></label>
 <label>Source clip duration<input aria-label={'Slot source duration '+(i+1)} type="number" min="0.01" step="0.01" value={s.source_clip_duration_sec} onChange={e=>{const n=Number(e.target.value);if(e.target.validity.valid&&n>s.internal_loop_crossfade_sec)patch(i,{source_clip_duration_sec:n});}}/></label>
 <label>Loop seam<input aria-label={'Slot loop seam '+(i+1)} type="number" min="0" step="0.01" value={s.internal_loop_crossfade_sec} onChange={e=>{const n=Number(e.target.value);if(e.target.validity.valid&&n<s.source_clip_duration_sec)patch(i,{internal_loop_crossfade_sec:n});}}/></label>
 <label>Transition<select aria-label={'Slot transition '+(i+1)} value={s.slot_transition_out.type} onChange={e=>patch(i,{slot_transition_out:{type:e.target.value as TimelineSlot['slot_transition_out']['type'],duration_sec:e.target.value==='none'?0:s.slot_transition_out.duration_sec}})}>{['none','xfade','fade','dissolve'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Transition seconds<input aria-label={'Slot transition duration '+(i+1)} type="number" min="0" step="0.01" disabled={s.slot_transition_out.type==='none'} value={s.slot_transition_out.duration_sec} onChange={e=>{const n=Number(e.target.value);if(e.target.validity.valid&&n<s.slot_duration_sec)patch(i,{slot_transition_out:{...s.slot_transition_out,duration_sec:n}});}}/></label>
 <p>Inserts: {s.inserts.length}</p>
 <button type="button" aria-label={'Add insert to slot '+(i+1)} onClick={()=>addInsert(i)}>Add insert</button>
 {s.inserts.map((v,j)=>{const suffix=(i+1)+'.'+(j+1);return <fieldset key={v.insert_id} className="border p-2"><legend>Insert {suffix}</legend>
 <label>Filename<input aria-label={'Insert filename '+suffix} value={v.file_name} onChange={e=>editInsert(i,j,{file_name:e.target.value})}/></label>
 {(['trigger_at_sec','duration_sec'] as const).map(k=><label key={k}>{k}<input aria-label={'Insert '+k+' '+suffix} type="number" min="0" step="any" value={v[k]} onChange={e=>{if(e.target.value!=='')editInsert(i,j,{[k]:Number(e.target.value)});}}/></label>)}
 {(['transition_in','transition_out'] as const).map(k=><div key={k}><label>{k}<select aria-label={'Insert '+k+' '+suffix} value={v[k].type} onChange={e=>{const type=e.target.value;editInsert(i,j,k==='transition_in'?{transition_in:{type:type as SlotInsertItem['transition_in']['type'],duration_sec:v[k].duration_sec}}:{transition_out:{type:type as SlotInsertItem['transition_out']['type'],duration_sec:type==='none'?0:v[k].duration_sec}});}}>{(k==='transition_in'?['fade','dissolve']:['none','fade','dissolve']).map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Seconds<input aria-label={'Insert '+k+' seconds '+suffix} type="number" min="0" step="any" disabled={v[k].type==='none'} value={v[k].duration_sec} onChange={e=>{if(e.target.value!=='')editInsert(i,j,{[k]:{...v[k],duration_sec:Number(e.target.value)}});}}/></label></div>)}
 <label><input type="checkbox" checked={v.hold_until_end??false} onChange={e=>editInsert(i,j,{hold_until_end:e.target.checked})}/> Hold until end</label>
 <label><input type="checkbox" checked={v.audio_soft_compressor??false} onChange={e=>editInsert(i,j,{audio_soft_compressor:e.target.checked})}/> Soft compressor</label>
 <button type="button" aria-label={'Remove insert '+suffix} onClick={()=>patch(i,{inserts:s.inserts.filter((_,n)=>n!==j)})}>Remove insert</button>
 </fieldset>;})}</fieldset>)}
 {insertError&&<p role="alert">{insertError}</p>}
 <label><input type="checkbox" checked={audio.loudnorm_enabled} onChange={e=>onChange({...production,audio_mastering:{...audio,loudnorm_enabled:e.target.checked}})}/> Loudnorm enabled</label>
 {(['integrated_lufs','true_peak_dbtp','lra','e3_max_peak_over_bed_db'] as const).map(k=><label key={k}>{k}<input aria-label={k} type="number" step="0.1" value={audio[k]} onChange={e=>onChange({...production,audio_mastering:{...audio,[k]:Number(e.target.value)}})}/></label>)}
 <label><input type="checkbox" checked={audio.e3_soft_attack_compressor} onChange={e=>onChange({...production,audio_mastering:{...audio,e3_soft_attack_compressor:e.target.checked}})}/> Soft attack compressor</label>
 </section>;
}
export function ScopedAssetPanel({storage,scope,payload,busy,saveBeforeAttach,acquireWrite,releaseWrite}:{storage:ProjectStorage;scope:ProjectScope;payload:ProjectPayload;busy:boolean;saveBeforeAttach:()=>Promise<void>;acquireWrite:()=>boolean;releaseWrite:()=>void}){
 const [rows,setRows]=useState<{assetId:string;name:string;size:number}[]>([]);
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const names=collectAssetNames(payload);
 const [preflightFolder,setPreflightFolder]=useState('');
 const [report,setReport]=useState('');
 const [authToken,setAuthToken]=useState('');
 const [dispatchResult,setDispatchResult]=useState<Awaited<ReturnType<typeof dispatchStrictPreflight>>|null>(null);
 const [dispatchStatus,setDispatchStatus]=useState('');
 const preflightKey=JSON.stringify([scope.workspaceId,scope.projectId,payload,preflightFolder]);
 useEffect(()=>{setReport('');setDispatchResult(null);setDispatchStatus('');setAuthToken('');},[preflightKey]);
 async function sendPreflight(){
  if(!acquireWrite())return;setDispatchStatus('');setDispatchResult(null);
  try{await saveBeforeAttach();if(!payload.production)throw new Error('No production settings');const result=await dispatchStrictPreflight(storage,scope,payload.production,preflightFolder.trim(),authToken);setDispatchResult(result);setDispatchStatus('Preflight request accepted; runner not verified');}catch{setDispatchStatus('Preflight request failed or unconfirmed');}finally{setAuthToken('');releaseWrite();}
 }
 async function lookupPreflight(){
  if(!dispatchResult||!acquireWrite())return;
  try{
   const run=await findStrictPreflightRun(dispatchResult.requestId,dispatchResult.rendererSha,authToken);
   if(!run){setDispatchStatus('Matching run not found yet');return;}
   const prefix='Run '+run.id+': '+run.status+' / '+(run.conclusion??'pending');
   if(run.status==='completed'&&run.conclusion==='success'){
    const verified=await verifyStrictPreflightJobs(run.id,dispatchResult.rendererSha,authToken);
    setDispatchStatus(prefix+(verified?'; strict runner evidence verified; production dispatch blocked':'; strict runner evidence not verified'));
   }else setDispatchStatus(prefix+'; runner verification pending');
  }catch{setDispatchStatus('Run lookup or evidence verification failed');}finally{setAuthToken('');releaseWrite();}
 }
 async function checkPreflight(){
  if(!acquireWrite())return;setReport('');
  try{await saveBeforeAttach();if(!payload.production)throw new Error('No production settings');const result=await prepareLoopPreflight(storage,scope,payload.production,preflightFolder.trim());setReport(JSON.stringify({assets:result.assets,rendererCandidate:result.rendererCandidate,dispatchAllowed:result.dispatchAllowed,blockers:result.blockers},null,2));}catch(e){setReport(e instanceof Error?e.message:'Preflight failed');}finally{releaseWrite();}
 }
 useEffect(()=>{let live=true;setLoading(true);storage.listAssets(scope.workspaceId,scope.projectId).then(v=>{if(live)setRows(v);},()=>{if(live)setMessage('Asset list unavailable');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[storage,scope.workspaceId,scope.projectId]);
 async function attach(file:File){
  if(!acquireWrite())return;setMessage('');
  try{await saveBeforeAttach();await attachMigrationAsset(storage,scope.workspaceId,scope.projectId,file.name,file);setRows(await storage.listAssets(scope.workspaceId,scope.projectId));setMessage('Asset attached and verified');}catch{setMessage('Attachment rejected or storage unavailable');}finally{releaseWrite();}
 }
 return <section aria-label="Project assets"><h3>Local project assets</h3><p>Only files referenced by the saved project may be attached. No upload to Google Drive.</p>
 {loading?<p>Loading assets…</p>:names.map(n=><p key={n}>{n}: {rows.some(r=>r.name===n)?'Attached (local)':'Not attached locally'}</p>)}
 <label>Attach referenced file<input aria-label="Attach referenced file" type="file" disabled={busy||loading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void attach(file);}}/></label>
 <p role="status">{message}</p>
 <h3>Production preflight (local evidence only)</h3>
 <label>Preflight Drive folder ID<input aria-label="Preflight Drive folder ID" value={preflightFolder} onChange={e=>setPreflightFolder(e.target.value)} disabled={busy||loading}/></label>
 <button type="button" disabled={busy||loading} onClick={()=>void checkPreflight()}>Check production preflight</button>
 {report&&<pre aria-label="Production preflight report" className="whitespace-pre-wrap">{report}</pre>}
 <h3>Authenticated preflight only</h3>
 <label>GitHub token (memory only)<input aria-label="Preflight GitHub token" type="password" autoComplete="off" value={authToken} onChange={e=>setAuthToken(e.target.value)} disabled={busy||loading}/></label>
 <button type="button" disabled={busy||loading||!authToken.trim()||!preflightFolder.trim()} onClick={()=>void sendPreflight()}>Dispatch strict preflight only</button>
 {dispatchResult&&<p>Request ID: {dispatchResult.requestId}</p>}
 <button type="button" disabled={busy||loading||!authToken.trim()||!dispatchResult} onClick={()=>void lookupPreflight()}>Check matching preflight run</button>
 <p role="status">{dispatchStatus}</p>
 <p>Production dispatch blocked. Token is cleared after each request and on project or configuration changes.</p>
 </section>;
}
