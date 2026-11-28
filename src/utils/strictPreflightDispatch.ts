import {prepareLoopPreflight} from './loopProductionPreflight';
import type {ProjectStorage} from './projectStorage';
import type {ProjectScope} from './workspaceProjectContext';
import type {ProjectPayload} from './projectPayload';
export const PREFLIGHT_REF='fix/loop-timestamp-boundaries-v81';
const API='https://api.github.com/repos/ZermeXX/aetherflow-render';
/** Explicit invocation only. Credentials never enter the manifest or persistence. */
export async function dispatchStrictPreflight(
 storage:ProjectStorage,scope:ProjectScope,production:NonNullable<ProjectPayload['production']>,
 folderId:string,token:string,request:typeof fetch=fetch
){
 if(!token.trim()||/[\r\n]/.test(token))throw new Error('GitHub authorization required');
 const prepared=await prepareLoopPreflight(storage,scope,production,folderId);
 const payload=JSON.stringify(prepared.manifest);
 if(new TextEncoder().encode(payload).length>60000)throw new Error('Manifest exceeds dispatch limit');
 const headers={Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 const branch=await request(API+'/git/ref/heads/'+encodeURIComponent(PREFLIGHT_REF),{headers,redirect:'error',cache:'no-store'});
 if(!branch.ok)throw new Error('Renderer candidate verification failed: HTTP '+branch.status);
 const head=await branch.json();
 if(head?.object?.sha!==prepared.rendererCandidate)throw new Error('Renderer candidate changed; review required');
 const response=await request(API+'/actions/workflows/render_loop.yml/dispatches',{
  method:'POST',headers,redirect:'error',cache:'no-store',
  body:JSON.stringify({ref:PREFLIGHT_REF,inputs:{target_hours:String(production.loopHours),manifest_payload:payload,strict_project_contract:'true',preflight_only:'true'}})
 });
 if(response.status!==204)throw new Error('Preflight dispatch not confirmed: HTTP '+response.status);
 return {accepted:true as const,runnerVerified:false as const,productionDispatchAllowed:false as const};
}
