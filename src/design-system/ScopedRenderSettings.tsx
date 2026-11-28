import type {ProjectPayload} from '../utils/projectPayload';
type Production=NonNullable<ProjectPayload['production']>;
type Render=NonNullable<Production['render']>;
const defaults:Render={crf:18,audioBitrate:320,actCrossfadeSec:1,internalCrossfadeSec:1,finalBlackEnabled:false,finalBlackSec:0,bitratePreset:'standard',transitionMode:'crossfade',useEmbeddedAudio:false};
export function ScopedRenderSettings({production,onChange}:{production:Production;onChange:(next:Production)=>void}){
 const render=production.render??defaults;
 function patch(change:Partial<Render>){onChange({...production,render:{...render,...change}});}
 return <section aria-label="Scoped render settings" className="space-y-2">
 <h3>Render settings · project preview</h3><p>Editing only. Render dispatch remains disabled.</p>
 {(['crf','actCrossfadeSec','internalCrossfadeSec','finalBlackSec'] as const).map(k=><label key={k}>{k}<input aria-label={'Render '+k} type="number" min={0} max={k==='crf'?51:undefined} step={k==='crf'?1:0.1} value={render[k]} onChange={e=>{if(e.target.value!==''&&e.target.validity.valid)patch({[k]:Number(e.target.value)});}}/></label>)}
 <label>Audio bitrate<select aria-label="Render audio bitrate" value={render.audioBitrate} onChange={e=>patch({audioBitrate:Number(e.target.value) as Render['audioBitrate']})}>{[192,256,320].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Bitrate preset<select aria-label="Render bitrate preset" value={render.bitratePreset} onChange={e=>patch({bitratePreset:e.target.value as Render['bitratePreset']})}>{['standard','cinema','eco'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Transition mode<select aria-label="Render transition mode" value={render.transitionMode} onChange={e=>patch({transitionMode:e.target.value as Render['transitionMode']})}>{['crossfade','pingpong'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label><input type="checkbox" checked={render.finalBlackEnabled} onChange={e=>patch({finalBlackEnabled:e.target.checked})}/> Final black</label>
 <label><input type="checkbox" checked={render.useEmbeddedAudio} onChange={e=>patch({useEmbeddedAudio:e.target.checked})}/> Embedded audio</label>
 </section>;
}
