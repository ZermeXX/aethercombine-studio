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
