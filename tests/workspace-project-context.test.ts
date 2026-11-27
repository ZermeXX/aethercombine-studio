import {test,expect} from 'bun:test';
import {IDBFactory} from 'fake-indexeddb';
import {openProjectDatabase,ProjectStorage} from '../src/utils/projectStorage';
import {WorkspaceProjectContext,WorkspaceSwitchCoordinator,emptyProjectPayload} from '../src/utils/workspaceProjectContext';
test('workspace and project context isolate payloads and remember active selection',async()=>{
 const factory=new IDBFactory(),s=new ProjectStorage(await openProjectDatabase(factory)),c=new WorkspaceProjectContext(s);
 try{
 const h=await c.create('histoviva','Same title'),w=await c.create('the_whisker_trio','Same title'),h2=await c.create('histoviva','Second');
 expect(h.project.projectId).not.toBe(w.project.projectId);
 const hs={workspaceId:'histoviva' as const,projectId:h.project.projectId},ws={workspaceId:'the_whisker_trio' as const,projectId:w.project.projectId};
 const hp={...emptyProjectPayload(),script:'History',seoScript:'Historical SEO',thumbnailTitle:'History title',chapters:'History chapters'};
 const wp={...emptyProjectPayload(),script:'Ambient',seoScript:'Ambient SEO',thumbnailTitle:'Ambient title'};
 await c.save(hs,h.project.revision,hp);await c.save(ws,w.project.revision,wp);
 await c.select(hs);await c.select(ws);
 expect((await c.openWorkspace('histoviva')).active?.payload).toEqual(hp);
 expect((await c.openWorkspace('the_whisker_trio')).active?.payload).toEqual(wp);
 expect((await c.openWorkspace('histoviva')).projects.length).toBe(2);
 expect((await c.read({workspaceId:'histoviva',projectId:h2.project.projectId})).payload).toEqual(emptyProjectPayload());
 await expect(c.read({...hs,workspaceId:'the_whisker_trio'})).rejects.toThrow();
 await expect(c.select({...hs,workspaceId:'the_whisker_trio'})).rejects.toThrow();
 await expect(c.save(hs,h.project.revision,wp)).rejects.toThrow();
 }finally{s.close();}
});
test('switch serializes flush and preserves selection when flush fails',async()=>{
 const s=new ProjectStorage(await openProjectDatabase(new IDBFactory())),c=new WorkspaceProjectContext(s),sw=new WorkspaceSwitchCoordinator(c);
 try{
 const h=await c.create('histoviva','H'),w=await c.create('the_whisker_trio','W');
 const hs={workspaceId:'histoviva' as const,projectId:h.project.projectId},ws={workspaceId:'the_whisker_trio' as const,projectId:w.project.projectId};
 await sw.switchTo(hs,async()=>{});
 await expect(sw.switchTo(ws,async()=>{throw new Error('Flush failed');})).rejects.toThrow('Flush failed');
 expect(sw.scope).toEqual(hs);
 expect((await c.openWorkspace('the_whisker_trio')).active).toBeNull();
 const events:string[]=[];
 await sw.switchTo(ws,async old=>{events.push(old.projectId);await c.save(old,h.project.revision,{...emptyProjectPayload(),script:'Flushed'});});
 expect(events).toEqual([hs.projectId]);expect(sw.scope).toEqual(ws);
 expect((await c.read(hs)).payload?.script).toBe('Flushed');
 expect((await c.read(ws)).payload?.script).toBe('');
 }finally{s.close();}
});
