import {useEffect,useRef,useState} from 'react';

export type NexusToastKind='success'|'info'|'warning'|'error';
const palette={
 success:{accent:'#37e6a4',background:'#122c2a',symbol:'✓'},
 info:{accent:'#45caff',background:'#14283e',symbol:'ⓘ'},
 warning:{accent:'#ffc45c',background:'#30281c',symbol:'!'},
 error:{accent:'#ff7898',background:'#351c2c',symbol:'!'},
};
type Props={kind:NexusToastKind;message:string;title:string;dismissLabel:string;onDismiss:()=>void;durationMs?:number};
export function NexusToast({kind,message,title,dismissLabel,onDismiss,durationMs}:Props){
 const colors=palette[kind];
 const [hovered,setHovered]=useState(false);
 const [focused,setFocused]=useState(false);
 const dismiss=useRef(onDismiss);
 useEffect(()=>{dismiss.current=onDismiss;},[onDismiss]);
 useEffect(()=>{
  if(kind!=='success'||!durationMs||durationMs<=0||hovered||focused)return;
  const timer=window.setTimeout(()=>dismiss.current(),durationMs);
  return ()=>window.clearTimeout(timer);
 },[kind,message,durationMs,hovered,focused]);
 return <section onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}} aria-label={title} style={{display:'flex',alignItems:'center',gap:12,padding:12,borderRadius:12,border:'1px solid '+colors.accent,background:colors.background,color:'#edf2ff',boxSizing:'border-box',position:'fixed',zIndex:60,right:'max(16px, env(safe-area-inset-right))',bottom:'max(16px, env(safe-area-inset-bottom))',width:'min(420px, calc(100% - 32px))',maxHeight:'calc(100dvh - 32px)',overflowY:'auto',boxShadow:'0 12px 36px #0008'}}>
 <span aria-hidden="true" style={{color:colors.accent,fontSize:22}}>{colors.symbol}</span>
 <div role={kind==='error'?'alert':'status'} style={{flex:1,minWidth:0,overflowWrap:'anywhere'}}><strong style={{color:colors.accent}}>{title}</strong><p style={{margin:'4px 0 0'}}>{message}</p></div>
 <button type="button" aria-label={dismissLabel} onClick={onDismiss} style={{minWidth:44,minHeight:44,flexShrink:0}}>×</button>
 </section>;
}
