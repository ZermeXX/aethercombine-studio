import type {TimelineSlot} from '../App';
/** Timeline duration excludes overlaps between acts; final black is separate. */
export function timelineDuration(slots:readonly TimelineSlot[]):number{
 return slots.reduce((n,s,i)=>n+s.slot_duration_sec-(i<slots.length-1&&s.slot_transition_out.type!=='none'?s.slot_transition_out.duration_sec:0),0);
}
/** Preserve media, inserts and transitions. Reject a target that would truncate an insert or overlap. */
export function synchronizeTimeline(slots:readonly TimelineSlot[],hours:number,fps:number):TimelineSlot[]{
 if(!Number.isInteger(hours)||hours<3||hours>10||![24,30,60].includes(fps))throw new Error('Invalid timeline target');
 if(!slots.length)return [];
 const overlaps=slots.map((s,i)=>i<slots.length-1&&s.slot_transition_out.type!=='none'?s.slot_transition_out.duration_sec:0);
 if(overlaps.some(x=>!Number.isFinite(x)||x<0))throw new Error('Invalid overlap');
 const exactOverlap=overlaps.reduce((a,b)=>a+b,0)*fps;
 if(Math.abs(exactOverlap-Math.round(exactOverlap))>1e-6)throw new Error('Overlap total must align to frames');
 const total=hours*3600*fps+Math.round(exactOverlap);
 const minimum=slots.map((s,i)=>{
  const ends=s.inserts.map(x=>x.trigger_at_sec+x.duration_sec);
  if(ends.some(x=>!Number.isFinite(x)||x<0))throw new Error('Invalid insert timing');
  // Smart Concat V8.1 omits bodies <=2s for multi-slot renders.
  const overlap=overlaps[i]+(overlaps[i-1]??0);
  const bodyMinimum=slots.length>1?Math.floor((overlap+2)*fps)+1:1;
  return Math.max(bodyMinimum,Math.ceil(Math.max(1,...ends)*fps));
 });
 const required=minimum.reduce((a,b)=>a+b,0);
 if(required>total)throw new Error('Target would truncate timeline inserts or transitions');
 const remaining=total-required;
 const per=Math.floor(remaining/slots.length),extra=remaining%slots.length;
 return slots.map((s,i)=>({...s,slot_duration_sec:(minimum[i]+per+(i<extra?1:0))/fps}));
}
