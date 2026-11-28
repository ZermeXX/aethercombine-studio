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
  const result={slot_id:slot.slot_id,title:slot.title,start_sec:start,slot_duration_sec:slot.slot_duration_sec,base_content:{file_name:file,loop_crossfade_sec:slot.internal_loop_crossfade_sec},slot_transition_out:{type:transition.type==='xfade'?'crossfade':'none',duration_sec:overlap},inserts:slot.inserts.map(ins=>{
   if(!ins.file_name.trim())throw new Error('Missing insert asset');
   if(ins.hold_until_end||ins.audio_soft_compressor||ins.max_peak_over_bed_db!==undefined)throw new Error('Unsupported insert audio or hold option in renderer preview');
   return {file_name:ins.file_name.trim(),trigger_at_sec:start+ins.trigger_at_sec,duration_sec:ins.duration_sec,transition_duration_sec:ins.transition_in.duration_sec,transition_in:{...ins.transition_in},transition_out:{...ins.transition_out}};
  })};
  start+=slot.slot_duration_sec-overlap;
  return result;
 });
}
