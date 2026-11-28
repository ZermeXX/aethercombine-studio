import type {TimelineSlot} from '../App';
/** Scoped editing guard: preserve existing inserts; never silently truncate. */
export function validateSlotInserts(slot:TimelineSlot):void{
 if(!Number.isFinite(slot.slot_duration_sec)||slot.slot_duration_sec<=0)throw new Error('Invalid slot duration');
 const ids=new Set<string>();
 const intervals:{start:number;end:number}[]=[];
 for(const insert of slot.inserts){
  const {trigger_at_sec:start,duration_sec:duration,transition_in:entry,transition_out:exit}=insert;
  if(!insert.insert_id||ids.has(insert.insert_id))throw new Error('Duplicate insert ID');
  ids.add(insert.insert_id);
  if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start+duration>slot.slot_duration_sec+1e-8)throw new Error('Insert outside slot');
  intervals.push({start,end:start+duration});
  if(!['fade','dissolve'].includes(entry.type)||!['none','fade','dissolve'].includes(exit.type))throw new Error('Unsupported insert transition');
  if(!Number.isFinite(entry.duration_sec)||!Number.isFinite(exit.duration_sec)||entry.duration_sec<0||exit.duration_sec<0||entry.duration_sec+exit.duration_sec>duration+1e-8||(exit.type==='none'&&exit.duration_sec!==0))throw new Error('Invalid insert transition');
 }
 // Conservative scoped-preview policy: adjacent inserts are valid; overlapping ones are not.
 intervals.sort((a,b)=>a.start-b.start);
 for(let i=1;i<intervals.length;i++)if(intervals[i].start<intervals[i-1].end-1e-8)throw new Error('Overlapping inserts');
}
