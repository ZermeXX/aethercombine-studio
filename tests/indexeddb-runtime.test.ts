import {test,expect} from 'bun:test';
import {IDBFactory} from 'fake-indexeddb';
import {openProjectDatabase,ProjectStorage} from '../src/utils/projectStorage';
import {createProject} from '../src/design-system/projectRegistry';
test('schema, ownership, payload, active project and concurrent revisions',async()=>{
 const db=await openProjectDatabase(new IDBFactory());const s=new ProjectStorage(db);
 try{
 expect(db.objectStoreNames.length).toBe(6);
 const p=createProject('histoviva','Episode');await s.createProject(p);
 expect(await s.getProject('the_whisker_trio',p.projectId)).toBeNull();
 await expect(s.setActiveProject('the_whisker_trio',p.projectId)).rejects.toThrow();
 await s.setActiveProject('histoviva',p.projectId);
 expect(await s.getActiveProject('histoviva')).toEqual(p);
 const payload={schemaVersion:1 as const,script:'Narration',seoScript:'SEO',thumbnailTitle:'Title',thumbnailBadge:'Badge',chapters:'Intro'};
 const results=await Promise.allSettled([s.saveProject(p,1,payload),s.saveProject(p,1,payload)]);
 expect(results.filter(x=>x.status==='fulfilled').length).toBe(1);
 expect(await s.getPayload('histoviva',p.projectId)).toEqual(payload);
 expect(await s.getPayload('the_whisker_trio',p.projectId)).toBeNull();
 const next=await s.getProject('histoviva',p.projectId);expect(next?.revision).toBe(2);
 await s.saveProject(next!,2);
 expect(await s.getPayload('histoviva',p.projectId)).toEqual(payload);
 const tx=db.transaction('project_revisions','readonly');
 const count=await new Promise<number>((resolve,reject)=>{const r=tx.objectStore('project_revisions').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 expect(count).toBe(2);
 }finally{s.close();}
});

test('binary asset round trip and ownership',async()=>{
 const db=await openProjectDatabase(new IDBFactory());const s=new ProjectStorage(db);
 try{
 const p=createProject('histoviva','Assets');await s.createProject(p);
 const a={assetId:'a1',name:'fixture.bin',blob:new Blob([new Uint8Array([1,2,3])])};
 await expect(s.putAsset('the_whisker_trio',p.projectId,a)).rejects.toThrow();
 await s.putAsset('histoviva',p.projectId,a);
 await expect(s.putAsset('histoviva',p.projectId,a)).rejects.toThrow();
 expect(await s.getAsset('the_whisker_trio',p.projectId,'a1')).toBeNull();
 const restored=await s.getAsset('histoviva',p.projectId,'a1');
 expect(restored?.name).toBe(a.name);
 expect(Array.from(new Uint8Array(await restored!.blob.arrayBuffer()))).toEqual([1,2,3]);
 }finally{s.close();}
});
