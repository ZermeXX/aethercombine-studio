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

const scene={scene_index:1,scene_id:'s1',file_name:'scene.mp4',start_time:0,duration:8,text_overlay:'Upano',camera_policy:'cinematic',video_duration_mode:'hybrid',allow_video_reuse:false,transition:{type:'fade',duration_sec:0.5},brand_identity_visible:true,cta_config:{enabled:true,style:'subscribe_bell',show_sec:[1,7],click_sec:3,bell_sec:5,sfx_enabled:true,sfx_volume:1},audio_processing:{video_ambient_mute:false,sfx_gain_db:1},subtitles:{en:'Hello',ru:'Привет'},historical_location:'Upano Valley'};
test('narrative scene migration preserves supported fields and drops unknown properties',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 const raw=JSON.stringify({...draft,combine:{narrative_scenes:[{...scene,apiKey:'fixture-only',audio_processing:{...scene.audio_processing,token:'fixture-only'}}]}});
 try{
 const result=await migrateLegacyDraft(db,local(raw),'histoviva',true);
 if(result.status==='missing')throw new Error('Missing');
 expect((await s.getPayload('histoviva',result.projectId))?.production?.narrative_scenes).toEqual([scene]);
 const recovered=await restoreMigrationBackup(db,'histoviva');
 expect((await s.getPayload('histoviva',recovered.projectId))?.production?.narrative_scenes).toEqual([scene]);
 expect(()=>previewLegacyDraft(JSON.stringify({...draft,combine:{narrative_scenes:[scene,scene]}}),'histoviva')).toThrow();
 }finally{s.close();}
});

test('global module import requires opt-in and excludes voice credentials',async()=>{
 const raw=JSON.stringify({...draft,render_settings:{...draft.render_settings,loop_draft_mode:false,continuous_bed:{enabled:true,asset_id:'bed',bed_audio_weight:0.7,token:'fixture-only'}}});
 const records:Record<string,string>={[LEGACY_DRAFT_KEY]:raw,ac_youtube_seo_state_v1:JSON.stringify({tone:'Historical Doc',selectedTitleId:'A',titles:[{id:'A',category:'Intrigue',categoryRu:'Интрига',title:'Amazon'}],description:'Description',tagsString:'history'}),aether_voice_settings:JSON.stringify({activeEngine:'edgetts',selectedLang:'English US',selectedGender:'all',selectedVoiceId:'voice',elevenKey1:'fixture-only'})};
 const l={getItem:(k:string)=>records[k]??null} as Storage;
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 try{
 expect(previewLegacyDraft(raw,'histoviva').payload.legacyExtras?.seo).toBeUndefined();
 const result=await migrateLegacyDraft(db,l,'histoviva',true,true);
 if(result.status==='missing')throw new Error('Missing');
 const p=await s.getPayload('histoviva',result.projectId);
 expect(p?.legacyExtras?.seo?.titles[0].title).toBe('Amazon');
 expect(p?.legacyExtras?.voice?.selectedVoiceId).toBe('voice');
 expect(p?.legacyExtras?.render?.loop_draft_mode).toBe(false);
 expect(JSON.stringify(p)).not.toContain('fixture-only');
 expect(records[LEGACY_DRAFT_KEY]).toBe(raw);
 }finally{s.close();}
});

test('thumbnail v2 and v1 snapshots preserve allowed fields and branding',async()=>{
 const raw=JSON.stringify({...draft,combine:{export_settings:{brand_identity:{enabled:true,name:'HISTOVIVA',episode_label:'EP02 | Amazon'},lower_third_config:{enabled:true,style:'histoviva_broadcast_en',emblem_path:'histoviva_emblem_gold_v2.png',show_sec:[0.5,5.5],anim_sec:0.55,bar_bg_rgba:[10,14,18,214]}}}});
 for(const version of ['v1','v2']){
 const slots=version==='v1'?{A:{title:'Amazon',badgeTexts:['DOCUMENTARY'],badgePositions:['left']}}:{A:{topText:'Amazon',hookLayout:{xPct:50,autoFitBottomToTop:false},presetBadges:{documentary:{enabled:true,position:'left',token:'fixture-only'}},apiKey:'fixture-only'},B:{topText:'B'},C:{topText:'C'}};
 const records:Record<string,string>={[LEGACY_DRAFT_KEY]:raw,['aether_thumb_abc_slots_'+version]:JSON.stringify(slots)};
 const l={getItem:(k:string)=>records[k]??null} as Storage;
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 try{
 const result=await migrateLegacyDraft(db,l,'histoviva',true,true);
 if(result.status==='missing')throw new Error('Missing');
 const p=await s.getPayload('histoviva',result.projectId);
 expect(p?.legacyExtras?.thumbnails?.A?.[version==='v1'?'title':'topText']).toBe('Amazon');
 expect(p?.legacyExtras?.branding?.lower_third_config?.emblem_path).toBe('histoviva_emblem_gold_v2.png');
 expect(JSON.stringify(p)).not.toContain('fixture-only');
 const copy=await restoreMigrationBackup(db,'histoviva');
 expect(await s.getPayload('histoviva',copy.projectId)).toEqual(p);
 }finally{s.close();}
 }
});
test('corrupted backup rejects recovery and rollback without deleting project',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 try{
 const result=await migrateLegacyDraft(db,local(JSON.stringify(draft)),'histoviva',true);
 if(result.status==='missing')throw new Error('Missing');
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('migration_backups','readwrite'),store=tx.objectStore('migration_backups'),r=store.get('legacy-draft-v1-import');r.onsuccess=()=>store.put({...r.result,payload:{...r.result.payload,script:'corrupt'}});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
 await expect(restoreMigrationBackup(db,'histoviva')).rejects.toThrow('Backup checksum mismatch');
 await expect(rollbackLegacyImport(db,'histoviva',result.projectId)).rejects.toThrow('Backup checksum mismatch');
 expect(await s.getProject('histoviva',result.projectId)).not.toBeNull();
 }finally{s.close();}
});

test('combine settings and V21 locks survive migration and recovery',async()=>{
 const combine={project_name:'EP02',rhythm_profile:'historical_storytelling',dna_reference_input:'reference',last_applied_dna_summary:'summary',selected_overlays:['lower_thirds','warm_glow'],lower_third_style:'sky_news',ambient_audio:{file_name:'bed.wav',volume:0.45,loop_full_duration:true},master_audio:{file_name:'voice.wav',start_timecode:'00:00:00',volume:1,fade_in_sec:1,fade_out_sec:2,duration_sec:304.5},master_audio_duration_sec:304.5,burn_in_srt_enabled:false,upload_srt_to_drive_enabled:true,subtitle_language:'en-US',srt_filename:'en.srt',srt_text_content:'Example',shorts_auto_slice_enabled:true,shorts_slice_count:3,shorts_hook_texts:['A','B','C'],v21_locks:{hardFrameLock:true,apadAtrimLock:true,continuousVoiceMaster:true,zeroSpeechOverlap:true,dynamicXfadeTransitions:true,decoupledVideoXfadeOnly:true,autoMuteFlaggedClips:false,youtubeLoudnorm:true,integratedLufs:-14,truePeakDbtp:-1.5,voiceoverLeadInSec:0.2,voiceoverSentencePadSec:0.35},export_settings:{resolution:'4k',aspect_ratio:'16:9',video_codec:'libx264',profile:'high',pix_fmt:'yuv420p',cfr:true,preset:'medium',draft_mode:false,bitrate_mbps:46,bitrate_cap:'on',crf:18,fps:24,audio_bitrate_kbps:320,preview_duration_sec:0,subtitles:{enabled:true,burn_in:false,upload_srt:true,language:'en',target_language:'en-US',srt_filename:'en.srt',srt_content:'Example'}}};
 const raw=JSON.stringify({...draft,combine:{...combine,apiKey:'fixture-only',v21_locks:{...combine.v21_locks,token:'fixture-only'}}});
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 try{
 const result=await migrateLegacyDraft(db,local(raw),'histoviva',true);
 if(result.status==='missing')throw new Error('Missing');
 const p=await s.getPayload('histoviva',result.projectId);
 expect(p?.legacyExtras?.combine).toEqual(combine);
 expect(JSON.stringify(p)).not.toContain('fixture-only');
 const copy=await restoreMigrationBackup(db,'histoviva');
 expect(await s.getPayload('histoviva',copy.projectId)).toEqual(p);
 }finally{s.close();}
});

import {collectAssetNames,attachMigrationAsset,auditMigrationAssets} from '../src/utils/migrationAssets';
test('completeness report counts omitted fields without revealing names or values',()=>{
 const raw=JSON.stringify({...draft,combine:{project_name:'EP02',private_fixture_name:'private_fixture_value',v21_locks:{hardFrameLock:false,hidden_fixture:'secret_fixture'}}});
 const p=previewLegacyDraft(raw,'histoviva');
 expect(p.omitted).toContain('combine: 2 omitted or changed fields');
 expect(JSON.stringify(p.omitted)).not.toContain('private_fixture');
 expect(JSON.stringify(p.omitted)).not.toContain('secret_fixture');
 expect(p.payload.legacyExtras?.combine?.v21_locks).toEqual({hardFrameLock:false});
});
test('referenced assets can be attached and checked without crossing workspace boundaries',async()=>{
 const db=await openProjectDatabase(new IDBFactory()),s=new ProjectStorage(db);
 const raw=JSON.stringify({...draft,combine:{narrative_scenes:[scene],master_audio:{file_name:'voice.wav',volume:1}}});
 try{
 const r=await migrateLegacyDraft(db,local(raw),'histoviva',true);
 if(r.status==='missing')throw new Error('Missing');
 const p=await s.getPayload('histoviva',r.projectId);
 expect(collectAssetNames(p!)).toEqual(['scene.mp4','voice.wav']);
 expect((await auditMigrationAssets(s,'histoviva',r.projectId)).map(a=>a.status)).toEqual(['unverified','unverified']);
 await attachMigrationAsset(s,'histoviva',r.projectId,'scene.mp4',new Blob(['test media']));
 const ref={name:'voice.wav',fileId:'fixtureFile123',folderId:'fixtureFolder123'};
 expect((await auditMigrationAssets(s,'histoviva',r.projectId,[ref])).map(a=>a.status)).toEqual(['local_verified','external_unverified']);
 expect((await auditMigrationAssets(s,'histoviva',r.projectId,[ref],async()=>false)).map(a=>a.status)).toEqual(['local_verified','missing']);
 expect((await auditMigrationAssets(s,'histoviva',r.projectId,[ref],async()=>true)).map(a=>a.status)).toEqual(['local_verified','external_verified']);
 await expect(attachMigrationAsset(s,'the_whisker_trio',r.projectId,'scene.mp4',new Blob(['x']))).rejects.toThrow();
 await expect(attachMigrationAsset(s,'histoviva',r.projectId,'unknown.mp4',new Blob(['x']))).rejects.toThrow();
 await expect(rollbackLegacyImport(db,'histoviva',r.projectId)).rejects.toThrow();
 }finally{s.close();}
});

import {persistExternalAssetReferences,readExternalAssetReferences} from '../src/utils/migrationAssets';
test('external registry persists across reopen and blocks unsafe rollback',async()=>{
 const factory=new IDBFactory(),db=await openProjectDatabase(factory),s=new ProjectStorage(db);
 try{
 const r=await migrateLegacyDraft(db,local(JSON.stringify({...draft,combine:{narrative_scenes:[scene]}})),'histoviva',true);
 if(r.status==='missing')throw new Error('Missing');
 const refs=[{name:'scene.mp4',fileId:'fixtureFile123',folderId:'fixtureFolder123'}];
 await persistExternalAssetReferences(db,'histoviva',r.projectId,refs);
 await expect(persistExternalAssetReferences(db,'the_whisker_trio',r.projectId,refs)).rejects.toThrow();
 const reopened=await openProjectDatabase(factory);
 try{
 expect(await readExternalAssetReferences(reopened,'histoviva',r.projectId)).toEqual(refs);
 expect(await readExternalAssetReferences(reopened,'the_whisker_trio',r.projectId)).toEqual([]);
 await expect(rollbackLegacyImport(reopened,'histoviva',r.projectId)).rejects.toThrow();
 }finally{reopened.close();}
 }finally{s.close();}
});
