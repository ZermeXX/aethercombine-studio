import {ScopedRenderSettings} from './ScopedRenderSettings';
import {ProjectImagePanel,type ProjectImageUrls} from './ProjectImagePanel';
import {ThumbnailStudioView} from '../components/ThumbnailStudioView';
import {VoiceStudioView} from '../components/VoiceStudioView';
import {ImageArtEditorView} from '../components/ImageArtEditorView';
import type {ComponentProps} from 'react';
import {legacyExtras} from '../utils/legacyExtras';
import {ScopedTimelinePanel,ScopedAssetPanel} from './ScopedTimelinePanel';
import {MontageCombineView} from '../components/MontageCombineView';
import {hydrateCombine,captureCombine} from '../utils/nativeCombineBinding';
import type {AetherCombineDraftSlice} from '../utils/aetherPersistence';
import {VerbaFlowTextWorkbench} from '../components/VerbaFlowTextWorkbench';
import {YouTubeSeoView} from '../components/YouTubeSeoView';
import {createDefaultYoutubeSeoState,type YoutubeSeoState} from '../utils/englishExport';
import type {NarrativeSceneItem} from '../components/MontageCombineView';
import {applyModulePatch} from '../utils/scopedModulePersistence';
import type {ProjectPayload} from '../utils/projectPayload';
import type {SetStateAction} from 'react';
import {projectPayload} from '../utils/projectPayload';
import {useEffect,useMemo,useRef,useState} from 'react';
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
 const [nativeTab,setNativeTab]=useState<'none'|'verbaflow'|'seo'|'combine'|'loop'|'thumb'|'voice'|'art'>('none');
 const [notice,setNotice]=useState('');
 const [imageUrls,setImageUrls]=useState<ProjectImageUrls>({});
 const [artInput,setArtInput]=useState<{dataUrl:string;label:string;nonce:number}|null>(null);
 const combineInvalid=useRef(false);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [assetBusy,setAssetBusy]=useState(false);
 const imageWrite=useRef(false);
 const [imageRefresh,setImageRefresh]=useState(0);
 const [error,setError]=useState('');
 function hydrate(snapshot:ProjectSnapshot|null){
  combineInvalid.current=false;setNativeTab('none');setNotice('');setArtInput(null);
  setProduction(snapshot?.payload?.production===undefined?'':JSON.stringify(snapshot.payload.production,null,2));setExtras(snapshot?.payload?.legacyExtras===undefined?'':JSON.stringify(snapshot.payload.legacyExtras,null,2));
  if(snapshot?.project.projectId!==active?.project.projectId)setImageUrls({});
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
  if(locked.current||imageWrite.current||assetBusy||!context.current)return;
  locked.current=true;setBusy(true);setError('');
  try{await action(context.current);}catch{setError('Operation failed. Current edits retained. Reload or retry after resolving storage conflicts.');}
  finally{locked.current=false;setBusy(false);}
 }
 async function save(c:WorkspaceProjectContext){
  if(combineInvalid.current)throw new Error('Unpersistable Montage changes');
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
 function openNative(tab:'verbaflow'|'seo'|'combine'|'loop'|'thumb'|'voice'|'art'){
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
   const projected=applyModulePatch(draft,{module:'seo',seoScript:seo,seo:{tone:next.tone,selectedTitleId:next.selectedTitleId,titles:next.titles.map(t=>({id:t.id,category:t.category,categoryRu:t.categoryRu,title:t.title})),description:next.description,tagsString:next.tagsString}});
   setExtras(JSON.stringify(projected.legacyExtras,null,2));setDirty(true);
  }catch{setNotice('SEO update rejected. Existing draft retained.');}
 }
 const combineCapture=useRef<(slice:AetherCombineDraftSlice)=>void>(()=>{});
 combineCapture.current=slice=>{
  try{
   const next=captureCombine(currentDraft(),slice);
   combineInvalid.current=false;
   const p=JSON.stringify(next.production,null,2),e=JSON.stringify(next.legacyExtras,null,2);
   if(p!==production||e!==extras){setProduction(p);setExtras(e);setDirty(true);}
  }catch{combineInvalid.current=true;setDirty(true);setError('Montage changes could not be represented by the project schema. Close module only after resolving the error.');}
 };
 const onCombineChange=useRef((slice:AetherCombineDraftSlice)=>combineCapture.current(slice)).current;
 function changeLoop(key:'fps'|'codec'|'resolution'|'loopHours',value:string){
  try{
   const draft=currentDraft(),prev=draft.production??{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]};
   const next=projectPayload({...draft,production:{...prev,[key]:key==='fps'||key==='loopHours'?Number(value):value}});
   setProduction(JSON.stringify(next.production,null,2));setDirty(true);
  }catch{setNotice('Invalid loop setting');}
 }
 const captureExtras=useRef<(section:'thumbnails'|'voice',value:unknown)=>void>(()=>{});
 captureExtras.current=(section,value)=>{
  try{const draft=currentDraft();const next=legacyExtras({...draft.legacyExtras,[section]:value});const encoded=JSON.stringify(next,null,2);if(encoded!==extras){setExtras(encoded);setDirty(true);}}
  catch{setError('Unsupported module preferences');}
 };
 const onSlots=useRef<NonNullable<ComponentProps<typeof ThumbnailStudioView>['onSlotsChange']>>(value=>captureExtras.current('thumbnails',value)).current;
 const onVoice=useRef<NonNullable<ComponentProps<typeof VoiceStudioView>['onPreferencesChange']>>(value=>captureExtras.current('voice',value)).current;
 async function persistNativeImage(slots:('A'|'B'|'C'|'art')[],source:Blob|string,nextTab?:'art'|'thumb'){
  if(!active||!storage.current||locked.current||imageWrite.current||assetBusy)return;
  const db=storage.current,scope={workspaceId:active.project.workspaceId,projectId:active.project.projectId};
  imageWrite.current=true;setAssetBusy(true);setError('');
  try{
   if(typeof source==='string'&&!/^data:image\/(png|jpeg|webp);base64,/i.test(source))throw new Error('Only local raster data accepted');
   const blob=typeof source==='string'?await (await fetch(source)).blob():source;
   if(blob.size>32*1024*1024)throw new Error('Image too large');
   const bitmap=await createImageBitmap(blob);bitmap.close();
   await db.replaceProjectImages(scope.workspaceId,scope.projectId,slots,blob);
   setImageRefresh(v=>v+1);setNotice('Native image saved: '+slots.join(', '));
   if(nextTab){setArtInput(null);setNativeTab(nextTab);}
  }catch{setError('Native image could not be saved. Existing stored images retained.');}
  finally{imageWrite.current=false;setAssetBusy(false);}
 }
 const artSource=useMemo(()=>artInput??(imageUrls.art?{dataUrl:imageUrls.art,label:'Stored project art',nonce:0}:null),[artInput,imageUrls.art]);
 const nativeDraft=(()=>{if(nativeTab==='none'||!active?.payload)return null;try{return currentDraft();}catch{return null;}})();
 const field=(label:string,value:string,set:(v:string)=>void)=><label className="grid gap-1">{label}<textarea aria-label={label} value={value} disabled={assetBusy||busy||!active?.payload||nativeTab!=='none'} onChange={e=>{set(e.currentTarget.value);setDirty(true);}} className="min-h-20 rounded border border-studio-border bg-studio-bg p-2"/></label>;
 return <main className="mx-auto max-w-4xl space-y-4 p-4 text-studio-text">
 <h1 className="text-xl font-semibold">V9 Isolated Project Editor · Preview</h1>
 <p>Text, validated production settings, native VerbaFlow and YouTube SEO are available. Other legacy production modules, rendering and credentials are not mounted.</p>
 <button type="button" disabled={assetBusy||busy||dirty} onClick={onExit}>Return to legacy Studio</button>
 {error&&<p role="alert">{error}</p>}
 <label className="grid gap-1">Workspace<select aria-label="Isolated workspace" value={workspace} disabled={assetBusy||!ready||busy} onChange={e=>{const id=e.currentTarget.value;if(id==='histoviva'||id==='the_whisker_trio')void changeWorkspace(id);}}>{Object.values(CHANNEL_PROFILES).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label className="grid gap-1">Project<select aria-label="Isolated project" value={active?.project.projectId??''} disabled={assetBusy||!ready||busy} onChange={e=>{if(e.currentTarget.value)void select(e.currentTarget.value);}}><option value="" disabled>Select project</option>{projects.map(p=><option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
 <label>New project name<input aria-label="New project name" value={name} disabled={assetBusy||!ready||busy} onChange={e=>setName(e.currentTarget.value)}/></label>
 <button type="button" disabled={assetBusy||!ready||busy||!name.trim()} onClick={()=>void create()}>Create isolated project</button>
 {active&&!active.payload&&<p role="alert">Project has no payload. Editing disabled.</p>}
 <div className="flex gap-2">
 <button type="button" disabled={assetBusy||busy||!active?.payload} onClick={()=>openNative('verbaflow')}>Open native VerbaFlow</button>
 <button type="button" disabled={assetBusy||busy||!active?.payload} onClick={()=>openNative('seo')}>Open native YouTube SEO</button>
 <button type="button" disabled={assetBusy||busy||!active?.payload} onClick={()=>openNative('combine')}>Open native Montage Combine</button>
 <button type="button" disabled={assetBusy||busy||!active?.payload} onClick={()=>openNative('loop')}>Open scoped Loop settings</button>
 <button type="button" disabled={busy||assetBusy||!active?.payload} onClick={()=>openNative('thumb')}>Open native Thumbnail Studio</button>
 <button type="button" disabled={busy||assetBusy||!active?.payload} onClick={()=>openNative('voice')}>Open native Voice Studio</button>
 <button type="button" disabled={busy||assetBusy||!active?.payload} onClick={()=>openNative('art')}>Open native Image Art Editor</button>
 <button type="button" onClick={()=>setNativeTab('none')} disabled={assetBusy||busy||nativeTab==='none'||combineInvalid.current}>Close native module</button>
 </div>
 {notice&&<p>{notice}</p>}
 {nativeDraft&&nativeTab==='verbaflow'&&<fieldset disabled={busy} key={active?.project.projectId+':verbaflow'} aria-label="Native VerbaFlow">
 <VerbaFlowTextWorkbench sourceText={script} onSourceTextChange={v=>{setScript(v);setDirty(true);}} projectName={active?.project.name} narrativeScenes={nativeDraft.production?.narrative_scenes??[]} onSendScenesToTimeline={transferScenes} onSendToYoutubeSeo={(v,scenes)=>{if(scenes.length)transferScenes(scenes,v);else{setSeo(v);setDirty(true);}setNativeTab('seo');}} onSendChaptersToYoutubeSeo={v=>{setChapters(v);setDirty(true);}} onNotify={setNotice}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='seo'&&<fieldset disabled={busy} key={active?.project.projectId+':seo'} aria-label="Native YouTube SEO">
 <YouTubeSeoView projectName={active?.project.name??''} scriptContext={seo||script} narrativeScenes={nativeDraft.production?.narrative_scenes??[]} loopSlots={nativeDraft.production?.timeline_slots??[]} externalChaptersTxt={chapters} onClearExternalChapters={()=>{setChapters('');setDirty(true);}} seoState={(nativeDraft.legacyExtras?.seo as YoutubeSeoState|undefined)??createDefaultYoutubeSeoState(workspace==='histoviva'?'Historical Doc':'Cozy Ambient')} onSeoStateChange={updateNativeSeo} onApplyTitleToThumbnail={v=>{setTitle(v);setDirty(true);}} onNotify={setNotice}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='combine'&&<fieldset disabled={busy} key={active?.project.projectId+':combine'} aria-label="Native Montage Combine">
 <MontageCombineView isolatedEditing ghToken="" ghRepo="" ghBranch="" gdriveFolderId="" onGdriveFolderIdChange={()=>{}} driveUser={null} driveToken={null} onDriveAuthChange={()=>{}} initialCombineDraft={hydrateCombine(nativeDraft)} onCombineDraftChange={onCombineChange} transferredScript="" onClearTransferredScript={()=>{}} onOpenConfigModal={()=>setNotice('External actions disabled in preview')} onStartRenderStatus={()=>{}} onCancelRenderRun={()=>{}} onNotify={setNotice} encodeManifestBase64={()=>''} terminalStatus="idle" terminalSeconds={0} terminalLogs={[]} onClearTerminalLogs={()=>{}}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='loop'&&<fieldset disabled={busy} aria-label="Scoped Loop settings">
 <p>Scoped loop settings preview; original Loop Builder not mounted.</p>
 {(['fps','codec','resolution','loopHours'] as const).map(k=><label key={k}>{k}<select aria-label={'Loop '+k} value={String(nativeDraft.production?.[k]??({fps:24,codec:'libx264',resolution:'4k',loopHours:3}[k]))} onChange={e=>changeLoop(k,e.target.value)}>{({fps:['24','30','60'],codec:['libx264','libx265'],resolution:['720p','1080p','2k','4k'],loopHours:['3','6','10']}[k]).map(v=><option key={v}>{v}</option>)}</select></label>)}
 <ScopedRenderSettings production={nativeDraft.production??{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]}} onChange={next=>{try{const validated=projectPayload({...nativeDraft,production:next});setProduction(JSON.stringify(validated.production,null,2));setDirty(true);}catch{setNotice('Invalid render settings');}}}/>
 <ScopedTimelinePanel production={nativeDraft.production??{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]}} onChange={next=>{try{const validated=projectPayload({...nativeDraft,production:next});setProduction(JSON.stringify(validated.production,null,2));setDirty(true);}catch{setNotice('Invalid timeline settings');}}}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='loop'&&active&&storage.current&&<fieldset disabled={busy||assetBusy} key={active.project.projectId+':assets'}>
 <ScopedAssetPanel storage={storage.current} scope={{workspaceId:active.project.workspaceId,projectId:active.project.projectId}} payload={nativeDraft} busy={busy||assetBusy} onBusy={setAssetBusy} saveBeforeAttach={async()=>{if(!context.current||dirty)throw new Error('Save project and reopen Loop settings before attaching');}}/>
 </fieldset>}

 {active&&storage.current&&<ProjectImagePanel key={active.project.projectId+':images'} storage={storage.current} scope={{workspaceId:active.project.workspaceId,projectId:active.project.projectId}} refresh={imageRefresh} onUrls={setImageUrls} onBusy={setAssetBusy} busy={busy||assetBusy}/>}
 {nativeDraft&&nativeTab==='thumb'&&<fieldset disabled={busy||assetBusy} key={active?.project.projectId+':thumb'} aria-label="Native Thumbnail Studio">
 <ThumbnailStudioView isolatedEditing onProjectImageData={(slot,url)=>void persistNativeImage([slot],url)} onProjectImageFile={(slot,file)=>void persistNativeImage([slot],file)} projectImageUrls={imageUrls} initialSlots={nativeDraft.legacyExtras?.thumbnails as ComponentProps<typeof ThumbnailStudioView>['initialSlots']} onSlotsChange={onSlots} thumbTitle={title} onThumbTitleChange={v=>{setTitle(v);setDirty(true);}} thumbBadge={badge} onThumbBadgeChange={v=>{setBadge(v);setDirty(true);}} scriptContext={script} onSendToArtEditor={dataUrl=>void persistNativeImage(['art'],dataUrl,'art')} onNotify={setNotice}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='voice'&&<fieldset disabled={busy||assetBusy} key={active?.project.projectId+':voice'} aria-label="Native Voice Studio">
 <VoiceStudioView isolatedEditing initialPreferences={nativeDraft.legacyExtras?.voice as ComponentProps<typeof VoiceStudioView>['initialPreferences']} onPreferencesChange={onVoice} scriptText={script} onScriptTextChange={v=>{setScript(v);setDirty(true);}} onMasterVoiceoverReady={()=>{}} onNotify={setNotice}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='art'&&<fieldset disabled={busy||assetBusy} key={active?.project.projectId+':art'} aria-label="Native Image Art Editor">
 <p>Apply to cover A saves the flattened art result and cover A atomically. Unsaved canvas edits remain temporary.</p>
 <ImageArtEditorView incomingAsset={artSource} onApplyToThumbnailCoverA={url=>void persistNativeImage(['art','A'],url,'thumb')} onNotify={setNotice}/>
 </fieldset>}
 {field('VerbaFlow script',script,setScript)}{field('Chapters',chapters,setChapters)}{field('SEO script',seo,setSeo)}{field('Thumbnail title',title,setTitle)}{field('Thumbnail badge',badge,setBadge)}
 <details><summary>Advanced production settings (JSON)</summary><p>Only supported typed fields are accepted. Do not enter credentials. Empty text removes the corresponding optional section.</p>{field('Production settings JSON',production,setProduction)}{field('Module settings JSON',extras,setExtras)}</details>
 <button type="button" disabled={!dirty||busy||!active?.payload} onClick={()=>void run(save)}>Save project</button>
 <p role="status">{busy?'Saving or loading…':dirty?'Unsaved changes':active?'Project loaded':'No project selected'}</p>
 </main>;
}
