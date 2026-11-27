// Initial typed content slice. Legacy arbitrary objects are deliberately not imported.
export interface ProjectPayload {
 schemaVersion:1;
 script:string;
 seoScript:string;
 thumbnailTitle:string;
 thumbnailBadge:string;
 chapters:string;
 production?: { fps:24|30|60; codec:'libx264'|'libx265'; resolution:'720p'|'1080p'|'2k'|'4k'; loopHours:number; scenes:{id:string;durationSec:number;text:string}[] };
}
export function projectPayload(input:unknown):ProjectPayload {
 if(!input||typeof input!=='object')throw new Error('Invalid payload');
 const p=input as ProjectPayload;
 if(p.schemaVersion!==1||[p.script,p.seoScript,p.thumbnailTitle,p.thumbnailBadge,p.chapters].some(v=>typeof v!=='string'))throw new Error('Invalid payload schema');
 let production:ProjectPayload['production'];
 if(p.production!==undefined){
  const q=p.production;
  if(!q||![24,30,60].includes(q.fps)||!['libx264','libx265'].includes(q.codec)||!['720p','1080p','2k','4k'].includes(q.resolution)||!Number.isFinite(q.loopHours)||q.loopHours<0||!Array.isArray(q.scenes))throw new Error('Invalid production settings');
  production={fps:q.fps,codec:q.codec,resolution:q.resolution,loopHours:q.loopHours,scenes:q.scenes.map(s=>{
   if(!s||typeof s.id!=='string'||typeof s.text!=='string'||!Number.isFinite(s.durationSec)||s.durationSec<=0)throw new Error('Invalid scene');
   return {id:s.id,text:s.text,durationSec:s.durationSec};
  })};
 }
 return {...(production===undefined?{}:{production}),schemaVersion:1,script:p.script,seoScript:p.seoScript,thumbnailTitle:p.thumbnailTitle,thumbnailBadge:p.thumbnailBadge,chapters:p.chapters};
}
