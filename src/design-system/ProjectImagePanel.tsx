import {useEffect,useState,useRef} from 'react';
import type {ProjectStorage} from '../utils/projectStorage';
import type {ProjectScope} from '../utils/workspaceProjectContext';
export type ImageSlot='A'|'B'|'C'|'art';
export type ProjectImageUrls=Partial<Record<ImageSlot,string>>;
export function ProjectImagePanel({storage,scope,onUrls,acquireWrite,releaseWrite,busy,refresh=0}:{storage:ProjectStorage;scope:ProjectScope;onUrls:(urls:ProjectImageUrls)=>void;acquireWrite:()=>boolean;releaseWrite:()=>void;busy:boolean;refresh?:number}){
 const [urls,setUrls]=useState<ProjectImageUrls>({});
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const owned=useRef<ProjectImageUrls>({});
 const live=useRef(false);
 useEffect(()=>{
  live.current=true;let cancelled=false;setLoading(true);
  void (async()=>{const next:ProjectImageUrls={};try{
   for(const slot of ['A','B','C','art'] as const){const asset=await storage.getAsset(scope.workspaceId,scope.projectId,'project-image:'+slot);if(asset)next[slot]=URL.createObjectURL(asset.blob);}
   if(cancelled){Object.values(next).forEach(URL.revokeObjectURL);return;}
   owned.current=next;setUrls(next);onUrls(next);
  }catch{Object.values(next).forEach(URL.revokeObjectURL);if(!cancelled)setMessage('Image recovery failed');}finally{if(!cancelled)setLoading(false);}})();
  return()=>{cancelled=true;live.current=false;Object.values(owned.current).forEach(URL.revokeObjectURL);owned.current={};};
 },[storage,scope.workspaceId,scope.projectId,refresh]);
 async function attach(slot:ImageSlot,file:File){
  if(!acquireWrite())return;setMessage('');
  try{
   // Decode before writing: reject mislabeled or corrupt image inputs.
   if(file.size>32*1024*1024)throw new Error('Image too large');
   const bitmap=await createImageBitmap(file);bitmap.close();
   await storage.replaceProjectImage(scope.workspaceId,scope.projectId,slot,file);
   if(!live.current)return;
   const previous=owned.current[slot],next={...owned.current,[slot]:URL.createObjectURL(file)};
   owned.current=next;setUrls(next);onUrls(next);if(previous)URL.revokeObjectURL(previous);
   setMessage('Project image saved: '+slot);
  }catch{if(live.current)setMessage('Project image rejected');}finally{releaseWrite();}
 }
 return <section aria-label="Persistent project images"><h3>Persistent project images</h3>
 <p>PNG, JPEG or WebP. Upload a background or a flattened art result. Files are stored locally under this project.</p>
 {(['A','B','C','art'] as const).map(slot=><div key={slot}><label>Project image {slot}<input aria-label={'Project image '+slot} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||loading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void attach(slot,file);}}/></label>{urls[slot]&&<img alt={'Stored project image '+slot} src={urls[slot]} width={160}/>}</div>)}
 <p role="status">{message}</p></section>;
}
