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

import {saveModulePatch} from '../src/utils/scopedModulePersistence';
test('atomic initial payload and scoped module updates preserve unrelated content',async()=>{
 const s=new ProjectStorage(await openProjectDatabase(new IDBFactory())),c=new WorkspaceProjectContext(s);
 try{
 const h=await c.create('histoviva','H'),w=await c.create('the_whisker_trio','W');
 expect(h.project.revision).toBe(1);
 const hs={workspaceId:'histoviva' as const,projectId:h.project.projectId},ws={workspaceId:'the_whisker_trio' as const,projectId:w.project.projectId};
 const a=await saveModulePatch(c,hs,1,{module:'verbaflow',script:'Narration',chapters:'Intro'});
 const b=await saveModulePatch(c,hs,a.project.revision,{module:'seo',seoScript:'History SEO'});
 const d=await saveModulePatch(c,hs,b.project.revision,{module:'thumb',thumbnailTitle:'Amazon',thumbnailBadge:'Documentary'});
 const e=await saveModulePatch(c,hs,d.project.revision,{module:'loop',production:{fps:24,codec:'libx264',resolution:'4k',loopHours:6}});
 expect(e.payload?.script).toBe('Narration');expect(e.payload?.seoScript).toBe('History SEO');expect(e.payload?.thumbnailTitle).toBe('Amazon');expect(e.payload?.production?.loopHours).toBe(6);
 expect((await c.read(ws)).payload).toEqual(emptyProjectPayload());
 await expect(saveModulePatch(c,hs,1,{module:'seo',seoScript:'Stale'})).rejects.toThrow();
 await expect(saveModulePatch(c,{...hs,workspaceId:'the_whisker_trio'},e.project.revision,{module:'seo',seoScript:'Wrong'})).rejects.toThrow();
 }finally{s.close();}
});

import {hydrateCombine,captureCombine} from '../src/utils/nativeCombineBinding';
test('native combine projection retains locks branding and timeline',()=>{
 const original={...emptyProjectPayload(),production:{fps:24 as const,codec:'libx264' as const,resolution:'4k' as const,loopHours:6,scenes:[],timeline_slots:[]},legacyExtras:{branding:{brand_identity:{enabled:true,name:'HISTOVIVA',episode_label:'EP02'}},combine:{v21_locks:{hardFrameLock:false}}}};
 const slice=hydrateCombine(original);
 const next=captureCombine(original,{...slice,project_name:'History',narrative_scenes:[]});
 expect(next.production?.timeline_slots).toEqual([]);
 expect(next.production?.loopHours).toBe(6);
 expect(next.legacyExtras?.combine?.v21_locks).toEqual({hardFrameLock:false});
 expect(next.legacyExtras?.branding?.brand_identity).toEqual(original.legacyExtras.branding.brand_identity);
 expect(hydrateCombine(next).narrative_scenes).toEqual([]);
});
