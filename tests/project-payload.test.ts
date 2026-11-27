import {test,expect} from 'bun:test';
import {projectPayload} from '../src/utils/projectPayload';
const fixture={schemaVersion:1 as const,script:'Narration',seoScript:'SEO',thumbnailTitle:'Title',thumbnailBadge:'Badge',chapters:'00:00 Intro'};
test('payload projects only approved fields',()=>{expect(projectPayload({...fixture,apiKey:'fixture',nested:{token:'fixture'}})).toEqual(fixture);});
test('invalid payload is rejected',()=>{expect(()=>projectPayload({...fixture,script:42})).toThrow();expect(()=>projectPayload({...fixture,schemaVersion:2})).toThrow();});

const slot={slot_index:0,slot_id:'s1',title:'Act',asset_id:'a1',file_name:'clip.mp4',source_clip_duration_sec:10,internal_loop_crossfade_sec:1,slot_duration_sec:20,inserts:[{insert_id:'i1',asset_id:'a2',file_name:'insert.mp4',trigger_at_sec:2,duration_sec:3,transition_in:{type:'fade',duration_sec:1},transition_out:{type:'none',duration_sec:0}}],slot_transition_out:{type:'xfade',duration_sec:1}};
const audio={loudnorm_enabled:true,integrated_lufs:-14,true_peak_dbtp:-1.5,lra:11,e3_soft_attack_compressor:true,e3_max_peak_over_bed_db:6};
const production={fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[],timeline_slots:[slot],audio_mastering:audio};
test('timeline and mastering survive projection with nested allowlist',()=>{
 const p=projectPayload({...fixture,production:{...production,timeline_slots:[{...slot,apiKey:'fixture'}],audio_mastering:{...audio,token:'fixture'}}});
 expect(p.production?.timeline_slots).toEqual([slot]);
 expect(p.production?.audio_mastering).toEqual(audio);
});
test('invalid timeline transition and mastering values are rejected',()=>{
 expect(()=>projectPayload({...fixture,production:{...production,timeline_slots:[{...slot,slot_transition_out:{type:'invalid',duration_sec:1}}]}})).toThrow();
 expect(()=>projectPayload({...fixture,production:{...production,audio_mastering:{...audio,lra:NaN}}})).toThrow();
});
