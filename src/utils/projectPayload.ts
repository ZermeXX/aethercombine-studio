// Initial typed content slice. Legacy arbitrary objects are deliberately not imported.
export interface ProjectPayload {
 schemaVersion:1;
 script:string;
 seoScript:string;
 thumbnailTitle:string;
 thumbnailBadge:string;
 chapters:string;
}
export function projectPayload(input:unknown):ProjectPayload {
 if(!input||typeof input!=='object')throw new Error('Invalid payload');
 const p=input as ProjectPayload;
 if(p.schemaVersion!==1||[p.script,p.seoScript,p.thumbnailTitle,p.thumbnailBadge,p.chapters].some(v=>typeof v!=='string'))throw new Error('Invalid payload schema');
 return {schemaVersion:1,script:p.script,seoScript:p.seoScript,thumbnailTitle:p.thumbnailTitle,thumbnailBadge:p.thumbnailBadge,chapters:p.chapters};
}
