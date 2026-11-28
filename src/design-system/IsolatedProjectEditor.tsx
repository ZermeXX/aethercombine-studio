import {readUiLanguage,saveUiLanguage,uiText} from './uiLanguage';
import {ContextHelp,type HelpLanguage} from './ContextHelp';
import {synchronizeTimeline,timelineDuration} from '../utils/timelineSynchronization';
import {LoopDurationControls} from '../components/LoopDurationControls';
import {LoopBuilderHeader} from '../components/LoopBuilderHeader';
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
import {CHANNEL_PROFILES,allowsModule,type WorkspaceId} from './workspaces';
import {projectFormat,allowsProjectFormat,defaultProjectFormat,type ProjectRecord,type ProjectFormat} from './projectRegistry';
function allowsProjectModule(p:ProjectRecord,tab:Parameters<typeof allowsModule>[1]){return allowsModule(p.workspaceId,tab)&& (tab!=='loop'||projectFormat(p)==='ambient');}

/** Explicit opt-in isolated editor. Never mounts legacy production modules. */
export function IsolatedProjectEditor({onExit}:{onExit:()=>void}){
 const storage=useRef<ProjectStorage|null>(null);
 const context=useRef<WorkspaceProjectContext|null>(null);
 const locked=useRef(false);
 const [language,setLanguage]=useState<HelpLanguage>(readUiLanguage);
 useEffect(()=>{saveUiLanguage(language);},[language]);
 const t=(en:string,ru:string)=>uiText(language,en,ru);
 const [ready,setReady]=useState(false);
 const [workspace,setWorkspace]=useState<WorkspaceId>('histoviva');
 const [projects,setProjects]=useState<ProjectRecord[]>([]);
 const [active,setActive]=useState<ProjectSnapshot|null>(null);
 const [name,setName]=useState('');
 const [format,setFormat]=useState<ProjectFormat>('video');
 const [script,setScript]=useState('');
 const [chapters,setChapters]=useState('');
 const [seo,setSeo]=useState('');
 const [title,setTitle]=useState('');
 const [badge,setBadge]=useState('');
 const [production,setProduction]=useState('');
 const [extras,setExtras]=useState('');
 const [nativeTab,setNativeTab]=useState<'none'|'verbaflow'|'seo'|'combine'|'loop'|'thumb'|'voice'|'art'>('none');
 const [navCollapsed,setNavCollapsed]=useState(false);
 const [navCompact,setNavCompact]=useState(()=>{
  try { const saved=localStorage.getItem('story-nexus.ui-navigation.v1'); if(saved==='compact'||saved==='full')return saved==='compact'; } catch {}
  return typeof window!=='undefined'&&window.matchMedia('(min-width:761px) and (max-width:1100px)').matches;
 });
 function toggleCompact(){
  const next=!navCompact;
  setNavCompact(next);
  try {localStorage.setItem('story-nexus.ui-navigation.v1',next?'compact':'full');} catch {}
 }
 const [notice,setNotice]=useState('');
 const [imageUrls,setImageUrls]=useState<ProjectImageUrls>({});
 const [artInput,setArtInput]=useState<{dataUrl:string;label:string;nonce:number}|null>(null);
 const combineInvalid=useRef(false);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [assetBusy,setAssetBusy]=useState(false);
 const imageWrite=useRef(false);
 function acquireAssetWrite(){if(locked.current||imageWrite.current||!context.current)return false;imageWrite.current=true;setAssetBusy(true);return true;}
 function releaseAssetWrite(){imageWrite.current=false;setAssetBusy(false);}

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
  hydrate(next);setProjects(list=>list.map(p=>p.projectId===next.project.projectId?next.project:p));
 }
 async function changeWorkspace(next:WorkspaceId){
  await run(async c=>{await save(c);const data=await c.openWorkspace(next);setWorkspace(next);setProjects(data.projects);hydrate(data.active);});
 }
 async function select(id:string){
  await run(async c=>{await save(c);const next=await c.select({workspaceId:workspace,projectId:id});hydrate(next);});
 }
 async function importProject(file:File){
  await run(async ()=>{
   if(dirty||!storage.current)throw new Error('Save current changes before importing');
   if(file.size>96*1024*1024)throw new Error('Backup too large');
   const copy=await storage.current.importProject(workspace,JSON.parse(await file.text()));
   setProjects(list=>[...list,copy]);
  });
 }
 async function exportProject(p:ProjectRecord){
  await run(async ()=>{
   if(dirty||!storage.current)throw new Error('Save current changes before exporting');
   const backup=await storage.current.exportProject(p.workspaceId,p.projectId,p.revision);
   const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
   try{
    const link=document.createElement('a');link.href=url;link.download='story-nexus-'+p.projectId+'.json';
    document.body.appendChild(link);link.click();link.remove();
   }finally{window.setTimeout(()=>URL.revokeObjectURL(url),30000);}
  });
 }
 async function duplicateProject(p:ProjectRecord){
  const proposed=window.prompt(t("Copy name","Название копии"),p.name+t(" — copy"," — копия"));
  if(proposed===null||!proposed.trim())return;
  await run(async c=>{
   if(dirty)throw new Error('Save current changes before duplicating');
   const copy=await c.duplicate({workspaceId:p.workspaceId,projectId:p.projectId},p.revision,proposed);
   setProjects(list=>[...list,copy]);
  });
 }
 async function archiveProject(p:ProjectRecord){
  if(!window.confirm(t("Archive project? Data will be retained.","Архивировать проект? Данные будут сохранены.")))return;
  await run(async ()=>{
   if(dirty||!storage.current)throw new Error('Save current changes before archiving');
   const next=await storage.current.archiveProject(p.workspaceId,p.projectId,p.revision);
   setProjects(list=>list.map(item=>item.projectId===p.projectId?next:item));
   if(active?.project.projectId===p.projectId){hydrate(null);setNativeTab(null);}
  });
 }
 async function renameProject(p:ProjectRecord){
  const proposed=window.prompt(t("New project name","Новое название проекта"),p.name);
  if(proposed===null||!proposed.trim()||proposed.trim()===p.name)return;
  await run(async c=>{
   if(dirty)throw new Error('Save current changes before renaming');
   const next=await c.rename({workspaceId:p.workspaceId,projectId:p.projectId},p.revision,proposed);
   setProjects(list=>list.map(item=>item.projectId===p.projectId?next.project:item));
   if(active?.project.projectId===p.projectId)setActive(next);
  });
 }
 async function create(){
  await run(async c=>{await save(c);const next=await c.create(workspace,name,allowsProjectFormat(workspace,format)?format:defaultProjectFormat(workspace));const selected=await c.select({workspaceId:workspace,projectId:next.project.projectId});setProjects(await c.openWorkspace(workspace).then(x=>x.projects));hydrate(selected);setName('');});
 }
 // Native components use the same draft as the JSON editor, never global LocalStorage.
 function currentDraft():ProjectPayload{
  if(!active?.payload)throw new Error('No project');
  return projectPayload({...active.payload,script,chapters,seoScript:seo,thumbnailTitle:title,thumbnailBadge:badge,production:production.trim()?JSON.parse(production):undefined,legacyExtras:extras.trim()?JSON.parse(extras):undefined});
 }
 function openNative(tab:'verbaflow'|'seo'|'combine'|'loop'|'thumb'|'voice'|'art'){
  if(!active?.payload||!allowsProjectModule(active.project,tab))return;
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
   const next=projectPayload({...draft,production:{...prev,[key]:key==='fps'||key==='loopHours'?Number(value):value,...(key==='loopHours'&&prev.timeline_slots?{timeline_slots:synchronizeTimeline(prev.timeline_slots,Number(value),prev.fps)}:{})}});
   setProduction(JSON.stringify(next.production,null,2));setDirty(true);
  }catch{setNotice('Invalid loop setting or target would truncate existing timeline data. No changes saved.');}
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
  if(!acquireAssetWrite())return;setError('');
  try{
   if(typeof source==='string'&&!/^data:image\/(png|jpeg|webp);base64,/i.test(source))throw new Error('Only local raster data accepted');
   const blob=typeof source==='string'?await (await fetch(source)).blob():source;
   if(blob.size>32*1024*1024)throw new Error('Image too large');
   const bitmap=await createImageBitmap(blob);bitmap.close();
   await db.replaceProjectImages(scope.workspaceId,scope.projectId,slots,blob);
   setImageRefresh(v=>v+1);setNotice('Native image saved: '+slots.join(', '));
   if(nextTab){setArtInput(null);setNativeTab(nextTab);}
  }catch{setError('Native image could not be saved. Existing stored images retained.');}
  finally{releaseAssetWrite();}
 }
 async function attachReleaseThumbnail(blob:Blob){
  if(!active||!storage.current||!acquireAssetWrite())return;
  const db=storage.current,scope=active.project;setError('');
  try{await db.saveReleaseThumbnail(scope.workspaceId,scope.projectId,blob);setImageRefresh(v=>v+1);setNotice('Project release thumbnail saved');}
  catch{setError('Release thumbnail could not be saved. Existing attachment retained.');}
  finally{releaseAssetWrite();}
 }
 async function removeNativeThumbnail(slot:'A'|'B'|'C'){
  if(!active||!storage.current||!acquireAssetWrite())return;
  const db=storage.current,scope=active.project;
  setError('');
  try{await db.removeProjectThumbnail(scope.workspaceId,scope.projectId,slot);setImageRefresh(v=>v+1);setNotice('Native image removed: '+slot);}
  catch{setError('Native image removal failed. Existing stored image retained.');}
  finally{releaseAssetWrite();}
 }
 const artSource=useMemo(()=>artInput??(imageUrls.art?{dataUrl:imageUrls.art,label:'Stored project art',nonce:0}:null),[artInput,imageUrls.art]);
 const nativeDraft=(()=>{if(nativeTab==='none'||!active?.payload||!allowsProjectModule(active.project,nativeTab))return null;try{return currentDraft();}catch{return null;}})();
 const field=(label:string,value:string,set:(v:string)=>void)=><label className="grid gap-1">{label}<textarea aria-label={label} value={value} disabled={assetBusy||busy||!active?.payload||nativeTab!=='none'} onChange={e=>{set(e.currentTarget.value);setDirty(true);}} className="min-h-20 rounded border border-studio-border bg-studio-bg p-2"/></label>;
 return <main className="nexus-preview mx-auto space-y-4 p-4 text-studio-text">
 <header className="nexus-brand nexus-smart-header"><img src={import.meta.env.BASE_URL+'favicon.svg'} alt="" width={48} height={48}/><div className="nexus-header-brand"><h1 className="text-xl font-semibold">Story Nexus Studio</h1><p>V9 · {t("Preview","Предпросмотр")}</p></div><div className="nexus-header-context"><div className="nexus-header-item"><small>{t("Channel","Канал")}</small><strong>{workspace==='histoviva'?'HISTOVIVA':'The Whisker Trio'}</strong></div><div className="nexus-header-item"><small>{t("Active project","Активный проект")}</small><strong title={active?.project.name}>{active?.project.name??t("No project","Нет проекта")}</strong></div><span className="nexus-header-status" data-state={error?'error':busy||assetBusy?'busy':dirty?'dirty':active?.payload?'saved':'idle'} role="status">{error?t("Check error","Проверьте ошибку"):busy||assetBusy?t("Working…","Выполняется…"):dirty?t("Unsaved changes","Не сохранено"):active?.payload?t("Saved locally","Сохранено локально"):t("No active draft","Нет активного черновика")}</span></div><div className="nexus-header-actions"><button type="button" disabled={!dirty||busy||assetBusy||!active?.payload||combineInvalid.current} onClick={()=>void run(save)}>{t("Quick save","Быстрое сохранение")}</button><button type="button" onClick={()=>{const library=document.getElementById("nexus-project-library");library?.scrollIntoView({block:"start"});library?.focus({preventScroll:true});}}>{t("Project library","Библиотека проектов")}</button></div><button type="button" aria-label="Help language" onClick={()=>setLanguage(v=>v==='ru'?'en':'ru')}>{language==='ru'?'RU':'EN'}</button></header>
 {!ready&&!error&&<section className="nexus-startup" role="status"><img src={import.meta.env.BASE_URL+'favicon.svg'} width={72} height={72} alt=""/><h2>Story Nexus Studio</h2><p>{t("Opening project library…","Открываем библиотеку проектов…")}</p><div className="nexus-loading-track" aria-hidden="true"><span/></div></section>}
 {!ready&&error&&<section className="nexus-startup" role="alert"><h2>{t("Unable to open Studio","Не удалось открыть Studio")}</h2><p>{error}</p><button type="button" onClick={()=>window.location.reload()}>Retry / Повторить</button></section>}
 <p>Project-scoped native module previews and validated production settings. Production rendering is disabled. Authorized strict preflight is available in ambient projects only.</p>
 <button type="button" disabled={assetBusy||busy||dirty} onClick={onExit}>{t("Return to legacy Studio","Вернуться в прежнюю Studio")}</button>
 {error&&<p role="alert">{error}</p>}
 <section id="nexus-project-library" tabIndex={-1} className="nexus-project-picker" aria-label="My projects"><h2>{t("My projects","Мои проекты")}</h2><div className="nexus-channel-cards">{Object.values(CHANNEL_PROFILES).map(p=><button type="button" key={p.id} aria-pressed={workspace===p.id} disabled={assetBusy||!ready||busy} onClick={()=>void changeWorkspace(p.id)}><span>{p.id==='histoviva'?'HISTOVIVA':'The Whisker Trio'}</span><small>{p.id==='histoviva'?'History · Documentary':'Video · Shorts · Ambient'}</small></button>)}</div>
 <label className="grid gap-1">{t("Workspace","Канал")}<select aria-label="Isolated workspace" value={workspace} disabled={assetBusy||!ready||busy} onChange={e=>{const id=e.currentTarget.value;if(id==='histoviva'||id==='the_whisker_trio')void changeWorkspace(id);}}>{Object.values(CHANNEL_PROFILES).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label className="grid gap-1">{t("Project","Проект")}<select aria-label="Isolated project" value={active?.project.projectId??''} disabled={assetBusy||!ready||busy} onChange={e=>{if(e.currentTarget.value)void select(e.currentTarget.value);}}><option value="" disabled>{t("Select project","Выберите проект")}</option>{projects.filter(p=>!p.archived).map(p=><option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
 <div className="nexus-help-row"><label>{t("New project name","Название нового проекта")}<input aria-label="New project name" value={name} disabled={assetBusy||!ready||busy} onChange={e=>setName(e.currentTarget.value)}/></label><ContextHelp language={language} entry={{ru:{summary:"Название нового независимого проекта.",effect:"Создаёт отдельную запись при нажатии кнопки создания.",whenOn:"Для нового выпуска или отдельного видео.",whenOff:"Для продолжения существующего проекта выберите его карточку.",recommended:"Уникальное понятное название.",example:"HISTOVIVA EP03",limitations:"Название не является идентификатором облачной папки."},en:{summary:"Name of a new independent project.",effect:"Creates a separate record when you press Create.",whenOn:"For a new episode or separate video.",whenOff:"Select an existing project to continue it.",recommended:"A descriptive unique name.",example:"HISTOVIVA EP03",limitations:"The name is not a cloud folder ID."}}}/></div>
 <div className="nexus-help-row"><label>{language==='ru'?'Формат проекта':'Project format'}<select aria-label="Project format" value={allowsProjectFormat(workspace,format)?format:defaultProjectFormat(workspace)} disabled={assetBusy||!ready||busy} onChange={e=>{const v=e.currentTarget.value;if(allowsProjectFormat(workspace,v))setFormat(v);}}><option value="video">Video</option><option value="shorts">Shorts</option>{workspace==='the_whisker_trio'&&<option value="ambient">Ambient Loop</option>}</select></label><ContextHelp language={language} entry={{ru:{summary:"Формат нового проекта.",effect:"Определяет доступность Loop.",whenOn:"Выберите формат до создания.",whenOff:"Не меняет существующие проекты.",recommended:"Video для обычного выпуска.",example:"Ambient Loop для длинного видео Whisker.",limitations:"Ambient недоступен HISTOVIVA."},en:{summary:"New project format.",effect:"Controls Loop availability.",whenOn:"Choose before creation.",whenOff:"Does not change existing projects.",recommended:"Video for regular episodes.",example:"Ambient Loop for long Whisker videos.",limitations:"Ambient is unavailable in HISTOVIVA."}}}/></div><button type="button" disabled={assetBusy||!ready||busy||!name.trim()} onClick={()=>void create()}>{t("Create isolated project","Создать независимый проект")}</button><label>{t("Import project backup","Импорт резервной копии")}<input type="file" aria-label={t("Import project backup","Импорт резервной копии")} accept=".json,application/json" disabled={assetBusy||!ready||busy||dirty} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importProject(file);}}/></label><div className="nexus-project-cards">{projects.filter(p=>!p.archived).map(p=><article className="nexus-project-card" key={p.projectId}><button type="button" aria-pressed={active?.project.projectId===p.projectId} disabled={assetBusy||!ready||busy} onClick={()=>void select(p.projectId)}><span className="nexus-card-cover" aria-hidden="true" data-format={projectFormat(p)}>{projectFormat(p)==='ambient'?'∞':projectFormat(p)==='shorts'?'▯':'▣'}</span><span className="nexus-card-name">{p.name}</span><small>{p.workspaceId==='histoviva'?'HISTOVIVA':'The Whisker Trio'} · {projectFormat(p)==='ambient'?t("Ambient","Эмбиент"):projectFormat(p)==='shorts'?'Shorts':t("Video","Видео")}</small><small>{t("Created","Создан")}: <time dateTime={new Date(p.createdAt).toISOString()}>{new Date(p.createdAt).toLocaleDateString(language==='ru'?'ru-RU':'en-GB')}</time></small><small>{t("Updated","Изменён")}: <time dateTime={new Date(p.updatedAt).toISOString()}>{new Date(p.updatedAt).toLocaleDateString(language==='ru'?'ru-RU':'en-GB')}</time></small><span className="nexus-card-state">{active?.project.projectId===p.projectId?t("Active project","Активный проект"):t("Open project","Открыть проект")}</span></button><details className="nexus-card-menu"><summary aria-label={t("Project actions","Действия проекта")+": "+p.name}>{t("Actions","Действия")} ···</summary><button type="button" disabled={assetBusy||!ready||busy} onClick={()=>void select(p.projectId)}>{t("Open","Открыть")}</button><button type="button" disabled={assetBusy||!ready||busy||dirty} onClick={()=>void renameProject(p)}>{t("Rename","Переименовать")}</button><button type="button" disabled={assetBusy||!ready||busy||dirty} onClick={()=>void duplicateProject(p)}>{t("Duplicate","Дублировать")}</button><button type="button" disabled={assetBusy||!ready||busy||dirty} onClick={()=>void exportProject(p)}>{t("Export project","Экспорт проекта")}</button><button type="button" disabled={assetBusy||!ready||busy||dirty} onClick={()=>void archiveProject(p)}>{t("Archive project","Архивировать проект")}</button><button type="button" disabled={assetBusy||!ready||busy||active?.project.projectId!==p.projectId||!dirty||combineInvalid.current} onClick={()=>void run(save)}>{t("Save changes","Сохранить изменения")}</button><button type="button" disabled={assetBusy||!ready||busy} onClick={()=>void run(async c=>{await save(c);const next=await c.select({workspaceId:p.workspaceId,projectId:p.projectId});hydrate(next);setNativeTab('verbaflow');})}>{t("Open script studio","Открыть студию сценариев")}</button></details></article>)}</div><details className="nexus-card-menu"><summary>{t("Archived projects","Архив проектов")} ({projects.filter(p=>p.archived).length})</summary>{projects.filter(p=>p.archived).map(p=><div key={p.projectId}><span>{p.name}</span><button type="button" disabled={assetBusy||!ready||busy||dirty} onClick={()=>void exportProject(p)}>{t("Export project","Экспорт проекта")}</button></div>)}</details></section>
 {active&&!active.payload&&<p role="alert">Project has no payload. Editing disabled.</p>}
 <div className="nexus-workspace-layout">
 {active?.payload&&<aside className={`nexus-sidebar${navCompact?" nexus-sidebar-compact":""}`}><button type="button" className="nexus-nav-toggle" aria-expanded={!navCollapsed} aria-controls="nexus-production-nav" onClick={()=>setNavCollapsed(v=>!v)}>{navCollapsed?t("☰ Expand menu","☰ Развернуть меню"):t("☰ Collapse menu","☰ Свернуть меню")}</button><button type="button" className="nexus-compact-toggle" aria-pressed={navCompact} onClick={toggleCompact}>{navCompact?t("Full menu","Полное меню"):t("Compact menu","Компактное меню")}</button><nav id="nexus-production-nav" hidden={navCollapsed} aria-label="Production modules" className="nexus-module-nav">
 <div className="nexus-nav-group" role="group" aria-label={t("Creation","Создание")}><span className="nexus-nav-heading">{t("Creation","Создание")}</span>
<button type="button" disabled={assetBusy||busy||!active?.payload} aria-pressed={nativeTab==='verbaflow'} onClick={()=>openNative('verbaflow')} aria-label={t("Open native VerbaFlow","Открыть VerbaFlow")} title={t("Open native VerbaFlow","Открыть VerbaFlow")}><span className="nexus-nav-symbol" aria-hidden="true">▤</span><span className="nexus-nav-label">{t("Open native VerbaFlow","Открыть VerbaFlow")}</span></button>
 <button type="button" disabled={busy||assetBusy||!active?.payload} aria-pressed={nativeTab==='voice'} onClick={()=>openNative('voice')} aria-label={t("Open native Voice Studio","Открыть Voice Studio")} title={t("Open native Voice Studio","Открыть Voice Studio")}><span className="nexus-nav-symbol" aria-hidden="true">♫</span><span className="nexus-nav-label">{t("Open native Voice Studio","Открыть Voice Studio")}</span></button>
 <button type="button" disabled={busy||assetBusy||!active?.payload} aria-pressed={nativeTab==='art'} onClick={()=>openNative('art')} aria-label={t("Open native Image Art Editor","Открыть Image Art Editor")} title={t("Open native Image Art Editor","Открыть Image Art Editor")}><span className="nexus-nav-symbol" aria-hidden="true">✧</span><span className="nexus-nav-label">{t("Open native Image Art Editor","Открыть Image Art Editor")}</span></button>
 </div>
 <div className="nexus-nav-group" role="group" aria-label={t("Production","Производство")}><span className="nexus-nav-heading">{t("Production","Производство")}</span>
 {allowsProjectModule(active!.project,'combine')&&<button type="button" disabled={assetBusy||busy||!active?.payload} aria-pressed={nativeTab==='combine'} onClick={()=>openNative('combine')} aria-label={t("Open native Montage Combine","Открыть Montage Combine")} title={t("Open native Montage Combine","Открыть Montage Combine")}><span className="nexus-nav-symbol" aria-hidden="true">▣</span><span className="nexus-nav-label">{t("Open native Montage Combine","Открыть Montage Combine")}</span></button>}
 {allowsProjectModule(active!.project,'loop')&&<button type="button" disabled={assetBusy||busy||!active?.payload} aria-pressed={nativeTab==='loop'} onClick={()=>openNative('loop')} aria-label={t("Open scoped Loop settings","Открыть Ambient Loop")} title={t("Open scoped Loop settings","Открыть Ambient Loop")}><span className="nexus-nav-symbol" aria-hidden="true">∞</span><span className="nexus-nav-label">{t("Open scoped Loop settings","Открыть Ambient Loop")}</span></button>}
 </div>
 <div className="nexus-nav-group" role="group" aria-label={t("Release","Публикация")}><span className="nexus-nav-heading">{t("Release","Публикация")}</span>
 <button type="button" disabled={busy||assetBusy||!active?.payload} aria-pressed={nativeTab==='thumb'} onClick={()=>openNative('thumb')} aria-label={t("Open native Thumbnail Studio","Открыть Thumbnail Studio")} title={t("Open native Thumbnail Studio","Открыть Thumbnail Studio")}><span className="nexus-nav-symbol" aria-hidden="true">▧</span><span className="nexus-nav-label">{t("Open native Thumbnail Studio","Открыть Thumbnail Studio")}</span></button>
 <button type="button" disabled={assetBusy||busy||!active?.payload} aria-pressed={nativeTab==='seo'} onClick={()=>openNative('seo')} aria-label={t("Open native YouTube SEO","Открыть YouTube SEO")} title={t("Open native YouTube SEO","Открыть YouTube SEO")}><span className="nexus-nav-symbol" aria-hidden="true">⌕</span><span className="nexus-nav-label">{t("Open native YouTube SEO","Открыть YouTube SEO")}</span></button>
 </div>
 <button type="button" onClick={()=>setNativeTab('none')} disabled={assetBusy||busy||nativeTab==='none'||combineInvalid.current}>{t("Close native module","Закрыть модуль")}</button>
 </nav></aside>}
 <section className="nexus-workspace-content">
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
 {nativeDraft&&nativeTab==='loop'&&<fieldset disabled={busy||assetBusy} aria-label="Scoped Loop settings">
 <LoopBuilderHeader loopProjectName={active?.project.name??''} videoCodec={nativeDraft.production?.codec??'libx264'} videoCrf={nativeDraft.production?.render?.crf??18} videoFps={nativeDraft.production?.fps??24} audioBitrateKbps={nativeDraft.production?.render?.audioBitrate??320} actCrossfadeSec={nativeDraft.production?.render?.actCrossfadeSec??1} internalLoopCrossfadeSec={nativeDraft.production?.render?.internalCrossfadeSec??1} slotCount={nativeDraft.production?.timeline_slots?.length??0} totalInsertsCount={nativeDraft.production?.timeline_slots?.reduce((n,s)=>n+s.inserts.length,0)??0} durationLabel={'Target '+(nativeDraft.production?.loopHours??3)+'h'}/>
 <p>Shared native header with scoped editing panels. Legacy manifest import and render dispatch are not mounted.</p>
 {(['fps','codec','resolution','loopHours'] as const).map(k=><label key={k}>{k}<select aria-label={'Loop '+k} value={String(nativeDraft.production?.[k]??({fps:24,codec:'libx264',resolution:'4k',loopHours:3}[k]))} onChange={e=>changeLoop(k,e.target.value)}>{({fps:['24','30','60'],codec:['libx264','libx265'],resolution:['720p','1080p','2k','4k'],loopHours:['3','4','5','6','7','8','9','10']}[k]).map(v=><option key={v}>{v}</option>)}</select></label>)}
 <LoopDurationControls loopHours={nativeDraft.production?.loopHours??3} durationSummary={nativeDraft.production?.timeline_slots?.length?'Calculated timeline: '+timelineDuration(nativeDraft.production.timeline_slots).toFixed(3)+' sec (excluding final black)':'No timeline slots yet; target only.'} onPreset={hours=>changeLoop('loopHours',String(hours))} onExact={value=>{const n=Number(value);if(Number.isInteger(n)&&n>=3&&n<=10)changeLoop('loopHours',value);}}/>
 <ScopedRenderSettings production={nativeDraft.production??{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]}} onChange={next=>{try{const validated=projectPayload({...nativeDraft,production:next});setProduction(JSON.stringify(validated.production,null,2));setDirty(true);}catch{setNotice('Invalid render settings');}}}/>
 <ScopedTimelinePanel production={nativeDraft.production??{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]}} onChange={next=>{try{const validated=projectPayload({...nativeDraft,production:next});setProduction(JSON.stringify(validated.production,null,2));setDirty(true);}catch{setNotice('Invalid timeline settings');}}}/>
 </fieldset>}
 {nativeDraft&&nativeTab==='loop'&&active&&storage.current&&<fieldset disabled={busy||assetBusy} key={active.project.projectId+':assets'}>
 <ScopedAssetPanel storage={storage.current} scope={{workspaceId:active.project.workspaceId,projectId:active.project.projectId}} payload={nativeDraft} busy={busy||assetBusy} acquireWrite={acquireAssetWrite} releaseWrite={releaseAssetWrite} saveBeforeAttach={async()=>{if(!context.current||dirty)throw new Error('Save project and reopen Loop settings before attaching');}}/>
 </fieldset>}

 {active&&storage.current&&<ProjectImagePanel key={active.project.projectId+':images'} storage={storage.current} scope={{workspaceId:active.project.workspaceId,projectId:active.project.projectId}} refresh={imageRefresh} onUrls={setImageUrls} acquireWrite={acquireAssetWrite} releaseWrite={releaseAssetWrite} busy={busy||assetBusy}/>}
 {nativeDraft&&nativeTab==='thumb'&&<fieldset disabled={busy||assetBusy} key={active?.project.projectId+':thumb'} aria-label="Native Thumbnail Studio">
 <ThumbnailStudioView isolatedEditing onProjectReleaseThumbnail={blob=>void attachReleaseThumbnail(blob)} onProjectImageRemove={slot=>void removeNativeThumbnail(slot)} onProjectImageData={(slot,url)=>void persistNativeImage([slot],url)} onProjectImageFile={(slot,file)=>void persistNativeImage([slot],file)} projectImageUrls={imageUrls} initialSlots={nativeDraft.legacyExtras?.thumbnails as ComponentProps<typeof ThumbnailStudioView>['initialSlots']} onSlotsChange={onSlots} thumbTitle={title} onThumbTitleChange={v=>{setTitle(v);setDirty(true);}} thumbBadge={badge} onThumbBadgeChange={v=>{setBadge(v);setDirty(true);}} scriptContext={script} onSendToArtEditor={dataUrl=>void persistNativeImage(['art'],dataUrl,'art')} onNotify={setNotice}/>
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
 </section></div>
 </main>;
}
