import { useEffect, useId, useRef, type ReactNode, type ComponentPropsWithoutRef } from 'react';

const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-primary';
const field = 'min-h-10 w-full rounded-studio-control border border-studio-border bg-studio-bg px-3 text-studio-body text-studio-text disabled:opacity-50';

export function Button({variant='secondary',busy=false,disabled,type='button',className,children,...props}: ComponentPropsWithoutRef<'button'> & {variant?:'primary'|'secondary'|'danger'|'ghost';busy?:boolean}) {
  const variants = {primary:'bg-studio-primary text-studio-bg',secondary:'bg-studio-elevated text-studio-text border border-studio-border',danger:'bg-studio-error text-studio-bg',ghost:'text-studio-text hover:bg-studio-elevated'};
  return <button {...props} type={type} disabled={disabled||busy} aria-busy={busy} className={cx('inline-flex min-h-10 items-center justify-center gap-2 rounded-studio-control px-4 font-semibold text-studio-body disabled:opacity-50',focus,variants[variant],className)}>{busy && <span aria-hidden="true">…</span>}{children}</button>;
}
type FieldMeta = {label:string; hint?:string; error?:string};
export function Input({label,hint,error,id,className,...props}: ComponentPropsWithoutRef<'input'> & FieldMeta) {
  const uid=useId(); const key=id||uid;
  return <label htmlFor={key} className="grid gap-1 text-studio-body text-studio-text">{label}<input {...props} id={key} aria-invalid={!!error} aria-describedby={error||hint?key+'-help':undefined} className={cx(field,focus,className)}/>{(error||hint)&&<span id={key+'-help'} className={error?'text-studio-error':'text-studio-muted'}>{error||hint}</span>}</label>;
}
export function Select({label,hint,error,id,className,children,...props}: ComponentPropsWithoutRef<'select'> & FieldMeta) {
  const uid=useId(); const key=id||uid;
  return <label htmlFor={key} className="grid gap-1 text-studio-body text-studio-text">{label}<select {...props} id={key} aria-invalid={!!error} aria-describedby={error||hint?key+'-help':undefined} className={cx(field,focus,className)}>{children}</select>{(error||hint)&&<span id={key+'-help'} className={error?'text-studio-error':'text-studio-muted'}>{error||hint}</span>}</label>;
}
export function Slider({label,value,min=0,max=100,step=1,onValueChange,disabled=false,format=String}:{label:string;value:number;min?:number;max?:number;step?:number;onValueChange:(value:number)=>void;disabled?:boolean;format?:(value:number)=>string}) {
  const id=useId();
  return <div className="grid gap-1 text-studio-body"><div className="flex justify-between gap-2"><label htmlFor={id}>{label}</label><output htmlFor={id} className="font-mono">{format(value)}</output></div><input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={format(value)} onChange={e=>onValueChange(e.currentTarget.valueAsNumber)} className={cx('w-full accent-studio-primary disabled:opacity-50',focus)}/></div>;
}
export function Toggle({label,checked,onCheckedChange,disabled=false}:{label:string;checked:boolean;onCheckedChange:(value:boolean)=>void;disabled?:boolean}) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-studio-body"><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e=>onCheckedChange(e.currentTarget.checked)} className={cx('h-5 w-5 accent-studio-primary disabled:opacity-50',focus)}/>{label}</label>;
}
export function Panel({className,...props}:ComponentPropsWithoutRef<'section'>) {
  return <section {...props} className={cx('min-w-0 rounded-studio-panel border border-studio-border bg-studio-surface p-4 text-studio-text',className)}/>;
}
export type StudioStatus='success'|'running'|'warning'|'error'|'unknown';
const statuses:Record<StudioStatus,{label:string;style:string}>={success:{label:'PASS',style:'text-studio-success'},running:{label:'Running',style:'text-studio-running'},warning:{label:'Review',style:'text-studio-warning'},error:{label:'FAIL',style:'text-studio-error'},unknown:{label:'Unverified',style:'text-studio-unknown'}};
export function StatusBadge({status,label}:{status:StudioStatus;label?:string}) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-studio-caption',statuses[status].style)}>{label||statuses[status].label}</span>;
}
export function normalizeProgress(value:number):number {return Number.isFinite(value)?Math.min(100,Math.max(0,value)):0;}
export function ProgressBar({value,label='Progress'}:{value?:number;label?:string}) {
  const determinate=value!==undefined&&Number.isFinite(value);
  const percent=normalizeProgress(value??0);
  return <div className="grid gap-1"><div className="flex justify-between text-studio-caption"><span>{label}</span><span>{determinate?Math.round(percent)+'%':'Processing'}</span></div><progress aria-label={label} max={100} value={determinate?percent:undefined} className="h-2 w-full accent-studio-primary"/></div>;
}
export function Modal({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);const id=useId();
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();else if(!open&&dialog.open)dialog.close();},[open]);
  return <dialog ref={ref} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} className="m-auto max-h-[90dvh] w-[min(92vw,40rem)] overflow-auto rounded-studio-dialog border border-studio-border bg-studio-surface p-5 text-studio-text backdrop:bg-black/70"><div className="mb-4 flex items-center justify-between gap-3"><h2 id={id} className="text-studio-section font-semibold">{title}</h2><Button variant="ghost" onClick={onClose} aria-label="Close dialog">×</Button></div>{children}</dialog>;
}
export function Tooltip({text,children}:{text:string;children:ReactNode}) {
  const id=useId();
  return <span tabIndex={0} aria-describedby={id} className={cx('group relative inline-flex',focus)}>{children}<span id={id} role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-max max-w-64 rounded-studio-control border border-studio-border bg-studio-elevated p-2 text-studio-caption text-studio-text group-hover:block group-focus-within:block">{text}</span></span>;
}
export function SectionHeader({title,description,actions}:{title:string;description?:string;actions?:ReactNode}) {
  return <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-studio-section font-semibold text-studio-text">{title}</h2>{description&&<p className="text-studio-body text-studio-muted">{description}</p>}</div>{actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}</header>;
}
