import type {ProjectPayload} from './projectPayload';
import type {TimelineSlot} from '../App';
import {validateSlotInserts} from './validateSlotInserts';
/** Pure preview adapter for build_timeline.py. No dispatch, credentials or storage. */
export function adaptLoopTimeline(slots:readonly TimelineSlot[]){
 if(!slots.length)throw new Error('Empty timeline');
 let start=0;
 return slots.map((slot,index)=>{
  validateSlotInserts(slot);
  const file=slot.file_name.trim();
  if(!file||!slot.slot_id)throw new Error('Missing base asset or slot ID');
  if(!Number.isFinite(slot.source_clip_duration_sec)||!Number.isFinite(slot.internal_loop_crossfade_sec)||slot.internal_loop_crossfade_sec<0||slot.source_clip_duration_sec<=slot.internal_loop_crossfade_sec)throw new Error('Invalid loop seam');
  const transition=slot.slot_transition_out;
  if(!['none','xfade'].includes(transition.type))throw new Error('Unsupported act transition in renderer preview');
  const overlap=transition.type==='xfade'?transition.duration_sec:0;
  if(!Number.isFinite(transition.duration_sec)||transition.duration_sec<0||(transition.type==='none'&&transition.duration_sec!==0)||overlap>=slot.slot_duration_sec||(index===slots.length-1&&overlap!==0)||(index<slots.length-1&&overlap>=slots[index+1].slot_duration_sec))throw new Error('Invalid act transition');
  const previous=index>0?slots[index-1].slot_transition_out:undefined;
  const incoming=previous?.type==='xfade'?previous.duration_sec:0;
  if(incoming+overlap>=slot.slot_duration_sec)throw new Error('Act crossfades overlap inside slot');
  // V8.1 smart concat omits bodies of two seconds or less.
  if(slots.length>1&&slot.slot_duration_sec-incoming-overlap<=2)throw new Error('Act body too short for current renderer');
  const result={slot_id:slot.slot_id,title:slot.title,start_sec:start,slot_duration_sec:slot.slot_duration_sec,base_content:{file_name:file,loop_crossfade_sec:slot.internal_loop_crossfade_sec},slot_transition_out:{type:transition.type==='xfade'?'crossfade':'none',duration_sec:overlap},inserts:slot.inserts.map(ins=>{
   if(!ins.file_name.trim())throw new Error('Missing insert asset');
   if(ins.hold_until_end||ins.audio_soft_compressor||ins.max_peak_over_bed_db!==undefined)throw new Error('Unsupported insert audio or hold option in renderer preview');
   return {file_name:ins.file_name.trim(),trigger_at_sec:start+ins.trigger_at_sec,duration_sec:ins.duration_sec,transition_duration_sec:ins.transition_in.duration_sec,transition_in:{...ins.transition_in},transition_out:{...ins.transition_out}};
  })};
  start+=slot.slot_duration_sec-overlap;
  return result;
 });
}

/** Export the fields consumed by the current loop runner, not the narrative renderer. */
export function buildScopedLoopManifest(production:NonNullable<ProjectPayload['production']>,folderId:string){
 const render=production.render;
 if(!render)throw new Error('Configure render settings first');
 if(!/^[A-Za-z0-9_-]+$/.test(folderId))throw new Error('Explicit Drive folder ID required');
 if(render.finalBlackEnabled||render.transitionMode!=='crossfade'||!render.useEmbeddedAudio)throw new Error('Runner export requires embedded audio, crossfade mode and no final black');
 if(production.audio_mastering)throw new Error('Custom mastering is not supported by this runner export');
 const dimensions={ '720p':[1280,720],'1080p':[1920,1080],'2k':[2560,1440],'4k':[3840,2160]} as const;
 const [width,height]=dimensions[production.resolution];
 const timeline_slots=adaptLoopTimeline(production.timeline_slots??[]);
 const duration=timeline_slots.reduce((n,s)=>n+s.slot_duration_sec-s.slot_transition_out.duration_sec,0);
 if(Math.abs(duration-production.loopHours*3600)>1/production.fps)throw new Error('Timeline does not match target duration');
 if(new Set(timeline_slots.map(s=>s.slot_id)).size!==timeline_slots.length)throw new Error('Duplicate slot ID');
 return {content_profile:'ambience',timeline_slots,export_settings:{width,height,fps:production.fps,video_codec:production.codec,preset:'veryfast',crf:render.crf,audio_bitrate:render.audioBitrate+'k',output_filename:'output.mp4'},cloud_export:{target_folder_id:folderId}};
}
