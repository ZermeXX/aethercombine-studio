import {useEffect,useId,useRef,useState} from 'react';
export type HelpLanguage='ru'|'en';
export type HelpEntry={summary:string;effect:string;whenOn:string;whenOff:string;recommended:string;example:string;limitations:string};
export type BilingualHelp=Record<HelpLanguage,HelpEntry>;
export function ContextHelp({entry,language='ru'}:{entry:BilingualHelp;language?:HelpLanguage}){
 const id=useId();
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false);
 const [details,setDetails]=useState(false);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target)){setOpen(false);setDetails(false);}};
  document.addEventListener('pointerdown',outside);
  return ()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 const h=entry[language],ru=language==='ru';
 const fields=[ [ru?'Что меняет':'Effect',h.effect],[ru?'Когда использовать':'When to use',h.whenOn],[ru?'Когда не использовать':'When not to use',h.whenOff],[ru?'Рекомендуемое значение':'Recommended',h.recommended],[ru?'Пример':'Example',h.example],[ru?'Ограничения':'Limitations',h.limitations] ];
 return <div ref={root} className="nexus-help" onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setDetails(false);trigger.current?.focus();e.stopPropagation();}}}>
 <button ref={trigger} type="button" className="nexus-help-trigger" aria-label={ru?'Справка':'Help'} aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(v=>!v);setDetails(false);}}>ⓘ</button>
 {!open&&<span className="nexus-help-hover" aria-hidden="true">{h.summary}</span>}
 {open&&<div id={id} className="nexus-help-panel"><p>{h.summary}</p><button type="button" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{details?(ru?'Свернуть':'Show less'):(ru?'Подробнее':'Learn more')}</button>{details&&<dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</div>}
 </div>;
}
