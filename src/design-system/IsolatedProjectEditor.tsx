import {VerbaFlowTextWorkbench} from '../components/VerbaFlowTextWorkbench';
import {YouTubeSeoView} from '../components/YouTubeSeoView';
import {createDefaultYoutubeSeoState,type YoutubeSeoState} from '../utils/englishExport';
import type {NarrativeSceneItem} from '../components/MontageCombineView';
import {applyModulePatch} from '../utils/scopedModulePersistence';
import type {ProjectPayload} from '../utils/projectPayload';
import type {SetStateAction} from 'react';
import {projectPayload} from '../utils/projectPayload';
import {useEffect,useRef,useState} from 'react';
import {openProjectDatabase,ProjectStorage} from '../utils/projectStorage';
import {WorkspaceProjectContext,type ProjectSnapshot} from '../utils/workspaceProjectContext';
import {CHANNEL_PROFILES,type WorkspaceId} from './workspaces';
import type {ProjectRecord} from './projectRegistry';

/** Explicit opt-in isolated editor. Never mounts legacy production modules. */
export function IsolatedProjectEditor({onExit}:{onExit:()=>void}){
 const storage=useRef<ProjectStorage|null>(null);
 const context=useRef<WorkspaceProjectContext|null>(null);
 const locked=useRef(false);
 const [ready,setReady]=useState(false);
 const [workspace,setWorkspace]=useState<WorkspaceId>('histoviva');
 const [projects,setProjects]=useState<ProjectRecord[]>([]);
 const [active,setActive]=useState<ProjectSnapshot|null>(null);
 const [name,setName]=useState('');
 const [script,setScript]=useState('');
 const [chapters,setChapters]=useState('');
 const [seo,setSeo]=useState('');
 const [title,setTitle]=useState('');
 const [badge,setBadge]=useState('');
 const [production,setProduction]=useState('');
 const [extras,setExtras]=useState('');
 const [nativeTab,setNativeTab]=useState<'none'|'verbaflow'|'seo'>('none');
 const [notice,setNotice]=useState('');
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 function hydrate(snapshot:ProjectSnapshot|null){
  setNativeTab('none');setNotice('');
  setProduction(snapshot?.payload?.production===undefined?'':JSON.stringify(snapshot.payload.production,null,2));setExtras(snapshot?.payload?.legacyExtras===undefined?'':JSON.stringify(snapshot.payload.legacyExtras,null,2));
  setActive(snapshot);setScript(snapshot?.payload?.script??'');setChapters(snapshot?.payload?.chapters??'');setSeo(snapshot?.payload?.seoScript??'');setTitle(snapshot?.payload?.thumbnailTitle??'');setBadge(snapshot?.payload?.thumbnailBadge??'');setDirty(false);
 }
 useEffect(()=>{
  let cancelled=false;let owned:ProjectStorage|undefined;
  void (async()=>{try{
   const db=await openProjectDatabase();if(cancelled){db.close();return;}
   owned=new ProjectStorage(db);const c=new WorkspaceProjectContext(owned);
   const initial=await c.openWorkspace('histoviva');if(cancelled)return;
   storage.current=owned;context.current=c;setProjects(initial.projects);hydrate(initial.active);setReady(true);
  }catch{if(!cancelled)setError('Unable to open project database. Legacy data unchanged.');}})();
  return()=>{cancelled=true;owned?.close();storage.current=null;context.current=null;};
 },[]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 async function run(action:(c:WorkspaceProjectContext)=>Promise<void>){
  if(locked.current||!context.current)return;
  locked.current=true;setBusy(true);setError('');
  try{await action(context.current);}catch{setError('Operation failed. Current edits retained. Reload or retry after resolving storage conflicts.');}
  finally{locked.current=false;setBusy(false);}
 }
 async function save(c:WorkspaceProjectContext){
  if(!active?.payload||!dirty)return;
  // One atomic revision, retaining other module data from the loaded snapshot.
  const scope={workspaceId:active.project.workspaceId,projectId:active.project.projectId};
  const input={...active.payload,script,chapters,seoScript:seo,thumbnailTitle:title,thumbnailBadge:badge,production:production.trim()?JSON.parse(production):undefined,legacyExtras:extras.trim()?JSON.parse(extras):undefined};
  const validated=projectPayload(input);
  // Reject silent projection loss rather than claiming a complete round trip.
  const equal=(a:unknown,b:unknown):boolean=>{
   if(Object.is(a,b))return true;
   if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
   const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
   const keys=Object.keys(x).filter(k=>x[k]!==undefined);
   return keys.length===Object.keys(y).filter(k=>y[k]!==undefined).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(y,k)&&equal(x[k],y[k]));
  };
  if(!equal(input,validated))throw new Error('Unsupported production fields');
  const screen=(v:unknown):void=>{if(typeof v==='string'&&/-----BEGIN [^-]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bya29\.[A-Za-z0-9_-]+/i.test(v))throw new Error('Possible credential');if(v&&typeof v==='object')Object.values(v).forEach(screen);};
  screen(validated);
  const next=await c.save(scope,active.project.revision,validated);
  hydrate(next);
 }
 async function changeWorkspace(next:WorkspaceId){
  await run(async c=>{await save(c);const data=await c.openWorkspace(next);setWorkspace(next);setProjects(data.projects);hydrate(data.active);});
 }
 async function select(id:string){
  await run(async c=>{await save(c);const next=await c.select({workspaceId:workspace,projectId:id});hydrate(next);});
 }
 async function create(){
  await run(async c=>{await save(c);const next=await c.create(workspace,name);const selected=await c.select({workspaceId:workspace,projectId:next.project.projectId});setProjects(await c.openWorkspace(workspace).then(x=>x.projects));hydrate(selected);setName('');});
 }
 // Native components use the same draft as the JSON editor, never global LocalStorage.
 function currentDraft():ProjectPayload{
  if(!active?.payload)throw new Error('No project');
  return projectPayload({...active.payload,script,chapters,seoScript:seo,thumbnailTitle:title,thumbnailBadge:badge,production:production.trim()?JSON.parse(production):undefined,legacyExtras:extras.trim()?JSON.parse(extras):undefined});
 }
 function openNative(tab:'verbaflow'|'seo'){
  // Save and validate advanced JSON before mounting a native component.
  void run(async c=>{await save(c);setNativeTab(tab);});
 }
 function transferScenes(scenes:NarrativeSceneItem[],fullScript:string){
  try{
   const draft=currentDraft();
   const next=applyModulePatch(draft,{module:'combine',narrativeScenes:scenes});
   setProduction(JSON.stringify(next.production,null,2));setScript(fullScript);setSeo(fullScript);setDirty(true);setNotice('Scenes copied to current project draft.');
  }catch{setNotice('Scene transfer rejected: unsupported scene data. Existing draft retained.');}
 }
 function updateNativeSeo(action:SetStateAction<YoutubeSeoState>){
  try{
   const draft=currentDraft();
   const previous=(draft.legacyExtras?.seo as YoutubeSeoState|undefined)??createDefaultYoutubeSeoState(workspace==='histoviva'?'Historical Doc':'Cozy Ambient');
   const next=typeof action==='function'?action(previous):action;
   const projected=applyModulePatch(draft,{module:'seo',seoScript:seo,seo:next});
   setExtras(JSON.stringify(projected.legacyExtras,null,2));setDirty(true);
  }catch{setNotice('SEO update rejected. Existing draft retained.');}
 }
 const nativeDraft=(()=>{if(nativeTab==='none'||!active?.payload)return null;try{return currentDraft();}catch{return null;}})();
 const field=(label:string,value:string,set:(v:string)=>void)=><label className="grid gap-1">{label}<textarea aria-label={label} value={value} disabled={busy||!active?.payload||nativeTab!=='none'} onChange={e=>{set(e.currentTarget.value);setDirty(true);}} className="min-h-20 rounded border border-studio-border bg-studio-bg p-2"/></label>;
 return <main className="mx-auto max-w-4xl space-y-4 p-4 text-studio-text">
 <h1 className="text-xl font-semibold">V9 Isolated Project Editor · Preview</h1>
 <p>Text, validated production settings, native VerbaFlow and YouTube SEO are available. Other legacy production modules, rendering and credentials are not mounted.</p>
 <button type="button" disabled={busy||dirty} onClick={onExit}>Return to legacy Studio</button>
 {error&&<p role="alert">{error}</p>}
 <label className="grid gap-1">Workspace<select aria-label="Isolated workspace" value={workspace} disabled={!ready||busy} onChange={e=>{const id=e.currentTarget.value;if(id==='histoviva'||id==='the_whisker_trio')void changeWorkspace(id);}}>{Object.values(CHANNEL_PROFILES).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label className="grid gap-1">Project<select aria-label="Isolated project" value={active?.project.projectId??''} disabled={!ready||busy} onChange={e=>{if(e.currentTarget.value)void select(e.currentTarget.value);}}><option value="" disabled>Select project</option>{projects.map(p=><option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
 <label>New project name<input aria-label="New project name" value={name} disabled={!ready||busy} onChange={e=>setName(e.currentTarget.value)}/></label>
 <button type="button" disabled={!ready||busy||!name.trim()} onClick={()=>void create()}>Create isolated project</button>
 {active&&!active.payload&&<p role="alert">Project has no payload. Editing disabled.</p>}
 <div className="flex gap-2">
 <button type="button" disabled={busy||!active?.payload} onClick={()=>openNative('verbaflow')}>Open native VerbaFlow</button>
 <button type="button" disabled={busy||!active?.payload} onClick={()=>openNative('seo')}>Open native YouTube SEO</button>
 <button type="button" onClick={()=>setNativeTab('none')} disabled={busy||nativeTab==='none'}>Close native module</button>
 </div>
 {notice&&<p>{notice}</p>}
 {nativeDraft&&nativeTab==='verbaflow'&&<fieldset disabled={busy} key={active?.project.projectId+':verbaflow'} aria-label="Native VerbaFlow">
 <VerbaFlowTextWorkbench sourceText={script} onSourceTextChange={v=>{setScript(v);setDirty(true);}} projectName={active?.project.name} narrativeScenes={nativeDraft.production?.narrative_scenes??[]} onSendScenesToTimeline={transferScenes} onSendToYoutubeSeo={(v,scenes)=>{if(scenes.length)transferScenes(scenes,v);else{setSeo(v);setDirty(true);}setNativeTab('seo');}} onSendChaptersToYoutubeSeo={v=>{setChapters(v);setDirty(true);}} onNotify={setNotice}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='seo'&&<fieldset disabled={busy} key={active?.project.projectId+':seo'} aria-label="Native YouTube SEO">
 <YouTubeSeoView projectName={active?.project.name??''} scriptContext={seo||script} narrativeScenes={nativeDraft.production?.narrative_scenes??[]} loopSlots={nativeDraft.production?.timeline_slots??[]} externalChaptersTxt={chapters} onClearExternalChapters={()=>{setChapters('');setDirty(true);}} seoState={(nativeDraft.legacyExtras?.seo as YoutubeSeoState|undefined)??createDefaultYoutubeSeoState(workspace==='histoviva'?'Historical Doc':'Cozy Ambient')} onSeoStateChange={updateNativeSeo} onApplyTitleToThumbnail={v=>{setTitle(v);setDirty(true);}} onNotify={setNotice}/>
 </fieldset>}
 {field('VerbaFlow script',script,setScript)}{field('Chapters',chapters,setChapters)}{field('SEO script',seo,setSeo)}{field('Thumbnail title',title,setTitle)}{field('Thumbnail badge',badge,setBadge)}
 <details><summary>Advanced production settings (JSON)</summary><p>Only supported typed fields are accepted. Do not enter credentials. Empty text removes the corresponding optional section.</p>{field('Production settings JSON',production,setProduction)}{field('Module settings JSON',extras,setExtras)}</details>
 <button type="button" disabled={!dirty||busy||!active?.payload} onClick={()=>void run(save)}>Save project</button>
 <p role="status">{busy?'Saving or loading…':dirty?'Unsaved changes':active?'Project loaded':'No project selected'}</p>
 </main>;
}
