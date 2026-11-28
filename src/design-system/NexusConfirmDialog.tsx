import {useEffect,useRef} from 'react';

type Props={
 title:string;
 message:string;
 cancelLabel:string;
 confirmLabel:string;
 danger?:boolean;
 onCancel:()=>void;
 onConfirm:()=>void;
};

export function NexusConfirmDialog({title,message,cancelLabel,confirmLabel,danger,onCancel,onConfirm}:Props){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const node=dialog.current;
  const previous=document.activeElement;
  if(node&&!node.open)node.showModal();
  return ()=>{
   if(node?.open)node.close();
   if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();
  };
 },[]);
 return <dialog ref={dialog} aria-label={title} onCancel={event=>{event.preventDefault();onCancel();}}
 style={{width:'min(440px, calc(100% - 32px))',boxSizing:'border-box',padding:24,borderRadius:16,border:'1px solid '+(danger?'#a64e65':'#7762c7'),background:'linear-gradient(145deg,#19233d,#101529)',color:'#edf2ff',boxShadow:'0 12px 60px #000a'}}>
 <h2 style={{margin:'0 0 12px',fontSize:20}}>{title}</h2>
 <p style={{overflowWrap:'anywhere',lineHeight:1.6}}>{message}</p>
 <div style={{display:'flex',flexWrap:'wrap',justifyContent:'flex-end',gap:12,marginTop:24}}>
 <button type="button" autoFocus onClick={onCancel} style={{minHeight:44,padding:'8px 16px',borderRadius:10,border:'1px solid #536381',background:'#19243c',color:'#edf2ff'}}>{cancelLabel}</button>
 <button type="button" onClick={onConfirm} style={{minHeight:44,padding:'8px 16px',borderRadius:10,border:'1px solid '+(danger?'#ff91aa':'#aa91ff'),background:danger?'#842d48':'#50349b',color:'#fff'}}>{confirmLabel}</button>
 </div>
 </dialog>;
}
