import {createProject,type ProjectRecord} from '../design-system/projectRegistry';
import {isWorkspaceId,type WorkspaceId} from '../design-system/workspaces';
import {projectPayload,type ProjectPayload} from './projectPayload';
import {ProjectStorage} from './projectStorage';

export type ProjectScope=Readonly<{workspaceId:WorkspaceId;projectId:string}>;
export type ProjectSnapshot={project:ProjectRecord;payload:ProjectPayload|null};
export type WorkspaceSnapshot={workspaceId:WorkspaceId;projects:ProjectRecord[];active:ProjectSnapshot|null};
export const emptyProjectPayload=():ProjectPayload=>({schemaVersion:1,script:'',seoScript:'',thumbnailTitle:'',thumbnailBadge:'',chapters:''});
/** No implicit fallback to global legacy drafts. Every write has an explicit scope. */
export class WorkspaceProjectContext {
 constructor(private readonly storage:ProjectStorage){}
 async read(scope:ProjectScope):Promise<ProjectSnapshot>{
  const project=await this.storage.getProject(scope.workspaceId,scope.projectId);
  if(!project)throw new Error('Project unavailable in workspace');
  return {project,payload:await this.storage.getPayload(scope.workspaceId,scope.projectId)};
 }
 async openWorkspace(workspaceId:WorkspaceId):Promise<WorkspaceSnapshot>{
  if(!isWorkspaceId(workspaceId))throw new Error('Invalid workspace');
  const projects=await this.storage.listProjects(workspaceId);
  const active=await this.storage.getActiveProject(workspaceId);
  return {workspaceId,projects,active:active?await this.read({workspaceId,projectId:active.projectId}):null};
 }
 async create(workspaceId:WorkspaceId,name:string):Promise<ProjectSnapshot>{
  const project=createProject(workspaceId,name);
  const payload=emptyProjectPayload();
  await this.storage.createProject(project);
  const saved=await this.storage.saveProject(project,project.revision,payload);
  return {project:saved,payload};
 }
 async select(scope:ProjectScope):Promise<ProjectSnapshot>{
  const snapshot=await this.read(scope);
  await this.storage.setActiveProject(scope.workspaceId,scope.projectId);
  return snapshot;
 }
 async save(scope:ProjectScope,expectedRevision:number,input:ProjectPayload):Promise<ProjectSnapshot>{
  const snapshot=await this.read(scope);
  if(snapshot.project.revision!==expectedRevision)throw new Error('Project revision conflict');
  const payload=projectPayload(input);
  const project=await this.storage.saveProject(snapshot.project,expectedRevision,payload);
  return {project,payload};
 }
}
/** Serialize UI transitions; a failed flush must not change the selected scope. */
export class WorkspaceSwitchCoordinator {
 private queue:Promise<unknown>=Promise.resolve();
 private current:ProjectScope|null=null;
 constructor(private readonly context:WorkspaceProjectContext){}
 get scope():ProjectScope|null{return this.current?{...this.current}:null;}
 switchTo(scope:ProjectScope,flush:(previous:ProjectScope)=>Promise<void>):Promise<ProjectSnapshot>{
  const target={...scope};
  const operation=this.queue.then(async()=>{
   await this.context.read(target);
   if(this.current&&(this.current.workspaceId!==target.workspaceId||this.current.projectId!==target.projectId))await flush({...this.current});
   const snapshot=await this.context.select(target);
   this.current=Object.freeze(target);
   return snapshot;
  });
  this.queue=operation.catch(()=>undefined);
  return operation;
 }
}
