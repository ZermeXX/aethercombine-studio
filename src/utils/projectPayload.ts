import type { AudioMasteringConfig } from '../App';
function mastering(input:unknown):AudioMasteringConfig {
 if(!input||typeof input!=='object')throw new Error('Invalid audio mastering');
 const a=input as AudioMasteringConfig;
 if(typeof a.loudnorm_enabled!=='boolean'||typeof a.e3_soft_attack_compressor!=='boolean'||[a.integrated_lufs,a.true_peak_dbtp,a.lra,a.e3_max_peak_over_bed_db].some(v=>!Number.isFinite(v)))throw new Error('Invalid audio mastering');
 return {loudnorm_enabled:a.loudnorm_enabled,integrated_lufs:a.integrated_lufs,true_peak_dbtp:a.true_peak_dbtp,lra:a.lra,e3_soft_attack_compressor:a.e3_soft_attack_compressor,e3_max_peak_over_bed_db:a.e3_max_peak_over_bed_db};
}
// Initial typed content slice. Legacy arbitrary objects are deliberately not imported.
export interface ProjectPayload {
 schemaVersion:1;
 script:string;
 seoScript:string;
 thumbnailTitle:string;
 thumbnailBadge:string;
 chapters:string;
 production?: { fps:24|30|60; codec:'libx264'|'libx265'; resolution:'720p'|'1080p'|'2k'|'4k'; loopHours:number; audio_mastering?:AudioMasteringConfig; render?: {crf:number; audioBitrate:192|256|320; actCrossfadeSec:number; internalCrossfadeSec:number; finalBlackEnabled:boolean; finalBlackSec:number; bitratePreset:'standard'|'cinema'|'eco'; transitionMode:'crossfade'|'pingpong'; useEmbeddedAudio:boolean}; scenes:{id:string;durationSec:number;text:string}[] };
}
export function projectPayload(input:unknown):ProjectPayload {
 if(!input||typeof input!=='object')throw new Error('Invalid payload');
 const p=input as ProjectPayload;
 if(p.schemaVersion!==1||[p.script,p.seoScript,p.thumbnailTitle,p.thumbnailBadge,p.chapters].some(v=>typeof v!=='string'))throw new Error('Invalid payload schema');
 let production:ProjectPayload['production'];
 if(p.production!==undefined){
  const q=p.production;
  if(!q||![24,30,60].includes(q.fps)||!['libx264','libx265'].includes(q.codec)||!['720p','1080p','2k','4k'].includes(q.resolution)||!Number.isFinite(q.loopHours)||q.loopHours<0||!Array.isArray(q.scenes))throw new Error('Invalid production settings');
  const t=q.render;
  if(t!==undefined && (!t || !Number.isFinite(t.crf)||t.crf<0||t.crf>51||![192,256,320].includes(t.audioBitrate)||[t.actCrossfadeSec,t.internalCrossfadeSec,t.finalBlackSec].some(v=>!Number.isFinite(v)||v<0)||typeof t.finalBlackEnabled!=='boolean'||typeof t.useEmbeddedAudio!=='boolean'||!['standard','cinema','eco'].includes(t.bitratePreset)||!['crossfade','pingpong'].includes(t.transitionMode)))throw new Error('Invalid render settings');
  const render=t===undefined?{}:{render:{crf:t.crf,audioBitrate:t.audioBitrate,actCrossfadeSec:t.actCrossfadeSec,internalCrossfadeSec:t.internalCrossfadeSec,finalBlackEnabled:t.finalBlackEnabled,finalBlackSec:t.finalBlackSec,bitratePreset:t.bitratePreset,transitionMode:t.transitionMode,useEmbeddedAudio:t.useEmbeddedAudio}};
  production={...render,...(q.audio_mastering===undefined?{}:{audio_mastering:mastering(q.audio_mastering)}),fps:q.fps,codec:q.codec,resolution:q.resolution,loopHours:q.loopHours,scenes:q.scenes.map(s=>{
   if(!s||typeof s.id!=='string'||typeof s.text!=='string'||!Number.isFinite(s.durationSec)||s.durationSec<=0)throw new Error('Invalid scene');
   return {id:s.id,text:s.text,durationSec:s.durationSec};
  })};
 }
 return {...(production===undefined?{}:{production}),schemaVersion:1,script:p.script,seoScript:p.seoScript,thumbnailTitle:p.thumbnailTitle,thumbnailBadge:p.thumbnailBadge,chapters:p.chapters};
}
