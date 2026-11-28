import {buildScopedLoopManifest} from './loopRendererAdapter';
import type {ProjectPayload} from './projectPayload';
import type {ProjectStorage} from './projectStorage';
import type {ProjectScope} from './workspaceProjectContext';
export const RENDERER_CANDIDATE='eb2a44e2e25afd4cb3f518f87876b1bf0e161c49';
/** Local evidence is not evidence of runner access to Drive. No network or credentials. */
export async function prepareLoopPreflight(storage:ProjectStorage,scope:ProjectScope,production:NonNullable<ProjectPayload['production']>,folderId:string){
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(folderId))throw new Error('Explicit project Drive folder required');
 const manifest=buildScopedLoopManifest(production,folderId);
 const names=[...new Set(manifest.timeline_slots.flatMap(s=>[s.base_content.file_name,...s.inserts.map(i=>i.file_name)]))].sort();
 const folded=new Set<string>();
 for(const name of names){
  if(!name||name!==name.trim()||name==='.'||name==='..'||name.length>255||/[\\/\x00-\x1f*?\[\]{}]/.test(name))throw new Error('Unsafe runner asset filename');
  const key=name.toLowerCase();if(folded.has(key))throw new Error('Ambiguous case-insensitive asset names');folded.add(key);
 }
 const assets=await Promise.all(names.map(async name=>{
  const asset=await storage.getAsset(scope.workspaceId,scope.projectId,'legacy-file:'+name);
  return {name,localVerified:Boolean(asset&&asset.name===name&&asset.blob.size>0),runnerVerified:false as const};
 }));
 return {manifest,assets,rendererCandidate:RENDERER_CANDIDATE,dispatchAllowed:false as const,blockers:['Runner Drive access not verified','Authenticated dispatch not connected']};
}
