import {useEffect} from 'react';

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
 useEffect(()=>{
  if(kind!=='success'||!durationMs||durationMs<=0)return;
  const timer=window.setTimeout(onDismiss,durationMs);
  return ()=>window.clearTimeout(timer);
 },[kind,message,durationMs,onDismiss]);
 return <section aria-label={title} style={{display:'flex',alignItems:'center',gap:12,padding:12,borderRadius:12,border:'1px solid '+colors.accent,background:colors.background,color:'#edf2ff',boxSizing:'border-box',maxWidth:'100%'}}>
 <span aria-hidden="true" style={{color:colors.accent,fontSize:22}}>{colors.symbol}</span>
 <div role={kind==='error'?'alert':'status'} style={{flex:1,minWidth:0,overflowWrap:'anywhere'}}><strong style={{color:colors.accent}}>{title}</strong><p style={{margin:'4px 0 0'}}>{message}</p></div>
 <button type="button" aria-label={dismissLabel} onClick={onDismiss} style={{minWidth:44,minHeight:44,flexShrink:0}}>×</button>
 </section>;
}
