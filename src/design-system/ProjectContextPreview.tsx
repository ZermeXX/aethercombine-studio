import {useEffect,useState} from 'react';
import {openProjectDatabase,ProjectStorage} from '../utils/projectStorage';
import {WorkspaceProjectContext,type WorkspaceSnapshot} from '../utils/workspaceProjectContext';
import type {WorkspaceId} from '../design-system/workspaces';

/** Read-only preview until all legacy production components have scoped persistence. */
export function ProjectContextPreview({workspace}:{workspace:WorkspaceId}){
 const [state,setState]=useState<WorkspaceSnapshot|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let cancelled=false;let storage:ProjectStorage|undefined;
  setState(null);setError(false);
  void (async()=>{
   try{
    const db=await openProjectDatabase();
    if(cancelled){db.close();return;}
    storage=new ProjectStorage(db);
    const snapshot=await new WorkspaceProjectContext(storage).openWorkspace(workspace);
    if(!cancelled)setState(snapshot);
   }catch{if(!cancelled)setError(true);}
   finally{storage?.close();}
  })();
  return ()=>{cancelled=true;storage?.close();};
 },[workspace]);
 const snapshot=state?.workspaceId===workspace?state:null;
 return <section aria-label="Project registry preview" className="rounded-studio-control border border-studio-border bg-studio-surface p-3">
  <h2 className="font-semibold text-studio-text">V9 Project Registry · Read-only preview</h2>
  <p className="text-studio-caption text-studio-warning">Production modules still use legacy shared data. Registry preview does not activate, migrate or overwrite projects.</p>
  {error?<p role="alert">Project registry unavailable.</p>:!snapshot?<p role="status">Loading registry…</p>:<>
   <p>{snapshot.projects.length} project(s) · Stored active project: {snapshot.active?.project.name??'None'}</p>
   <ul>{snapshot.projects.map(p=><li key={p.projectId} className="break-words">{p.name}</li>)}</ul>
  </>}
 </section>;
}
