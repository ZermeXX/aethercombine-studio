import type {ReactNode} from 'react';
import {CHANNEL_PROFILES,isWorkspaceId,type WorkspaceId} from './workspaces';
import {Clapperboard,Repeat,FileText,ChartNoAxesCombined,Image,Palette} from 'lucide-react';
export type StudioModuleId='combine'|'loop'|'verbaflow'|'seo'|'thumb'|'editor';
export const STUDIO_MODULES=[
 {id:'combine',label:'Повествовательный монтаж',name:'Montage Combine',icon:Clapperboard},
 {id:'loop',label:'Многочасовой луп',name:'Ambient Loop',icon:Repeat},
 {id:'verbaflow',label:'Сценарии и текст',name:'VerbaFlow',icon:FileText},
 {id:'seo',label:'Метаданные YouTube',name:'YouTube SEO',icon:ChartNoAxesCombined},
 {id:'thumb',label:'4K обложки',name:'Thumbnail Studio',icon:Image},
 {id:'editor',label:'Арт-редактор и фон',name:'Image Art Editor',icon:Palette},
] as const;
export function StudioShell({active,onSelect,children,workspace='histoviva',onWorkspaceChange}:{active:StudioModuleId;onSelect:(id:StudioModuleId)=>void;children:ReactNode;workspace?:WorkspaceId;onWorkspaceChange?:(id:WorkspaceId)=>void}){
 return <div data-workspace={workspace} className="relative z-10 mx-auto flex w-full max-w-[1920px] flex-1 flex-col lg:flex-row">
  <aside className="min-w-0 shrink-0 border-b border-studio-border bg-studio-surface/90 lg:w-56 lg:border-b-0 lg:border-r">
   <div className="grid gap-2 border-b border-studio-border p-3">
    <label className="grid gap-1 text-studio-caption text-studio-muted">Channel profile
     <select aria-label="Channel profile" value={workspace} disabled={!onWorkspaceChange} onChange={e=>{if(isWorkspaceId(e.currentTarget.value))onWorkspaceChange?.(e.currentTarget.value);}} className="min-h-11 w-full rounded-studio-control border border-studio-border bg-studio-bg px-2 font-semibold text-[var(--studio-channel-accent)]">
      {Object.values(CHANNEL_PROFILES).map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
     </select>
    </label>
    <p className="text-studio-caption text-studio-muted">{CHANNEL_PROFILES[workspace].productionType==='documentary'?'Historical Documentary':'Ambient & Cozy Cinema'}</p>
    <p className="text-studio-caption text-studio-warning">Profile only · shared project data</p>
   </div>
   <nav aria-label="Цехи продакшна AetherCombine" className="p-2 lg:p-3">
    <p className="hidden px-2 pb-3 text-studio-caption font-semibold uppercase tracking-wider text-studio-muted lg:block">Production modules</p>
    <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
     {STUDIO_MODULES.map(({id,label,name,icon:Icon})=><button key={id} id={'tab-'+id} type="button" aria-current={active===id?'page':undefined} aria-controls={'view-'+id} onClick={()=>onSelect(id)} className={'flex min-h-11 shrink-0 items-center gap-2 rounded-studio-control border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-studio-primary '+(active===id?'border-studio-primary/50 bg-studio-primary/10 text-studio-primary':'border-transparent text-studio-muted hover:bg-studio-elevated hover:text-studio-text')}><Icon aria-hidden="true" className="h-5 w-5 shrink-0"/><span className="min-w-0"><span className="block whitespace-nowrap text-studio-body font-semibold">{name}</span><span className="hidden text-studio-caption lg:block">{label}</span></span></button>)}
    </div>
   </nav>
  </aside>
  <div className="min-w-0 flex-1">{children}</div>
 </div>;
}
