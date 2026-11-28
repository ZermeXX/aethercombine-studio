import {buildScopedLoopManifest} from '../src/utils/loopRendererAdapter';
const manifest=buildScopedLoopManifest({fps:24,codec:'libx264',resolution:'720p',loopHours:5/3600,scenes:[],timeline_slots:[{slot_index:1,slot_id:'fixture',title:'Fixture',asset_id:'base',file_name:'base.mp4',source_clip_duration_sec:2,internal_loop_crossfade_sec:0,slot_duration_sec:5,inserts:[],slot_transition_out:{type:'none',duration_sec:0}}],render:{crf:24,audioBitrate:192,actCrossfadeSec:0,internalCrossfadeSec:0,finalBlackEnabled:false,finalBlackSec:0,bitratePreset:'standard',transitionMode:'crossfade',useEmbeddedAudio:true}},'synthetic-folder');
const advanced=process.argv.includes('--advanced');
if(!advanced)console.log(JSON.stringify(manifest));
else console.log(JSON.stringify(buildScopedLoopManifest({fps:24,codec:'libx264',resolution:'720p',loopHours:15/3600,scenes:[],timeline_slots:[
{slot_index:1,slot_id:'blue',title:'Blue',asset_id:'blue',file_name:'base.mp4',source_clip_duration_sec:2,internal_loop_crossfade_sec:0,slot_duration_sec:8,inserts:[],slot_transition_out:{type:'xfade',duration_sec:1}},
{slot_index:2,slot_id:'green',title:'Green',asset_id:'green',file_name:'green.mp4',source_clip_duration_sec:2,internal_loop_crossfade_sec:0,slot_duration_sec:8,inserts:[{insert_id:'red',asset_id:'red',file_name:'red.mp4',trigger_at_sec:3,duration_sec:2,transition_in:{type:'fade',duration_sec:0.25},transition_out:{type:'fade',duration_sec:0.25}}],slot_transition_out:{type:'none',duration_sec:0}}
],render:{crf:24,audioBitrate:192,actCrossfadeSec:1,internalCrossfadeSec:0,finalBlackEnabled:false,finalBlackSec:0,bitratePreset:'standard',transitionMode:'crossfade',useEmbeddedAudio:true}},'synthetic-folder')));

