import {projectPayload,type ProjectPayload} from './projectPayload';
import {ProjectStorage} from './projectStorage';
import type {WorkspaceId} from '../design-system/workspaces';

export interface ExternalAssetReference {name:string;fileId:string;folderId:string}
export interface AssetAvailability {name:string;status:'local_verified'|'external_verified'|'external_unverified'|'missing'|'unverified';fileId?:string}
const fileFields=new Set(['file_name','filename','video_file','voiceover_file','audio_file','image_reference','expected_video_filename','expected_audio_filename','srt_filename','emblem_path']);
function safeName(name:string):string{
 if(!name.trim()||name.length>512||/[\\/\x00-\x1f]/.test(name)||name==='.'||name==='..'||name.includes('://'))throw new Error('Invalid asset filename');
 return name;
}
function driveId(id:string):string{if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))throw new Error('Invalid Drive identifier');return id;}
export function collectAssetNames(input:ProjectPayload):string[]{
 const p=projectPayload(input),names=new Set<string>();
 const scan=(v:unknown):void=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(fileFields.has(k)&&typeof x==='string'&&x.trim())names.add(x);else if(typeof x==='object')scan(x);}};
 scan(p.production);scan(p.legacyExtras?.render);scan(p.legacyExtras?.combine);scan(p.legacyExtras?.branding);
 return [...names].sort();
}
// Explicitly supplied local files only. No filesystem or Drive discovery.
export async function attachMigrationAsset(storage:ProjectStorage,workspaceId:WorkspaceId,projectId:string,name:string,blob:Blob):Promise<void>{
 safeName(name);
 const payload=await storage.getPayload(workspaceId,projectId);
 if(!payload||!collectAssetNames(payload).includes(name))throw new Error('Asset not referenced by project');
 if(!(blob instanceof Blob)||blob.size===0)throw new Error('Empty or invalid asset');
 await storage.putAsset(workspaceId,projectId,{assetId:'legacy-file:'+name,name,blob});
 const restored=await storage.getAsset(workspaceId,projectId,'legacy-file:'+name);
 if(!restored||restored.name!==name||restored.blob.size!==blob.size)throw new Error('Asset read-back failed');
}
export async function auditMigrationAssets(storage:ProjectStorage,workspaceId:WorkspaceId,projectId:string,external:readonly ExternalAssetReference[]=[],verify?:(ref:ExternalAssetReference)=>Promise<boolean>):Promise<AssetAvailability[]>{
 const payload=await storage.getPayload(workspaceId,projectId);
 if(!payload)throw new Error('Project unavailable');
 const names=collectAssetNames(payload),refs=new Map<string,ExternalAssetReference>();
 for(const r of external){safeName(r.name);driveId(r.fileId);driveId(r.folderId);if(!names.includes(r.name)||refs.has(r.name))throw new Error('Invalid or ambiguous external reference');refs.set(r.name,{name:r.name,fileId:r.fileId,folderId:r.folderId});}
 const result:AssetAvailability[]=[];
 for(const name of names){
  const local=await storage.getAsset(workspaceId,projectId,'legacy-file:'+name);
  if(local){result.push({name,status:'local_verified'});continue;}
  const ref=refs.get(name);
  if(!ref){result.push({name,status:'unverified'});continue;}
  if(!verify){result.push({name,status:'external_unverified',fileId:ref.fileId});continue;}
  const found=await verify(ref);result.push({name,status:found?'external_verified':'missing',fileId:ref.fileId});
 }
 return result;
}

/** Store only identifiers, never OAuth credentials. Registry lives in metadata. */
export function persistExternalAssetReferences(db:IDBDatabase,workspaceId:WorkspaceId,projectId:string,external:readonly ExternalAssetReference[]):Promise<void>{
 return new Promise((resolve,reject)=>{
 const tx=db.transaction(['projects','metadata'],'readwrite');let error:unknown;
 tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error??tx.error);
 const req=tx.objectStore('projects').get(projectId);
 req.onsuccess=()=>{try{
 const p=req.result;if(!p||p.workspaceId!==workspaceId)throw new Error('Workspace mismatch');
 const names=collectAssetNames(projectPayload(p.payload)),seen=new Set<string>();
 const refs=external.map(r=>{const name=safeName(r.name);if(!names.includes(name)||seen.has(name))throw new Error('Invalid or ambiguous external reference');seen.add(name);return {name,fileId:driveId(r.fileId),folderId:driveId(r.folderId)};});
 tx.objectStore('metadata').put({key:'asset-refs:'+projectId,workspaceId,projectId,refs});
 }catch(e){error=e;tx.abort();}};
 });
}
export function readExternalAssetReferences(db:IDBDatabase,workspaceId:WorkspaceId,projectId:string):Promise<ExternalAssetReference[]>{
 return new Promise((resolve,reject)=>{
 const tx=db.transaction(['projects','metadata'],'readonly');let result:ExternalAssetReference[]=[];let error:unknown;
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error);
 const p=tx.objectStore('projects').get(projectId);
 p.onsuccess=()=>{if(!p.result||p.result.workspaceId!==workspaceId)return;
 const r=tx.objectStore('metadata').get('asset-refs:'+projectId);
 r.onsuccess=()=>{try{if(!r.result)return;if(r.result.workspaceId!==workspaceId||r.result.projectId!==projectId)throw new Error('Registry ownership mismatch');
 const names=collectAssetNames(projectPayload(p.result.payload));const seen=new Set<string>();result=r.result.refs.map((x:ExternalAssetReference)=>{const name=safeName(x.name);if(!names.includes(name)||seen.has(name))throw new Error('Stale or ambiguous reference');seen.add(name);return {name,fileId:driveId(x.fileId),folderId:driveId(x.folderId)};});
 }catch(e){error=e;tx.abort();}};};
 });
}

// Metadata-only Drive check. Authorization stays in the caller's session.
export function createDriveAssetVerifier(accessToken:string,request:typeof fetch=fetch):(ref:ExternalAssetReference)=>Promise<boolean>{
 if(!accessToken.trim())throw new Error('Drive authorization required');
 return async ref=>{
  const id=driveId(ref.fileId),folder=driveId(ref.folderId),name=safeName(ref.name);
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,parents,trashed,mimeType&supportsAllDrives=true';
  const response=await request(url,{headers:{Authorization:'Bearer '+accessToken},redirect:'error',cache:'no-store'});
  // A 404 can also mean insufficient permissions; it is not proof of deletion.
  if(response.status===404)return false;
  if(!response.ok)throw new Error('Drive verification unavailable: HTTP '+response.status);
  const data=await response.json();
  return data.id===id&&data.name===name&&data.trashed===false&&Array.isArray(data.parents)&&data.parents.includes(folder)&&typeof data.mimeType==='string'&&data.mimeType!=='application/vnd.google-apps.folder'&&data.mimeType!=='application/vnd.google-apps.shortcut';
 };
}
