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
export function previewLegacyDraft(raw:string,workspaceId:WorkspaceId):MigrationPreview{
 if(!isWorkspaceId(workspaceId))throw new Error('Invalid workspace');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new Error('Invalid legacy JSON');}
 const d=object(parsed);if(d.version!==1)throw new Error('Unsupported legacy draft version');
 const p=object(d.project),v=object(d.verbaflow),r=object(d.render_settings);
 const project=createProject(workspaceId,string(p.name));
 const payload=projectPayload({schemaVersion:1,script:string(v.source_text),seoScript:string(p.seo_script_text),thumbnailTitle:string(p.thumb_title),thumbnailBadge:string(p.thumb_badge),chapters:string(p.verbaflow_chapters_txt),production:{fps:r.video_fps,codec:r.video_codec,resolution:r.loop_resolution,loopHours:r.loop_hours,scenes:[],timeline_slots:r.timeline_slots,audio_mastering:r.audio_mastering,render:{crf:r.video_crf,audioBitrate:r.audio_bitrate_kbps,actCrossfadeSec:r.act_crossfade_sec,internalCrossfadeSec:r.internal_loop_crossfade_sec,finalBlackEnabled:r.final_black_screen_enabled,finalBlackSec:r.final_black_screen_sec,bitratePreset:r.bitrate_preset,transitionMode:r.seamless_transition_mode,useEmbeddedAudio:r.use_embedded_audio}}});
 // Screen every projected string, including timeline references.
 const scan=(x:unknown):void=>{if(typeof x==='string')string(x);else if(x&&typeof x==='object')Object.values(x).forEach(scan);};
 scan(payload);
 return {project,payload,omitted:['combine and narrative scenes','additional render settings','unknown nested timeline fields','standalone SEO and thumbnail state','voice preferences and binary assets']};
}
export type MigrationResult={status:'missing'}|{status:'imported_partial'|'already_imported';projectId:string;workspaceId:WorkspaceId};
export async function migrateLegacyDraft(db:IDBDatabase,local:Storage,workspaceId:WorkspaceId,confirmPartial:boolean):Promise<MigrationResult>{
 if(!confirmPartial)throw new Error('Explicit partial import confirmation required');
 const raw=local.getItem(LEGACY_DRAFT_KEY);if(raw===null)return {status:'missing'};
 const preview=previewLegacyDraft(raw,workspaceId);
 const {project,payload,omitted}=preview;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({name:project.name,payload})))),b=>b.toString(16).padStart(2,'0')).join('');
 if(local.getItem(LEGACY_DRAFT_KEY)!==raw)throw new Error('Legacy draft changed during preview');
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
