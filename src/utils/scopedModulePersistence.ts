import {projectPayload,type ProjectPayload} from './projectPayload';
import {WorkspaceProjectContext,type ProjectScope,type ProjectSnapshot} from './workspaceProjectContext';
import type {LegacyExtras} from './legacyExtras';
type Production=NonNullable<ProjectPayload['production']>;
export type ModulePatch=
 |{module:'verbaflow';script:string;chapters:string}
 |{module:'seo';seoScript:string;seo?:LegacyExtras['seo']}
 |{module:'thumb';thumbnailTitle:string;thumbnailBadge:string;thumbnails?:LegacyExtras['thumbnails']}
 |{module:'voice';voice:NonNullable<LegacyExtras['voice']>}
 |{module:'combine';narrativeScenes:NonNullable<Production['narrative_scenes']>;combine?:LegacyExtras['combine'];branding?:LegacyExtras['branding']}
 |{module:'loop';production:Pick<Production,'fps'|'codec'|'resolution'|'loopHours'>;render?:Production['render'];extras?:LegacyExtras['render']}
 |{module:'timeline';timeline:NonNullable<Production['timeline_slots']>;audioMastering?:Production['audio_mastering']};
const defaults=():Production=>({fps:24,codec:'libx264',resolution:'4k',loopHours:3,scenes:[]});
/** Explicit module projections. Unrelated fields survive each revision. */
export function applyModulePatch(input:ProjectPayload,patch:ModulePatch):ProjectPayload{
 const p=projectPayload(input),extra={...p.legacyExtras},prod={...(p.production??defaults())};
 switch(patch.module){
 case 'verbaflow':return projectPayload({...p,script:patch.script,chapters:patch.chapters});
 case 'seo':return projectPayload({...p,seoScript:patch.seoScript,legacyExtras:{...extra,...(patch.seo===undefined?{}:{seo:patch.seo})}});
 case 'thumb':return projectPayload({...p,thumbnailTitle:patch.thumbnailTitle,thumbnailBadge:patch.thumbnailBadge,legacyExtras:{...extra,...(patch.thumbnails===undefined?{}:{thumbnails:patch.thumbnails})}});
 case 'voice':return projectPayload({...p,legacyExtras:{...extra,voice:patch.voice}});
 case 'combine':return projectPayload({...p,production:{...prod,narrative_scenes:patch.narrativeScenes},legacyExtras:{...extra,...(patch.combine===undefined?{}:{combine:patch.combine}),...(patch.branding===undefined?{}:{branding:patch.branding})}});
 case 'loop':return projectPayload({...p,production:{...prod,fps:patch.production.fps,codec:patch.production.codec,resolution:patch.production.resolution,loopHours:patch.production.loopHours,...(patch.render===undefined?{}:{render:patch.render})},legacyExtras:{...extra,...(patch.extras===undefined?{}:{render:patch.extras})}});
 case 'timeline':return projectPayload({...p,production:{...prod,timeline_slots:patch.timeline,...(patch.audioMastering===undefined?{}:{audio_mastering:patch.audioMastering})}});
 default:throw new Error('Unknown module');
 }
}
export async function saveModulePatch(context:WorkspaceProjectContext,scope:ProjectScope,revision:number,patch:ModulePatch):Promise<ProjectSnapshot>{
 const snapshot=await context.read(scope);
 if(!snapshot.payload||snapshot.project.revision!==revision)throw new Error('Project payload or revision conflict');
 return context.save(scope,revision,applyModulePatch(snapshot.payload,patch));
}
