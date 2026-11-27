import {createProject,projectMetadata,type ProjectRecord} from '../design-system/projectRegistry';
import {projectPayload,type ProjectPayload} from './projectPayload';
import {isWorkspaceId,type WorkspaceId} from '../design-system/workspaces';

export const LEGACY_DRAFT_KEY='aether_workspace_draft';
const MARKER='legacy-draft-v1-import';
export interface MigrationPreview {
 project:ProjectRecord;
 payload:ProjectPayload;
 omitted:string[];
}
function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid legacy draft structure');
 return value as Record<string,unknown>;
}
function string(value:unknown):string{
 if(typeof value!=='string')throw new Error('Invalid legacy text field');
 // Reject recognizable private keys and common token patterns; not a universal secret detector.
 if(/-----BEGIN [^-]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bya29\.[A-Za-z0-9_-]+/i.test(value))throw new Error('Possible credential in legacy text');
 return value;
}
export function previewLegacyDraft(raw:string,workspaceId:WorkspaceId,modules?:{seo?:unknown;voice?:unknown}):MigrationPreview{
 if(!isWorkspaceId(workspaceId))throw new Error('Invalid workspace');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new Error('Invalid legacy JSON');}
 const d=object(parsed);if(d.version!==1)throw new Error('Unsupported legacy draft version');
 const p=object(d.project),v=object(d.verbaflow),r=object(d.render_settings);
 const project=createProject(workspaceId,string(p.name));
 const combine=d.combine===undefined?{}:object(d.combine);
 const payload=projectPayload({legacyExtras:{project:p,render:r,...(modules??{})},schemaVersion:1,script:string(v.source_text),seoScript:string(p.seo_script_text),thumbnailTitle:string(p.thumb_title),thumbnailBadge:string(p.thumb_badge),chapters:string(p.verbaflow_chapters_txt),production:{fps:r.video_fps,codec:r.video_codec,resolution:r.loop_resolution,loopHours:r.loop_hours,scenes:[],narrative_scenes:combine.narrative_scenes,timeline_slots:r.timeline_slots,audio_mastering:r.audio_mastering,render:{crf:r.video_crf,audioBitrate:r.audio_bitrate_kbps,actCrossfadeSec:r.act_crossfade_sec,internalCrossfadeSec:r.internal_loop_crossfade_sec,finalBlackEnabled:r.final_black_screen_enabled,finalBlackSec:r.final_black_screen_sec,bitratePreset:r.bitrate_preset,transitionMode:r.seamless_transition_mode,useEmbeddedAudio:r.use_embedded_audio}}});
 // Screen every projected string, including timeline references.
 const scan=(x:unknown):void=>{if(typeof x==='string')string(x);else if(x&&typeof x==='object')Object.values(x).forEach(scan);};
 scan(payload);
 return {project,payload,omitted:['additional combine settings and unknown narrative scene fields','unmapped render and project fields','unknown nested timeline fields','thumbnail slots and binary assets',...(modules?.seo===undefined?['standalone SEO state']:[]),...(modules?.voice===undefined?['voice preferences']:[])]};
}
export type MigrationResult={status:'missing'}|{status:'imported_partial'|'already_imported';projectId:string;workspaceId:WorkspaceId};
export async function migrateLegacyDraft(db:IDBDatabase,local:Storage,workspaceId:WorkspaceId,confirmPartial:boolean,includeGlobalModules=false):Promise<MigrationResult>{
 if(!confirmPartial)throw new Error('Explicit partial import confirmation required');
 const raw=local.getItem(LEGACY_DRAFT_KEY);if(raw===null)return {status:'missing'};
 const keys=includeGlobalModules?['ac_youtube_seo_state_v1','aether_voice_settings','config_voice_studio']:[];
 const snapshots=keys.map(k=>local.getItem(k));
 let modules:{seo?:unknown;voice?:unknown}|undefined;
 if(includeGlobalModules){modules={};if(snapshots[0]!==null)modules.seo=JSON.parse(snapshots[0]);if(snapshots[1]!==null)modules.voice=JSON.parse(snapshots[1]);else if(snapshots[2]!==null){const v=object(JSON.parse(snapshots[2]));modules.voice={activeAccount:v.activeAccount,activeEngine:v.provider,selectedLang:v.selectedLanguage,selectedGender:v.selectedGender,selectedVoiceId:v.selectedVoiceId,favorites:v.favorites};}}
 const preview=previewLegacyDraft(raw,workspaceId,modules);
 const {project,payload,omitted}=preview;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({name:project.name,payload})))),b=>b.toString(16).padStart(2,'0')).join('');
 if(local.getItem(LEGACY_DRAFT_KEY)!==raw||keys.some((k,i)=>local.getItem(k)!==snapshots[i]))throw new Error('Legacy draft changed during preview');
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','migration_backups','metadata'],'readwrite');
  let result:MigrationResult;let error:unknown;
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(error??tx.error??new Error('Migration aborted'));
  const fail=(e:unknown)=>{error=e;tx.abort();};
  const meta=tx.objectStore('metadata'),projects=tx.objectStore('projects'),backups=tx.objectStore('migration_backups');
  const marker=meta.get(MARKER);
  marker.onsuccess=()=>{try{
   const previous=marker.result;
   if(previous){
    if(previous.status==='rolled_back')throw new Error('Import rolled back; explicit recovery required');
    if(previous.workspaceId!==workspaceId||previous.digest!==digest)throw new Error('Legacy import already exists; manual review required');
    const check=projects.get(previous.projectId);
    check.onsuccess=()=>{try{const p=projectMetadata(check.result);if(p.workspaceId!==workspaceId)throw new Error('Migration ownership mismatch');result={status:'already_imported',projectId:p.projectId,workspaceId};}catch(e){fail(e);}};
    return;
   }
   projects.add({...project,payload});
   backups.add({backupId:MARKER,createdAt:Date.now(),projectId:project.projectId,workspaceId,digest,payload,name:project.name,omitted});
   meta.add({key:MARKER,projectId:project.projectId,workspaceId,digest,status:'imported_partial'});
   const check=projects.get(project.projectId);
   check.onsuccess=()=>{try{if(projectMetadata(check.result).projectId!==project.projectId||JSON.stringify(projectPayload(check.result.payload))!==JSON.stringify(payload))throw new Error('Migration read-back mismatch');result={status:'imported_partial',projectId:project.projectId,workspaceId};}catch(e){fail(e);}};
  }catch(e){fail(e);}};
 });
}

// Recovery is deliberately non-destructive: original backup and imported project remain.
export async function restoreMigrationBackup(db:IDBDatabase,workspaceId:WorkspaceId):Promise<ProjectRecord>{
 const backup=await new Promise<any>((resolve,reject)=>{
  const tx=db.transaction('migration_backups','readonly');const req=tx.objectStore('migration_backups').get(MARKER);
  tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);
 });
 if(!backup||backup.workspaceId!==workspaceId)throw new Error('Backup unavailable');
 const payload=projectPayload(backup.payload);
 const name=string(backup.name);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({name,payload})))),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==backup.digest)throw new Error('Backup checksum mismatch');
 const scan=(x:unknown):void=>{if(typeof x==='string')string(x);else if(x&&typeof x==='object')Object.values(x).forEach(scan);};scan(payload);
 const project=createProject(workspaceId,name+' (Recovered)');
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('projects','readwrite');
  tx.oncomplete=()=>resolve(project);tx.onabort=()=>reject(tx.error);
  tx.objectStore('projects').add({...project,payload});
 });
}
// Rollback only unmodified, inactive imports with no associated assets or history.
// Retain the backup and marker so the operation cannot silently reimport.
export async function rollbackLegacyImport(db:IDBDatabase,workspaceId:WorkspaceId,projectId:string):Promise<void>{
 const snapshot=await new Promise<any>((resolve,reject)=>{
  const tx=db.transaction('migration_backups','readonly'),req=tx.objectStore('migration_backups').get(MARKER);
  tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);
 });
 if(!snapshot||snapshot.workspaceId!==workspaceId||snapshot.projectId!==projectId)throw new Error('Backup unavailable');
 const canonical=JSON.stringify({name:string(snapshot.name),payload:projectPayload(snapshot.payload)});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==snapshot.digest)throw new Error('Backup checksum mismatch');
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['metadata','projects','workspace_state','project_assets','project_revisions','migration_backups'],'readwrite');
  let error:unknown;tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error??tx.error);
  const fail=(e:unknown)=>{error=e;tx.abort();};
  const meta=tx.objectStore('metadata'),projects=tx.objectStore('projects');
  const requests=[meta.get(MARKER),projects.get(projectId),tx.objectStore('workspace_state').get(workspaceId),tx.objectStore('project_assets').index('projectId').count(projectId),tx.objectStore('project_revisions').index('projectId').count(projectId),tx.objectStore('migration_backups').get(MARKER)];
  let pending=requests.length;
  for(const request of requests)request.onsuccess=()=>{if(--pending!==0)return;try{
   const [marker,record,active,assets,revisions,backup]=requests.map(r=>r.result);
   const p=projectMetadata(record);
   if(!marker||marker.status!=='imported_partial'||marker.workspaceId!==workspaceId||marker.projectId!==projectId||p.workspaceId!==workspaceId||p.revision!==1||active?.projectId===projectId||assets||revisions||!backup||backup.projectId!==projectId||backup.workspaceId!==workspaceId||backup.digest!==marker.digest||backup.digest!==digest||JSON.stringify({name:backup.name,payload:projectPayload(backup.payload)})!==canonical||backup.name!==p.name||JSON.stringify(projectPayload(record.payload))!==JSON.stringify(projectPayload(backup.payload)))throw new Error('Rollback unsafe; preserve project');
   projects.delete(projectId);meta.put({...marker,status:'rolled_back'});
  }catch(e){fail(e);}};
 });
}
