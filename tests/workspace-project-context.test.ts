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

test('asset inventory remains project-scoped even for equal filenames',async()=>{
 const s=new ProjectStorage(await openProjectDatabase(new IDBFactory())),c=new WorkspaceProjectContext(s);
 try{
 const h=await c.create('histoviva','H'),w=await c.create('the_whisker_trio','W');
 await s.putAsset('histoviva',h.project.projectId,{assetId:'fixture',name:'scene.mp4',blob:new Blob(['abc'])});
 expect(await s.listAssets('histoviva',h.project.projectId)).toEqual([{assetId:'fixture',name:'scene.mp4',size:3}]);
 expect(await s.listAssets('the_whisker_trio',h.project.projectId)).toEqual([]);
 expect(await s.listAssets('the_whisker_trio',w.project.projectId)).toEqual([]);
 expect(await s.getAsset('the_whisker_trio',h.project.projectId,'fixture')).toBeNull();
 }finally{s.close();}
});

test('thumbnail and voice preferences are isolated and credential fields are discarded',async()=>{
 const s=new ProjectStorage(await openProjectDatabase(new IDBFactory())),c=new WorkspaceProjectContext(s);
 try{
 const h=await c.create('histoviva','H'),w=await c.create('the_whisker_trio','W');
 const next=await c.save({workspaceId:'histoviva',projectId:h.project.projectId},h.project.revision,{...emptyProjectPayload(),legacyExtras:{thumbnails:{A:{topText:'History'},B:{topText:'B'},C:{topText:'C'}},voice:{activeEngine:'edgetts',selectedLang:'English UK',favorites:[],elevenKey1:'fixture-not-a-real-key'}}});
 expect(next.payload?.legacyExtras?.thumbnails?.A?.topText).toBe('History');
 expect(next.payload?.legacyExtras?.voice?.selectedLang).toBe('English UK');
 expect(next.payload?.legacyExtras?.voice?.elevenKey1).toBeUndefined();
 expect((await c.read({workspaceId:'the_whisker_trio',projectId:w.project.projectId})).payload?.legacyExtras).toBeUndefined();
 }finally{s.close();}
});

test('fixed project image slots replace only within the owning project',async()=>{
 const s=new ProjectStorage(await openProjectDatabase(new IDBFactory())),c=new WorkspaceProjectContext(s);
 try{
 const h=await c.create('histoviva','H'),w=await c.create('the_whisker_trio','W');
 const png=(v:string)=>new Blob([v],{type:'image/png'});
 await s.replaceProjectImage('histoviva',h.project.projectId,'A',png('first'));
 await s.replaceProjectImage('histoviva',h.project.projectId,'A',png('second'));
 await s.replaceProjectImage('the_whisker_trio',w.project.projectId,'A',png('other'));
 expect(await (await s.getAsset('histoviva',h.project.projectId,'project-image:A'))?.blob.text()).toBe('second');
 expect(await (await s.getAsset('the_whisker_trio',w.project.projectId,'project-image:A'))?.blob.text()).toBe('other');
 await expect(s.replaceProjectImage('the_whisker_trio',h.project.projectId,'A',png('wrong'))).rejects.toThrow();
 await expect(s.replaceProjectImage('histoviva',h.project.projectId,'B',new Blob(['x'],{type:'text/plain'}))).rejects.toThrow();
 }finally{s.close();}
});

import {projectPayload} from '../src/utils/projectPayload';
test('nonempty V8.1 scene, CTA, branding and locks survive project save and database reopen',async()=>{
 const factory=new IDBFactory();
 let s=new ProjectStorage(await openProjectDatabase(factory));
 try{
 const c=new WorkspaceProjectContext(s),h=await c.create('histoviva','History'),w=await c.create('the_whisker_trio','Ambient');
 const scope={workspaceId:'histoviva' as const,projectId:h.project.projectId};
 const fixture=projectPayload({...emptyProjectPayload(),script:'Narration',production:{fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[],narrative_scenes:[{scene_id:'scene-1',scene_index:0,file_name:'scene.mp4',text_overlay:'History',duration:8,start_time:0,transition:{type:'fade',duration_sec:0.5},brand_identity_visible:true,cta_config:{enabled:true,style:'subscribe_bell',show_sec:[1,7],click_sec:2,bell_sec:4,sfx_enabled:true,sfx_volume:1}}]},legacyExtras:{combine:{project_name:'History',v21_locks:{hardFrameLock:true,apadAtrimLock:true,zeroSpeechOverlap:true}},branding:{brand_identity:{enabled:true,name:'HISTOVIVA',episode_label:'EP02'},lower_third_config:{style:'histoviva_broadcast_en',enabled:true,show_sec:[1,4],bar_bg_rgba:[0,0,0,200]}},voice:{activeEngine:'edgetts',activeAccount:'2',selectedLang:'English UK',selectedGender:'male',selectedVoiceId:'en-GB-RyanNeural',favorites:['en-GB-RyanNeural']}}});
 const next=captureCombine(fixture,hydrateCombine(fixture));
 expect(next.production?.narrative_scenes).toEqual(fixture.production?.narrative_scenes);
 expect(next.legacyExtras?.branding).toEqual(fixture.legacyExtras?.branding);
 expect(next.legacyExtras?.combine?.v21_locks).toEqual(fixture.legacyExtras?.combine?.v21_locks);
 expect(next.legacyExtras?.voice).toEqual(fixture.legacyExtras?.voice);
 await c.save(scope,h.project.revision,next);
 s.close();s=new ProjectStorage(await openProjectDatabase(factory));
 const restored=new WorkspaceProjectContext(s);
 expect((await restored.read(scope)).payload).toEqual(next);
 expect((await restored.read({workspaceId:'the_whisker_trio',projectId:w.project.projectId})).payload).toEqual(emptyProjectPayload());
 }finally{s.close();}
});

import {synchronizeTimeline,timelineDuration} from '../src/utils/timelineSynchronization';
import type {TimelineSlot} from '../src/App';
test('timeline synchronization preserves references and achieves frame-aligned target',()=>{
 const slot=(id:string):TimelineSlot=>({slot_index:1,slot_id:id,title:id,asset_id:id,file_name:id+'.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:1,slot_duration_sec:100,inserts:[],slot_transition_out:{type:'xfade',duration_sec:1.5}});
 const original=[slot('a'),{...slot('b'),slot_index:2,slot_transition_out:{type:'none' as const,duration_sec:0}}];
 const next=synchronizeTimeline(original,6,24);
 expect(timelineDuration(next)).toBeCloseTo(21600,8);
 expect(next.map(s=>s.file_name)).toEqual(original.map(s=>s.file_name));
 expect(next.map(s=>s.slot_transition_out)).toEqual(original.map(s=>s.slot_transition_out));
 expect(original[0].slot_duration_sec).toBe(100);
 expect(next.every(s=>Math.abs(s.slot_duration_sec*24-Math.round(s.slot_duration_sec*24))<1e-6)).toBe(true);
 expect(()=>synchronizeTimeline(original,2,24)).toThrow();
 expect(synchronizeTimeline([],3,24)).toEqual([]);
});

test('timeline shortening rejects insert truncation and preserves original slot',()=>{
 const slot:TimelineSlot={slot_index:1,slot_id:'long',title:'Long',asset_id:'base',file_name:'base.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:1,slot_duration_sec:20000,inserts:[{insert_id:'insert-1',asset_id:'cutaway',file_name:'insert.mp4',trigger_at_sec:12000,duration_sec:20,transition_in:{type:'fade',duration_sec:1},transition_out:{type:'fade',duration_sec:1}}],slot_transition_out:{type:'none',duration_sec:0}};
 const before=structuredClone(slot);
 expect(()=>synchronizeTimeline([slot],3,24)).toThrow();
 expect(slot).toEqual(before);
 const next=synchronizeTimeline([slot],6,24);
 expect(next[0].inserts).toEqual(before.inserts);
 expect(next[0].slot_duration_sec).toBe(21600);
});

import {validateSlotInserts} from '../src/utils/validateSlotInserts';
test('scoped insert validation rejects overlap without mutating input and accepts adjacent inserts',()=>{
 const slot:TimelineSlot={slot_index:1,slot_id:'slot',title:'Slot',asset_id:'base',file_name:'base.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:1,slot_duration_sec:100,inserts:[{insert_id:'a',asset_id:'a',file_name:'a.mp4',trigger_at_sec:10,duration_sec:10,transition_in:{type:'fade',duration_sec:1},transition_out:{type:'none',duration_sec:0}},{insert_id:'b',asset_id:'b',file_name:'b.mp4',trigger_at_sec:15,duration_sec:10,transition_in:{type:'dissolve',duration_sec:1},transition_out:{type:'fade',duration_sec:1}}],slot_transition_out:{type:'none',duration_sec:0}};
 const before=structuredClone(slot);
 expect(()=>validateSlotInserts(slot)).toThrow('Overlapping inserts');
 expect(slot).toEqual(before);
 slot.inserts[1].trigger_at_sec=20;
 expect(()=>validateSlotInserts(slot)).not.toThrow();
 slot.inserts.reverse();
 expect(()=>validateSlotInserts(slot)).not.toThrow();
 slot.inserts[0].transition_in.duration_sec=11;
 expect(()=>validateSlotInserts(slot)).toThrow('Invalid insert transition');
});

import {adaptLoopTimeline} from '../src/utils/loopRendererAdapter';
test('renderer preview adapter maps slot-relative triggers, crossfade and input fade without mutation',()=>{
 const first:TimelineSlot={slot_id:'a',slot_index:1,title:'A',asset_id:'a',file_name:'a.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:2,slot_duration_sec:100,inserts:[],slot_transition_out:{type:'xfade',duration_sec:5}};
 const second:TimelineSlot={...first,slot_id:'b',slot_index:2,slot_transition_out:{type:'none',duration_sec:0},inserts:[{insert_id:'i',asset_id:'i',file_name:'i.mp4',trigger_at_sec:10,duration_sec:8,transition_in:{type:'fade',duration_sec:1.5},transition_out:{type:'none',duration_sec:0}}]};
 const input=[first,second],before=structuredClone(input),out=adaptLoopTimeline(input);
 expect(out[0].slot_transition_out.type).toBe('crossfade');
 expect(out[0].base_content.loop_crossfade_sec).toBe(2);
 expect(out[1].start_sec).toBe(95);
 expect(out[1].inserts[0].trigger_at_sec).toBe(105);
 expect(out[1].inserts[0].transition_duration_sec).toBe(1.5);
 expect(input).toEqual(before);
 expect(()=>adaptLoopTimeline([{...first,slot_transition_out:{type:'fade',duration_sec:5}},second])).toThrow();
});

import {buildScopedLoopManifest} from '../src/utils/loopRendererAdapter';
test('loop manifest exports runner settings and rejects unsupported configurations',()=>{
 const production:NonNullable<import('../src/utils/projectPayload').ProjectPayload['production']>={fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[],timeline_slots:[{slot_index:1,slot_id:'one',title:'One',asset_id:'base',file_name:'base.mp4',source_clip_duration_sec:8,internal_loop_crossfade_sec:1,slot_duration_sec:10800,inserts:[],slot_transition_out:{type:'none',duration_sec:0}}],render:{crf:18,audioBitrate:320,actCrossfadeSec:1,internalCrossfadeSec:1,finalBlackEnabled:false,finalBlackSec:0,bitratePreset:'standard',transitionMode:'crossfade',useEmbeddedAudio:true}};
 const out=buildScopedLoopManifest(production,'synthetic-folder');
 expect(out.export_settings.width).toBe(3840);
 expect(out.export_settings.audio_bitrate).toBe('320k');
 expect(out.cloud_export.target_folder_id).toBe('synthetic-folder');
 expect(out.timeline_slots[0].slot_duration_sec).toBe(10800);
 expect(()=>buildScopedLoopManifest(production,'')).toThrow();
 expect(()=>buildScopedLoopManifest({...production,loopHours:6},'synthetic-folder')).toThrow();
 expect(()=>buildScopedLoopManifest({...production,render:{...production.render!,finalBlackEnabled:true}},'synthetic-folder')).toThrow();
});

 test('renderer rejects overlapping act transitions and unsupported short bodies',()=>{
 const slot=(id:string,duration:number,overlap:number):TimelineSlot=>({slot_index:1,slot_id:id,title:id,asset_id:id,file_name:id+'.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:1,slot_duration_sec:duration,inserts:[],slot_transition_out:{type:overlap?'xfade':'none',duration_sec:overlap}});
 expect(()=>adaptLoopTimeline([slot('a',10,4),slot('b',7,4),slot('c',10,0)])).toThrow('Act crossfades overlap');
 expect(()=>adaptLoopTimeline([slot('a',10,4),slot('b',10,4),slot('c',10,0)])).toThrow('Act body too short');
 expect(adaptLoopTimeline([slot('a',10,4),slot('b',11,4),slot('c',10,0)])).toHaveLength(3);
 });
