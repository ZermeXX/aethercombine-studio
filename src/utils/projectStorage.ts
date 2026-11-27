import { projectPayload, type ProjectPayload } from './projectPayload';
import { projectMetadata, type ProjectRecord } from '../design-system/projectRegistry';
import { isWorkspaceId, type WorkspaceId } from '../design-system/workspaces';
export const DATABASE_NAME='aether_studio_v9';
export const DATABASE_VERSION=2;
export function openProjectDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  const req=factory.open(DATABASE_NAME,DATABASE_VERSION);
  let blocked=false;
  req.onblocked=()=>{blocked=true;reject(new Error('Database upgrade blocked'));};
  req.onerror=()=>reject(req.error);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('projects')){
    const s=db.createObjectStore('projects',{keyPath:'projectId'});
    s.createIndex('workspaceId','workspaceId');s.createIndex('updatedAt','updatedAt');
   }
   if(!db.objectStoreNames.contains('workspace_state'))db.createObjectStore('workspace_state',{keyPath:'workspaceId'});
   if(!db.objectStoreNames.contains('project_assets'))db.createObjectStore('project_assets',{keyPath:['projectId','assetId']}).createIndex('projectId','projectId');
   if(!db.objectStoreNames.contains('project_revisions'))db.createObjectStore('project_revisions',{keyPath:['projectId','revision']}).createIndex('projectId','projectId');
   if(!db.objectStoreNames.contains('migration_backups'))db.createObjectStore('migration_backups',{keyPath:'backupId'}).createIndex('createdAt','createdAt');
   if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'key'});
  };
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();if(blocked)db.close();else resolve(db);};
 });
}
function transaction<T>(db:IDBDatabase, stores:string[], mode:IDBTransactionMode, run:(tx:IDBTransaction,done:(v:T)=>void,fail:(e:unknown)=>void)=>void):Promise<T>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(stores,mode);let value:T;let error:unknown;
  tx.oncomplete=()=>resolve(value);
  tx.onabort=()=>reject(error??tx.error??new Error('Transaction aborted'));
  const fail=(e:unknown)=>{error=e;try{tx.abort();}catch{reject(e);}};
  try{run(tx,v=>{value=v;},fail);}catch(e){fail(e);}
 });
}
export interface ProjectAsset { assetId:string; name:string; blob:Blob }
async function assetDigest(blob:Blob):Promise<string>{
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
}
export class ProjectStorage {
 async putAsset(workspaceId:WorkspaceId,projectId:string,asset:ProjectAsset):Promise<void>{
  if(!asset.assetId.trim()||!asset.name.trim()||!(asset.blob instanceof Blob))throw new Error('Invalid asset');
  const record={projectId,assetId:asset.assetId,name:asset.name,blob:asset.blob,sha256:await assetDigest(asset.blob)};
  return transaction(this.db,['projects','project_assets'],'readwrite',(tx,done,fail)=>{
   const r=tx.objectStore('projects').get(projectId);
   r.onsuccess=()=>{try{if(projectMetadata(r.result).workspaceId!==workspaceId)throw new Error('Workspace mismatch');tx.objectStore('project_assets').add(record);done(undefined);}catch(e){fail(e);}};
  });
 }
 async getAsset(workspaceId:WorkspaceId,projectId:string,assetId:string):Promise<ProjectAsset|null>{
  const result=await transaction<ProjectAsset & {sha256?:string} | null>(this.db,['projects','project_assets'],'readonly',(tx,done,fail)=>{
   const r=tx.objectStore('projects').get(projectId);
   r.onsuccess=()=>{try{if(!r.result||projectMetadata(r.result).workspaceId!==workspaceId){done(null);return;}
    const a=tx.objectStore('project_assets').get([projectId,assetId]);
    a.onsuccess=()=>{try{const v=a.result;if(!v){done(null);return;}if(!(v.blob instanceof Blob))throw new Error('Invalid stored asset');done({assetId:v.assetId,name:v.name,blob:v.blob,sha256:v.sha256});}catch(e){fail(e);}};
   }catch(e){fail(e);}};
  });
  if(!result)return null;
  if(result.sha256!==undefined && await assetDigest(result.blob)!==result.sha256)throw new Error('Asset checksum mismatch');
  return {assetId:result.assetId,name:result.name,blob:result.blob};
 }
 // Hash outside the IndexedDB transaction to avoid transaction inactivity.
 constructor(private readonly db:IDBDatabase){}
 close(){this.db.close();}
 createProject(input:ProjectRecord):Promise<void>{
  const p=projectMetadata(input);
  if(p.revision!==1)throw new Error('Initial revision must be 1');
  return transaction(this.db,['projects'],'readwrite',(tx,done)=>{tx.objectStore('projects').add(p);done(undefined);});
 }
 getProject(workspaceId:WorkspaceId,projectId:string):Promise<ProjectRecord|null>{
  return transaction(this.db,['projects'],'readonly',(tx,done,fail)=>{
   const r=tx.objectStore('projects').get(projectId);
   r.onsuccess=()=>{try{done(r.result?.workspaceId===workspaceId?projectMetadata(r.result):null);}catch(e){fail(e);}};
  });
 }
 listProjects(workspaceId:WorkspaceId):Promise<ProjectRecord[]>{
  if(!isWorkspaceId(workspaceId))throw new Error('Invalid workspace');
  return transaction(this.db,['projects'],'readonly',(tx,done,fail)=>{
   const r=tx.objectStore('projects').index('workspaceId').getAll(workspaceId);
   r.onsuccess=()=>{try{done(r.result.map(projectMetadata));}catch(e){fail(e);}};
  });
 }
 saveProject(input:ProjectRecord,expectedRevision:number,payload?:ProjectPayload):Promise<ProjectRecord>{
  const p=projectMetadata(input);
  const content=payload===undefined?undefined:projectPayload(payload);
  return transaction(this.db,['projects','project_revisions'],'readwrite',(tx,done,fail)=>{
   const s=tx.objectStore('projects');const r=s.get(p.projectId);
   r.onsuccess=()=>{try{
    const old=projectMetadata(r.result);
    if(old.workspaceId!==p.workspaceId||old.revision!==expectedRevision||p.revision!==expectedRevision||old.createdAt!==p.createdAt)throw new Error('Ownership or revision conflict');
    const next=projectMetadata({...p,revision:old.revision+1,updatedAt:Math.max(Date.now(),old.updatedAt)});
    const previous=r.result.payload===undefined?undefined:projectPayload(r.result.payload);
    tx.objectStore('project_revisions').add({...old,...(previous===undefined?{}:{payload:previous})});
    const current=content??previous;s.put({...next,...(current===undefined?{}:{payload:current})});done(next);
   }catch(e){fail(e);}};
  });
 }
 getPayload(workspaceId:WorkspaceId,projectId:string):Promise<ProjectPayload|null>{
  return transaction(this.db,['projects'],'readonly',(tx,done,fail)=>{
   const r=tx.objectStore('projects').get(projectId);
   r.onsuccess=()=>{try{done(r.result?.workspaceId===workspaceId&&r.result.payload!==undefined?projectPayload(r.result.payload):null);}catch(e){fail(e);}};
  });
 }
 setActiveProject(workspaceId:WorkspaceId,projectId:string):Promise<void>{
  return transaction(this.db,['projects','workspace_state'],'readwrite',(tx,done,fail)=>{
   const r=tx.objectStore('projects').get(projectId);
   r.onsuccess=()=>{try{if(projectMetadata(r.result).workspaceId!==workspaceId)throw new Error('Workspace mismatch');tx.objectStore('workspace_state').put({workspaceId,projectId});done(undefined);}catch(e){fail(e);}};
  });
 }
 getActiveProject(workspaceId:WorkspaceId):Promise<ProjectRecord|null>{
  return transaction(this.db,['projects','workspace_state'],'readonly',(tx,done,fail)=>{
   const r=tx.objectStore('workspace_state').get(workspaceId);
   r.onsuccess=()=>{if(!r.result){done(null);return;}const p=tx.objectStore('projects').get(r.result.projectId);p.onsuccess=()=>{try{done(p.result?.workspaceId===workspaceId?projectMetadata(p.result):null);}catch(e){fail(e);}};};
  });
 }
}
