import {test,expect} from 'bun:test';
import {IDBFactory} from 'fake-indexeddb';
import {openProjectDatabase,ProjectStorage} from '../src/utils/projectStorage';
import {migrateLegacyDraft,previewLegacyDraft,LEGACY_DRAFT_KEY} from '../src/utils/legacyMigration';
const draft={version:1,project:{name:'EP02',seo_script_text:'SEO',thumb_title:'Title',thumb_badge:'Badge',verbaflow_chapters_txt:'Intro'},verbaflow:{source_text:'Narration'},render_settings:{video_fps:24,video_codec:'libx264',loop_resolution:'4k',loop_hours:3,timeline_slots:[],video_crf:20,audio_bitrate_kbps:320,act_crossfade_sec:90,internal_loop_crossfade_sec:1,final_black_screen_enabled:true,final_black_screen_sec:2,bitrate_preset:'cinema',seamless_transition_mode:'crossfade',use_embedded_audio:true},combine:{secret:'fixture-only'}};
const local=(raw:string|null)=>({getItem:(k:string)=>k===LEGACY_DRAFT_KEY?raw:null} as Storage);
test('preview validates and reports omitted data',()=>{
 const p=previewLegacyDraft(JSON.stringify(draft),'histoviva');
 expect(p.payload.script).toBe('Narration');expect(p.omitted.length).toBeGreaterThan(0);
 expect(JSON.stringify(p.payload)).not.toContain('fixture-only');
 expect(()=>previewLegacyDraft('{','histoviva')).toThrow();
 expect(()=>previewLegacyDraft(JSON.stringify({...draft,version:99}),'histoviva')).toThrow();
 expect(()=>previewLegacyDraft(JSON.stringify({...draft,verbaflow:{source_text:'-----BEGIN PRIVATE KEY-----'}}),'histoviva')).toThrow();
});
test('atomic partial import, repeated import and workspace conflict',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 const raw=JSON.stringify(draft),l=local(raw);
 try{
 await expect(migrateLegacyDraft(db,l,'histoviva',false)).rejects.toThrow();
 expect(await migrateLegacyDraft(db,local(null),'histoviva',true)).toEqual({status:'missing'});
 const [a,b]=await Promise.all([migrateLegacyDraft(db,l,'histoviva',true),migrateLegacyDraft(db,l,'histoviva',true)]);
 expect([a.status,b.status].sort()).toEqual(['already_imported','imported_partial']);
 if(a.status==='missing'||b.status==='missing')throw new Error('Missing result');
 expect(a.projectId).toBe(b.projectId);
 expect(await s.getPayload('histoviva',a.projectId)).not.toBeNull();
 expect(await s.getActiveProject('histoviva')).toBeNull();
 expect(l.getItem(LEGACY_DRAFT_KEY)).toBe(raw);
 await expect(migrateLegacyDraft(db,l,'the_whisker_trio',true)).rejects.toThrow();
 expect((await s.listProjects('histoviva')).length).toBe(1);
 }finally{s.close();}
});

import {restoreMigrationBackup,rollbackLegacyImport} from '../src/utils/legacyMigration';
test('rollback preserves backup and legacy; recovery creates a distinct project',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 const raw=JSON.stringify(draft),l=local(raw);
 try{
 const a=await migrateLegacyDraft(db,l,'histoviva',true);
 if(a.status==='missing')throw new Error('Missing');
 await expect(rollbackLegacyImport(db,'the_whisker_trio',a.projectId)).rejects.toThrow();
 await s.setActiveProject('histoviva',a.projectId);
 await expect(rollbackLegacyImport(db,'histoviva',a.projectId)).rejects.toThrow();
 const other=await restoreMigrationBackup(db,'histoviva');
 await s.setActiveProject('histoviva',other.projectId);
 await rollbackLegacyImport(db,'histoviva',a.projectId);
 expect(await s.getProject('histoviva',a.projectId)).toBeNull();
 expect(l.getItem(LEGACY_DRAFT_KEY)).toBe(raw);
 await expect(migrateLegacyDraft(db,l,'histoviva',true)).rejects.toThrow();
 expect(other.projectId).not.toBe(a.projectId);
 expect(await s.getPayload('histoviva',other.projectId)).toEqual(previewLegacyDraft(raw,'histoviva').payload);
 await expect(restoreMigrationBackup(db,'the_whisker_trio')).rejects.toThrow();
 }finally{s.close();}
});
test('migration transaction conflict rolls back all new records',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 try{
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('migration_backups','readwrite');tx.objectStore('migration_backups').add({backupId:'legacy-draft-v1-import'});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
 await expect(migrateLegacyDraft(db,local(JSON.stringify(draft)),'histoviva',true)).rejects.toThrow();
 expect(await s.listProjects('histoviva')).toEqual([]);
 }finally{s.close();}
});
