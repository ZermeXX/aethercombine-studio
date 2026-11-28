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
 const requestId=crypto.randomUUID();
 const response=await request(API+'/actions/workflows/render_loop.yml/dispatches',{
  method:'POST',headers,redirect:'error',cache:'no-store',
  body:JSON.stringify({ref:PREFLIGHT_REF,inputs:{target_hours:String(production.loopHours),manifest_payload:payload,strict_project_contract:'true',preflight_only:'true',expected_renderer_sha:prepared.rendererCandidate,request_id:requestId}})
 });
 if(response.status!==204)throw new Error('Preflight dispatch not confirmed: HTTP '+response.status);
 return {accepted:true as const,requestId,rendererSha:prepared.rendererCandidate,runnerVerified:false as const,productionDispatchAllowed:false as const};
}

/** Find only the exact request, never infer success from another run. */
export async function findStrictPreflightRun(requestId:string,rendererSha:string,token:string,request:typeof fetch=fetch){
 if(!/^[0-9a-f-]{36}$/.test(requestId)||! /^[0-9a-f]{40}$/.test(rendererSha)||!token.trim()||/[\r\n]/.test(token))throw new Error('Invalid run lookup');
 const response=await request(API+'/actions/workflows/render_loop.yml/runs?event=workflow_dispatch&branch='+encodeURIComponent(PREFLIGHT_REF)+'&per_page=100',{headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json'},redirect:'error',cache:'no-store'});
 if(!response.ok)throw new Error('Run lookup failed: HTTP '+response.status);
 const data=await response.json();
 const matches=(data.workflow_runs??[]).filter((r:any)=>r.display_title==='Strict preflight '+requestId&&r.head_sha===rendererSha&&r.head_branch===PREFLIGHT_REF&&r.event==='workflow_dispatch');
 if(matches.length>1)throw new Error('Ambiguous preflight run');
 if(!matches.length)return null;
 const run=matches[0];
 return {id:run.id,status:run.status,conclusion:run.conclusion,runnerVerified:false as const};
}

/** Require positive evidence of actual strict steps; success alone is insufficient. */
export async function verifyStrictPreflightJobs(runId:number,rendererSha:string,token:string,request:typeof fetch=fetch){
 if(!Number.isSafeInteger(runId)||runId<=0||! /^[0-9a-f]{40}$/.test(rendererSha)||!token.trim()||/[\r\n]/.test(token))throw new Error('Invalid evidence lookup');
 const response=await request(API+'/actions/runs/'+runId+'/jobs?filter=latest&per_page=100',{headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json'},redirect:'error',cache:'no-store'});
 if(!response.ok)throw new Error('Job evidence unavailable: HTTP '+response.status);
 const data=await response.json();
 const jobs=Array.isArray(data.jobs)?data.jobs:[];
 const matches=jobs.filter((j:any)=>j.run_id===runId&&j.head_sha===rendererSha&&j.name==='render_and_upload');
 if(matches.length!==1)return false;
 const job=matches[0];
 if(job.status!=='completed'||job.conclusion!=='success'||!Array.isArray(job.steps))return false;
 const step=(name:string,conclusion:string)=>job.steps.filter((s:any)=>s.name===name&&s.status==='completed'&&s.conclusion===conclusion).length===1;
 return step('Strict Project Dispatch Identity Guard','success')&&step('Preflight Asset Check','success')&&step('Download Source Clips (only needed files)','success')&&step('Strict Project Media Verification','success')&&step('Build and Run FFmpeg Pipeline','skipped')&&step('Upload Output Video, Shorts & Metadata to Google Drive','skipped');
}
