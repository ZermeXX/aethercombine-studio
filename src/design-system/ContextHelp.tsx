import {useId,useState} from 'react';
export type HelpLanguage='ru'|'en';
export type HelpEntry={summary:string;effect:string;whenOn:string;whenOff:string;recommended:string;example:string;limitations:string};
export type BilingualHelp=Record<HelpLanguage,HelpEntry>;
export function ContextHelp({entry,language='ru'}:{entry:BilingualHelp;language?:HelpLanguage}){
 const id=useId();
 const [open,setOpen]=useState(false);
 const [details,setDetails]=useState(false);
 const h=entry[language],ru=language==='ru';
 const fields=[ [ru?'Что меняет':'Effect',h.effect],[ru?'Когда использовать':'When to use',h.whenOn],[ru?'Когда не использовать':'When not to use',h.whenOff],[ru?'Рекомендуемое значение':'Recommended',h.recommended],[ru?'Пример':'Example',h.example],[ru?'Ограничения':'Limitations',h.limitations] ];
 return <div className="nexus-help" onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setDetails(false);e.stopPropagation();}}}>
 <button type="button" className="nexus-help-trigger" aria-label={ru?'Справка':'Help'} aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(v=>!v);setDetails(false);}}>ⓘ</button>
 {!open&&<span className="nexus-help-hover" aria-hidden="true">{h.summary}</span>}
 {open&&<div id={id} className="nexus-help-panel"><p>{h.summary}</p><button type="button" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{details?(ru?'Свернуть':'Show less'):(ru?'Подробнее':'Learn more')}</button>{details&&<dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</div>}
 </div>;
}
