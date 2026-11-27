import {attachMigrationAsset,auditMigrationAssets,persistExternalAssetReferences,readExternalAssetReferences} from '../src/utils/migrationAssets';
import {migrateLegacyDraft,restoreMigrationBackup,rollbackLegacyImport,LEGACY_DRAFT_KEY} from '../src/utils/legacyMigration';
import {openProjectDatabase, ProjectStorage} from '../src/utils/projectStorage';
import {createProject} from '../src/design-system/projectRegistry';
async function main(){
 const p=createProject('histoviva','Browser smoke');
 const payload={schemaVersion:1 as const,script:'Narration',seoScript:'SEO',thumbnailTitle:'Title',thumbnailBadge:'Badge',chapters:'Intro'};
 let storage=new ProjectStorage(await openProjectDatabase());
 try {
  await storage.createProject(p);
  await storage.saveProject(p,1,payload);
  await storage.putAsset('histoviva',p.projectId,{assetId:'a1',name:'test.bin',blob:new Blob([new Uint8Array([1,2,3])])});
 } finally {storage.close();}
 storage=new ProjectStorage(await openProjectDatabase());
 try {
  const restored=await storage.getPayload('histoviva',p.projectId);
  if(JSON.stringify(restored)!==JSON.stringify(payload))throw new Error('Payload mismatch');
  if(await storage.getPayload('the_whisker_trio',p.projectId)!==null)throw new Error('Workspace isolation failed');
  const asset=await storage.getAsset('histoviva',p.projectId,'a1');
  if(!asset||Array.from(new Uint8Array(await asset.blob.arrayBuffer())).join(',')!=='1,2,3')throw new Error('Asset mismatch');
 } finally {storage.close();}
 const legacy={version:1,project:{name:'Migration smoke',seo_script_text:'SEO',thumb_title:'Title',thumb_badge:'Badge',verbaflow_chapters_txt:'Intro'},verbaflow:{source_text:'Narration'},render_settings:{video_fps:24,video_codec:'libx264',loop_resolution:'4k',loop_hours:3,timeline_slots:[],video_crf:20,audio_bitrate_kbps:320,act_crossfade_sec:90,internal_loop_crossfade_sec:1,final_black_screen_enabled:true,final_black_screen_sec:2,bitrate_preset:'cinema',seamless_transition_mode:'crossfade',use_embedded_audio:true}};
 const scene={scene_index:1,scene_id:'s1',file_name:'scene.mp4',start_time:0,duration:8,text_overlay:'Upano',camera_policy:'cinematic',video_duration_mode:'hybrid',allow_video_reuse:false,transition:{type:'fade',duration_sec:0.5},brand_identity_visible:true,cta_config:{enabled:true,style:'subscribe_bell',show_sec:[1,7],click_sec:3,bell_sec:5,sfx_enabled:true,sfx_volume:1},audio_processing:{video_ambient_mute:false,sfx_gain_db:1},subtitles:{en:'Hello',ru:'Привет'},historical_location:'Upano Valley'};
 const raw=JSON.stringify({...legacy,combine:{narrative_scenes:[scene]}});
 // Isolated CI browser context, never production user data.
 localStorage.setItem(LEGACY_DRAFT_KEY,raw);
 const db=await openProjectDatabase();
 const migrationStorage=new ProjectStorage(db);
 try {
 const result=await migrateLegacyDraft(db,localStorage,'histoviva',true);
 if(result.status!=='imported_partial')throw new Error('Migration failed');
 const content=await migrationStorage.getPayload('histoviva',result.projectId);
 if(content?.production?.narrative_scenes?.[0]?.scene_id!=='s1'||content.production.narrative_scenes[0].cta_config?.sfx_volume!==1)throw new Error('Scene migration failed');
 const duplicate=await migrateLegacyDraft(db,localStorage,'histoviva',true);
 if(duplicate.status!=='already_imported'||duplicate.projectId!==result.projectId)throw new Error('Duplicate guard failed');
 const copy=await restoreMigrationBackup(db,'histoviva');
 if(JSON.stringify(await migrationStorage.getPayload('histoviva',copy.projectId))!==JSON.stringify(content))throw new Error('Recovery mismatch');
 await attachMigrationAsset(migrationStorage,'histoviva',result.projectId,'scene.mp4',new Blob(['fixture media']));
 await persistExternalAssetReferences(db,'histoviva',result.projectId,[{name:'scene.mp4',fileId:'fixtureFile123',folderId:'fixtureFolder123'}]);
 const assetCopy=await restoreMigrationBackup(db,'histoviva');
 let refused=false;try{await rollbackLegacyImport(db,'histoviva',result.projectId);}catch{refused=true;}
 if(!refused||!await migrationStorage.getProject('histoviva',result.projectId)||localStorage.getItem(LEGACY_DRAFT_KEY)!==raw)throw new Error('Unsafe rollback protection failed');
 const reopen=await openProjectDatabase();const reopened=new ProjectStorage(reopen);
 try{
 const refs=await readExternalAssetReferences(reopen,'histoviva',assetCopy.projectId);
 if(refs.length!==1||refs[0].fileId!=='fixtureFile123')throw new Error('Registry persistence failed');
 if((await readExternalAssetReferences(reopen,'the_whisker_trio',assetCopy.projectId)).length)throw new Error('Registry isolation failed');
 if((await auditMigrationAssets(reopened,'histoviva',assetCopy.projectId,refs))[0]?.status!=='local_verified')throw new Error('Binary attachment verification failed');
 const asset=await reopened.getAsset('histoviva',assetCopy.projectId,'legacy-file:scene.mp4');
 if(!asset||await asset.blob.text()!=='fixture media')throw new Error('Recovered binary mismatch');
 }finally{reopened.close();}
 console.log('BROWSER_MIGRATION_PASS');
 }finally{migrationStorage.close();}
 document.body.textContent='BROWSER_STORAGE_PASS';
}
main().catch(e=>{document.body.textContent='BROWSER_STORAGE_FAIL: '+String(e);});
