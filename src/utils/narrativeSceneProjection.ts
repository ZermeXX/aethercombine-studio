// Explicit V8.1 scene projection. Unknown properties are not copied.
import type {NarrativeSceneItem} from '../components/MontageCombineView';
type Obj=Record<string,unknown>;
function obj(v:unknown):Obj{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid scene object');return v as Obj;}
function fields(v:unknown,strings:string[],numbers:string[],booleans:string[]):Obj{
 const a=obj(v),out:Obj={};
 for(const [keys,type] of [[strings,'string'],[numbers,'number'],[booleans,'boolean']] as const)for(const k of keys){
  if(a[k]===undefined)continue;
  if(typeof a[k]!==type||(type==='number'&&!Number.isFinite(a[k])))throw new Error('Invalid scene field '+k);
  out[k]=a[k];
 }
 return out;
}
const cameraStrings=['camera_movement','camera_policy','video_duration_mode'];
const cameraNumbers=['camera_zoom','max_extension_sec'];
const audioStrings=['sfx'];
const audioNumbers=['video_ambient_gain_db','sfx_gain_db'];
function transition(v:unknown){const t=fields(v,['type'],['duration_sec'],[]);if(typeof t.type!=='string'||typeof t.duration_sec!=='number'||t.duration_sec<0||!['crossfade','dissolve','fade','dip_to_black','dip_to_white','fadeblack','fadewhite','wipeleft','wiperight','smoothleft','smoothup','cut','none'].includes(t.type))throw new Error('Invalid scene transition');return t;}
function camera(a:Obj){
 const t=fields(a,cameraStrings,cameraNumbers,['allow_video_reuse']);
 for(const [key,allowed] of Object.entries({camera_movement:['zoom_in','zoom_out','pan_left','pan_right','pan_up','pan_down','static'],camera_policy:['native','cinematic'],video_duration_mode:['hybrid','native','stretch','freeze','loop']}))if(t[key]!==undefined&&!allowed.includes(String(t[key])))throw new Error('Invalid camera field '+key);
 return t;
}
export function narrativeScenes(v:unknown):NarrativeSceneItem[]{
 if(!Array.isArray(v))throw new Error('Invalid narrative scenes');
 const ids=new Set<string>();
 return v.map(value=>{
  const a=obj(value);
  const s={...fields(a,['scene_id','title','file_name','video_file','voiceover_file','audio_file','image_reference','visual_style','revision_note','ambient_audio','text_overlay','ai_video_prompt','prompt_ru','historical_date','historical_location',...audioStrings],['scene_index','duration','voiceover_duration_sec','voice_start','voice_end','source_audio_volume','voiceover_volume','ambient_volume',...audioNumbers],['needs_revision','brand_identity_visible','adaptive_audio','audio_ducking','source_audio_enabled','video_ambient_mute']),...camera(a)};
  if(typeof s.scene_id!=='string'||!s.scene_id||ids.has(s.scene_id)||typeof s.scene_index!=='number'||!Number.isInteger(s.scene_index)||s.scene_index<0||typeof s.file_name!=='string'||typeof s.text_overlay!=='string'||typeof s.duration!=='number'||s.duration<=0||!(typeof a.start_time==='string'||typeof a.start_time==='number'&&Number.isFinite(a.start_time)))throw new Error('Invalid narrative scene');
  ids.add(s.scene_id);s.start_time=a.start_time;s.transition=transition(a.transition);
  if(a.assets!==undefined)s.assets=fields(a.assets,['video_file','voiceover_file','audio_file','image_reference'],[],[]);
  if(a.video_processing!==undefined){const p=obj(a.video_processing),out=camera(p);for(const k of ['transition_in','transition_out'])if(p[k]!==undefined)out[k]=typeof p[k]==='string'?p[k]:fields(p[k],['type'],['duration_sec'],[]);s.video_processing=out;}
  if(a.audio_processing!==undefined)s.audio_processing=fields(a.audio_processing,audioStrings,audioNumbers,['video_ambient_mute']);
  if(a.cta_config!==undefined){const c=obj(a.cta_config),out=fields(c,['style'],['click_sec','bell_sec','sfx_volume'],['enabled','sfx_enabled']);if(typeof out.enabled!=='boolean'||typeof out.style!=='string')throw new Error('Invalid CTA');if(c.show_sec!==undefined){if(!Array.isArray(c.show_sec)||c.show_sec.length!==2||c.show_sec.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error('Invalid CTA time');out.show_sec=[...c.show_sec];}s.cta_config=out;}
  if(a.subtitles!==undefined){const sub=obj(a.subtitles),out:Obj={};for(const k of Object.keys(sub)){if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$|^original$/.test(k)||typeof sub[k]!=='string')throw new Error('Invalid subtitle');out[k]=sub[k];}s.subtitles=out;}
  return s as unknown as NarrativeSceneItem;
 });
}
